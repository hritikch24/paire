// Adapted from Paire's server face matcher. Pure math; no network or persistence.
export const ALIGNMENT = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];
export function similarityTransform(from, to = ALIGNMENT) {
  if (
    from.length !== 5 ||
    from.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  )
    throw Error("Face landmarks are unclear.");
  const mean = (points, axis) =>
    points.reduce((sum, p) => sum + p[axis], 0) / points.length;
  const [fx, fy, tx, ty] = [
    mean(from, 0),
    mean(from, 1),
    mean(to, 0),
    mean(to, 1),
  ];
  let dot = 0,
    cross = 0,
    spread = 0;
  for (let i = 0; i < from.length; i++) {
    const sx = from[i][0] - fx,
      sy = from[i][1] - fy,
      dx = to[i][0] - tx,
      dy = to[i][1] - ty;
    dot += sx * dx + sy * dy;
    cross += sx * dy - sy * dx;
    spread += sx * sx + sy * sy;
  }
  if (spread < 1e-6) throw Error("Face landmarks are unclear.");
  const a = dot / spread,
    b = cross / spread;
  if (a * a + b * b < 1e-8) throw Error("Face landmarks are unclear.");
  return {
    a,
    b,
    shiftX: tx - (a * fx - b * fy),
    shiftY: ty - (b * fx + a * fy),
  };
}
export function alignedFace(image, face) {
  const { a, b, shiftX, shiftY } = similarityTransform(face.landmarks);
  const det = a * a + b * b,
    plane = 112 * 112,
    out = new Float32Array(3 * plane);
  const pixel = (x, y, c) =>
    x < 0 || y < 0 || x >= image.width || y >= image.height
      ? 0
      : image.data[(y * image.width + x) * 4 + c];
  for (let y = 0; y < 112; y++)
    for (let x = 0; x < 112; x++) {
      const u = x - shiftX,
        v = y - shiftY,
        sx = (a * u + b * v) / det,
        sy = (-b * u + a * v) / det,
        x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        wx = sx - x0,
        wy = sy - y0;
      for (let c = 0; c < 3; c++)
        out[c * plane + y * 112 + x] =
          pixel(x0, y0, c) * (1 - wx) * (1 - wy) +
          pixel(x0 + 1, y0, c) * wx * (1 - wy) +
          pixel(x0, y0 + 1, c) * (1 - wx) * wy +
          pixel(x0 + 1, y0 + 1, c) * wx * wy;
    }
  return out;
}
export function overlap(a, b) {
  const w = Math.max(
      0,
      Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    ),
    h = Math.max(
      0,
      Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
    );
  const shared = w * h;
  return shared / (a.width * a.height + b.width * b.height - shared);
}
export function cosine(a, b) {
  if (
    a.length !== 128 ||
    b.length !== 128 ||
    [...a, ...b].some((v) => !Number.isFinite(v))
  )
    throw Error("Face comparison was unclear.");
  const length = Math.hypot(...a) * Math.hypot(...b);
  if (length < 1e-8) throw Error("Face comparison was unclear.");
  return a.reduce((sum, v, i) => sum + v * b[i], 0) / length;
}
export function photoDecision(photos) {
  if (!photos.length || !photos[0].faces)
    return {
      matched: false,
      reason:
        "Your first profile photo needs a clear face. Add a recent photo of just you.",
    };
  if (photos[0].faces !== 1)
    return {
      matched: false,
      reason:
        "Use a first profile photo with only your face. Group photos can go after it.",
    };
  if (!Number.isFinite(photos[0].best) || photos[0].best < 0.5)
    return {
      matched: false,
      reason:
        "The selfie did not clearly match your first photo. Try good light, or update that photo.",
    };
  for (let i = 1; i < photos.length; i++)
    if (
      photos[i].faces &&
      (!Number.isFinite(photos[i].best) || photos[i].best < 0.42)
    )
      return {
        matched: false,
        reason: `Photo ${i + 1} did not clearly match your selfie. Check that it shows you.`,
      };
  return {
    matched: true,
    reason:
      "Your selfie looks consistent with the faces in your profile photos on this device.",
  };
}
