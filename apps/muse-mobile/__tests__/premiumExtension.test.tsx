import React from "react";
import renderer, { act } from "react-test-renderer";
import { PremiumScreen } from "../src/screens/PremiumScreen";
import { useKraftaiReturn } from "../src/hooks/useKraftaiReturn";
import { purchaseWebPass, fetchPremiumStatus } from "../src/services/billingService";
import { ChatAccess, purchaseChatUnlock, startUpiUnlock } from "../src/services/chatAccessService";
import { callFunction } from "../src/services/firebase";
import { showToast } from "../src/components/Toast";

let mockChat: ChatAccess | undefined;
let mockOfferError = false;
const mockPrices = {day:5900,week:17900,month:34900,halfyear:124900,year:179900,lifetime:369900,chat:7900};
const mockUntil = Date.UTC(2026, 11, 18, 10);
let mockPremium: { active: boolean; expiresAt: number | null; webPurchaseAvailable: boolean; upiPurchaseAvailable?: boolean; lifetime?: boolean } = { active: true, expiresAt: mockUntil, webPurchaseAvailable: true };
const mockInvalidate = jest.fn();
const mockRefetch = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: jest.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: queryKey[0] === "premium" ? mockPremium : queryKey[0] === "launch-offer" && !mockOfferError ? { active:false, personalized:null, code:null, couponAvailable:false, remaining:0, plans:Object.fromEntries(Object.entries(mockPrices).map(([id,amount])=>[id,{regular:amount,amount,offer:amount,coupon:amount}])) } : undefined, isError: queryKey[0] === "launch-offer" && mockOfferError, refetch: mockRefetch })
}));
jest.mock("@react-navigation/native", () => ({ useNavigation: () => ({ navigate: jest.fn() }) }));
jest.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: { openURL: jest.fn() }, Pressable: "Pressable" }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton" }));
jest.mock("../src/components/Screen", () => ({ Screen: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => <>{children}{footer}</> }));
jest.mock("../src/components/ScreenHeader", () => ({ ScreenHeader: () => null }));
jest.mock("../src/components/Icon", () => ({ Icon: () => null }));
jest.mock("../src/components/MuseInput", () => ({ MuseInput: "MuseInput" }));
jest.mock("../src/components/UpiPayPanel", () => ({ UpiPayPanel: () => null }));
jest.mock("../src/components/Toast", () => ({ showToast: jest.fn() }));
jest.mock("../src/theme/useThemeColors", () => ({ useThemeColors: () => ({ gradient: ["#fff", "#000"] }) }));
jest.mock("../src/store/authStore", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { uid: "fixture-member" } }) }));
jest.mock("../src/hooks/useChatAccess", () => ({ useChatAccess: () => ({ data: mockChat }) }));
jest.mock("../src/hooks/useWebScreenActive", () => ({ useWebScreenActive: () => true }));
jest.mock("../src/services/billingService", () => ({ webCheckout: true, nativeBillingAvailable: false, purchaseWebPass: jest.fn(), fetchPremiumStatus: jest.fn() }));
jest.mock("../src/services/chatAccessService", () => ({ fetchOpenUpiOrder: jest.fn(), startUpiUnlock: jest.fn(), purchaseChatUnlock: jest.fn(), fetchChatAccess: jest.fn() }));
jest.mock("../src/services/ccavenueService", () => ({ ccavenueCheckout: true }));
jest.mock("../src/services/discoveryService", () => ({ fetchDailyAllowance: jest.fn() }));
jest.mock("../src/services/analytics", () => ({ trackConversion: jest.fn() }));
jest.mock("../src/services/firebase", () => ({ callFunction: jest.fn() }));
jest.mock("../src/services/supportMode", () => ({ isSupportView: false }));
jest.mock("../src/utils/chatAccess", () => ({ restoreDrafts: jest.fn(), takeReturnChat: jest.fn() }));
jest.mock("../src/config/legal", () => ({ legal: {} }));

afterEach(() => { jest.clearAllMocks(); mockChat = undefined; mockOfferError = false; });

