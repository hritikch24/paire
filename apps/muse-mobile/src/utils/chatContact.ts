import patterns from "../config/chatContactPolicy.json";

const checks = Object.entries(patterns).map(([kind, pattern]) => ({ kind, regex: new RegExp(pattern, "s") }));

/** Local, bounded checks; the same patterns reject writes in firestore.rules. */
export function chatContactIssue(value: string): { kind: "phone" | "instagram"; message: string } | null {
  const text = value.toLowerCase().replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ");
  for (const { kind, regex } of checks) {
    if (!regex.test(text)) continue;
    return kind === "instagram"
      ? { kind: "instagram", message: "Instagram handles and links can’t be shared here. Remove them to send your message." }
      : { kind: "phone", message: "Phone numbers can’t be shared here. Remove the number to send your message." };
  }
  return null;
}
