/** Previewing names/content is an explicit opt-in, including legacy accounts. */
export function notificationCopy(kind: "matches" | "messages", title: string, body: string, previews: unknown) {
  return previews === true
    ? { title, body }
    : { title: "Paire", body: kind === "messages" ? "You have a new message." : "You have a new connection." };
}