test("an active web member can extend by the selected days, retaining the current expiry", async () => {
  mockPremium = { active: true, expiresAt: mockUntil, webPurchaseAvailable: true };
  jest.mocked(purchaseWebPass).mockResolvedValue({ redirecting: true });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  const button = () => tree.root.findByProps({ testID: "premium-purchase" });
  expect(button().props.disabled).toBe(false);
  expect(button().props.children).toBe("Extend Plus by 30 days · ₹349");
  const extension = () => tree.root.findByProps({ testID: "premium-extension" }).findAll(node => typeof node.props.children === "string").map(node => node.props.children).join(" ");
  expect(extension()).toContain(new Date(mockUntil + 30 * 86_400_000).toLocaleString("en-IN"));
  await act(async () => { tree.root.findByProps({ testID: "premium-more-options" }).props.onPress(); });
  await act(async () => { tree.root.findByProps({ testID: "premium-plan-day" }).props.onPress(); });
  expect(button().props.children).toBe("Extend Plus by 1 day · ₹59");
  expect(extension()).toContain(new Date(mockUntil + 86_400_000).toLocaleString("en-IN"));
  await act(async () => { await button().props.onPress(); });
  expect(purchaseWebPass).toHaveBeenCalledWith("day", "#000", undefined, 5900);
  await act(async () => { tree.unmount(); });
});

test("active Plus still respects the server's sales switch", async () => {
  mockPremium = { active: true, expiresAt: mockUntil, webPurchaseAvailable: false };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.disabled).toBe(true);
  await act(async () => { tree.unmount(); });
});

function Return() { useKraftaiReturn(); return null; }

test.each(["pending", "paid", "cancelled"])("an existing pass does not misreport a %s extension", async (outcome) => {
  const signature = "a".repeat(64);
  Object.assign(window, {
    location: { href: `http://localhost/app/?kraftai=${outcome === "cancelled" ? "cancelled" : "paid"}&kind=plus&order=order_fixture123&payment=pay_fixture123&signature=${signature}` },
    history: { state: null, replaceState: jest.fn() }
  });
  jest.mocked(callFunction).mockResolvedValue({ active: true, expiresAt: mockUntil, pending: outcome === "pending" });
  jest.mocked(fetchPremiumStatus).mockResolvedValue({ active: true, expiresAt: mockUntil, purchaseAvailable: false });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Return />); });
  const message = jest.mocked(showToast).mock.calls[0][0];
  expect(message).toMatch(outcome === "pending" ? /still confirming/ : outcome === "cancelled" ? /window closed/ : /Payment received.*pass is active/);
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["premium"] });
  await act(async () => { tree.unmount(); });
});


test("Lifetime Plus is ₹3,699 once, starts immediately and never pretends to add finite days", async () => {
  mockPremium = { active: true, expiresAt: mockUntil, webPurchaseAvailable: true };
  jest.mocked(purchaseWebPass).mockResolvedValue({ redirecting: true });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  await act(async () => { tree.root.findByProps({ testID: "premium-plan-lifetime" }).props.onPress(); });
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.children).toBe("Get Lifetime Plus · ₹3,699");
  expect(tree.root.findAllByProps({ testID: "premium-extension" })).toHaveLength(0);
  expect(tree.root.findByProps({ testID: "premium-lifetime-terms" }).props.children.join("")).toMatch(/₹3,699 once/);
  await act(async () => { await tree.root.findByProps({ testID: "premium-purchase" }).props.onPress(); });
  expect(purchaseWebPass).toHaveBeenCalledWith("lifetime", "#000", undefined, 369900);
  await act(async () => { tree.unmount(); });
});

test("lifetime owners see permanent benefits instead of another purchase or an invalid expiry", async () => {
  mockPremium = { active: true, expiresAt: null, lifetime: true, webPurchaseAvailable: false };
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.disabled).toBe(true);
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.children).toBe("Lifetime Plus is active");
  expect(tree.root.findAllByProps({ testID: "premium-plan-lifetime" })).toHaveLength(0);
  expect(tree.root.findByProps({ testID: "premium-lifetime-active" })).toBeDefined();
  await act(async () => { tree.unmount(); });
});

