/**
 * Pure planning for `set-runtime-flags.mjs --backfill-free-sender`, kept apart so it
 * can be unit tested without Firebase (node --test scripts/test/*.test.mjs).
 */

/** The account docs that belong to women (existing users docs only: a deleted account has none). */
export function womenUids(userDocs) {
  return userDocs.filter((doc) => doc && doc.exists !== false && doc.gender === "woman" && typeof doc.uid === "string" && doc.uid).map((doc) => doc.uid);
}

/**
 * Splits women into those whose mirror still needs `freeSender: true` and those that
 * already have it. `mirrors` maps uid to the current moderation/{uid}.chatAccess (or undefined).
 */
export function planFreeSenderBackfill(uids, mirrors) {
  const toWrite = [];
  let alreadySet = 0;
  for (const uid of uids) {
    if (mirrors.get(uid)?.freeSender === true) alreadySet += 1;
    else toWrite.push(uid);
  }
  return { toWrite, alreadySet };
}

/**
 * The merge written to moderation/{uid}: only chatAccess.freeSender and updatedAt, so
 * unlimited, premiumUntil and premiumLifetime stay exactly as they are (use with set merge).
 */
export function freeSenderMerge(now) {
  return { chatAccess: { freeSender: true, updatedAt: now } };
}
