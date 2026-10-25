import { onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { chatPolicy, syncChatAccess } from "./chatEntitlement";
import { REGION } from "./config";
import { isSupportSession, requireReadAuth } from "./lib/auth";
import { ChatAccessMirror } from "./lib/chatAccess";
import { effectiveFreeSender, freeSenderNeedsRepair } from "./lib/sendPolicy";

export type SendPolicyStatus = { acceptFlow: boolean; womenSendFree: boolean; giftSales: boolean; freeSender: boolean };

/**
 * The accept-flow and free-sending switches, plus whether the caller herself
 * sends free. Read-only for the caller; the only write is the existing
 * syncChatAccess repair, which refreshes her own chatAccess mirror when
 * freeSender drifted from her gender (getChatAccess skips that resync once any
 * mirror exists). Support sessions never repair.
 */
export const getSendPolicy = onCall({ region: REGION, timeoutSeconds: 30 }, async (request): Promise<SendPolicyStatus> => {
  const uid = await requireReadAuth(request);
  const policy = await chatPolicy();
  let freeSender = false;
  if (policy.womenSendFree) {
    const [user, moderation] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`));
    let mirror = moderation.get("chatAccess") as Partial<ChatAccessMirror> | undefined;
    if (user.exists && !isSupportSession(request) && freeSenderNeedsRepair(policy, mirror, user.get("gender") === "woman")) {
      mirror = (await syncChatAccess(uid)) ?? mirror;
    }
    freeSender = effectiveFreeSender(policy, mirror);
  }
  return { acceptFlow: policy.acceptFlow, womenSendFree: policy.womenSendFree, giftSales: policy.giftSales, freeSender };
});
