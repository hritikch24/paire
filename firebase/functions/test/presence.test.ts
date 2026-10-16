import { applyBeat, BeatInput, coarseLastActive, onlineUntil, parseBeat, parsePresenceConfig, PresenceDoc, presenceView } from "../src/lib/presence";

const config = parsePresenceConfig({ enabled: true });
const T0 = 1_800_000_000_000;
const beat = (state: BeatInput["state"], idleMs = 0, sessionId = "tab-aaaaaaaaaaaa"): BeatInput => ({ sessionId, platform: "web", state, idleMs });

/** Replays beats at the given offsets (ms after T0). */
function replay(steps: Array<[number, BeatInput]>, doc: PresenceDoc = {}): PresenceDoc {
  return steps.reduce((current, [at, input]) => applyBeat(current, input, config, T0 + at) ?? current, doc);
}

describe("presence config", () => {
  it("is off unless enabled, with a 2-minute idle timeout and a lease renewed twice per lease", () => {
    expect(parsePresenceConfig(undefined)).toEqual({ enabled: false, idleTimeoutMs: 120_000, leaseMs: 90_000, heartbeatMs: 45_000 });
    expect(parsePresenceConfig({ enabled: "yes" }).enabled).toBe(false);
  });

  it("makes the inactivity threshold configurable within safe bounds", () => {
    expect(parsePresenceConfig({ enabled: true, idleTimeoutMs: 300_000 }).idleTimeoutMs).toBe(300_000);
    expect(parsePresenceConfig({ idleTimeoutMs: 1 }).idleTimeoutMs).toBe(10_000);
    expect(parsePresenceConfig({ idleTimeoutMs: 10 * 60 * 60_000 }).idleTimeoutMs).toBe(30 * 60_000);
    expect(parsePresenceConfig({ idleTimeoutMs: "fast" }).idleTimeoutMs).toBe(120_000);
    expect(parsePresenceConfig({ leaseMs: 20_000 }).heartbeatMs).toBe(10_000);
  });
});

