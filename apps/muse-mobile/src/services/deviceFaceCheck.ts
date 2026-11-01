import type { DeviceFaceCheck } from "./deviceFaceCheckTypes";
/** The on-device web implementation is resolved only by the browser build. */
export function createDeviceFaceCheck(_progress?: (message: string) => void): DeviceFaceCheck {
  throw new Error("Device photo comparison is available in the browser.");
}
