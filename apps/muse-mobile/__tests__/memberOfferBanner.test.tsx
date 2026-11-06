import React from "react";
import renderer, { act } from "react-test-renderer";
import { MemberOfferBanner } from "../src/components/MemberOfferBanner";
import { resetOfferMemory } from "../src/utils/offerDismissal";
import type { MemberOffer } from "../src/config/member-offer";
jest.mock("react-native", () => ({ Platform: { OS: "web" } }));
jest.mock("tamagui", () => ({ Text: "Text", XStack: "XStack", YStack: "YStack" }));
jest.mock("../src/components/MuseButton", () => ({ PrimaryButton: "PrimaryButton", SecondaryButton: "SecondaryButton" }));
const offer = (): MemberOffer => ({id:`banner-${Math.random()}`,discountPercent:30,startsAt:Date.now(),expiresAt:Date.now()+7*86400000,reason:"welcome",city:"Pune",interest:"music"});
beforeEach(()=>resetOfferMemory());
test("shows real city/hobby context and exact prices without initiating payment",async()=>{
 const explore=jest.fn();let tree!:renderer.ReactTestRenderer;
 await act(async()=>{tree=renderer.create(<MemberOfferBanner compact offer={offer()} onExplore={explore}/>);});
 const text=JSON.stringify(tree.toJSON());expect(text).toContain("PUNE");expect(text).not.toContain("Into music?");expect(text).toContain("₹2,098.60");expect(text).toContain("₹4,497");expect(text).toContain("expiry stays fixed");expect(explore).not.toHaveBeenCalled();
 await act(async()=>{tree.root.findByType("PrimaryButton" as never).props.onPress();});expect(explore).toHaveBeenCalledTimes(1);await act(async()=>tree.unmount());
});
test("closing an offer hides that tier, while a genuinely earned upgrade can be shown",async()=>{
 const member=offer();let tree!:renderer.ReactTestRenderer;await act(async()=>{tree=renderer.create(<MemberOfferBanner compact offer={member} onExplore={jest.fn()}/>);});
 await act(async()=>tree.root.findByType("SecondaryButton" as never).props.onPress());expect(tree.toJSON()).toBeNull();
 await act(async()=>tree.update(<MemberOfferBanner compact offer={{...member,discountPercent:50,reason:"both-limits"}} onExplore={jest.fn()}/>));
 expect(JSON.stringify(tree.toJSON())).toContain("50% off");expect(JSON.stringify(tree.toJSON())).toContain("₹1,499");expect(JSON.stringify(tree.toJSON())).toContain("₹3,212.15");await act(async()=>tree.unmount());
});
test("expired or absent offers show no sales card",async()=>{
 let tree!:renderer.ReactTestRenderer;await act(async()=>{tree=renderer.create(<MemberOfferBanner offer={{...offer(),expiresAt:Date.now()-1}}/>);});expect(tree.toJSON()).toBeNull();await act(async()=>tree.update(<MemberOfferBanner offer={null}/>));expect(tree.toJSON()).toBeNull();await act(async()=>tree.unmount());
});
