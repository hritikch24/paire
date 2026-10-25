import type { ChatAccess } from "../services/chatAccessService";
import type { SendPolicy } from "../services/sendPolicyService";
import { sendLocked } from "./chatAccess";

/**
 * sendLocked() plus the free-sender term: a woman sends free once the server
 * says so (mirrors paidSendAllowed() in firestore.rules, which decides). While
 * the policy is unknown nothing changes: the existing paid-chat result stands.
 */
export function sendLockedFor(access: ChatAccess | undefined, policy: SendPolicy | undefined, chatCreatedAt: number, now = Date.now()): boolean {
  if (policy?.freeSender === true) return false;
  return sendLocked(access, chatCreatedAt, now);
}
