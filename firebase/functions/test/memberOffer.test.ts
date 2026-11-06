import { readFileSync } from "fs";
import { resolve } from "path";
import { engagementDiscount, MEMBER_OFFER, memberContext, memberPrice, validMemberQuote } from "../src/lib/member-offer";

test("exact tier prices are rounded in integer paise", () => {
  expect(MEMBER_OFFER.discounts.map(p => memberPrice("month", p))).toEqual([39900, 34200, 28500]);
  expect(MEMBER_OFFER.discounts.map(p => memberPrice("lifetime", p))).toEqual([149900, 128486, 107072]);
});
test("only actual usage earns higher tiers; both exhausted allowances earn 50", () => {
  expect(engagementDiscount(0,0,0).percent).toBe(30);
  expect(engagementDiscount(9,0,2).percent).toBe(30);
  expect(engagementDiscount(10,0,1).percent).toBe(40);
  expect(engagementDiscount(0,1,1).percent).toBe(40);
  expect(engagementDiscount(2,0,3).percent).toBe(40);
  expect(engagementDiscount(10,1,1).percent).toBe(50);
});
test("city and explicit non-sensitive hobbies personalize wording only", () => {
  expect(memberContext(" Pune ",["religion", " Music "])).toEqual({city:"Pune",interest:"music"});
  expect(memberContext("https://spam.example",["sexuality", "health"])).toEqual({city:null,interest:null});
  expect(memberContext("<b>city</b>",null).city).toBeNull();
});
test("hosted quote rejects altered amount, percentages, timestamps and metadata", () => {
  const startsAt=MEMBER_OFFER.startsAt+1000;
  const notes={campaign:MEMBER_OFFER.campaign,pricing:"member_offer",offerId:"12345678-1234-1234-1234-123456789abc",discountPercent:"50",offerStartedAt:String(startsAt),offerExpiresAt:String(startsAt+MEMBER_OFFER.durationMs)};
  const createdAt=Math.floor(startsAt/1000);
  expect(validMemberQuote("month",28500,notes,createdAt)).toBe(true);
  expect(validMemberQuote("month",1,notes,createdAt)).toBe(false);
  expect(validMemberQuote("day",28500,notes,createdAt)).toBe(false);
  expect(validMemberQuote("month",28500,{...notes,discountPercent:"100"},createdAt)).toBe(false);
  expect(validMemberQuote("month",28500,{...notes,offerId:"anything"},createdAt)).toBe(false);
  expect(validMemberQuote("month",28500,notes,createdAt-10)).toBe(false);
  expect(validMemberQuote("month",28500,notes,createdAt+7*86400)).toBe(false);
  expect(validMemberQuote("month",28500,notes,undefined)).toBe(false);
});
test("the browser and hosted checkout share the exact server contract", () => {
 const server=readFileSync(resolve(__dirname,"../src/lib/member-offer.ts"),"utf8");
 expect(readFileSync(resolve(__dirname,"../../../apps/muse-mobile/src/config/member-offer.ts"),"utf8")).toBe(server);
 expect(readFileSync(resolve(process.env.KRAFTAI_SOURCE_DIR ?? resolve(__dirname,"../../../../kanoon-simplified"),"src/lib/member-offer.ts"),"utf8")).toBe(server);
});
