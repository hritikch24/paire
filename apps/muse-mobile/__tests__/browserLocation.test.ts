import { currentApproximateLocation, requestApproximateLocation } from "../src/services/locationService.web";

const position = jest.fn();
const permission = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: { getCurrentPosition: position }, permissions: { query: permission } } });
});
test("browser requests have a finite timeout and only return rounded coordinates", async () => {
  position.mockImplementation((success) => success({ coords: { latitude: 28.613912, longitude: 77.209034, accuracy: 5 } }));
  const result = await requestApproximateLocation();
  expect(result).toMatchObject({ status: "granted", city: null, location: { lat: 28.61, lng: 77.21 } });
  expect(position.mock.calls[0][2]).toEqual({ enableHighAccuracy: false, maximumAge: 300000, timeout: 12000 });
});
test("automatic foreground refresh does not request location after permission expires", async () => {
  permission.mockResolvedValue({ state: "prompt" });
  expect(await currentApproximateLocation()).toBeNull();
  expect(position).not.toHaveBeenCalled();
  permission.mockRejectedValue(new Error("Permissions API unavailable"));
  expect(await currentApproximateLocation()).toBeNull();
});
test("denied and unavailable browser locations are recoverable results", async () => {
  position.mockImplementation((_success, failure) => failure({ code: 1 }));
  expect(await requestApproximateLocation()).toEqual({ status: "denied" });
  position.mockImplementation((_success, failure) => failure({ code: 3 }));
  expect(await requestApproximateLocation()).toEqual({ status: "unavailable" });
});
