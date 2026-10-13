import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import type * as Ort from "onnxruntime-web";
import type Sharp from "sharp";
import { bucket } from "../admin";

/**
 * Face matching for the selfie check, with OpenCV's open models (Apache-2.0 / MIT):
 * YuNet finds faces and five landmarks, SFace turns an aligned face into a
 * 128-number fingerprint. Two photos of the same person have a high cosine
 * similarity. This is the identity decision: language models such as Gemini were
 * tested and called different people "the same" too often to be trusted with it.
 *
 * The model files live in Cloud Storage (system/face-models/, see
 * scripts/upload-face-models.sh) and are checked against these hashes on load.
 * MUSE_FACE_MODELS_DIR loads them from a local folder instead (tests).
 */
export const FACE_MODELS = {
  detector: { file: "face_detection_yunet_2023mar.onnx", sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4" },
  recognizer: { file: "face_recognition_sface_2021dec.onnx", sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79" }
} as const;

const DETECTOR_SIZE = 640;
const MIN_FACE_SCORE = 0.6;
/** Where SFace expects the eyes, nose and mouth corners in its 112×112 input. */
const TEMPLATE: Array<[number, number]> = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

export type Face = { score: number; x: number; y: number; width: number; height: number; landmarks: Array<[number, number]> };
type Rgb = { data: Buffer; width: number; height: number };

let models: Promise<{ ort: typeof Ort; detector: Ort.InferenceSession; recognizer: Ort.InferenceSession }> | undefined;

async function modelBytes(file: string, sha256: string): Promise<Uint8Array> {
  const dir = process.env.MUSE_FACE_MODELS_DIR;
  const bytes = dir ? await readFile(join(dir, file)) : (await bucket().file(`system/face-models/${file}`).download())[0];
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Face model ${file} doesn't match its pinned hash.`);
  return new Uint8Array(bytes);
}

/** Loaded once per server instance, on the first selfie check. */
function loadModels() {
  models ??= (async () => {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    const [detector, recognizer] = await Promise.all([
      modelBytes(FACE_MODELS.detector.file, FACE_MODELS.detector.sha256).then((bytes) => ort.InferenceSession.create(bytes)),
      modelBytes(FACE_MODELS.recognizer.file, FACE_MODELS.recognizer.sha256).then((bytes) => ort.InferenceSession.create(bytes))
    ]);
    return { ort, detector, recognizer };
  })().catch((error) => {
    models = undefined;
    throw error;
  });
  return models;
}

const sharp = async (): Promise<typeof Sharp> => (await import("sharp")).default;

/** Upright RGB pixels, at most 1280 px on the long side. */
export async function decodeImage(bytes: Buffer): Promise<Rgb> {
  const { data, info } = await (await sharp())(bytes, { limitInputPixels: 40_000_000 })
    .rotate().removeAlpha().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true })
    .raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function overlap(a: Face, b: Face): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const shared = width * height;
  return shared / (a.width * a.height + b.width * b.height - shared);
}

