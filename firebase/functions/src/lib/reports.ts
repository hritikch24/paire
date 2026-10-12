import { HttpsError } from "firebase-functions/v2/https";

export const REPORT_REASONS = ["fake_profile", "inappropriate_content", "harassment", "underage", "scam_or_spam", "offline_behavior", "other"] as const;
export const REPORT_OUTCOMES = ["action_taken", "no_violation_found", "insufficient_information"] as const;
export type ReportOutcome = typeof REPORT_OUTCOMES[number];

export function reportId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9]{20}$/.test(value)) throw new HttpsError("invalid-argument", "Report reference is invalid.");
  return value;
}

export function parseReport(data: unknown) {
  const body = data as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpsError("invalid-argument", "Report details are required.");
  const id = reportId(body.reportId);
  const targetUid = body.targetUid;
  if (typeof targetUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(targetUid)) throw new HttpsError("invalid-argument", "Member is invalid.");
  if (!(REPORT_REASONS as readonly unknown[]).includes(body.reason)) throw new HttpsError("invalid-argument", "Choose a report reason.");
  if (typeof body.details !== "string" || body.details.length > 1000) throw new HttpsError("invalid-argument", "Details must be at most 1,000 characters.");
  if (body.reason === "other" && body.details.trim().length < 5) throw new HttpsError("invalid-argument", "Please add a few details.");
  for (const [key, max] of [["matchId", 300], ["messageId", 128]] as const) {
    const value = body[key];
    if (value !== undefined && (typeof value !== "string" || !new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(value))) throw new HttpsError("invalid-argument", `${key} is invalid.`);
  }
  if (body.messageId && !body.matchId) throw new HttpsError("invalid-argument", "A message needs its conversation reference.");
  return { id, targetUid, reason: body.reason as typeof REPORT_REASONS[number], details: body.details.trim(), matchId: body.matchId as string | undefined, messageId: body.messageId as string | undefined };
}

/** A closed case may be retried, but changing its decision requires an appeal workflow. */
export function parseReview(data: unknown) {
  const body = data as Record<string, unknown> | null;
  const id = reportId(body?.reportId);
  if (body?.status !== "reviewing" && body?.status !== "closed") throw new HttpsError("invalid-argument", "Choose reviewing or closed.");
  const status = body.status;
  const action = body.action ?? "none";
  if (action !== "none" && action !== "hide" && action !== "ban") throw new HttpsError("invalid-argument", "Unknown moderation action.");
  const outcome = body.outcome;
  if (status === "closed" && !(REPORT_OUTCOMES as readonly unknown[]).includes(outcome)) throw new HttpsError("invalid-argument", "A closed report needs an outcome.");
  if ((status !== "closed" && (outcome !== undefined || action !== "none")) || (action !== "none" && outcome !== "action_taken")) throw new HttpsError("invalid-argument", "Account actions require a closed report with action taken.");
  const note = body.note ?? "";
  if (typeof note !== "string" || note.trim().length < 5 || note.length > 1000) throw new HttpsError("invalid-argument", "Add a private review note (5–1,000 characters).");
  return { id, status, action, outcome: outcome as ReportOutcome | undefined, note: note.trim() };
}
