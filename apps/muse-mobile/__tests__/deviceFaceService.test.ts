import { createDeviceFaceCheck } from "../src/services/deviceFaceCheck.web";

class FakeWorker {
  static current: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { preventDefault: () => void }) => void) | null = null;
  postMessage = jest.fn();
  terminate = jest.fn();
  constructor() { FakeWorker.current = this; }
}
const savedWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
const savedBitmap = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
beforeEach(() => Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker }));
afterEach(() => {
  if (savedWorker) Object.defineProperty(globalThis, "Worker", savedWorker); else Reflect.deleteProperty(globalThis, "Worker");
  if (savedBitmap) Object.defineProperty(globalThis, "createImageBitmap", savedBitmap); else Reflect.deleteProperty(globalThis, "createImageBitmap");
  jest.restoreAllMocks();
});
test("cancel rejects pending work and terminates the worker without returning a match", async () => {
  const check = createDeviceFaceCheck(); const pending = expect(check.prepare()).rejects.toThrow("cancelled");
  check.dispose(); await pending;
  expect(FakeWorker.current.terminate).toHaveBeenCalledTimes(1);
});
test("unreadable images produce actionable feedback without fetching photos or sending pixels", async () => {
  const fetch = jest.spyOn(globalThis, "fetch");
  Object.defineProperty(globalThis, "createImageBitmap", { configurable: true, value: jest.fn().mockRejectedValue(new Error("internal decoder detail")) });
  const check = createDeviceFaceCheck(); const ready = check.prepare(); FakeWorker.current.onmessage?.({ data: { type: "ready" } }); await ready;
  await expect(check.compare("aGVsbG8=", ["https://example.com/profile.jpg"])).rejects.toThrow("That image could not be read");
  expect(fetch).not.toHaveBeenCalled(); expect(FakeWorker.current.postMessage).toHaveBeenCalledTimes(1); check.dispose();
});
test("worker startup failures explain the retry path instead of exposing runtime internals", async () => {
  const check = createDeviceFaceCheck(); const failed = expect(check.prepare()).rejects.toThrow("Try a current browser or contact support");
  const preventDefault = jest.fn(); FakeWorker.current.onerror?.({ preventDefault }); await failed;
  expect(preventDefault).toHaveBeenCalledTimes(1); check.dispose();
});
