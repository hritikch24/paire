jest.mock("../src/services/firebase", () => ({ db: { name: "db" } }));

import * as firestore from "@firebase/firestore/dist/index.cjs.js";
import { Platform } from "react-native";
import { sendChatMessage, toSafety } from "../src/services/chatService";
import { safetyNotice } from "../src/utils/chatSafety";
import { chatTitle, normalizeMatch, otherParticipant, otherSide, partnerIn } from "../src/services/matchService";

const mocked = firestore as unknown as Record<string, jest.Mock>;

describe("normalizeMatch", () => {
  it("converts server timestamps and fills defaults", () => {
    const match = normalizeMatch("a_b", {
      participants: ["a", "b"],
      active: true,
      createdAt: { toMillis: () => 1000 },
      lastActivityAt: { toMillis: () => 2000 },
      profiles: { b: { displayName: "Bea", photoUrl: null } },
      lastMessage: { text: "Hi", senderId: "b", createdAt: { toMillis: () => 1500 } },
      unread: { a: 2, b: 0 },
      lastReadAt: { b: { toMillis: () => 1400 } }
    });
    expect(match).toMatchObject({
      id: "a_b",
      createdAt: 1000,
      lastActivityAt: 2000,
      lastMessage: { text: "Hi", senderId: "b", createdAt: 1500 },
      unread: { a: 2, b: 0 },
      lastReadAt: { b: 1400 },
      superLikedBy: []
    });
    expect(otherParticipant(match, "a")).toBe("b");
  });

  it("treats a missing active flag as active and missing preview as null", () => {
    const match = normalizeMatch("x", { participants: ["x", "y"] });
    expect(match.active).toBe(true);
    expect(match.lastMessage).toBeNull();
  });
});

describe("sendChatMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects contact details before creating an optimistic message or changing unread counts", async () => {
    const old = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    try {
      await expect(sendChatMessage("a_b", "a", ["b"], "Call 9876543210")).rejects.toMatchObject({ code: "chat/contact-details" });
      await expect(sendChatMessage("a_b", "a", ["b"], "IG: alex")).rejects.toMatchObject({ code: "chat/contact-details" });
      expect(mocked.writeBatch).not.toHaveBeenCalled();
    } finally { Object.defineProperty(Platform, "OS", { value: old, configurable: true }); }
  });

  it("writes the message and bumps only the recipient's unread count in one batch", async () => {
    const batch = { set: jest.fn(), update: jest.fn(), commit: jest.fn(async () => undefined) };
    mocked.writeBatch.mockReturnValue(batch);
    mocked.serverTimestamp.mockReturnValue("SERVER_TIME");
    mocked.increment.mockImplementation((n: number) => ({ increment: n }));
    mocked.doc.mockImplementation((...parts: unknown[]) => ({ path: parts.slice(1).join("/") }));
    mocked.collection.mockImplementation((...parts: unknown[]) => ({ path: parts.slice(1).join("/") }));

    await sendChatMessage("a_b", "a", ["b"], "  Hey there  ");

    expect(batch.set).toHaveBeenCalledTimes(1);
    expect(batch.set.mock.calls[0][1]).toEqual({ senderId: "a", text: "Hey there", createdAt: "SERVER_TIME" });
    expect(batch.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lastMessage: { text: "Hey there", senderId: "a", createdAt: "SERVER_TIME" },
        "unread.b": { increment: 1 }
      })
    );
    expect(batch.update.mock.calls[0][1]).not.toHaveProperty("unread.a");
    expect(batch.commit).toHaveBeenCalled();
  });

  it("shares only the explicitly confirmed message and keeps contact details out of previews", async () => {
    const old = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
    const batch = { set: jest.fn(), update: jest.fn(), commit: jest.fn(async () => undefined) };
    mocked.writeBatch.mockReturnValue(batch);
    try {
      await sendChatMessage("a_b", "a", ["b"], "  IG: alex  ", { shareContactDetails: true });
      expect(batch.set.mock.calls[0][1]).toEqual({ senderId: "a", text: "IG: alex", createdAt: "SERVER_TIME", contactShareConfirmed: true });
      expect(batch.update.mock.calls[0][1]).toMatchObject({ lastMessage: { text: "Shared contact details" }, "unread.b": { increment: 1 } });
      expect(batch.commit).toHaveBeenCalledTimes(1);
      await expect(sendChatMessage("a_b", "a", ["b"], "IG: alex")).rejects.toMatchObject({ code: "chat/contact-details" });
      expect(batch.commit).toHaveBeenCalledTimes(1);
    } finally { Object.defineProperty(Platform, "OS", { value: old, configurable: true }); }
  });

  it("bumps everyone else's unread count in a Duo chat", async () => {
    const batch = { set: jest.fn(), update: jest.fn(), commit: jest.fn(async () => undefined) };
    mocked.writeBatch.mockReturnValue(batch);
    await sendChatMessage("duo_a_b__c_d", "a", ["b", "c", "d"], "Hi all");
    expect(batch.update.mock.calls[0][1]).toEqual(
      expect.objectContaining({ "unread.b": { increment: 1 }, "unread.c": { increment: 1 }, "unread.d": { increment: 1 } })
    );
    expect(batch.update.mock.calls[0][1]).not.toHaveProperty("unread.a");
  });

  it("ignores blank messages", async () => {
    await sendChatMessage("a_b", "a", ["b"], "   ");
    expect(mocked.writeBatch).not.toHaveBeenCalled();
  });
});

