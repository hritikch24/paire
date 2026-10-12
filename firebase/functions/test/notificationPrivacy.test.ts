import { notificationCopy } from "../src/lib/notificationPrivacy";

describe("notification privacy", () => {
  it("hides names and message content unless previews are explicitly enabled", () => {
    for (const preference of [undefined, false, null, "true", 1]) {
      expect(notificationCopy("messages", "Aditi", "Personal message", preference)).toEqual({ title: "Paire", body: "You have a new message." });
      expect(notificationCopy("matches", "New match", "You and Aditi matched", preference)).toEqual({ title: "Paire", body: "You have a new connection." });
    }
  });
  it("keeps content when the recipient chooses to show previews", () => {
    expect(notificationCopy("messages", "Aditi", "Hello", true)).toEqual({ title: "Aditi", body: "Hello" });
  });
});
