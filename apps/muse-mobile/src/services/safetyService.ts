import { collection, doc } from "@firebase/firestore/dist/index.cjs.js";
import { ReportReason } from "../types/models";
import { callFunction, db } from "./firebase";

export const createReportId = () => doc(collection(db, "reports")).id;

export type ReportProgress = {
  id: string;
  reason: ReportReason;
  targetName: string;
  status: "received" | "reviewing" | "closed";
  outcome: "action_taken" | "no_violation_found" | "insufficient_information" | null;
  createdAt: number;
  updatedAt: number;
};
export type ReportCursor = { seconds: number; nanoseconds: number; id: string };

export async function getMyReports(cursor?: ReportCursor | null) {
  return callFunction<{ reports: ReportProgress[]; cursor: ReportCursor | null }>("getMyReports", { cursor: cursor ?? null });
}

export async function reportUser(params: {
  reportId: string;
  targetUid: string;
  reason: ReportReason;
  details: string;
  matchId?: string;
  /** The message a report was made from (e.g. a Paire AI warning). */
  messageId?: string;
}) {
  return callFunction<{ reportId: string }>("submitReport", {
    reportId: params.reportId,
    targetUid: params.targetUid,
    reason: params.reason,
    details: params.details.trim().slice(0, 1000),
    ...(params.matchId ? { matchId: params.matchId } : {}),
    ...(params.messageId ? { messageId: params.messageId } : {})
  });
}

/** Ends any match and hides you from each other permanently. */
export async function blockUser(targetUid: string) {
  await callFunction("blockUser", { targetUid });
}
