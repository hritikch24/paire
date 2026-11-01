import type { DeviceFaceCheck, DeviceFaceResult } from "./deviceFaceCheckTypes";

const MAX_EDGE = 1024;
const MAX_BYTES = 10 * 1024 * 1024;
/** All inference is in this worker. No Firebase, model API or analytics calls. */
export function createDeviceFaceCheck(progress: (message: string) => void = () => undefined): DeviceFaceCheck {
  const worker = new Worker("/face-check/v1/worker.mjs", { type: "module" });
  const controller = new AbortController();
  let disposed = false;
  let pending: { resolve: (value: DeviceFaceResult | undefined) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  const abortError = () => new Error("Photo check cancelled.");
  function settle(error?: Error, value?: DeviceFaceResult) {
    if (!pending) return;
    clearTimeout(pending.timer);
    const current = pending; pending = null;
    if (error) current.reject(error); else current.resolve(value);
  }
  worker.onmessage = ({ data }) => {
    if (disposed || !data || typeof data !== "object") return;
    if (data.type === "progress" && Number.isInteger(data.photo) && Number.isInteger(data.total)) progress(`Comparing photo ${data.photo} of ${data.total} on your device…`);
    else if (data.type === "error") settle(new Error(typeof data.message === "string" ? data.message : "Your device could not complete the check."));
    else if (data.type === "ready") settle();
    else if (data.type === "result" && typeof data.matched === "boolean" && typeof data.reason === "string") settle(undefined, { matched: data.matched, reason: data.reason });
  };
  worker.onerror = event => { event.preventDefault(); settle(new Error("This browser could not start the private photo checker. Try a current browser or contact support.")); };
  function send(message: object, transfer: Transferable[] = []): Promise<DeviceFaceResult | undefined> {
    if (disposed) return Promise.reject(abortError());
    if (pending) return Promise.reject(new Error("A photo check is already running."));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject, timer: setTimeout(() => { settle(new Error("The photo check took too long. Please retry on a faster device or connection.")); controller.abort(); worker.terminate(); disposed = true; }, 120_000) };
      try { worker.postMessage(message, transfer); } catch (error) { settle(error instanceof Error ? error : new Error("The photo checker could not start.")); }
    });
  }
  async function pixels(blob: Blob) {
    if (blob.size <= 0 || blob.size > MAX_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(blob.type)) throw new Error("Use JPG, PNG or WebP photos under 10 MB.");
    const image = await createImageBitmap(blob).catch(() => { throw new Error("That image could not be read. Retake your selfie or replace the profile photo."); });
    try {
      if (image.width * image.height > 40_000_000) throw new Error("That photo is too large. Use a smaller profile photo.");
      if (disposed) throw abortError();
      const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
      try {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("This browser cannot prepare the photo check.");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
      } finally { canvas.width = canvas.height = 1; }
    } finally { image.close(); }
  }
  return {
    prepare: async () => { await send({ type: "init" }); },
    compare: async (selfie, photos) => {
      const images: Awaited<ReturnType<typeof pixels>>[] = [];
      try {
        if (!selfie || selfie.length > Math.ceil(MAX_BYTES * 4 / 3) || !photos.length || photos.length > 6) throw new Error("Add between one and six profile photos, then retake your selfie.");
        const bytes = Uint8Array.from(atob(selfie), c => c.charCodeAt(0));
        try { images.push(await pixels(new Blob([bytes], { type: "image/jpeg" }))); } finally { bytes.fill(0); }
        for (let index = 0; index < photos.length; index++) {
          if (disposed) throw abortError();
          progress(`Preparing photo ${index + 1} of ${photos.length}…`);
          const url = new URL(photos[index]);
          if (url.protocol !== "https:" && !(url.origin === window.location.origin && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("Use profile photos uploaded to Paire.");
          const response = await fetch(url.href, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "force-cache" }).catch(() => { throw new Error("A profile photo could not be loaded. Check your connection or replace it."); });
          if (!response.ok || Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("A profile photo could not be loaded. Check your connection or replace it.");
          images.push(await pixels(await response.blob()));
        }
        const result = await send({ type: "compare", selfie: images[0], photos: images.slice(1) }, images.map(image => image.data.buffer as ArrayBuffer));
        if (!result) throw new Error("The photo checker did not return a result.");
        return result;
      } finally {
        // Transferred buffers are detached; clear any remaining untransferred pixels.
        for (const image of images) if (image.data.byteLength) image.data.fill(0);
      }
    },
    dispose: () => { disposed = true; controller.abort(); worker.terminate(); settle(abortError()); }
  };
}
