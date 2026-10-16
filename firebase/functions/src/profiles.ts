import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db } from "./admin";
import { REGION } from "./config";
import { refreshEmailVerification } from "./accountChecks";
import { syncDiscoveryIndex } from "./discovery";
import { publicSnippet, updateDuoLikeSnippets } from "./duoSnippets";
import { MatchProfileSnippet, PublicProfile } from "./types";

export function snippetOf(profile: Partial<PublicProfile> | undefined): MatchProfileSnippet {
  return {
    displayName: profile?.displayName || "Paire member",
    photoUrl: profile?.photoUrls?.[0] ?? null
  };
}

const ACTIVITY_ONLY_KEYS = new Set(["lastActiveAt", "updatedAt"]);

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

/**
 * Keeps derived data in sync with users/{uid}: the discovery index, and the
 * name/photo snippet copied onto each of the user's matches.
 */
export const onUserProfileWritten = onDocumentWritten(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before.data() as Partial<PublicProfile> | undefined;
    const after = event.data?.after.data() as Partial<PublicProfile> | undefined;

    // Hidden activity stays hidden: an older app or a second device that hasn't seen the
    // setting yet may still write lastActiveAt, which matches could read. Take it back out
    // (that write runs this trigger again and rebuilds the index).
    if (after?.lastActiveAt !== undefined && (await db.doc(`users/${uid}/private/settings`).get()).get("showPresence") === false) {
      await db.doc(`users/${uid}`).update({ lastActiveAt: FieldValue.delete() });
      return;
    }

    // Heartbeat writes only move lastActiveAt: patch the index without re-reading everything.
    const onlyActivity =
      before &&
      after &&
      changedKeys(before, after).every((key) => ACTIVITY_ONLY_KEYS.has(key));
    if (onlyActivity && typeof after.lastActiveAt === "number") {
      try {
        await db.doc(`discovery/${uid}`).update({ lastActiveAt: after.lastActiveAt });
        return;
      } catch {
        // Index missing: fall through to a full rebuild.
      }
    }

    // New profiles: record a confirmed email (Google sign-ins arrive confirmed).
    if (after && (await db.doc(`moderation/${uid}`).get()).get("emailVerified") !== true) await refreshEmailVerification(uid);
    const entry = await syncDiscoveryIndex(uid);

    if (!after) return;
    const previous = snippetOf(before);
    const next = snippetOf(after);
    if (previous.displayName === next.displayName && previous.photoUrl === next.photoUrl) return;

    // Everywhere the name/photo is copied: matches and duos (people you're already
    // connected with), and other pairs' likes of this person's duo (strangers, so
    // private photos stay out).
    await updateDuoLikeSnippets(uid, publicSnippet(next, entry?.privatePhotos === true));
    const [matches, duos] = await Promise.all([
      db.collection("matches").where("participants", "array-contains", uid).get(),
      db.collection("duos").where("members", "array-contains", uid).get()
    ]);
    const updates = [...matches.docs, ...duos.docs].map((doc) => ({ ref: doc.ref, data: { [`profiles.${uid}`]: next } }));
    for (let i = 0; i < updates.length; i += 400) {
      const batch = db.batch();
      updates.slice(i, i + 400).forEach(({ ref, data }) => batch.update(ref, data));
      await batch.commit();
    }
  }
);
