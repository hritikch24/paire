import * as ort from "./runtime/ort.wasm.min.mjs";
import { alignedFace, cosine, overlap, photoDecision } from "./face-math.mjs";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = new URL("./runtime/", import.meta.url).href;
const MODELS = [
  [
    "face_detection_yunet_2023mar.onnx",
    "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  ],
  [
    "face_recognition_sface_2021dec.onnx",
    "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
  ],
];
class CheckError extends Error {}
let detector,
  recognizer,
  busy = false;
async function load([file, expected]) {
  const response = await fetch(new URL(`./models/${file}`, import.meta.url), {
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok)
    throw new CheckError(
      "The photo checker could not download. Check your connection and retry.",
    );
  const bytes = await response.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== expected)
    throw new CheckError(
      "The photo checker download could not be validated. Please retry.",
    );
  try {
    return await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  } finally {
    new Uint8Array(bytes).fill(0);
  }
}
function validate(image) {
  if (
    !image ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height) ||
    image.width < 1 ||
    image.height < 1 ||
    image.width > 1280 ||
    image.height > 1280 ||
    !(image.data instanceof Uint8ClampedArray) ||
    image.data.length !== image.width * image.height * 4
  )
    throw new CheckError(
      "That image could not be checked. Retake your selfie.",
    );
}
async function detect(image) {
  validate(image);
  const scale = Math.min(640 / image.width, 640 / image.height),
    w = Math.round(image.width * scale),
    h = Math.round(image.height * scale);
  const source = new OffscreenCanvas(image.width, image.height);
  source
    .getContext("2d")
    .putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
  const resized = new OffscreenCanvas(640, 640),
    context = resized.getContext("2d");
  context.drawImage(source, 0, 0, w, h);
  const pixels = context.getImageData(0, 0, 640, 640).data,
    plane = 640 * 640,
    input = new Float32Array(3 * plane);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * 640 + x,
        s = p * 4;
      input[p] = pixels[s + 2];
      input[plane + p] = pixels[s + 1];
      input[2 * plane + p] = pixels[s];
    }
  let output;
  const tensor = new ort.Tensor("float32", input, [1, 3, 640, 640]);
  try {
    output = await detector.run({ [detector.inputNames[0]]: tensor });
    const found = [];
    for (const stride of [8, 16, 32]) {
      const cells = 640 / stride,
        cls = output[`cls_${stride}`].data,
        obj = output[`obj_${stride}`].data,
        box = output[`bbox_${stride}`].data,
        kps = output[`kps_${stride}`].data;
      for (let row = 0; row < cells; row++)
        for (let col = 0; col < cells; col++) {
          const i = row * cells + col,
            clamp = (v) => Math.min(Math.max(v, 0), 1),
            score = Math.sqrt(clamp(cls[i]) * clamp(obj[i]));
          if (score < 0.6) continue;
          const cx = (col + box[i * 4]) * stride,
            cy = (row + box[i * 4 + 1]) * stride,
            width = Math.exp(box[i * 4 + 2]) * stride,
            height = Math.exp(box[i * 4 + 3]) * stride;
          found.push({
            score,
            x: (cx - width / 2) / scale,
            y: (cy - height / 2) / scale,
            width: width / scale,
            height: height / scale,
            landmarks: Array.from({ length: 5 }, (_, n) => [
              ((kps[i * 10 + 2 * n] + col) * stride) / scale,
              ((kps[i * 10 + 2 * n + 1] + row) * stride) / scale,
            ]),
          });
        }
    }
    found.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const face of found)
      if (kept.every((other) => overlap(other, face) < 0.3)) kept.push(face);
    return kept;
  } finally {
    tensor.dispose();
    input.fill(0);
    pixels.fill(0);
    source.width = source.height = resized.width = resized.height = 1;
    for (const t of Object.values(output || {})) t.dispose();
  }
}
async function fingerprint(image, face) {
  const values = alignedFace(image, face),
    tensor = new ort.Tensor("float32", values, [1, 3, 112, 112]);
  let output;
  try {
    output = await recognizer.run({ [recognizer.inputNames[0]]: tensor });
    return Array.from(output[recognizer.outputNames[0]].data);
  } finally {
    tensor.dispose();
    values.fill(0);
    for (const t of Object.values(output || {})) t.dispose();
  }
}
self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  let selfiePrint;
  try {
    if (data.type === "init") {
      [detector, recognizer] = await Promise.all(MODELS.map(load));
      self.postMessage({ type: "ready" });
      return;
    }
    if (data.type !== "compare" || !detector || !recognizer)
      throw new CheckError("Start the photo check again.");
    if (
      !Array.isArray(data.photos) ||
      !data.photos.length ||
      data.photos.length > 6
    )
      throw new CheckError("Add between one and six profile photos first.");
    const faces = (await detect(data.selfie)).sort(
      (a, b) => b.width * b.height - a.width * a.height,
    );
    const prominent = faces.filter(
      (f) => f.width * f.height >= 0.4 * faces[0].width * faces[0].height,
    );
    if (prominent.length !== 1) {
      self.postMessage({
        type: "result",
        matched: false,
        reason: prominent.length
          ? "Only you should be in the selfie. Try again on your own."
          : "No clear face was found. Face the camera in good light and try again.",
      });
      return;
    }
    if (Math.min(prominent[0].width, prominent[0].height) < 80) {
      self.postMessage({
        type: "result",
        matched: false,
        reason: "Move closer so your face is clear, then take another selfie.",
      });
      return;
    }
    selfiePrint = await fingerprint(data.selfie, prominent[0]);
    const comparisons = [];
    for (let i = 0; i < data.photos.length; i++) {
      self.postMessage({
        type: "progress",
        photo: i + 1,
        total: data.photos.length,
      });
      const photo = data.photos[i],
        photoFaces = (await detect(photo)).slice(0, 8);
      let best = null;
      for (const face of photoFaces) {
        const print = await fingerprint(photo, face);
        try {
          best = Math.max(best ?? -1, cosine(selfiePrint, print));
        } finally {
          print.fill(0);
        }
      }
      comparisons.push({ faces: photoFaces.length, best });
      photo.data.fill(0);
    }
    self.postMessage({ type: "result", ...photoDecision(comparisons) });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        error instanceof CheckError
          ? error.message
          : "This device could not finish the photo check. Try another browser or contact support.",
    });
  } finally {
    selfiePrint?.fill(0);
    data.selfie?.data?.fill(0);
    for (const photo of data.photos || []) photo?.data?.fill(0);
    busy = false;
  }
};
