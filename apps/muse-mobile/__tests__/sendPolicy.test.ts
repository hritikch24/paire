import type { ChatAccess } from "../src/services/chatAccessService";
import type { SendPolicy } from "../src/services/sendPolicyService";
import { sendLocked } from "../src/utils/chatAccess";
import { sendLockedFor } from "../src/utils/sendPolicy";

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
const policy = (overrides: Partial<SendPolicy> = {}): SendPolicy => ({ acceptFlow: true, womenSendFree: true, giftSales: false, freeSender: false, ...overrides });

describe("sendLockedFor (display only; the rules decide)", () => {
  it("is open for a free sender even with the gate on and no pass", () => {
    expect(sendLocked(access(), NOW, NOW)).toBe(true);
    expect(sendLockedFor(access(), policy({ freeSender: true }), NOW, NOW)).toBe(false);
  });

  it("otherwise equals sendLocked, with the policy false or unknown", () => {
    const cases: Array<ChatAccess | undefined> = [
      undefined,
      access(),
      access({ enforced: false }),
      access({ unlimited: true, canSend: true }),
      access({ premiumUntil: NOW + HOUR, canSend: true }),
      access({ premiumUntil: NOW - HOUR }),
      access({ legacyCutoff: NOW, legacyGraceUntil: NOW + HOUR })
    ];
    for (const value of cases) {
      for (const created of [NOW - HOUR, NOW + HOUR]) {
        expect(sendLockedFor(value, policy({ freeSender: false }), created, NOW)).toBe(sendLocked(value, created, NOW));
        expect(sendLockedFor(value, undefined, created, NOW)).toBe(sendLocked(value, created, NOW));
      }
    }
  });
});