/** Faces in the image, most confident first. */
export async function detectFaces(image: Rgb): Promise<Face[]> {
  const { ort, detector } = await loadModels();
  const scale = Math.min(DETECTOR_SIZE / image.width, DETECTOR_SIZE / image.height);
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const small = await (await sharp())(image.data, { raw: { width: image.width, height: image.height, channels: 3 } }).resize(width, height, { fit: "fill" }).raw().toBuffer();
  // BGR planes, top-left aligned on a 640×640 canvas.
  const plane = DETECTOR_SIZE * DETECTOR_SIZE;
  const input = new Float32Array(3 * plane);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 3;
      const target = y * DETECTOR_SIZE + x;
      input[target] = small[source + 2];
      input[plane + target] = small[source + 1];
      input[2 * plane + target] = small[source];
    }
  }
  const output = await detector.run({ [detector.inputNames[0]]: new ort.Tensor("float32", input, [1, 3, DETECTOR_SIZE, DETECTOR_SIZE]) });
  const found: Face[] = [];
  for (const stride of [8, 16, 32]) {
    const cells = DETECTOR_SIZE / stride;
    const cls = output[`cls_${stride}`].data as Float32Array;
    const obj = output[`obj_${stride}`].data as Float32Array;
    const box = output[`bbox_${stride}`].data as Float32Array;
    const kps = output[`kps_${stride}`].data as Float32Array;
    for (let row = 0; row < cells; row++) {
      for (let col = 0; col < cells; col++) {
        const i = row * cells + col;
        const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
        const score = Math.sqrt(clamp(cls[i]) * clamp(obj[i]));
        if (score < MIN_FACE_SCORE) continue;
        const centerX = (col + box[i * 4]) * stride;
        const centerY = (row + box[i * 4 + 1]) * stride;
        const boxWidth = Math.exp(box[i * 4 + 2]) * stride;
        const boxHeight = Math.exp(box[i * 4 + 3]) * stride;
        const landmarks = Array.from({ length: 5 }, (_, n): [number, number] => [
          ((kps[i * 10 + 2 * n] + col) * stride) / scale,
          ((kps[i * 10 + 2 * n + 1] + row) * stride) / scale
        ]);
        found.push({ score, x: (centerX - boxWidth / 2) / scale, y: (centerY - boxHeight / 2) / scale, width: boxWidth / scale, height: boxHeight / scale, landmarks });
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  const kept: Face[] = [];
  for (const face of found) if (kept.every((other) => overlap(other, face) < 0.3)) kept.push(face);
  return kept;
}

/** The similarity transform (rotation, scale, shift) that best maps `from` onto `to`. */
export function similarityTransform(from: Array<[number, number]>, to: Array<[number, number]>) {
  const n = from.length;
  const mean = (points: Array<[number, number]>, axis: 0 | 1) => points.reduce((sum, point) => sum + point[axis], 0) / n;
  const [fx, fy, tx, ty] = [mean(from, 0), mean(from, 1), mean(to, 0), mean(to, 1)];
  let dot = 0, cross = 0, spread = 0;
  for (let i = 0; i < n; i++) {
    const sx = from[i][0] - fx, sy = from[i][1] - fy, dx = to[i][0] - tx, dy = to[i][1] - ty;
    dot += sx * dx + sy * dy;
    cross += sx * dy - sy * dx;
    spread += sx * sx + sy * sy;
  }
  const scale = Math.hypot(dot, cross) / spread;
  const angle = Math.atan2(cross, dot);
  const a = scale * Math.cos(angle), b = scale * Math.sin(angle);
  // to = [a -b; b a] · from + shift
  return { a, b, shiftX: tx - (a * fx - b * fy), shiftY: ty - (b * fx + a * fy) };
}

/** The face cut out, levelled and scaled to SFace's 112×112 RGB input. */
function alignedFace(image: Rgb, face: Face): Float32Array {
  const { a, b, shiftX, shiftY } = similarityTransform(face.landmarks, TEMPLATE);
  const det = a * a + b * b;
  const plane = 112 * 112;
  const out = new Float32Array(3 * plane);
  const pixel = (x: number, y: number, channel: number) =>
    x < 0 || y < 0 || x >= image.width || y >= image.height ? 0 : image.data[(y * image.width + x) * 3 + channel];
  for (let y = 0; y < 112; y++) {
    for (let x = 0; x < 112; x++) {
      const u = x - shiftX, v = y - shiftY;
      const sx = (a * u + b * v) / det, sy = (-b * u + a * v) / det;
      const x0 = Math.floor(sx), y0 = Math.floor(sy), wx = sx - x0, wy = sy - y0;
      for (let channel = 0; channel < 3; channel++) {
        out[channel * plane + y * 112 + x] =
          pixel(x0, y0, channel) * (1 - wx) * (1 - wy) + pixel(x0 + 1, y0, channel) * wx * (1 - wy) +
          pixel(x0, y0 + 1, channel) * (1 - wx) * wy + pixel(x0 + 1, y0 + 1, channel) * wx * wy;
      }
    }
  }
  return out;
}

/** A unit-length fingerprint of one face. */
export async function faceFingerprint(image: Rgb, face: Face): Promise<number[]> {
  const { ort, recognizer } = await loadModels();
  const output = await recognizer.run({ [recognizer.inputNames[0]]: new ort.Tensor("float32", alignedFace(image, face), [1, 3, 112, 112]) });
  const values = Array.from(output[recognizer.outputNames[0]].data as Float32Array);
  const length = Math.hypot(...values) || 1;
  return values.map((value) => value / length);
}

export const similarity = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
