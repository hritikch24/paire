import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

// Model weights and licenses are pinned to OpenCV Zoo, never fetched by a member
// from a third-party CDN. Changing weights/runtime requires a new asset version.
const OPENCV_COMMIT = "48b10fa505aeb51fbd127fc60a5c660040e823b7";
export const FACE_MODELS = [
  {
    folder: "face_detection_yunet",
    file: "face_detection_yunet_2023mar.onnx",
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
  },
  {
    folder: "face_recognition_sface",
    file: "face_recognition_sface_2021dec.onnx",
    sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
  },
];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function prepareFaceCheckAssets(output) {
  const app = resolve(import.meta.dirname, "../../muse-mobile");
  const require = createRequire(resolve(app, "package.json"));
  const runtimeRoot = dirname(dirname(require.resolve("onnxruntime-web/wasm")));
  const pkg = JSON.parse(
    await readFile(resolve(runtimeRoot, "package.json"), "utf8"),
  );
  if (pkg.version !== "1.22.0")
    throw Error(
      "The browser face-check runtime must remain pinned to 1.22.0; version its assets before upgrading.",
    );
  const destination = resolve(output, "face-check/v1");
  const cache = resolve(import.meta.dirname, "../.face-check-cache");
  await mkdir(resolve(destination, "models"), { recursive: true });
  await mkdir(resolve(destination, "runtime"), { recursive: true });
  await mkdir(cache, { recursive: true });
  for (const file of [
    "ort.wasm.min.mjs",
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
  ])
    await cp(
      resolve(runtimeRoot, "dist", file),
      resolve(destination, "runtime", file),
    );
  for (const file of ["LICENSE", "ThirdPartyNotices.txt"]) {
    const cached = resolve(cache, `onnxruntime-1.22.0-${file}`);
    let text;
    try {
      text = await readFile(cached);
    } catch {
      const response = await fetch(
        `https://raw.githubusercontent.com/microsoft/onnxruntime/v1.22.0/${file}`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw Error("Could not fetch ONNX Runtime redistribution notices.");
      text = Buffer.from(await response.arrayBuffer());
      await writeFile(cached, text);
    }
    await writeFile(
      resolve(
        destination,
        "runtime",
        file === "LICENSE" ? "LICENSE.txt" : file,
      ),
      text,
    );
  }
  for (const model of FACE_MODELS) {
    const cached = resolve(cache, model.file);
    let bytes;
    try {
      bytes = await readFile(cached);
    } catch {
      /* First build downloads once into the ignored cache. */
    }
    if (!bytes || hash(bytes) !== model.sha256) {
      const url = `https://media.githubusercontent.com/media/opencv/opencv_zoo/${OPENCV_COMMIT}/models/${model.folder}/${model.file}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok)
        throw Error(
          `Could not download browser face model (${response.status}).`,
        );
      bytes = Buffer.from(await response.arrayBuffer());
      if (hash(bytes) !== model.sha256)
        throw Error("Browser face model failed its pinned SHA-256 check.");
      await writeFile(cached, bytes);
    }
    await writeFile(resolve(destination, "models", model.file), bytes);
    const licenseCache = resolve(cache, `${model.folder}-LICENSE.txt`);
    let license;
    try {
      license = await readFile(licenseCache);
    } catch {
      const response = await fetch(
        `https://raw.githubusercontent.com/opencv/opencv_zoo/${OPENCV_COMMIT}/models/${model.folder}/LICENSE`,
        { signal: AbortSignal.timeout(30_000) },
      );
      if (!response.ok)
        throw Error("Could not fetch model redistribution license.");
      license = Buffer.from(await response.arrayBuffer());
      await writeFile(licenseCache, license);
    }
    await writeFile(
      resolve(destination, "models", `${model.folder}-LICENSE.txt`),
      license,
    );
  }
  await writeFile(
    resolve(destination, "NOTICE.txt"),
    `Browser face comparison uses ONNX Runtime Web 1.22.0 (Microsoft, MIT), OpenCV Zoo YuNet (MIT) and SFace (Apache-2.0).\nModel source: https://github.com/opencv/opencv_zoo/tree/${OPENCV_COMMIT}/models\nRuntime source: https://github.com/microsoft/onnxruntime/tree/v1.22.0\nRedistributed license texts are in runtime/LICENSE.txt and models/*-LICENSE.txt.\nThis is a device-side similarity check, not identity or liveness proof.\n`,
  );
  console.log(
    "Browser face-check assets prepared: pinned models and runtime, served locally with no paid AI dependency.",
  );
}
