import type { ChatAccess } from "../services/chatAccessService";
import type { SendPolicy } from "../services/sendPolicyService";

export function sendLockedFor(access: ChatAccess | undefined, _policy: SendPolicy | undefined, _chatCreatedAt: number, now = Date.now()): boolean {
  return !(access?.unlimited || access?.premiumLifetime || (access?.premiumUntil ?? 0) > now);
}
