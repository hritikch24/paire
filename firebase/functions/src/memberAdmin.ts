import { HttpsError, onCall } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";

/**
 * Member admin for Paire's moderators (the `moderator` custom claim, checked
 * here on every call). Shows each member's public profile, photos, account
 * status and payments, with women and men listed separately. Never shows
 * messages, precise location or private dating preferences.
 */

function requireModerator(request: { auth?: { uid: string; token: Record<string, unknown> } }): string {
  const uid = requireAuth(request as never);
  if (request.auth?.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  return uid;
}

const PAGE = 30;
const rupees = (paise: unknown) => (Number(paise) || 0) / 100;

type Payment = { source: "razorpay" | "upi"; product: string; amountInr: number; status: string; at: number | null; utr?: string | null; expiresAt?: number | null };

async function paymentsOf(uid: string): Promise<{ payments: Payment[]; plusUntil: number | null; unlimitedChat: boolean }> {
  const [razorpay, upi, unlock, billing] = await Promise.all([
    db.collection("razorpayOrders").where("uid", "==", uid).get(),
    db.collection("upiUnlockOrders").where("uid", "==", uid).get(),
    db.doc(`chatUnlocks/${uid}`).get(),
    db.doc(`billing/${uid}`).get()
  ]);
  const at = (value: unknown) => (typeof value === "number" ? value : value && typeof (value as { toMillis?: () => number }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : null);
  const payments: Payment[] = [
    ...razorpay.docs.map((doc) => ({
      source: "razorpay" as const,
      product: `Plus · ${doc.get("plan")}`,
      amountInr: rupees(doc.get("amountPaise")),
      // "created" means the checkout was opened but never paid.
      status: doc.get("status") === "created" ? "not paid" : String(doc.get("status")),
      at: at(doc.get("createdAt")),
      expiresAt: (doc.get("expiresAt") as number | undefined) ?? null
    })),
    ...upi.docs.map((doc) => ({
      source: "upi" as const,
      product: doc.get("kind") === "plus" ? `Plus · ${doc.get("plan")}` : "Unlimited Chat",
      amountInr: Number(doc.get("amountPaise")) / 100,
      status: String(doc.get("status")).replace("_", " "),
      at: at(doc.get("createdAt")),
      utr: (doc.get("utr") as string | undefined) ?? null,
      expiresAt: (doc.get("expiresAt") as number | undefined) ?? null
    }))
  ].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const expiresAt = billing.get("expiresAt");
  return { payments, plusUntil: typeof expiresAt === "number" && expiresAt > Date.now() ? expiresAt : null, unlimitedChat: unlock.get("status") === "active" };
}

export type MemberRow = {
  uid: string;
  name: string;
  age: number | null;
  city: string | null;
  photoUrl: string | null;
  photoCount: number;
  joinedAt: number | null;
  lastActiveAt: number | null;
  status: string;
  verified: boolean;
  testAccount: boolean;
  plus: boolean;
  unlimitedChat: boolean;
};

/** Women or men, newest first, 30 at a time. */
export const adminListMembers = onCall({ region: REGION, timeoutSeconds: 60 }, async (request): Promise<{ members: MemberRow[]; nextCursor: string | null; total: number }> => {
  requireModerator(request);
  const { gender, cursor } = (request.data ?? {}) as { gender?: unknown; cursor?: unknown };
  if (gender !== "woman" && gender !== "man") throw new HttpsError("invalid-argument", "Choose women or men.");
  let query = db.collection("users").where("gender", "==", gender).orderBy("createdAt", "desc").limit(PAGE);
  if (typeof cursor === "string" && cursor) {
    const after = await db.doc(`users/${cursor}`).get();
    if (after.exists) query = query.startAfter(after);
  }
  const [snap, total] = await Promise.all([query.get(), db.collection("users").where("gender", "==", gender).count().get()]);
  const uids = snap.docs.map((doc) => doc.id);
  const extra = uids.length ? await db.getAll(...uids.flatMap((uid) => [db.doc(`moderation/${uid}`), db.doc(`billing/${uid}`), db.doc(`chatUnlocks/${uid}`)])) : [];
  const now = Date.now();
  const members = snap.docs.map((doc, index): MemberRow => {
    const [moderation, billing, unlock] = extra.slice(index * 3, index * 3 + 3);
    const photos = (doc.get("photoUrls") as string[] | undefined) ?? [];
    return {
      uid: doc.id,
      name: String(doc.get("displayName") ?? "No name"),
      age: typeof doc.get("age") === "number" ? doc.get("age") : null,
      city: (doc.get("city") as string | undefined) || null,
      photoUrl: photos[0] ?? null,
      photoCount: photos.length,
      joinedAt: (doc.get("createdAt") as number | undefined) ?? null,
      lastActiveAt: (doc.get("lastActiveAt") as number | undefined) ?? null,
      status: String(moderation.get("status") ?? "ok"),
      verified: moderation.get("verification.status") === "verified",
      testAccount: moderation.get("cohort") === "test",
      plus: (Number(billing.get("expiresAt")) || 0) > now,
      unlimitedChat: unlock.get("status") === "active"
    };
  });
  return { members, nextCursor: snap.size === PAGE ? snap.docs[snap.size - 1].id : null, total: total.data().count };
});

/** One member in full: profile, photos, account, moderation and every payment. */
export const adminGetMember = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  requireModerator(request);
  let uid = (request.data as { uid?: unknown } | null)?.uid;
  if (typeof uid === "string" && uid.includes("@") && uid.length <= 254) {
    uid = await adminAuth().getUserByEmail(uid.trim().toLowerCase()).then((user) => user.uid).catch((error) => {
      if ((error as { code?: string }).code === "auth/user-not-found") throw new HttpsError("not-found", "No member has that email.");
      throw error;
    });
  }
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new HttpsError("invalid-argument", "That member isn't valid.");
  const [profile, moderation] = await db.getAll(db.doc(`users/${uid}`), db.doc(`moderation/${uid}`));
  const [account, money, matches, reports] = await Promise.all([
    adminAuth().getUser(uid).catch(() => null),
    paymentsOf(uid),
    db.collection("matches").where("participants", "array-contains", uid).count().get(),
    db.collection("reports").where("targetUid", "==", uid).count().get()
  ]);
  if (!profile.exists && !account) throw new HttpsError("not-found", "That member no longer exists.");
  return {
    uid,
    profile: {
      name: profile.get("displayName") ?? account?.displayName ?? null,
      age: profile.get("age") ?? null,
      gender: profile.get("gender") ?? null,
      city: profile.get("city") ?? null,
      bio: profile.get("bio") ?? null,
      photoUrls: (profile.get("photoUrls") as string[] | undefined) ?? [],
      interests: profile.get("interests") ?? [],
      intentions: profile.get("intentions") ?? [],
      languages: profile.get("languages") ?? [],
      basics: profile.get("basics") ?? {},
      discoverable: profile.get("isDiscoverable") !== false,
      joinedAt: profile.get("createdAt") ?? null,
      lastActiveAt: profile.get("lastActiveAt") ?? null
    },
    account: account
      ? {
          email: account.email ?? null,
          emailVerified: account.emailVerified,
          signInMethods: account.providerData.map((provider) => provider.providerId),
          createdAt: Date.parse(account.metadata.creationTime) || null,
          lastSignInAt: Date.parse(account.metadata.lastSignInTime) || null,
          disabled: account.disabled
        }
      : null,
    moderation: {
      status: moderation.get("status") ?? "ok",
      reason: moderation.get("reason") ?? null,
      cohort: moderation.get("cohort") ?? "public",
      verification: moderation.get("verification.status") ?? "unverified"
    },
    activity: { matches: matches.data().count, reportsAgainst: reports.data().count },
    ...money
  };
});
