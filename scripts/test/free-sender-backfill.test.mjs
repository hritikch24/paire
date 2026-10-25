import assert from "node:assert/strict";
import test from "node:test";
import { freeSenderClearMerge, freeSenderMerge, planFreeSenderBackfill, planFreeSenderClear, womenUids } from "../lib/free-sender-backfill.mjs";

test("womenUids keeps only existing women's accounts", () => {
  const docs = [
    { uid: "a", gender: "woman" },
    { uid: "b", gender: "man" },
    { uid: "c", gender: "woman", exists: false },
    { uid: "d" },
    { gender: "woman" },
    { uid: "e", gender: "Woman" }
  ];
  assert.deepEqual(womenUids(docs), ["a"]);
});

test("planFreeSenderBackfill skips mirrors that already say freeSender", () => {
  const mirrors = new Map([
    ["a", { unlimited: true, premiumUntil: 0, freeSender: true }],
    ["b", { unlimited: false, premiumUntil: 5 }],
    ["c", { freeSender: false }]
  ]);
  assert.deepEqual(planFreeSenderBackfill(["a", "b", "c", "d"], mirrors), { toWrite: ["b", "c", "d"], alreadySet: 1 });
  assert.deepEqual(planFreeSenderBackfill([], new Map()), { toWrite: [], alreadySet: 0 });
});

test("freeSenderMerge touches only chatAccess.freeSender and updatedAt", () => {
  const merge = freeSenderMerge(123);
  assert.deepEqual(merge, { chatAccess: { freeSender: true, updatedAt: 123 } });
  for (const kept of ["unlimited", "premiumUntil", "premiumLifetime"]) assert.equal(kept in merge.chatAccess, false);
});

test("planFreeSenderClear clears only members whose account is no longer a woman's, and leaves missing accounts alone", () => {
  const users = new Map([
    ["a", { exists: true, gender: "woman" }],
    ["b", { exists: true, gender: "man" }],
    ["c", { exists: true }],
    ["d", { exists: false }]
  ]);
  assert.deepEqual(planFreeSenderClear(["a", "b", "c", "d", "e"], users), { toClear: ["b", "c"], kept: 1, skippedMissing: 2 });
  assert.deepEqual(planFreeSenderClear([], new Map()), { toClear: [], kept: 0, skippedMissing: 0 });
});

test("freeSenderClearMerge sets only chatAccess.freeSender=false and updatedAt", () => {
  assert.deepEqual(freeSenderClearMerge(9), { chatAccess: { freeSender: false, updatedAt: 9 } });
});
