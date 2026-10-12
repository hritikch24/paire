import { createHmac } from "crypto";
import { parsePasses, sameSecret, validBillingSnapshot, validRevenueCatSignature } from "../src/lib/billing";
const now = Date.parse("2026-10-10T12:00:00Z");
const purchase = { id: "rc-id", store_transaction_id: "store-id", store: "play_store", is_sandbox: false, purchase_date: new Date(now - 1000).toISOString() };
const body = (rows: unknown, product = "muse_premium_day") => ({ subscriber: { non_subscriptions: { [product]: rows } } });
it("derives a fixed-duration pass from validated store transactions, without extending on replay", () => {
  expect(parsePasses(body([purchase]), now)[0]).toEqual({ transactionId: "store-id", productId: "muse_premium_day", store: "play_store", purchasedAt: now - 1000, expiresAt: now - 1000 + 86_400_000 });
  expect(parsePasses(body([purchase]), now + 5000)).toEqual(parsePasses(body([purchase]), now));
  expect(parsePasses(body([purchase], "muse_premium_month"), now)[0].expiresAt).toBe(now - 1000 + 30 * 86_400_000);
});
it("rejects sandbox, unknown products/stores, forged dates and missing environment fields", () => {
  for (const edits of [{ is_sandbox: true }, { is_sandbox: undefined }, { purchase_date: "invalid" }, { purchase_date: new Date(now + 1).toISOString() }, { store: "stripe" }, { id: undefined, store_transaction_id: undefined }])
    expect(parsePasses(body([{ ...purchase, ...edits }]), now)).toEqual([]);
  expect(parsePasses(body([purchase], "unknown"), now)).toEqual([]);
  expect(parsePasses(body([{ ...purchase, is_sandbox: true }]), now, true)).toHaveLength(1);
});
it("expires passes and refuses stale or future-dated server snapshots", () => {
  expect(validBillingSnapshot({ checkedAt: now - 1, expiresAt: now + 1 }, now)).toBe(true);
  for (const snapshot of [{ checkedAt: now, expiresAt: now }, { checkedAt: now - 600_001, expiresAt: now + 1 }, { checkedAt: now + 1, expiresAt: now + 100 }, { expiresAt: Infinity, checkedAt: now }]) expect(validBillingSnapshot(snapshot, now)).toBe(false);
});
it("authenticates exact raw bytes and fresh HMAC signatures", () => {
  const raw = Buffer.from('{"event":{"id":"one"}}'); const timestamp = String(now / 1000);
  const signature = createHmac("sha256", "secret").update(`${timestamp}.`).update(raw).digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  expect(validRevenueCatSignature(raw, header, "secret", now)).toBe(true);
  expect(validRevenueCatSignature(Buffer.from("{}"), header, "secret", now)).toBe(false);
  expect(validRevenueCatSignature(raw, header, "secret", now + 301_000)).toBe(false);
  expect(validRevenueCatSignature(raw, "bad", "secret", now)).toBe(false);
  expect(sameSecret(undefined, undefined)).toBe(false);
});
