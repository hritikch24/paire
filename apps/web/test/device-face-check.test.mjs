import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  similarityTransform,
  alignedFace,
  cosine,
  photoDecision,
} from "../site/face-check/v1/face-math.mjs";
import { FACE_MODELS } from "../scripts/face-check-assets.mjs";
test("face alignment recovers rotation/translation and rejects degenerate landmarks", () => {
  const points = [
      [1, 1],
      [3, 1],
      [2, 2],
      [1, 3],
      [3, 3],
    ],
    target = points.map(([x, y]) => [2 * x - 3 * y + 10, 3 * x + 2 * y - 4]);
  const transform = similarityTransform(points, target);
  assert.ok(Math.abs(transform.a - 2) < 1e-8);
  assert.ok(Math.abs(transform.b - 3) < 1e-8);
  assert.ok(Math.abs(transform.shiftX - 10) < 1e-8);
  assert.ok(Math.abs(transform.shiftY + 4) < 1e-8);
  assert.throws(() => similarityTransform(Array(5).fill([0, 0])));
  assert.throws(() => similarityTransform([[NaN, 0]]));
});
test("fingerprints require finite nonzero 128-dimensional vectors", () => {
  const a = Array(128).fill(1),
    b = Array(128).fill(-1);
  assert.ok(Math.abs(cosine(a, a) - 1) < 1e-8);
  assert.ok(Math.abs(cosine(a, b) + 1) < 1e-8);
  assert.throws(() => cosine(Array(128).fill(0), a));
  assert.throws(() => cosine([1], a));
  assert.throws(() => cosine([...a.slice(1), NaN], a));
  const image = {
    width: 112,
    height: 112,
    data: new Uint8ClampedArray(112 * 112 * 4).fill(128),
  };
  const landmarks = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
  ];
  assert.equal(alignedFace(image, { landmarks }).length, 3 * 112 * 112);
});
test("unclear and mismatched profile photos fail while consistent visible faces pass", () => {
  assert.equal(photoDecision([]).matched, false);
  assert.equal(photoDecision([{ faces: 0, best: null }]).matched, false);
  assert.equal(photoDecision([{ faces: 2, best: 0.9 }]).matched, false);
  assert.equal(photoDecision([{ faces: 1, best: NaN }]).matched, false);
  assert.equal(photoDecision([{ faces: 1, best: 0.49 }]).matched, false);
  assert.equal(
    photoDecision([
      { faces: 1, best: 0.7 },
      { faces: 1, best: 0.3 },
    ]).matched,
    false,
  );
  assert.equal(
    photoDecision([
      { faces: 1, best: 0.7 },
      { faces: 0, best: null },
      { faces: 2, best: 0.7 },
    ]).matched,
    true,
  );
});
test("browser weights match the existing server pins and never request a paid provider", () => {
  const server = readFileSync(
      new URL("../../../firebase/functions/src/lib/faces.ts", import.meta.url),
      "utf8",
    ),
    worker = readFileSync(
      new URL("../site/face-check/v1/worker.mjs", import.meta.url),
      "utf8",
    );
  for (const model of FACE_MODELS) {
    assert.ok(server.includes(model.sha256));
    assert.ok(worker.includes(model.sha256));
  }
  assert.doesNotMatch(
    worker,
    /aiplatform|generativelanguage|cloudfunctions|firestore|anthropic|indexedDB|localStorage/,
  );
});
