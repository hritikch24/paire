import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { ChatAccessMirror, ChatPolicy, parseChatPolicy } from "./lib/chatAccess";

let cachedPolicy: { policy: ChatPolicy; at: number } | null = null;

/**
 * The paid-chat switches, kept in runtime/trust next to the verification policy
 * (the rules already read that document; see firestore.rules). Cached briefly
 * per instance. Missing fields mean paid chat is off.
 */
export async function chatPolicy(now = Date.now()): Promise<ChatPolicy> {
  if (cachedPolicy && now - cachedPolicy.at < 15_000 && process.env.FUNCTIONS_EMULATOR !== "true" && process.env.MUSE_UNCACHED_RUNTIME !== "true") return cachedPolicy.policy;
  const policy = parseChatPolicy((await db.doc("runtime/trust").get()).data());
  cachedPolicy = { policy, at: now };
  return policy;
}

/**
 * Recomputes a member's chat access from its sources (chatUnlocks/{uid} for
 * Unlimited Chat, billing/{uid} for Paire Plus) and mirrors it onto
 * moderation/{uid}.chatAccess for the Firestore rules. Only touches chatAccess: a ban, review or
 * verification state is never changed here, and deleted accounts get nothing.
 */
export async function syncChatAccess(uid: string): Promise<ChatAccessMirror | null> {
  // One transaction, so a grant, a refund and a Plus sync landing together can't leave a stale copy.
  return db.runTransaction(async (tx) => {
    const [user, unlock, billing, moderation] = await tx.getAll(
      db.doc(`users/${uid}`),
      db.doc(`chatUnlocks/${uid}`),
      db.doc(`billing/${uid}`),
      db.doc(`moderation/${uid}`)
    );
    if (!user.exists) return null;
    const billed = billing.get("expiresAt");
    // syncPremium writes billing/{uid} before calling this, so it's always the fresh reading.
    const plusUntil = process.env.MUSE_BILLING_ENABLED === "true" && typeof billed === "number" && Number.isFinite(billed) ? billed : 0;
    const next: ChatAccessMirror = { unlimited: unlock.get("status") === "active", premiumUntil: Math.max(0, Math.floor(plusUntil)) };
    const current = moderation.get("chatAccess") as Partial<ChatAccessMirror> | undefined;
    // No mirror already means no access to the rules: don't write one just to say so.
    const nothing = !next.unlimited && next.premiumUntil === 0;
    if (current ? current.unlimited !== next.unlimited || current.premiumUntil !== next.premiumUntil : !nothing) {
      tx.set(db.doc(`moderation/${uid}`), { chatAccess: { ...next, updatedAt: Date.now() } }, { merge: true });
    }
    return next;
  });
}

/** Paire's own UPI ID for direct payments (MUSE_UPI_VPA), if a valid one is configured. */
export const upiVpa = () => {
  const vpa = process.env.MUSE_UPI_VPA?.trim() ?? "";
  return /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9]{2,64}$/.test(vpa) ? vpa : null;
};

/** UPI checkout is on: a valid UPI ID is configured and runtime/trust.upiSales is set. */
export async function upiSalesOpen(): Promise<boolean> {
  return Boolean(upiVpa()) && (await chatPolicy()).upiSales;
}

/** Account deletion: the mirror goes; payment records stay for tax law. */
export async function clearChatAccess(uid: string): Promise<void> {
  await db.doc(`chatUnlocks/${uid}`).delete();
  await db.doc(`chatUnlockCheckout/${uid}`).delete();
  const moderation = db.doc(`moderation/${uid}`);
  if ((await moderation.get()).exists) await moderation.update({ chatAccess: FieldValue.delete() });
}
