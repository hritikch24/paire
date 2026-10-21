type Source = "razorpay" | "razorpay-chat" | "upi" | "ccavenue";
export type RevenueOrder = Record<string, unknown> & { id: string; source: Source };
export type ManualReceipt = Record<string, unknown> & { id: string };
export type RecognizedPayment = { uid: string | null; kind: "plus" | "chat"; source: Source; orderId: string; amountPaise: number; manual: boolean; confirmedAt: number | null };

const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const key = (order: RevenueOrder) => `${order.source}:${order.id}`;
const product = (order: RevenueOrder) => order.source === "razorpay" ? "plus" : order.source === "razorpay-chat" ? "chat" : order.kind ?? "chat";
const paid = (order: RevenueOrder) => order.status === (order.source === "upi" ? "approved" : "paid");
const reversed = (order: RevenueOrder) => ["refunded", "chargeback", "revoked", "duplicate", "orphaned", "rejected"].includes(String(order.status));
const memberUid = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
const time = (value: unknown): number | null => {
  try {
    const ms = typeof value === "number" ? value : value && typeof (value as { toMillis?: unknown }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : null;
    return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch { return null; }
};

/** One receipt stream powers both lifetime totals and recent purchases. */
export function recognizedPayments(orders: RevenueOrder[], receipts: ManualReceipt[]): RecognizedPayment[] {
  const usable = orders.filter(order => order.mode !== "test" && order.currency === "INR" && validAmount(order.amountPaise));
  const receiptLinks = [...receipts].sort((a, b) => a.id.localeCompare(b.id)).flatMap(receipt => {
    if (receipt.confirmationSource !== "owner_statement" || receipt.currency !== "INR" || !["active", "reconciled", "confirmed"].includes(String(receipt.status)) || !validAmount(receipt.amountReportedPaise)) return [];
    const recovery = receipt.action === "plus-payment-recovery";
    if (!recovery && receipt.action !== "payment-received") return [];
    const source = receipt.orderSource ?? (recovery ? "ccavenue" : undefined), kind = recovery ? "plus" : receipt.kind;
    const ids = receipt.coveredOrderIds;
    if ((kind !== "plus" && kind !== "chat") || !Array.isArray(ids)) return [];
    const linked = usable.filter(order => order.source === source && order.uid === receipt.uid && order.amountPaise === receipt.amountReportedPaise && product(order) === kind && ids.includes(order.id));
    return linked.length ? [{ receipt, linked, kind: kind as "plus" | "chat" }] : [];
  });
  // Gateway reconciliation must not make an already-recorded receipt look like
  // a new purchase today. Preserve its earliest known confirmation time.
  const receiptTimes = new Map<string, number>();
  for (const { receipt, linked } of receiptLinks) {
    const at = time(receipt.createdAt);
    if (at !== null) for (const order of linked) receiptTimes.set(key(order), Math.min(at, receiptTimes.get(key(order)) ?? Infinity));
  }
  const confirmation = (linked: RevenueOrder[], at: number | null) => {
    const times = [at, ...linked.map(order => receiptTimes.get(key(order)) ?? null)].filter((value): value is number => value !== null);
    return times.length ? Math.min(...times) : null;
  };
  const result: RecognizedPayment[] = [];
  for (const order of usable) {
    const kind = product(order);
    if (!paid(order) || (kind !== "plus" && kind !== "chat")) continue;
    result.push({ uid: memberUid(order.uid), kind, source: order.source, orderId: order.id, amountPaise: order.amountPaise as number, manual: false, confirmedAt: confirmation([order], time(order.source === "upi" ? order.reviewedAt : order.paidAt)) });
  }
  const claimed = new Set<string>();
  for (const { receipt, linked, kind } of receiptLinks) {
    // Checkout aliases and repeated approvals represent one receipt. A later
    // gateway confirmation replaces it; reversal removes its manual revenue.
    if (linked.some(order => claimed.has(key(order)))) continue;
    linked.forEach(order => claimed.add(key(order)));
    if (linked.some(order => paid(order) || reversed(order))) continue;
    result.push({ uid: memberUid(receipt.uid), kind, source: linked[0].source, orderId: linked[0].id, amountPaise: receipt.amountReportedPaise as number, manual: true, confirmedAt: confirmation(linked, time(receipt.createdAt)) });
  }
  return result;
}

/** Count money received, not entitlement duration. */
export function summarizeRevenue(orders: RevenueOrder[], receipts: ManualReceipt[]) {
  const totals = { plus: { orders: 0, paise: 0, manualOrders: 0, manualPaise: 0 }, chat: { orders: 0, paise: 0, manualOrders: 0, manualPaise: 0 } };
  for (const payment of recognizedPayments(orders, receipts)) {
    const total = totals[payment.kind];
    total.orders++; total.paise += payment.amountPaise;
    if (payment.manual) { total.manualOrders++; total.manualPaise += payment.amountPaise; }
  }
  const result = (total: typeof totals.plus) => ({ orders: total.orders, rupees: total.paise / 100, manualOrders: total.manualOrders, manualRupees: total.manualPaise / 100 });
  return { plus: result(totals.plus), unlimitedChat: result(totals.chat) };
}

export function recentPremiumPayments(payments: RecognizedPayment[], now: number, excluded = new Set<string>()) {
  return payments.filter(payment => payment.kind === "plus" && payment.confirmedAt !== null && payment.confirmedAt >= now - 86_400_000 && payment.confirmedAt <= now && (!payment.uid || (!excluded.has(payment.uid) && !payment.uid.startsWith("support_"))))
    .sort((a, b) => b.confirmedAt! - a.confirmedAt!);
}
export function summarizeRecentPremium(payments: RecognizedPayment[], now: number) {
  return { buyers: new Set(payments.flatMap(payment => payment.uid ? [payment.uid] : [])).size, orders: payments.length, rupees: payments.reduce((sum, payment) => sum + payment.amountPaise, 0) / 100, manualOrders: payments.filter(payment => payment.manual).length, unassignedOrders: payments.filter(payment => !payment.uid).length, windowStart: now - 86_400_000, windowEnd: now };
}
