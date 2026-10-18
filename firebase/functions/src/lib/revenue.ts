type Source = "razorpay" | "razorpay-chat" | "upi" | "ccavenue";
export type RevenueOrder = Record<string, unknown> & { id: string; source: Source };
export type ManualReceipt = Record<string, unknown> & { id: string };

const validAmount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const key = (order: RevenueOrder) => `${order.source}:${order.id}`;
const product = (order: RevenueOrder) => order.source === "razorpay" ? "plus" : order.source === "razorpay-chat" ? "chat" : order.kind ?? "chat";
const paid = (order: RevenueOrder) => order.status === (order.source === "upi" ? "approved" : "paid");
const reversed = (order: RevenueOrder) => ["refunded", "chargeback", "revoked", "duplicate", "orphaned", "rejected"].includes(String(order.status));

/** Count receipts, not pass durations. Owner confirmations never pretend to be gateway confirmations. */
export function summarizeRevenue(orders: RevenueOrder[], receipts: ManualReceipt[]) {
  const totals = { plus: { orders: 0, paise: 0, manualOrders: 0, manualPaise: 0 }, chat: { orders: 0, paise: 0, manualOrders: 0, manualPaise: 0 } };
  const usable = orders.filter((order) => order.mode !== "test" && order.currency === "INR" && validAmount(order.amountPaise));
  for (const order of usable) {
    const kind = product(order);
    if (!paid(order) || (kind !== "plus" && kind !== "chat")) continue;
    totals[kind].orders++;
    totals[kind].paise += order.amountPaise as number;
  }
  const claimed = new Set<string>();
  for (const receipt of [...receipts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (receipt.confirmationSource !== "owner_statement" || receipt.currency !== "INR" ||
      !["active", "reconciled", "confirmed"].includes(String(receipt.status)) || !validAmount(receipt.amountReportedPaise)) continue;
    const recovery = receipt.action === "plus-payment-recovery";
    if (!recovery && receipt.action !== "payment-received") continue;
    const source = receipt.orderSource ?? (recovery ? "ccavenue" : undefined);
    const kind = recovery ? "plus" : receipt.kind;
    if (kind !== "plus" && kind !== "chat") continue;
    const ids = receipt.coveredOrderIds;
    if (!Array.isArray(ids)) continue;
    const linked = usable.filter((order) => order.source === source && order.uid === receipt.uid &&
      order.amountPaise === receipt.amountReportedPaise && product(order) === kind && ids.includes(order.id));
    // Aliases represent one receipt even if the customer opened several checkouts.
    // A later gateway confirmation replaces it; a refund/chargeback removes it.
    if (!linked.length || linked.some((order) => claimed.has(key(order)))) continue;
    linked.forEach((order) => claimed.add(key(order)));
    if (linked.some((order) => paid(order) || reversed(order))) continue;
    totals[kind].orders++;
    totals[kind].paise += receipt.amountReportedPaise;
    totals[kind].manualOrders++;
    totals[kind].manualPaise += receipt.amountReportedPaise;
  }
  const result = (total: typeof totals.plus) => ({ orders: total.orders, rupees: total.paise / 100, manualOrders: total.manualOrders, manualRupees: total.manualPaise / 100 });
  return { plus: result(totals.plus), unlimitedChat: result(totals.chat) };
}
