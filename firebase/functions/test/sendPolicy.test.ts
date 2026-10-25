import { effectiveFreeSender, freeSenderNeedsRepair } from "../src/lib/sendPolicy";
import { parseChatPolicy } from "../src/lib/chatAccess";

const on = parseChatPolicy({ womenSendFree: true });
const off = parseChatPolicy({ womenSendFree: false });

describe("effective freeSender (what getSendPolicy reports)", () => {
  it("is true only when the switch is on AND the caller's mirror says so", () => {
    expect(effectiveFreeSender(on, { unlimited: false, premiumUntil: 0, freeSender: true })).toBe(true);
    expect(effectiveFreeSender(off, { unlimited: false, premiumUntil: 0, freeSender: true })).toBe(false);
    expect(effectiveFreeSender(on, { unlimited: false, premiumUntil: 0, freeSender: false })).toBe(false);
    expect(effectiveFreeSender(on, { unlimited: true, premiumUntil: 0 })).toBe(false);
    expect(effectiveFreeSender(on, undefined)).toBe(false);
    expect(effectiveFreeSender(on, null)).toBe(false);
  });
});

describe("mirror repair (getSendPolicy resyncs a drifted freeSender before answering)", () => {
  it("is needed only with the switch on and a mirror that disagrees with the member's gender", () => {
    expect(freeSenderNeedsRepair(on, { unlimited: false, premiumUntil: 0 }, true)).toBe(true);
    expect(freeSenderNeedsRepair(on, undefined, true)).toBe(true);
    expect(freeSenderNeedsRepair(on, { unlimited: false, premiumUntil: 0, freeSender: true }, false)).toBe(true);
    expect(freeSenderNeedsRepair(on, { unlimited: false, premiumUntil: 0, freeSender: true }, true)).toBe(false);
    // A missing flag and a man: both mean "not a free sender", nothing to fix (and nothing to write).
    expect(freeSenderNeedsRepair(on, { unlimited: false, premiumUntil: 0 }, false)).toBe(false);
    expect(freeSenderNeedsRepair(on, undefined, false)).toBe(false);
    expect(freeSenderNeedsRepair(off, { unlimited: false, premiumUntil: 0 }, true)).toBe(false);
  });
});
