import { offerPlusForLikeLimit, showLikeLimitOffer } from "../src/services/likeLimitOffer";
import { Alert } from "../src/services/dialog";

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("../src/services/dialog", () => ({ Alert: { alert: jest.fn() } }));
beforeEach(() => jest.clearAllMocks());

test("a free daily limit asks for Plus without opening a purchase automatically", () => {
  const upgrade = jest.fn();
  const error = { code: "functions/resource-exhausted", details: { reason: "daily-swipe-limit", kind: "like", upgradeAvailable: true } };
  expect(offerPlusForLikeLimit(error, upgrade)).toBe(true);
  expect(upgrade).not.toHaveBeenCalled();
  const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
  expect(buttons.map((b: { text: string }) => b.text)).toEqual(["Maybe later", "Get Paire Plus"]);
  buttons[1].onPress();
  expect(upgrade).toHaveBeenCalledTimes(1);
});
test("Plus caps, generic quotas and network failures do not promise more likes through another purchase", () => {
  for (const error of [{ code: "functions/resource-exhausted" }, { code: "functions/unavailable" }, { code: "functions/resource-exhausted", details: { reason: "daily-swipe-limit", upgradeAvailable: false } }]) expect(offerPlusForLikeLimit(error, jest.fn())).toBe(false);
  expect(Alert.alert).not.toHaveBeenCalled();
});
test("the last successful free Super Like also has an explicit optional upgrade offer", () => {
  showLikeLimitOffer(true, jest.fn());
  expect((Alert.alert as jest.Mock).mock.calls[0][0]).toContain("Super Like");
});
