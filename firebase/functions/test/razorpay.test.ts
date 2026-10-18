import { createHmac } from "crypto";
import {
  isPlusPlan,
  passDays,
  plusPricePaise,
  isRazorpayId,
  passWindow,
  paymentMatchesOrder,
  PLUS_PASSES,
  validCheckoutSignature,
  validWebhookSignature
} from "../src/lib/razorpay";

const DAY = 24 * 60 * 60 * 1000;
const sign = (value: string | Buffer, secret: string) => createHmac("sha256", secret).update(value).digest("hex");

describe("Paire Plus on the web", () => {
  it("prices passes on the server: ₹20, ₹119 (₹99 photo-verified) and ₹299", () => {
    expect(PLUS_PASSES.day.amountPaise).toBe(2000);
    // 7 days: ₹119, or ₹99 for photo-verified members. Day and month are the same for everyone.
    expect(PLUS_PASSES.week).toMatchObject({ amountPaise: 11900, verifiedAmountPaise: 9900, days: 7 });
    expect(plusPricePaise("week", false)).toBe(11900);
    expect(plusPricePaise("week", true)).toBe(9900);
    expect(plusPricePaise("month", true)).toBe(plusPricePaise("month", false));
    expect(plusPricePaise("day", true)).toBe(2000);
    expect(PLUS_PASSES.month).toMatchObject({ amountPaise: 29900, days: 30 });
    // Web offer: buy 1 month, get 1 month free. Day and week passes have no bonus.
    expect(passDays("month")).toBe(60);
    expect(passDays("week")).toBe(7);
    expect(passDays("day")).toBe(1);
    expect(isPlusPlan("week")).toBe(true);
    expect(isPlusPlan("lifetime")).toBe(false);
    expect(isPlusPlan("toString")).toBe(false);
  });

  it("accepts only well-formed Razorpay ids", () => {
    expect(isRazorpayId("order_Nabc123XYZ", "order")).toBe(true);
    expect(isRazorpayId("pay_Nabc123XYZ", "order")).toBe(false);
    expect(isRazorpayId("order_../../x", "order")).toBe(false);
  });

  it("verifies Checkout's signature over order|payment with the key secret", () => {
    const signature = sign("order_ABC123|pay_DEF456", "secret");
    expect(validCheckoutSignature("order_ABC123", "pay_DEF456", signature, "secret")).toBe(true);
    expect(validCheckoutSignature("order_ABC123", "pay_OTHER1", signature, "secret")).toBe(false);
    expect(validCheckoutSignature("order_ABC123", "pay_DEF456", signature, "disabled")).toBe(false);
    expect(validCheckoutSignature("order_ABC123", "pay_DEF456", undefined, "secret")).toBe(false);
  });

  it("verifies webhooks over the exact raw body", () => {
    const raw = Buffer.from('{"event":"payment.captured"}');
    expect(validWebhookSignature(raw, sign(raw, "hook"), "hook")).toBe(true);
    expect(validWebhookSignature(Buffer.from('{"event":"payment.captured" }'), sign(raw, "hook"), "hook")).toBe(false);
    expect(validWebhookSignature(raw, undefined, "hook")).toBe(false);
  });

  it("grants only captured payments for the exact order, amount and currency", () => {
    const order = { orderId: "order_ABC123", amountPaise: 9900 };
    expect(paymentMatchesOrder({ order_id: "order_ABC123", status: "captured", amount: 9900, currency: "INR" }, order)).toBe("captured");
    expect(paymentMatchesOrder({ order_id: "order_ABC123", status: "authorized", amount: 9900, currency: "INR" }, order)).toBe("pending");
    expect(paymentMatchesOrder({ order_id: "order_ABC123", status: "captured", amount: 2000, currency: "INR" }, order)).toBe("mismatch");
    expect(paymentMatchesOrder({ order_id: "order_OTHER1", status: "captured", amount: 9900, currency: "INR" }, order)).toBe("mismatch");
    expect(paymentMatchesOrder({ order_id: "order_ABC123", status: "failed", amount: 9900, currency: "INR" }, order)).toBe("mismatch");
    expect(paymentMatchesOrder(null, order)).toBe("mismatch");
    expect(paymentMatchesOrder({ order_id: "order_ABC123", status: "captured", amount: 9900, currency: "INR", amount_refunded: 100 }, order)).toBe("mismatch");
  });

  it("queues a pass after one that is still running, so no days are lost", () => {
    const now = 1_000 * DAY;
    expect(passWindow(now, 7, 0)).toEqual({ startsAt: now, expiresAt: now + 7 * DAY });
    expect(passWindow(now, 1, now + 3 * DAY)).toEqual({ startsAt: now + 3 * DAY, expiresAt: now + 4 * DAY });
  });
});
