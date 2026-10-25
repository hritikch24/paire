import React from "react";
import renderer, { act } from "react-test-renderer";
import { showToast } from "../src/components/Toast";
import { useGiftReturn } from "../src/hooks/useGiftReturn";
import { confirmGiftPayment } from "../src/services/giftService";
import { rememberReturnChat } from "../src/utils/chatAccess";

const mockNavigate = jest.fn();
const mockInvalidate = jest.fn();
let mockUid: string | undefined = "her";
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mockInvalidate }) }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/services/supportMode", () => ({ isSupportView: false }));
jest.mock("../src/services/giftService", () => ({ confirmGiftPayment: jest.fn() }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: mockUid ? { uid: mockUid } : null }) }));

const SIG = "a".repeat(64);
const replaceState = jest.fn();
let session = new Map<string, string>();
let n = 0;
/** A fresh order id per test, because a return is handled once per page load. */
const orderId = () => `order_TEST${String(++n).padStart(6, "0")}`;
const setUrl = (search: string) => {
  (globalThis as { window?: unknown }).window = { location: { href: `https://www.paire.in/app/${search}` }, history: { state: null, replaceState } };
};
function Probe() { useGiftReturn(); return null; }
const mount = async () => { await act(async () => { renderer.create(<Probe />); }); };
const paidQuery = (order: string, extra = "") => `?kraftai=paid&kind=gift&order=${order}&payment=pay_ABC12345&signature=${SIG}${extra}`;

beforeEach(() => {
  jest.useFakeTimers();
  mockUid = "her";
  session = new Map();
  (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => { session.set(k, v); }, removeItem: (k: string) => { session.delete(k); } };
});
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); delete (globalThis as { window?: unknown }).window; });

test("a paid gift return confirms once (even if mounted twice), leaves the URL parameters for the existing hook, and goes back to the chat", async () => {
  const order = orderId();
  rememberReturnChat("her_him");
  setUrl(paidQuery(order));
  jest.mocked(confirmGiftPayment).mockResolvedValue({ status: "paid", giftId: order });
  await mount();
  await mount();
  await act(async () => { jest.runAllTimers(); });
  expect(confirmGiftPayment).toHaveBeenCalledTimes(1);
  expect(confirmGiftPayment).toHaveBeenCalledWith(order, "pay_ABC12345", SIG);
  expect(replaceState).not.toHaveBeenCalled();
  expect((globalThis as unknown as { window: { location: { href: string } } }).window.location.href).toContain("kraftai=paid");
  expect(mockNavigate).toHaveBeenCalledWith("Chat", { matchId: "her_him" });
  expect(showToast).toHaveBeenCalledWith("Gift paid. They'll see it when they open Paire.", "success");
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["gifts"] });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["send-policy"] });
});

test("a payment the bank is still confirming says so and promises no second charge", async () => {
  setUrl(paidQuery(orderId()));
  jest.mocked(confirmGiftPayment).mockResolvedValue({ status: "pending", giftId: "g" });
  await mount();
  expect(showToast).toHaveBeenCalledWith("Payment received. Your bank is still confirming it; you won't be charged again.");
});

test("a second payment that is being refunded is explained, and nothing polls", async () => {
  setUrl(paidQuery(orderId()));
  jest.mocked(confirmGiftPayment).mockResolvedValue({ status: "paid", giftId: "g", refunding: true });
  await mount();
  expect(showToast).toHaveBeenCalledWith("That was a second payment, and it is being refunded.");
  expect(confirmGiftPayment).toHaveBeenCalledTimes(1);
});

test("a server refusal (refunded, test payment) shows its own plain message", async () => {
  setUrl(paidQuery(orderId()));
  jest.mocked(confirmGiftPayment).mockRejectedValue(Object.assign(new Error("This gift can't be delivered any more, so your payment is being refunded."), { code: "functions/failed-precondition" }));
  await mount();
  expect(showToast).toHaveBeenCalledWith("This gift can't be delivered any more, so your payment is being refunded.", "error");
});

test("a failed or cancelled gift return confirms nothing and says nobody was charged", async () => {
  for (const result of ["failed", "cancelled"]) {
    setUrl(`?kraftai=${result}&kind=gift&order=${orderId()}`);
    await mount();
  }
  expect(confirmGiftPayment).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledTimes(2);
  expect(showToast).toHaveBeenCalledWith("The payment didn't go through, and you weren't charged.");
});

test.each([["plus"], ["chat"]])("kind=%s is left entirely to the existing hook", async (kind) => {
  rememberReturnChat("her_him");
  setUrl(`?kraftai=paid&kind=${kind}&order=${orderId()}&payment=pay_ABC12345&signature=${SIG}`);
  await mount();
  await act(async () => { jest.runAllTimers(); });
  expect(confirmGiftPayment).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockInvalidate).not.toHaveBeenCalled();
  expect(replaceState).not.toHaveBeenCalled();
  expect(session.get("paire.ccavenueReturnChat")).toBe("her_him");
});

test("no kraftai parameter, signed out, or another page: nothing happens", async () => {
  setUrl(`?kind=gift&order=${orderId()}&payment=pay_ABC12345&signature=${SIG}`);
  await mount();
  mockUid = undefined;
  setUrl(paidQuery(orderId()));
  await mount();
  expect(confirmGiftPayment).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
});

test.each([
  ["order", `?kraftai=paid&kind=gift&order=nope&payment=pay_ABC12345&signature=${SIG}`],
  ["payment", `?kraftai=paid&kind=gift&order=order_BADPAY1234&payment=x&signature=${SIG}`],
  ["signature", "?kraftai=paid&kind=gift&order=order_BADSIG1234&payment=pay_ABC12345&signature=ZZ"]
])("a malformed %s is never sent to the server", async (_name, search) => {
  setUrl(search);
  await mount();
  expect(confirmGiftPayment).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledTimes(1);
});