test("featured offers keep monthly, day, lifetime order; six months is a deliberate secondary choice", async () => {
  mockPremium = { active: true, expiresAt: mockUntil, webPurchaseAvailable: true };
  jest.mocked(purchaseWebPass).mockResolvedValue({ redirecting: true });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  const choices = () => tree.root.findAll(node => node.props.accessibilityRole === "radio").map(node => node.props.testID);
  expect(choices()).toEqual(["premium-plan-year", "premium-plan-lifetime", "premium-plan-month"]);
  await act(async () => { tree.root.findByProps({ testID: "premium-more-options" }).props.onPress(); });
  expect(choices()).toEqual(["premium-plan-year", "premium-plan-lifetime", "premium-plan-month", "premium-plan-day", "premium-plan-week", "premium-plan-halfyear"]);
  await act(async () => { tree.root.findByProps({ testID: "premium-plan-halfyear" }).props.onPress(); });
  const button = tree.root.findByProps({ testID: "premium-purchase" });
  expect(button.props.children).toBe("Extend Plus by 180 days · ₹1,249");
  const extension = tree.root.findByProps({ testID: "premium-extension" }).findAll(node => typeof node.props.children === "string").map(node => node.props.children).join(" ");
  expect(extension).toContain(new Date(mockUntil + 180 * 86_400_000).toLocaleString("en-IN"));
  await act(async () => { await button.props.onPress(); });
  expect(purchaseWebPass).toHaveBeenCalledWith("halfyear", "#000", undefined, 124900);
  await act(async () => { tree.unmount(); });
});

function chatOffer(unlock: ChatAccess["unlock"]): ChatAccess {
  return { enforced: true, enforceFrom: null, legacyCutoff: null, legacyGraceUntil: null, canSend: false, unlimited: false, premiumUntil: null, unlock, serverNow: Date.now() };
}
test("the messaging-only offer explains first-match eligibility and never opens a purchase for an unavailable account", async () => {
  mockPremium = { active: false, expiresAt: null, webPurchaseAvailable: true };
  mockChat = chatOffer({ status: "unavailable", priceInr: 49, reason: "no-match" });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  expect(tree.root.findByProps({ testID: "chat-offer-unavailable" }).props.children).toMatch(/first mutual match/);
  expect(tree.root.findAllByProps({ testID: "chat-access-unlock" })).toHaveLength(0);
  expect(purchaseChatUnlock).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});
test("eligible members can deliberately open messaging-only checkout from Plus without creating a Plus order", async () => {
  mockPremium = { active: false, expiresAt: null, webPurchaseAvailable: true };
  mockChat = chatOffer({ status: "available", priceInr: 49, methods: ["razorpay"] });
  jest.mocked(purchaseChatUnlock).mockResolvedValue("redirecting");
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  expect(purchaseChatUnlock).not.toHaveBeenCalled();
  const buyChat = tree.root.findByProps({ testID: "chat-access-unlock" });
  expect(buyChat.props.children).toBe("Unlock unlimited chats — ₹79 once");
  await act(async () => { await buyChat.props.onPress(); });
  expect(purchaseChatUnlock).toHaveBeenCalledWith("#000", undefined, undefined, 7900);
  expect(purchaseWebPass).not.toHaveBeenCalled();
  await act(async () => { tree.unmount(); });
});


test("retired coupons do not reach hosted checkout", async () => {
  mockPremium = { active: false, expiresAt: null, webPurchaseAvailable: true };
  jest.mocked(purchaseWebPass).mockResolvedValue({ redirecting: true });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  await act(async () => { tree.root.findByProps({ testID: "premium-more-options" }).props.onPress(); });
  await act(async () => { tree.root.findByProps({ testID: "premium-plan-day" }).props.onPress(); });
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.children).toBe("Get 1 day · ₹59");
  expect(purchaseWebPass).not.toHaveBeenCalled();
  await act(async () => { await tree.root.findByProps({ testID: "premium-purchase" }).props.onPress(); });
  expect(purchaseWebPass).toHaveBeenCalledWith("day", "#000", undefined, 5900);
  await act(async () => { tree.unmount(); });
});
test("a failed promo validation disables purchase instead of silently charging another price", async () => {
  mockPremium = { active: false, expiresAt: null, webPurchaseAvailable: true };
  mockOfferError = true;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PremiumScreen />); });
  expect(tree.root.findByProps({ testID: "premium-purchase" }).props.disabled).toBe(true);
  await act(async () => { tree.unmount(); });
});