describe("chat safety", () => {
  it("accepts only well-formed safety markers from the server", () => {
    expect(toSafety({ category: "money", severity: "high", hidden: false })).toEqual({
      category: "money",
      severity: "high",
      hidden: false
    });
    expect(toSafety({ category: "harassment", severity: "medium", hidden: true })?.hidden).toBe(true);
    expect(toSafety({ category: "unknown", severity: "high" })).toBeUndefined();
    expect(toSafety({ category: "money", severity: "extreme" })).toBeUndefined();
    expect(toSafety("money")).toBeUndefined();
    expect(toSafety(undefined)).toBeUndefined();
  });

  it("warns clearly about money and threats, and only tips about moving off the app", () => {
    const money = safetyNotice({ category: "money", severity: "medium", hidden: false })!;
    expect(money.subtle).toBe(false);
    expect(money.body).toMatch(/Never send money/);
    expect(safetyNotice({ category: "threat", severity: "high", hidden: true })?.suggestReport).toBe(true);
    expect(safetyNotice({ category: "off_platform", severity: "low", hidden: false })).toMatchObject({
      subtle: true,
      suggestReport: false
    });
    expect(safetyNotice({ category: "link", severity: "low", hidden: false })?.subtle).toBe(true);
    expect(safetyNotice({ category: "link", severity: "medium", hidden: false })?.subtle).toBe(false);
  });
});

describe("Duo chats", () => {
  const duo = normalizeMatch("duo_a_b__c_d", {
    kind: "duo",
    sides: { a_b: ["a", "b"], c_d: ["c", "d"] },
    participants: ["a", "b", "c", "d"],
    profiles: {
      a: { displayName: "Riya", photoUrl: null },
      b: { displayName: "Neha Shah", photoUrl: null },
      c: { displayName: "Arjun", photoUrl: null },
      d: { displayName: "Kabir", photoUrl: null }
    }
  });

  it("knows who's on each side", () => {
    expect(duo.kind).toBe("duo");
    expect(otherSide(duo, "a")).toEqual(["c", "d"]);
    expect(partnerIn(duo, "a")).toBe("b");
    expect(partnerIn(duo, "c")).toBe("d");
  });

  it("is titled by the other pair's first names", () => {
    expect(chatTitle(duo, "a")).toBe("Arjun & Kabir");
    expect(chatTitle(duo, "c")).toBe("Riya & Neha");
  });

  it("treats ordinary matches as pairs", () => {
    const pair = normalizeMatch("a_b", { participants: ["a", "b"], profiles: { b: { displayName: "Bea", photoUrl: null } } });
    expect(pair.kind).toBe("pair");
    expect(chatTitle(pair, "a")).toBe("Bea");
  });
});
