import { dueTime, funnelStatus, parseTestLikeConfig } from "../src/lib/test-like";

const on = parseTestLikeConfig({ enabled: true, senderEmail: "Sender@Example.com", allowlist: ["Tester@Example.com "], delayMs: 300000 });

describe("test-like probe", () => {
  it("is off and inert by default", () => {
    const off = parseTestLikeConfig(undefined);
    expect(off.enabled).toBe(false);
    expect(dueTime(off, "tester@example.com", true, 1000)).toBeNull();
  });
  it("queues only allowlisted finished signups, five minutes later", () => {
    expect(dueTime(on, "tester@example.com", true, 1000)).toBe(301000);
    expect(dueTime(on, "real.member@example.com", true, 1000)).toBeNull();
    expect(dueTime(on, "tester@example.com", false, 1000)).toBeNull();
    expect(dueTime(on, null, true, 1000)).toBeNull();
  });
  it("never targets the sender and clamps the delay", () => {
    const self = parseTestLikeConfig({ enabled: true, senderEmail: "a@x.com", allowlist: ["a@x.com"] });
    expect(dueTime(self, "a@x.com", true, 0)).toBeNull();
    expect(parseTestLikeConfig({ delayMs: 5 }).delayMs).toBe(60000);
    expect(parseTestLikeConfig({ delayMs: 9e9 }).delayMs).toBe(3600000);
    expect(parseTestLikeConfig({}).delayMs).toBe(300000);
  });
  it("reports whether the person came back after the like", () => {
    expect(funnelStatus({ status: "pending" }, null)).toBe("waiting");
    expect(funnelStatus({ status: "sent", likeSentAt: 100 }, null)).toBe("sent");
    expect(funnelStatus({ status: "sent", likeSentAt: 100 }, 90)).toBe("sent");
    expect(funnelStatus({ status: "sent", likeSentAt: 100 }, 150)).toBe("returned");
    expect(funnelStatus({ status: "skipped" }, null)).toBe("failed");
  });
});
