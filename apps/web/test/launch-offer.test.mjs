import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const home = readFileSync(new URL("../site/index.html",import.meta.url),"utf8");
test("structured totals and visible prices agree for every fixed plan",()=>{
  const graph = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const offers=graph.find(item=>item["@type"]==="WebApplication").offers;
  const amounts=[59,179,349,1249,1799,3699,79];
  for(const [i,id] of ["day","week","month","halfyear","year","lifetime","chat"].entries()){
    assert.equal(Number(offers[i+1].price),amounts[i]);
    assert.ok(home.includes('data-offer-plan="'+id+'">₹'+amounts[i].toLocaleString("en-IN")));
  }
  assert.doesNotMatch(home,/50% off|1 month free|launch-offer\.js/i);
});
