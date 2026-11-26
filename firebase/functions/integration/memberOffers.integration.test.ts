import { randomUUID } from "crypto";
import { db } from "../src/admin";
import { getMemberOffer } from "../src/memberOffers";
import { promoCheckout, getLaunchOffer } from "../src/launchOffer";
import { MEMBER_OFFER } from "../src/lib/member-offer";
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
test("fixed prices reject expired promo codes and stale client amounts before order creation", async () => {
 const create = jest.fn(async (amount:number, notes:Record<string,string>) => ({amount,notes}));
 for(const [code,amount] of [["PAIRE250",34900],[null,28500],[null,1]] as const) {
   await expect(promoCheckout(uid,"month",code,create,amount)).rejects.toThrow();
 }
 expect(create).not.toHaveBeenCalled();
 const quote = await getLaunchOffer.run({data:{discountPercent:100},auth:{uid,token:{}}} as never);
 expect(quote.personalized).toBeNull();
 const result = await promoCheckout(uid,"month",null,create,quote.plans.month.amount);
 expect(result).toEqual({amount:34900,notes:{pricing:"fixed",priceVersion:"paire-web-2026-11"}});
 expect((await db.doc(`memberOffers/${uid}`).get()).exists).toBe(false);
});
