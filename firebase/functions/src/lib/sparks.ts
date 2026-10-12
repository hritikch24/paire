/** Sparks: likes that carry a note, and who opens the chat. Pure helpers. */

export type IncomingLike = { fromUid?: unknown; type?: unknown; note?: unknown; priority?: unknown; createdAt?: unknown };

const millis = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
};

/** Each person's like note, when they wrote one. */
export function sparksOf(notes: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(notes).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  );
}

/** The one person who opened with "I'll message first", or null when neither or both did. */
export function firstMoveOf(choices: Record<string, boolean>): string | null {
  const chosen = Object.keys(choices).filter((uid) => choices[uid]);
  return chosen.length === 1 ? chosen[0] : null;
}

/**
 * "Likes you" order: effort first (a note or a Super Like), then Paire Plus
 * priority, then the newest.
 */
export function compareLikes(a: IncomingLike, b: IncomingLike): number {
  const effort = (like: IncomingLike) => (like.type === "super" || (typeof like.note === "string" && like.note) ? 1 : 0);
  return (
    effort(b) - effort(a) ||
    Number(b.priority === true) - Number(a.priority === true) ||
    millis(b.createdAt) - millis(a.createdAt)
  );
}
