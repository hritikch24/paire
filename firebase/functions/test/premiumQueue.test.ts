import { appendPremiumCredit, initialPremiumQueue, premiumWindows, queueBenefits, reversePremiumCredit, reconcileSupportCredit } from "../src/lib/premiumQueue";
const DAY=86400000, start=1800000000000;
const empty=()=>initialPremiumQueue([],undefined,undefined,0,start);
test("refunding a purchased pass preserves all unused gifted days and reserves only elapsed time",()=>{
 let q=appendPremiumCredit(empty(),"razorpay:paid","month",start).queue;
 q=appendPremiumCredit(q,"gift:gift","week",start+DAY).queue;
 q=reversePremiumCredit(q,"razorpay:paid",start+10*DAY).queue;
 expect(queueBenefits(q,start+10*DAY).expiresAt).toBe(start+17*DAY);
 expect(premiumWindows(q).find(w=>w.key==="gift:gift")).toMatchObject({startsAt:start+10*DAY,expiresAt:start+17*DAY});
});
test("a pass bought after a gift loses none of its days when that gift is refunded",()=>{
 let q=appendPremiumCredit(empty(),"gift:first","week",start).queue;
 q=appendPremiumCredit(q,"razorpay:paid","month",start+DAY).queue;
 q=reversePremiumCredit(q,"gift:first",start+2*DAY).queue;
 expect(queueBenefits(q,start+2*DAY)).toEqual({expiresAt:start+62*DAY,unlimitedLikesUntil:start+62*DAY});
});
test.each([["gift:first","gift:second"],["gift:second","gift:first"]])("gift reversals in either order remove only their own credit (%s first)",(one,two)=>{
 let q=appendPremiumCredit(empty(),"gift:first","day",start).queue;
 q=appendPremiumCredit(q,"gift:second","week",start).queue;
 q=appendPremiumCredit(q,"razorpay:paid","week",start).queue;
 q=reversePremiumCredit(q,one,start+1000).queue;
 q=reversePremiumCredit(q,two,start+1000).queue;
 expect(queueBenefits(q,start+1000).expiresAt).toBe(start+1000+7*DAY);
});
test("duplicates never add days, repeated reversals never reset the queue, and completed prefixes are archived",()=>{
 let q=appendPremiumCredit(empty(),"gift:first","day",start).queue;
 expect(appendPremiumCredit(q,"gift:first","month",start).queue).toEqual(q);
 const next=appendPremiumCredit(q,"gift:second","week",start+2*DAY);
 expect(next.retired).toEqual([expect.objectContaining({key:"gift:first",expiresAt:start+DAY})]);
 q=reversePremiumCredit(next.queue,"gift:second",start+3*DAY).queue;
 expect(reversePremiumCredit(q,"gift:second",start+4*DAY).queue).toEqual(q);
});
test("first acceptance preserves remaining paid days and only the uncovered free-grant tail",()=>{
 const orders=[{id:"paid",paymentSource:"razorpay",status:"paid",plan:"month",startsAt:start-DAY,expiresAt:start+20*DAY}];
 const q=initialPremiumQueue(orders,undefined,{status:"active",expiresAt:start+50*DAY},0,start);
 expect(queueBenefits(q,start)).toEqual({expiresAt:start+50*DAY,unlimitedLikesUntil:start+20*DAY});
 const after=reversePremiumCredit(q,"razorpay:paid",start+5*DAY).queue;
 expect(queueBenefits(after,start+5*DAY).expiresAt).toBe(start+35*DAY);
});
test("cache-only expiry is never an entitlement and ambiguous old paid windows fail closed",()=>{
 expect(queueBenefits(empty(),start).expiresAt).toBe(0);
 const order={id:"a",paymentSource:"razorpay",status:"paid",plan:"day",startsAt:start,expiresAt:start+DAY};
 expect(()=>initialPremiumQueue([order,{...order,id:"b"}],undefined,undefined,0,start)).toThrow(/Overlapping/);
 expect(()=>initialPremiumQueue([],undefined,{lastSource:"gift",status:"active",expiresAt:start+DAY},0,start)).toThrow(/Legacy/);
});

 test("a recovered pass later confirmed by the provider is not doubled and its refund preserves the gift",()=>{
  let q=initialPremiumQueue([],{status:"active",startsAt:start,expiresAt:start+30*DAY},undefined,0,start);
  q=appendPremiumCredit(q,"gift:next","week",start).queue;
  q=reconcileSupportCredit(q,"ccavenue:recovered");
  expect(queueBenefits(q,start).expiresAt).toBe(start+37*DAY);
  q=reversePremiumCredit(q,"ccavenue:recovered",start+5*DAY).queue;
  expect(queueBenefits(q,start+5*DAY).expiresAt).toBe(start+12*DAY);
});
