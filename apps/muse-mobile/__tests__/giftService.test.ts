import { Platform } from "react-native";
import { leaveForHostedCheckout } from "../src/services/billingService";
import { callFunction } from "../src/services/firebase";
import { claimGift, confirmGiftPayment, createGift, declineGift, fetchGifts } from "../src/services/giftService";

jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("../src/services/firebase", () => ({ callFunction: jest.fn() }));
jest.mock("../src/services/billingService", () => ({ leaveForHostedCheckout: jest.fn() }));

const order = { orderId: "order_ABC123", amount: 9900, currency: "INR", keyId: "k", name: "Paire", description: "Gift", email: null, hostedUrl: "https://kraftai.in/pay/x" };
afterEach(() => { jest.clearAllMocks(); (Platform as { OS: string }).OS = "web"; });

test("createGift asks the server for an order with the match and plan only, then leaves for hosted checkout from that chat", async () => {
  jest.mocked(callFunction).mockResolvedValue(order);
  await expect(createGift("her_him", "week")).resolves.toBe("redirecting");
  expect(callFunction).toHaveBeenCalledWith("createGiftOrder", { matchId: "her_him", plan: "week" });
  expect(leaveForHostedCheckout).toHaveBeenCalledWith(order, "her_him");
});

test("a refusal from the server is thrown as it came and the page does not leave", async () => {
  const denied = Object.assign(new Error("You already gave 3 gifts today."), { code: "functions/failed-precondition" });
  jest.mocked(callFunction).mockRejectedValue(denied);
  await expect(createGift("her_him", "day")).rejects.toBe(denied);
  expect(leaveForHostedCheckout).not.toHaveBeenCalled();
});

test("gifts are web only: nothing is called on other platforms", async () => {
  (Platform as { OS: string }).OS = "android";
  await expect(createGift("her_him", "day")).rejects.toThrow();
  expect(callFunction).not.toHaveBeenCalled();
});

test("confirm, claim, decline and list call their functions with just the ids", async () => {
  jest.mocked(callFunction).mockResolvedValue({});
  await confirmGiftPayment("order_ABC123", "pay_ABC123", "a".repeat(64));
  await claimGift("order_ABC123");
  await declineGift("order_ABC123");
  await fetchGifts();
  expect(jest.mocked(callFunction).mock.calls).toEqual([
    ["confirmGiftPayment", { orderId: "order_ABC123", paymentId: "pay_ABC123", signature: "a".repeat(64) }],
    ["claimGift", { giftId: "order_ABC123" }],
    ["declineGift", { giftId: "order_ABC123" }],
    ["listGifts", {}]
  ]);
});
