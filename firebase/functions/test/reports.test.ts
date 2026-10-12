import { parseReport, parseReview } from "../src/lib/reports";

const report = { reportId: "abcdefghijklmnopqrst", targetUid: "a_member", reason: "harassment", details: "  Rude messages  " };

test("report validation rejects invalid references and never trusts a supplied reporter", () => {
  expect(parseReport({ ...report, reporterId: "forged", status: "closed" })).toEqual({ id: report.reportId, targetUid: report.targetUid, reason: report.reason, details: "Rude messages", matchId: undefined, messageId: undefined });
  for (const invalid of [null, [], { ...report, reportId: "../x" }, { ...report, targetUid: "a/b" }, { ...report, reason: "dislike" }, { ...report, details: "x".repeat(1001) }, { ...report, reason: "other", details: " " }, { ...report, messageId: "m" }, { ...report, matchId: "m/x" }]) expect(() => parseReport(invalid)).toThrow();
});

test("report reviews require a bounded note and explicit, consistent actions", () => {
  const review = { reportId: report.reportId, status: "closed", outcome: "action_taken", action: "ban", note: "Reviewed reported message" };
  expect(parseReview(review)).toMatchObject({ status: "closed", outcome: "action_taken", action: "ban" });
  expect(parseReview({ ...review, status: "reviewing", outcome: undefined, action: "none" })).toMatchObject({ status: "reviewing", action: "none" });
  for (const invalid of [null, { ...review, status: "received" }, { ...review, outcome: "no_violation_found" }, { ...review, status: "reviewing" }, { ...review, outcome: undefined }, { ...review, action: "restore" }, { ...review, note: " " }, { ...review, note: "x".repeat(1001) }]) expect(() => parseReview(invalid)).toThrow();
});
