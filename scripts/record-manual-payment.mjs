#!/usr/bin/env node
/** Owner-confirmed money received; records revenue only, never changes a pass or gateway status. */
import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const { values } = parseArgs({ options: {
  project: { type: "string" }, source: { type: "string" }, order: { type: "string" },
  email: { type: "string" }, reason: { type: "string" }, confirm: { type: "boolean", default: false }
} });
const collections = { ccavenue: "ccavenueOrders", upi: "upiUnlockOrders", razorpay: "razorpayOrders", "razorpay-chat": "chatUnlockOrders" };
if (!/^[a-z][a-z0-9-]{4,62}$/.test(values.project ?? "") || !Object.hasOwn(collections, values.source ?? "") ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(values.order ?? "") || !values.email?.includes("@") || (values.reason?.trim().length ?? 0) < 10) {
  throw new Error("Usage: node scripts/record-manual-payment.mjs --project ID --source ccavenue|upi|razorpay|razorpay-chat --order ID --email EMAIL --reason 'Owner confirmed receipt in bank statement' [--confirm]");
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("This operational script uses the logged-in Firebase CLI against the explicitly selected project. Unset emulator variables first.");
const binary = process.env.PATH.split(":").map((dir) => join(dir, "firebase")).find(existsSync);
if (!binary) throw new Error("Install Firebase CLI and run firebase login first.");
const require = createRequire(import.meta.url);
const auth = require(resolve(dirname(realpathSync(binary)), "../auth.js"));
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const account = auth.getProjectDefaultAccount(root);
if (!account?.tokens?.refresh_token) throw new Error("Run firebase login first.");
const token = await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/userinfo.email", "openid"]);
const headers = { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" };
async function request(url, body) {
  const response = await fetch(url, { headers, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`Admin request failed (${response.status}): ${data.error?.message ?? "unknown error"}`);
  return data;
}
const lookup = await request(`https://identitytoolkit.googleapis.com/v1/projects/${values.project}/accounts:lookup`, { email: [values.email.trim().toLowerCase()] });
const uid = lookup.users?.[0]?.localId;
if (!uid) throw new Error("That account does not exist.");
const base = `https://firestore.googleapis.com/v1/projects/${values.project}/databases/(default)/documents`;
const transaction = (await request(`${base}:beginTransaction`, { options: { readWrite: {} } })).transaction;
let committed = false;
const decode = (value) => value?.stringValue ?? (value?.integerValue !== undefined ? Number(value.integerValue) : value?.doubleValue);
try {
  const order = await request(`${base}/${collections[values.source]}/${values.order}?transaction=${encodeURIComponent(transaction)}`);
  const f = order.fields ?? {};
  const amount = decode(f.amountPaise);
  const status = decode(f.status);
  const kind = values.source === "razorpay" ? "plus" : values.source === "razorpay-chat" ? "chat" : decode(f.kind) ?? "chat";
  if (decode(f.uid) !== uid || decode(f.mode) === "test" || decode(f.currency) !== "INR" ||
    !Number.isSafeInteger(amount) || amount <= 0 || !["plus", "chat"].includes(kind)) throw new Error("Order account, mode, product, currency or amount is invalid.");
  if (["refunded", "chargeback", "revoked", "duplicate", "orphaned", "rejected"].includes(status)) throw new Error("This order is reversed/rejected; do not record it as money received.");
  if (status === "paid" || status === "approved") {
    console.log("Already counted by its confirmed gateway/UPI record; no receipt added.");
  } else {
    const prior = await request(`${base}:runQuery`, { transaction, structuredQuery: { from: [{ collectionId: "billingSupportAudit" }], where: { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: uid } } } } });
    const duplicate = prior.some(({ document }) => {
      const p = document?.fields ?? {};
      const source = decode(p.orderSource) ?? (decode(p.action) === "plus-payment-recovery" ? "ccavenue" : undefined);
      return source === values.source && ["active", "reconciled", "confirmed"].includes(decode(p.status)) && decode(p.confirmationSource) === "owner_statement" &&
        decode(p.currency) === "INR" && decode(p.amountReportedPaise) === amount && p.coveredOrderIds?.arrayValue?.values?.some((v) => decode(v) === values.order);
    });
    if (duplicate) console.log("An owner-confirmed receipt already covers this order; no duplicate added.");
    else {
      const id = `owner-payment-${values.source}-${values.order}`;
      const receipt = { uid, action: "payment-received", status: "confirmed", confirmationSource: "owner_statement", paymentProviderVerified: false, amountReportedPaise: amount, currency: "INR", kind, orderSource: values.source, coveredOrderIds: [values.order], createdAt: Date.now(), approvedBy: account.user?.email ?? "firebase-cli-admin", reason: values.reason.trim() };
      console.log(JSON.stringify({ project: values.project, receiptId: id, amountInr: amount / 100, kind, action: values.confirm ? "record receipt" : "dry run; use --confirm to record" }));
      if (values.confirm) {
        const encode = (v) => typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) } : { arrayValue: { values: v.map(encode) } };
        await request(`${base}:commit`, { transaction, writes: [{ update: { name: `${base.replace("https://firestore.googleapis.com/v1/", "")}/billingSupportAudit/${id}`, fields: Object.fromEntries(Object.entries(receipt).map(([k, v]) => [k, encode(v)])) }, currentDocument: { exists: false } }] });
        committed = true;
        console.log("Receipt recorded. Premium, gateway orders and refunds unchanged.");
      }
    }
  }
} finally {
  if (!committed) await request(`${base}:rollback`, { transaction });
}
