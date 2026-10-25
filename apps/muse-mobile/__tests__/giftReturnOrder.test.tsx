import React from "react";
import renderer, { act } from "react-test-renderer";
import { showToast } from "../src/components/Toast";
import { useGiftReturn } from "../src/hooks/useGiftReturn";
import { useKraftaiReturn } from "../src/hooks/useKraftaiReturn";
import { callFunction } from "../src/services/firebase";
import { confirmGiftPayment } from "../src/services/giftService";

/** The two hooks together in AppStack's real order: the gift hook first, the existing hook second. */
const mockNavigate = jest.fn();
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: jest.fn() }) }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/services/supportMode", () => ({ isSupportView: false }));
jest.mock("../src/services/firebase", () => ({ callFunction: jest.fn() }));
jest.mock("../src/services/billingService", () => ({ fetchPremiumStatus: jest.fn() }));
jest.mock("../src/services/chatAccessService", () => ({ fetchChatAccess: jest.fn() }));
jest.mock("../src/services/giftService", () => ({ confirmGiftPayment: jest.fn() }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "her" } }) }));

const SIG = "a".repeat(64);
const win = { location: { href: "" }, history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { win.location.href = url; } } };
const setUrl = (search: string) => { win.location.href = `https://www.paire.in/app/${search}`; (globalThis as { window?: unknown }).window = win; };
const params = () => new URL(win.location.href).searchParams;
function Both() { useGiftReturn(); useKraftaiReturn(); return null; }
const mount = async () => { await act(async () => { renderer.create(<Both />); }); };
beforeEach(() => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
});
afterEach(() => { jest.clearAllMocks(); delete (globalThis as { window?: unknown }).window; });

test("kind=gift: one confirmation, only the gift toast, and the existing hook then strips the parameters without acting", async () => {
  jest.mocked(confirmGiftPayment).mockResolvedValue({ status: "paid", giftId: "g" });
  setUrl(`?kraftai=paid&kind=gift&order=order_BOTH000001&payment=pay_ABC12345&signature=${SIG}`);
  await mount();
  expect(confirmGiftPayment).toHaveBeenCalledTimes(1);
  expect(confirmGiftPayment).toHaveBeenCalledWith("order_BOTH000001", "pay_ABC12345", SIG);
  expect(callFunction).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith("Gift paid. They'll see it when they open Paire.", "success");
  for (const name of ["kraftai", "kind", "order", "payment", "signature"]) expect(params().has(name)).toBe(false);
});

test("kind=plus: the gift hook stays inert and the existing hook confirms the Plus payment as before", async () => {
  jest.mocked(callFunction).mockResolvedValue({ active: true });
  setUrl(`?kraftai=paid&kind=plus&order=order_BOTH000002&payment=pay_ABC12345&signature=${SIG}`);
  await mount();
  expect(confirmGiftPayment).not.toHaveBeenCalled();
  expect(callFunction).toHaveBeenCalledTimes(1);
  expect(callFunction).toHaveBeenCalledWith("confirmPlusPayment", { orderId: "order_BOTH000002", paymentId: "pay_ABC12345", signature: SIG });
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith("Payment received. Your Paire Plus pass is active.", "success");
  expect(params().has("kraftai")).toBe(false);
});
