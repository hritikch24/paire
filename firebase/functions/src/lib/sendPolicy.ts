import { ChatAccessMirror, ChatPolicy } from "./chatAccess";

/**
 * What getSendPolicy reports about the caller: the switch is on AND her own
 * mirror (moderation/{uid}.chatAccess.freeSender) says she is a free sender.
 */
export function effectiveFreeSender(policy: ChatPolicy, mirror: Partial<ChatAccessMirror> | null | undefined): boolean {
  return policy.womenSendFree && mirror?.freeSender === true;
}

/**
 * The mirror disagrees with the member's gender while the switch is on, so it
 * must be resynced before answering. A missing flag and `false` are the same
 * thing (not a free sender): nothing to repair, nothing to write.
 */
export function freeSenderNeedsRepair(policy: ChatPolicy, mirror: Partial<ChatAccessMirror> | null | undefined, isWoman: boolean): boolean {
  return policy.womenSendFree && (mirror?.freeSender === true) !== isWoman;
}