test("the fixed Lifetime price is passed to checkout after explicit selection", async()=>{
 mockPremium={active:false,expiresAt:null,webPurchaseAvailable:true};
 jest.mocked(purchaseWebPass).mockResolvedValue({redirecting:true});let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<PremiumScreen/>);});
 expect(tree.root.findAll(node=>node.props.accessibilityRole==="radio").map(node=>node.props.testID)).toEqual(["premium-plan-year","premium-plan-lifetime","premium-plan-month"]);
 await act(async()=>tree.root.findByProps({testID:"premium-plan-lifetime"}).props.onPress());
 expect(tree.root.findByProps({testID:"premium-purchase"}).props.children).toBe("Get Lifetime Plus · ₹3,699");expect(purchaseWebPass).not.toHaveBeenCalled();
 await act(async()=>{await tree.root.findByProps({testID:"premium-purchase"}).props.onPress();});expect(purchaseWebPass).toHaveBeenCalledWith("lifetime","#000",undefined,369900);
 await act(async()=>tree.unmount());
});

test("annual checkout submits the fixed annual price only after a deliberate purchase", async()=>{
 mockPremium={active:false,expiresAt:null,webPurchaseAvailable:true};
 jest.mocked(purchaseWebPass).mockResolvedValue({redirecting:true});let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<PremiumScreen/>);});
 await act(async()=>tree.root.findByProps({testID:"premium-plan-year"}).props.onPress());
 expect(tree.root.findByProps({testID:"premium-purchase"}).props.children).toBe("Get Annual Plus · ₹1,799");
 expect(tree.root.findByProps({testID:"premium-plan-year"}).props.accessibilityLabel).toContain("1799 rupees");
 expect(purchaseWebPass).not.toHaveBeenCalled();
 await act(async()=>{await tree.root.findByProps({testID:"premium-purchase"}).props.onPress();});
 expect(purchaseWebPass).toHaveBeenCalledWith("year","#000",undefined,179900);
 await act(async()=>tree.unmount());
});

test("hosted checkout keeps the advertised member price when direct UPI is also available",async()=>{
 mockPremium={active:false,expiresAt:null,webPurchaseAvailable:true,upiPurchaseAvailable:true};
 jest.mocked(purchaseWebPass).mockResolvedValue({redirecting:true});let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<PremiumScreen/>);});
 await act(async()=>tree.root.findByProps({testID:"premium-plan-year"}).props.onPress());
 await act(async()=>{await tree.root.findByProps({testID:"premium-purchase"}).props.onPress();});
 expect(purchaseWebPass).toHaveBeenCalledWith("year","#000",undefined,179900);expect(startUpiUnlock).not.toHaveBeenCalled();
 await act(async()=>tree.unmount());
});
test("direct UPI fallback shows its full catalog amount and hides the inapplicable member saving",async()=>{
 mockPremium={active:false,expiresAt:null,webPurchaseAvailable:false,upiPurchaseAvailable:true};
 jest.mocked(startUpiUnlock).mockResolvedValue({status:"owned"});let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<PremiumScreen/>);});
 await act(async()=>tree.root.findByProps({testID:"premium-plan-year"}).props.onPress());
 expect(tree.root.findByProps({testID:"premium-purchase"}).props.children).toBe("Pay ₹1,799 by UPI · Annual Plus");
 expect(JSON.stringify(tree.toJSON())).not.toContain("50% OFF");
 await act(async()=>{await tree.root.findByProps({testID:"premium-purchase"}).props.onPress();});
 expect(startUpiUnlock).toHaveBeenCalledWith("year");expect(purchaseWebPass).not.toHaveBeenCalled();
 await act(async()=>tree.unmount());
});
test("short passes never claim the member offer that only covers longer plans",async()=>{
 mockPremium={active:false,expiresAt:null,webPurchaseAvailable:true};let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<PremiumScreen/>);});
 await act(async()=>tree.root.findByProps({testID:"premium-more-options"}).props.onPress());
 const day=tree.root.findByProps({testID:"premium-plan-day"});
 expect(day.findAll(node=>typeof node.props.children==="string" && node.props.children.includes("50% OFF"))).toHaveLength(0);
 await act(async()=>tree.unmount());
});
