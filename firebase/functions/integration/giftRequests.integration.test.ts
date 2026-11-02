import { randomUUID } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
process.env.MUSE_BILLING_ENABLED="true";
process.env.MUSE_UNCACHED_RUNTIME="true";
if(!getApps().length) initializeApp({projectId:"demo-muse",storageBucket:"demo-muse.appspot.com"});
const db=getFirestore();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gifts=require("../src/giftRequests") as typeof import("../src/giftRequests");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {dailyLimitRef}=require("../src/quota") as typeof import("../src/quota");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {pairId}=require("../src/lib/ids") as typeof import("../src/lib/ids");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call=<T>(fn:{run:(r:any)=>T},uid:string,data:unknown={})=>fn.run({data,auth:{uid,token:{email_verified:true}},rawRequest:{},acceptsStreaming:false});
async function member(gender:"woman"|"man"="woman"){
const uid=(await getAuth().createUser({email:`gift-request-${randomUUID()}@example.com`,emailVerified:true})).uid;
await db.doc(`users/${uid}`).set({uid,displayName:"Fictional member",gender,age:29,photoUrls:[],onboardingComplete:true,isDiscoverable:true});
await db.doc(`users/${uid}/private/settings`).set({notifications:{matches:false,messages:false}});
await db.doc(`moderation/${uid}`).set({status:"ok",emailVerified:true,cohort:"test"});return uid;
}
async function matched(a:string,b:string,extra={}){const id=pairId(a,b);await db.doc(`matches/${id}`).set({participants:[a,b],active:true,...extra});return id;}
beforeEach(async()=>{await db.doc("runtime/trust").set({requireVerification:false,giftSales:true});});
afterAll(async()=>{await db.doc("runtime/trust").set({requireVerification:false});});
test("either gender can request a selected plan; retries do not send twice or create orders", async () => {
  const a = await member(), b = await member("man"), id = await matched(a, b);
  const before = (await db.collection("razorpayOrders").get()).size;
  const first = await call(gifts.requestPlusGift, a, { matchId: id, plan: "month" });
  expect(first).toMatchObject({ fromUid: a, toUid: b, plan: "month", status: "pending" });
  expect(await call(gifts.requestPlusGift, a, { matchId: id, plan: "month" })).toEqual(first);
  const second = await call(gifts.requestPlusGift, b, { matchId: id, plan: "week" }); expect(second).toMatchObject({ fromUid: b, toUid: a, plan: "week" });
  expect((await call(gifts.getPlusGiftRequests, a, { matchId: id })).requests).toHaveLength(2);
  expect((await dailyLimitRef(a).get()).get("giftRequests")).toBe(1);
  expect((await db.collection("razorpayOrders").get()).size).toBe(before);
  await expect(call(gifts.requestPlusGift, a, { matchId: id, plan: "lifetime" })).rejects.toThrow(/Choose/);
});

test("recipient may decline even after sales stop or match ends; roles and versions are enforced", async () => {
  const a = await member(), b = await member("man"), outsider = await member(), id = await matched(a, b);
  const row = await call(gifts.requestPlusGift, a, { matchId: id, plan: "day" });
  await expect(call(gifts.closePlusGiftRequest, outsider, { ...row, action: "decline" })).rejects.toThrow(/not yours/);
  await expect(call(gifts.closePlusGiftRequest, a, { ...row, action: "decline" })).rejects.toThrow(/not yours/);
  await expect(call(gifts.closePlusGiftRequest, b, { ...row, version: "stale", action: "decline" })).rejects.toThrow(/changed/);
  await db.doc("runtime/trust").update({ giftSales: false }); await db.doc(`matches/${id}`).update({ active: false });
  expect(await call(gifts.closePlusGiftRequest, b, { ...row, action: "decline" })).toEqual({ closed: true });
  expect((await db.doc(`giftRequests/${row.id}`).get()).get("status")).toBe("declined");
  await db.doc("runtime/trust").update({ giftSales: true }); await db.doc(`matches/${id}`).update({ active: true });
  await expect(call(gifts.requestPlusGift, a, { matchId: id, plan: "day" })).rejects.toThrow(/7 days/);
});

test("gift requests respect opt out, first move, sales, blocks, lifetime and daily limits", async () => {
  const a = await member(), b = await member("man"), id = await matched(a, b, { firstMoveBy: b });
  const input = { matchId: id, plan: "month" };
  await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/start the chat/);
  await db.doc(`matches/${id}`).update({ firstMessageAt: Timestamp.now() });
  await db.doc(`users/${b}/private/settings`).update({ allowGiftRequests: false }); await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/does not accept/);
  await db.doc(`users/${b}/private/settings`).update({ allowGiftRequests: true });
  await db.doc("runtime/trust").update({ giftSales: false }); await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/not open/);
  await db.doc("runtime/trust").update({ giftSales: true });
  await db.doc(`blocks/${b}/blocked/${a}`).set({ targetUid: a }); await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/not available/); await db.doc(`blocks/${b}/blocked/${a}`).delete();
  await dailyLimitRef(a).set({ giftRequests: 3 }); await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/at most 3/);
  await dailyLimitRef(a).set({ giftRequests: 0 });
  await db.doc(`lifetimePlusGrants/${a}`).set({ status: "active", grantedAt: Date.now() }); await expect(call(gifts.requestPlusGift, a, input)).rejects.toThrow(/Lifetime/);
});
test("account data removal deletes both sides of non-financial wishes and keeps payment evidence", async () => {
  const a = await member(), b = await member("man"), id = await matched(a, b);
  const out = await call(gifts.requestPlusGift, a, { matchId: id, plan: "month" });
  const incoming = await call(gifts.requestPlusGift, b, { matchId: id, plan: "day" });
  const evidence = db.doc(`giftOrders/qa-evidence-${randomUUID()}`); await evidence.set({ fromUid: b, toUid: a, status: "paid", amountPaise: 3500 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { purgeUserData } = require("../src/account") as typeof import("../src/account");
  await purgeUserData(a);
  for (const row of [out, incoming]) expect((await db.doc(`giftRequests/${row.id}`).get()).exists).toBe(false);
  expect((await evidence.get()).exists).toBe(true);
});
