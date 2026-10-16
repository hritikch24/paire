import type { ChatAccess } from "../src/services/chatAccessService";
import { draftFor, saveDraft, sendLocked } from "../src/utils/chatAccess";

const NOW = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;
const access = (overrides: Partial<ChatAccess> = {}): ChatAccess => ({
  enforced: true,
  enforceFrom: null,
  legacyCutoff: null,
  legacyGraceUntil: null,
  canSend: false,
  unlimited: false,
  premiumUntil: null,
  unlock: { status: "available", priceInr: 49 },
  serverNow: NOW,
  ...overrides
});

describe("send gate (display only; the rules decide)", () => {
  it("is open while paid chat is off or access is unknown", () => {
    expect(sendLocked(undefined, NOW, NOW)).toBe(false);
    expect(sendLocked(access({ enforced: false }), NOW, NOW)).toBe(false);
  });

  it("locks unpaid members and opens for Unlimited Chat or a running Plus pass", () => {
    expect(sendLocked(access(), NOW, NOW)).toBe(true);
    expect(sendLocked(access({ unlimited: true, canSend: true }), NOW, NOW)).toBe(false);
    expect(sendLocked(access({ premiumUntil: NOW + HOUR, canSend: true }), NOW, NOW)).toBe(false);
  });

  it("locks again when Plus runs out, unless Unlimited Chat is owned too", () => {
    expect(sendLocked(access({ premiumUntil: NOW + HOUR }), NOW, NOW + HOUR + 1)).toBe(true);
    expect(sendLocked(access({ premiumUntil: NOW + HOUR, unlimited: true }), NOW, NOW + HOUR + 1)).toBe(false);
  });

  it("honours the grace period for chats from before the gate", () => {
    const grace = access({ legacyCutoff: NOW - HOUR, legacyGraceUntil: NOW + HOUR });
    expect(sendLocked(grace, NOW - 2 * HOUR, NOW)).toBe(false);
    expect(sendLocked(grace, NOW - 30 * 60_000, NOW)).toBe(true);
    expect(sendLocked(grace, NOW - 2 * HOUR, NOW + 2 * HOUR)).toBe(true);
  });
});

describe("drafts", () => {
  it("keep a composed message through checkout and leaving the chat, and clear once sent", () => {
    saveDraft("m1", "Hey! Coffee this weekend?");
    expect(draftFor("m1")).toBe("Hey! Coffee this weekend?");
    expect(draftFor("m2")).toBe("");
    saveDraft("m1", "");
    expect(draftFor("m1")).toBe("");
  });
});
