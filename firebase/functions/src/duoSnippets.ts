import { db } from "./admin";
import { MatchProfileSnippet } from "./types";

/** A snippet as strangers may see it: no photo while the member keeps photos private. */
export function publicSnippet(snippet: MatchProfileSnippet, privatePhotos: boolean): MatchProfileSnippet {
  return privatePhotos ? { ...snippet, photoUrl: null } : snippet;
}

/**
 * Rewrites the copy of a member's name/photo kept on other pairs' Duo likes
 * (duoSwipes/{duo}/outgoing/*), which those pairs can read even before any match.
 */
export async function updateDuoLikeSnippets(uid: string, snippet: MatchProfileSnippet): Promise<void> {
  const duoLikes = await db.collectionGroup("outgoing").where("targetUids", "array-contains", uid).get();
  for (let i = 0; i < duoLikes.docs.length; i += 400) {
    const batch = db.batch();
    duoLikes.docs.slice(i, i + 400).forEach((doc) =>
      batch.update(doc.ref, {
        target: ((doc.get("target") as Array<{ uid: string }> | undefined) ?? []).map((person) =>
          person.uid === uid ? { uid, ...snippet } : person
        )
      })
    );
    await batch.commit();
  }
}