describe("presence beats", () => {
  it("accepts only well-formed beats: no free text, no clock times", () => {
    expect(parseBeat({ sessionId: "tab-aaaaaaaaaaaa", platform: "web", state: "active", idleMs: 10 })).toEqual(beat("active", 10));
    expect(parseBeat({ sessionId: "short", platform: "web", state: "active", idleMs: 0 })).toBeNull();
    expect(parseBeat({ sessionId: "../../etc/passwd!!", platform: "web", state: "active", idleMs: 0 })).toBeNull();
    expect(parseBeat({ sessionId: "tab-aaaaaaaaaaaa", platform: "desktop", state: "active", idleMs: 0 })).toBeNull();
    expect(parseBeat({ sessionId: "tab-aaaaaaaaaaaa", platform: "web", state: "typing", idleMs: 0 })).toBeNull();
    expect(parseBeat({ sessionId: "tab-aaaaaaaaaaaa", platform: "web", state: "active", idleMs: -5 })).toBeNull();
    expect(parseBeat({ sessionId: "tab-aaaaaaaaaaaa", platform: "web", state: "active" })).toBeNull();
  });

  it("an active, foreground session is online until two minutes after the last interaction", () => {
    const doc = replay([[0, beat("active")]]);
    expect(presenceView(doc, config, T0 + 1_000)).toEqual({ state: "online", onlineUntil: T0 + 90_000 });
    // The lease (90 s) runs out first unless the client keeps beating.
    expect(presenceView(doc, config, T0 + 90_001).state).toBe("offline");
  });

  it("goes offline after 2 minutes idle even with an open tab that keeps heartbeating", () => {
    // Heartbeats every 45 s, with no interaction after T0: idleMs grows, activity doesn't move.
    const doc = replay([[0, beat("active")], [45_000, beat("active", 45_000)], [90_000, beat("active", 90_000)], [135_000, beat("active", 135_000)]]);
    expect(doc.sessions!["tab-aaaaaaaaaaaa"].activeAt).toBe(T0);
    expect(presenceView(doc, config, T0 + 119_000).state).toBe("online");
    expect(presenceView(doc, config, T0 + 120_000).state).toBe("offline");
    expect(onlineUntil(doc, config, T0 + 140_000)).toBeNull();
  });

  it("interaction carried by a heartbeat extends activity to the moment it happened", () => {
    const doc = replay([[0, beat("active")], [45_000, beat("active", 5_000)]]);
    expect(doc.sessions!["tab-aaaaaaaaaaaa"].activeAt).toBe(T0 + 40_000);
    expect(onlineUntil(doc, config, T0 + 50_000)).toBe(T0 + 135_000);
  });

  it("hidden or backgrounded sessions never count as online", () => {
    const doc = replay([[0, beat("active")], [10_000, beat("background", 1_000)]]);
    expect(presenceView(doc, config, T0 + 11_000)).toEqual({ state: "offline", lastActiveAt: coarseLastActive(T0 + 9_000, T0 + 11_000) });
  });

  it("returning to the foreground starts an active session again", () => {
    const doc = replay([[0, beat("active")], [10_000, beat("background")], [600_000, beat("active")]]);
    expect(presenceView(doc, config, T0 + 601_000)).toEqual({ state: "online", onlineUntil: T0 + 690_000 });
  });

  it("a crash, lost connection or missed close signal expires with the lease", () => {
    // The tab is busy (interacting) but its beats stop arriving.
    const doc = replay([[0, beat("active")], [45_000, beat("active", 0)]]);
    // Reported in 5-second steps, rounded down: offline a few seconds early, never late.
    expect(presenceView(doc, config, T0 + 134_999).state).toBe("online");
    expect(presenceView(doc, config, T0 + 135_000).state).toBe("offline");
    const late = replay([[0, beat("active")], [45_000, beat("active", 0)], [47_000, beat("active", 0)]]);
    expect(presenceView(late, config, T0 + 50_000)).toEqual({ state: "online", onlineUntil: T0 + 135_000 });
  });

  it("reconnecting resumes with the real idle time, not the reconnection time", () => {
    // Offline for 5 minutes; the first beat back reports 4 minutes since the last tap.
    const doc = replay([[0, beat("active")], [300_000, beat("active", 240_000)]]);
    expect(doc.sessions!["tab-aaaaaaaaaaaa"].activeAt).toBe(T0 + 60_000);
    expect(presenceView(doc, config, T0 + 300_000).state).toBe("offline");
  });

  it("the client's wall clock never matters: only server time and durations are used", () => {
    // The same beats arriving with any client clock produce identical state.
    const a = replay([[0, beat("active", 3_000)]]);
    expect(a.sessions!["tab-aaaaaaaaaaaa"]).toMatchObject({ activeAt: T0 - 3_000, heartbeatAt: T0 });
  });

  it("logging out or closing ends the session at once", () => {
    const doc = replay([[0, beat("active")], [5_000, beat("ended", 1_000)]]);
    expect(doc.sessions).toEqual({});
    expect(presenceView(doc, config, T0 + 6_000).state).toBe("offline");
    expect(doc.lastActiveAt).toBe(T0 + 4_000);
  });

  it("is online while any one tab or device is active", () => {
    const phone = "app-bbbbbbbbbbbb";
    const doc = replay([[0, beat("active")], [1_000, { ...beat("active", 0, phone), platform: "android" }], [2_000, beat("background")]]);
    expect(presenceView(doc, config, T0 + 3_000)).toEqual({ state: "online", onlineUntil: T0 + 90_000 });
    const phoneIdle = replay([[100_000, { ...beat("background", 0, phone), platform: "android" }]], doc);
    expect(presenceView(phoneIdle, config, T0 + 100_001).state).toBe("offline");
  });

  it("an older beat arriving late never overrides a newer one", () => {
    const doc = replay([[0, { ...beat("active"), seq: 1 }], [1_000, { ...beat("background"), seq: 3 }]]);
    expect(applyBeat(doc, { ...beat("active"), seq: 2 }, config, T0 + 1_500)).toBeNull();
    expect(presenceView(doc, config, T0 + 2_000).state).toBe("offline");
  });

  it("ignores beats that repeat too fast, but never a change of state", () => {
    const doc = replay([[0, beat("active")]]);
    expect(applyBeat(doc, beat("active", 1_000), config, T0 + 2_000)).toBeNull();
    expect(applyBeat(doc, beat("background"), config, T0 + 2_000)).not.toBeNull();
    expect(applyBeat(doc, beat("ended"), config, T0 + 2_000)).not.toBeNull();
  });

  it("keeps a bounded number of sessions and prunes long-dead ones", () => {
    const many = Array.from({ length: 14 }, (_, index): [number, BeatInput] => [index * 10_000, beat("active", 0, `tab-${String(index).padStart(12, "0")}`)]);
    const doc = replay(many);
    expect(Object.keys(doc.sessions!)).toHaveLength(10);
    expect(doc.sessions!["tab-000000000000"]).toBeUndefined();
    const later = applyBeat(doc, beat("active", 0, "tab-zzzzzzzzzzzz"), config, T0 + 60 * 60_000)!;
    expect(Object.keys(later.sessions)).toEqual(["tab-zzzzzzzzzzzz"]);
  });
});

describe("last active", () => {
  it("is approximate: 5-minute steps, then hours, then days, and nothing after 30 days", () => {
    const now = Date.UTC(2026, 9, 17, 12, 0, 0);
    expect(coarseLastActive(now - 7 * 60_000 - 1234, now)).toBe(now - 10 * 60_000);
    expect(coarseLastActive(now - 3 * 60 * 60_000 - 1234, now)).toBe(now - 4 * 60 * 60_000);
    expect(coarseLastActive(now - 3 * 24 * 60 * 60_000, now)).toBe(Date.UTC(2026, 9, 14));
    expect(coarseLastActive(now - 31 * 24 * 60 * 60_000, now)).toBeNull();
    expect(coarseLastActive(undefined, now)).toBeNull();
    expect(coarseLastActive(now + 60_000, now)).toBe(now);
  });

  it("stale or missing presence is never reported as online", () => {
    expect(presenceView(undefined, config, T0)).toEqual({ state: "offline", lastActiveAt: null });
    expect(presenceView({ sessions: { x: { platform: "web", foreground: true, activeAt: T0, heartbeatAt: T0, createdAt: T0 } } }, config, T0 + 10 * 60_000).state).toBe("offline");
  });
});
