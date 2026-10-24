/** Previewing names/content is an explicit opt-in, including legacy accounts. */
export function notificationCopy(kind: "matches" | "messages" | "likes", title: string, body: string, previews: unknown) {
  return previews === true
    ? { title, body }
    : { title: "Paire", body: kind === "messages" ? "You have a new message." : kind === "likes" ? "You have a new like." : "You have a new connection." };
}

/** Likes alerts follow the "New matches" preference, so no new setting or rule is needed. */
export const preferenceFor = (kind: "matches" | "messages" | "likes") => (kind === "likes" ? "matches" : kind);
