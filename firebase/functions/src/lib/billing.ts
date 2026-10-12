import { createHmac, timingSafeEqual } from "crypto";

export const PASS_PRODUCTS = { muse_premium_day: 1, muse_premium_week: 7, muse_premium_month: 30 } as const;
export type PassProduct = keyof typeof PASS_PRODUCTS;
export type ValidPass = { transactionId: string; productId: PassProduct; purchasedAt: number; expiresAt: number; store: string };

/** Consumable passes have a fixed duration; never treat RC's lifetime entitlement as Premium. */
export function parsePasses(value: unknown, now = Date.now(), allowSandbox = false): ValidPass[] {
  const purchases = (value as { subscriber?: { non_subscriptions?: Record<string, unknown> } } | null)?.subscriber?.non_subscriptions;
  if (!purchases || typeof purchases !== "object") return [];
  const result: ValidPass[] = [];
  for (const [productId, days] of Object.entries(PASS_PRODUCTS)) {
    const rows = purchases[productId];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const { id, store_transaction_id: storeId, purchase_date: date, is_sandbox: sandbox, store } = row;
      const purchasedAt = typeof date === "string" ? Date.parse(date) : NaN;
      const transactionId = typeof storeId === "string" && storeId ? storeId : id;
      if (typeof transactionId !== "string" || !transactionId || transactionId.length > 300 ||
        !["app_store", "play_store"].includes(store) || typeof sandbox !== "boolean" || (sandbox && !allowSandbox) ||
        !Number.isFinite(purchasedAt) || purchasedAt <= 0 || purchasedAt > now) continue;
      result.push({ transactionId, productId: productId as PassProduct, purchasedAt, expiresAt: purchasedAt + days * 86_400_000, store });
    }
  }
  return result;
}

export function validBillingSnapshot(snapshot: { expiresAt?: unknown; checkedAt?: unknown } | undefined, now = Date.now()): boolean {
  return typeof snapshot?.expiresAt === "number" && Number.isFinite(snapshot.expiresAt) && snapshot.expiresAt > now &&
    typeof snapshot.checkedAt === "number" && snapshot.checkedAt <= now && snapshot.checkedAt > now - 10 * 60_000;
}

export function sameSecret(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual || !expected || expected === "disabled") return false;
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validRevenueCatSignature(raw: Buffer, header: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!secret || secret === "disabled" || !header) return false;
  const match = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header);
  if (!match || Math.abs(now / 1000 - Number(match[1])) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${match[1]}.`).update(raw).digest("hex");
  return sameSecret(match[2], expected);
}
