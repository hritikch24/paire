import { randomUUID } from "crypto";
import { db } from "../src/admin";
import { getMemberOffer } from "../src/memberOffers";
import { promoCheckout, getLaunchOffer } from "../src/launchOffer";
import { MEMBER_OFFER, memberPrice } from "../src/lib/member-offer";
import { dayKey } from "../src/lib/ids";
const NOW=MEMBER_OFFER.startsAt+12*3600000;
let uid: string;
async function usage(likes:number,supers:number,day=0){await db.doc(`limits/${uid}/daily/${dayKey(new Date(NOW-day*86400000))}`).set({likes,supers});}
beforeEach(async()=>{uid=`member_offer_qa_${randomUUID()}`;jest.spyOn(Date,"now").mockReturnValue(NOW);await db.doc(`users/${uid}`).set({displayName:"Offer QA",onboardingComplete:true,city:"Pune",interests:["music"]});});
afterEach(()=>jest.restoreAllMocks());
test("welcome offer is persisted once with a fixed seven-day expiry",async()=>{
 const first=await getMemberOffer(uid);expect(first).toMatchObject({discountPercent:50,city:"Pune",interest:"music",startsAt:NOW,expiresAt:NOW+MEMBER_OFFER.durationMs});
 const later=await getMemberOffer(uid,NOW+3600000);expect(later?.id).toBe(first?.id);expect(later?.expiresAt).toBe(first?.expiresAt);
});
test("member saving stays at 50 without usage requirements or resetting expiry",async()=>{
 const first=await getMemberOffer(uid);await usage(10,0);expect((await getMemberOffer(uid))?.discountPercent).toBe(50);
 await usage(10,1);const best=await getMemberOffer(uid);expect(best?.discountPercent).toBe(50);expect(best?.expiresAt).toBe(first?.expiresAt);
 await usage(0,0);expect((await getMemberOffer(uid,NOW+86400000))?.discountPercent).toBe(50);
});
test("returning activity does not change the 50 percent saving",async()=>{await Promise.all([usage(1,0,0),usage(1,0,1),usage(1,0,2)]);expect((await getMemberOffer(uid))?.discountPercent).toBe(50);});
test("expired offers stay expired and never reset on a new visit",async()=>{
 const initial=await getMemberOffer(uid);expect(await getMemberOffer(uid,initial!.expiresAt)).toBeNull();expect(await getMemberOffer(uid,initial!.expiresAt+86400000)).toBeNull();
 expect((await db.doc(`memberOffers/${uid}`).get()).get("expiresAt")).toBe(initial!.expiresAt);
});
test.each(["active-month","lifetime-grant","cached-lifetime","banned","incomplete"])("%s does not get a sales offer",async state=>{
 if(state==="active-month")await db.doc(`razorpayOrders/${uid}`).set({uid,plan:"month",status:"paid",startsAt:NOW-1000,expiresAt:NOW+86400000});
 if(state==="lifetime-grant")await db.doc(`lifetimePlusGrants/${uid}`).set({status:"active",startsAt:NOW-1000});
 if(state==="cached-lifetime")await db.doc(`billing/${uid}`).set({lifetime:true});
 if(state==="banned")await db.doc(`moderation/${uid}`).set({status:"banned"});
 if(state==="incomplete")await db.doc(`users/${uid}`).update({onboardingComplete:false});
 expect(await getMemberOffer(uid)).toBeNull();expect((await db.doc(`memberOffers/${uid}`).get()).exists).toBe(false);
});
test("quote and creation callback agree; client-discount tampering cannot reach payment creation",async()=>{
 await usage(10,1);const create=jest.fn(async(amount:number,notes:Record<string,string>)=>({amount,notes}));
 const result=await promoCheckout(uid,"month",undefined,create,28500);expect(result.amount).toBe(28500);expect(result.notes).toMatchObject({campaign:MEMBER_OFFER.campaign,pricing:"member_offer",discountPercent:"50"});
 expect(Object.values(result.notes).join(" ")).not.toContain(uid);
 create.mockClear();await expect(promoCheckout(uid,"month",undefined,create,1)).rejects.toThrow("price changed");expect(create).not.toHaveBeenCalled();
});
test("the callable ignores claimed discounts and derives the actual quote from server usage",async()=>{
 const quote=await getLaunchOffer.run({data:{discountPercent:100,city:"Other city"},auth:{uid,token:{}},rawRequest:{},acceptsStreaming:false} as never);
 expect(quote.personalized?.discountPercent).toBe(50);expect(quote.plans.month.amount).toBe(memberPrice("month",50));expect(quote.personalized?.city).toBe("Pune");
});
test("concurrent quote requests share one offer id and one expiry",async()=>{
 const offers=await Promise.all(Array.from({length:5},()=>getMemberOffer(uid)));
 expect(new Set(offers.map(o=>o?.id)).size).toBe(1);expect(new Set(offers.map(o=>o?.expiresAt)).size).toBe(1);
});
test("payment activation removes the offer without rewriting issued prices",async()=>{
 const existing=await getMemberOffer(uid);await db.doc(`billing/${uid}`).set({expiresAt:NOW+86400000});expect(await getMemberOffer(uid)).toBeNull();expect((await db.doc(`memberOffers/${uid}`).get()).get("id")).toBe(existing?.id);
});

test("an existing 30 percent offer upgrades once without resetting its original deadline", async () => {
 const old={id:randomUUID(),campaign:MEMBER_OFFER.campaign,discountPercent:30,reason:"welcome",startsAt:NOW-86400000,expiresAt:NOW+6*86400000};
 await db.doc(`memberOffers/${uid}`).set(old);
 expect(await getMemberOffer(uid)).toMatchObject({id:old.id,discountPercent:50,startsAt:old.startsAt,expiresAt:old.expiresAt});
});
test("annual quote and checkout use the same exact discounted paise", async () => {
 const quote=await getLaunchOffer.run({data:{},auth:{uid,token:{}},rawRequest:{},acceptsStreaming:false} as never);
 expect(quote.plans.year).toMatchObject({regular:299800,amount:149900});
 const create=jest.fn(async(amount:number,notes:Record<string,string>)=>({amount,notes}));
 const result=await promoCheckout(uid,"year",undefined,create,149900);
 expect(result.amount).toBe(149900);expect(result.notes.discountPercent).toBe("50");
 await expect(promoCheckout(uid,"year",undefined,create,74950)).rejects.toThrow("price changed");
});
