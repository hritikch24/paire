#!/usr/bin/env node
/**
 * Puts the open face models used by the selfie check (firebase/functions/src/lib/faces.ts)
 * into the project's Storage bucket at system/face-models/. Members can't read or write
 * there (no Storage rule matches it). Run once per project, with admin credentials:
 *
 *   gcloud auth application-default login
 *   node scripts/upload-face-models.mjs --bucket muse-352ba.firebasestorage.app
 *
 * Sources: OpenCV Zoo (YuNet: MIT, SFace: Apache-2.0). Hashes must match faces.ts.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(new URL("../firebase/functions/package.json", import.meta.url));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");

const MODELS = [
  { file: "face_detection_yunet_2023mar.onnx", url: "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx", sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4" },
  { file: "face_recognition_sface_2021dec.onnx", url: "https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx", sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79" }
];

const index = process.argv.indexOf("--bucket");
const bucketName = index > 0 ? process.argv[index + 1] : undefined;
if (!bucketName) {
  console.error("Usage: node scripts/upload-face-models.mjs --bucket <project>.firebasestorage.app");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
const bucket = getStorage().bucket();
for (const model of MODELS) {
  const bytes = Buffer.from(await (await fetch(model.url)).arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== model.sha256) throw new Error(`${model.file}: unexpected hash ${hash}`);
  await bucket.file(`system/face-models/${model.file}`).save(bytes, { contentType: "application/octet-stream", resumable: false });
  console.log(`Uploaded system/face-models/${model.file}`);
}
