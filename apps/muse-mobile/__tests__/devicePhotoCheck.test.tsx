import React from "react";
import renderer, { act } from "react-test-renderer";
import { DevicePhotoCheck } from "../src/components/DevicePhotoCheck.web";
import { createDeviceFaceCheck } from "../src/services/deviceFaceCheck";

let mockPhotos = ["https://example.com/own-photo.jpg"];
let mockActive = true;
const mockPrepare = jest.fn();
const mockCompare = jest.fn();
const mockDispose = jest.fn();
jest.mock("../src/services/deviceFaceCheck", () => ({ createDeviceFaceCheck: jest.fn(() => ({ prepare: mockPrepare, compare: mockCompare, dispose: mockDispose })) }));
jest.mock("../src/hooks/useWebScreenActive", () => ({ useWebScreenActive: () => mockActive }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "fictional" }, profile: { photoUrls: mockPhotos } }) }));
jest.mock("tamagui", () => ({ Text: "Text", YStack: "YStack" }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton" }));
jest.mock("../src/components/SettingsRow", () => ({ ToggleRow: "ToggleRow" }));
jest.mock("../src/components/SelfieCamera", () => ({ SelfieCamera: "SelfieCamera" }));
const globals = ["Worker", "OffscreenCanvas", "createImageBitmap"] as const;
const original = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let tree: renderer.ReactTestRenderer;
beforeEach(() => {
  mockPhotos = ["https://example.com/own-photo.jpg"]; mockActive = true;
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: jest.fn() });
  mockPrepare.mockResolvedValue(undefined); mockCompare.mockResolvedValue({ matched: true, reason: "The faces look consistent." });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  for (const key of globals) { const value = original.get(key); if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
  jest.clearAllMocks();
});
const render = async () => { await act(async () => { tree = renderer.create(<DevicePhotoCheck />); }); };
const start = async () => {
  await act(async () => tree.root.findByProps({ testID: "device-photo-consent" }).props.onValueChange(true));
  await act(async () => tree.root.findByProps({ testID: "device-photo-start" }).props.onPress());
};
test("models and camera start only after consent, and a local match never claims a verified badge", async () => {
  await render(); expect(createDeviceFaceCheck).not.toHaveBeenCalled(); expect(tree.root.findByProps({ testID: "device-photo-start" }).props.disabled).toBe(true);
  await start(); expect(mockPrepare).toHaveBeenCalledTimes(1); expect(mockCompare).not.toHaveBeenCalled();
  await act(async () => tree.root.findByType("SelfieCamera" as never).props.onCapture("private-jpeg"));
  expect(mockCompare).toHaveBeenCalledWith("private-jpeg", mockPhotos); expect(mockDispose).toHaveBeenCalledTimes(1);
  const copy = JSON.stringify(tree.toJSON()); expect(copy).toContain("Photos match on this device"); expect(copy).toContain("verified badge status has not changed"); expect(copy).not.toContain("private-jpeg");
  expect(tree.root.findAllByType("SelfieCamera" as never)).toHaveLength(0);
});
test("mismatches show useful feedback and can be retried", async () => {
  mockCompare.mockResolvedValueOnce({ matched: false, reason: "Replace the first profile photo." });
  await render(); await start(); await act(async () => tree.root.findByType("SelfieCamera" as never).props.onCapture("jpeg"));
  expect(JSON.stringify(tree.toJSON())).toContain("No clear match on this device"); expect(JSON.stringify(tree.toJSON())).toContain("Replace the first profile photo.");
  expect(tree.root.findByProps({ testID: "device-photo-start" }).props.disabled).toBe(false);
});
test("cancelling a model download prevents a late camera from opening", async () => {
  let ready!: () => void; mockPrepare.mockImplementationOnce(() => new Promise<void>(resolve => { ready = resolve; }));
  await render(); await start(); await act(async () => tree.root.findByProps({ testID: "device-photo-cancel" }).props.onPress());
  await act(async () => ready()); expect(mockDispose).toHaveBeenCalledTimes(1); expect(tree.root.findAllByType("SelfieCamera" as never)).toHaveLength(0);
});
test.each(["photos", "background"])("%s changes stop the device session and clear its result", async cause => {
  await render(); await start();
  await act(async () => { if (cause === "photos") mockPhotos = ["https://example.com/replaced.jpg"]; else mockActive = false; tree.update(<DevicePhotoCheck />); });
  expect(mockDispose).toHaveBeenCalledTimes(1); expect(tree.root.findAllByType("SelfieCamera" as never)).toHaveLength(0); expect(mockCompare).not.toHaveBeenCalled();
});
test("errors close the camera without turning an unsuccessful comparison into a pass", async () => {
  mockCompare.mockRejectedValueOnce(new Error("The photo could not be loaded."));
  await render(); await start(); await act(async () => tree.root.findByType("SelfieCamera" as never).props.onCapture("jpeg"));
  expect(JSON.stringify(tree.toJSON())).toContain("The photo could not be loaded."); expect(JSON.stringify(tree.toJSON())).not.toContain("Photos match on this device"); expect(mockDispose).toHaveBeenCalledTimes(1);
});
