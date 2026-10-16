import { BeatPayload, BeatReply, createPresenceSession, MIN_ACTIVITY_GAP_MS, newSessionId } from "../src/services/presenceSession";
import { nextPresenceChange, presenceLabel, presenceStatus } from "../src/utils/presence";

const MINUTE = 60_000;

/** A session on a fake clock, recording every beat it sends. */
function harness(reply: Partial<BeatReply> = {}, startForeground = true) {
  let clock = 0;
  const timers: Array<{ at: number; callback: () => void; id: number }> = [];
  let nextId = 1;
  const beats: Array<BeatPayload & { at: number }> = [];
  const session = createPresenceSession({
    send: async (payload) => {
      beats.push({ ...payload, at: clock });
      return { enabled: true, sharing: true, idleTimeoutMs: 2 * MINUTE, heartbeatMs: 45_000, serverNow: 0, ...reply };
    },
    now: () => clock,
    setTimer: (callback, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, callback, id });
      return id;
    },
    clearTimer: (id) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    platform: "web",
    sessionId: "test-session-0001",
    startForeground
  });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };
  /** Moves the clock forward, firing due timers (and letting sends settle). */
  const advance = async (ms: number) => {
    const target = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > target) break;
      timers.shift();
      clock = due.at;
      due.callback();
      await settle();
    }
    clock = target;
    await settle();
  };
  return { session, beats, advance, timers };
}

describe("presence session", () => {
  it("opening Paire starts an active session at once", async () => {
    const { beats, advance } = harness();
    await advance(0);
    expect(beats).toEqual([{ sessionId: "test-session-0001", platform: "web", state: "active", idleMs: 0, seq: 1, at: 0 }]);
  });

  it("a tab or app started in the background isn't activity until it's brought forward", async () => {
    const { session, beats, advance } = harness({}, false);
    session.markActivity();
    await advance(5 * MINUTE);
    expect(beats).toHaveLength(0);
    session.foreground();
    await advance(0);
    expect(beats).toEqual([expect.objectContaining({ state: "active", idleMs: 0, seq: 1 })]);
  });

  it("numbers its beats so the server can drop late, older ones", async () => {
    const { session, beats, advance } = harness();
    await advance(10_000);
    session.background();
    await advance(0);
    expect(beats.map((beat) => beat.seq)).toEqual([1, 2]);
  });

  it("heartbeats carry how long ago the last interaction was, and stop once idle", async () => {
    const { session, beats, advance } = harness();
    await advance(30_000);
    session.markActivity(); // a tap at 30 s
    await advance(4 * MINUTE);
    expect(beats.map(({ at, idleMs }) => [at, idleMs])).toEqual([
      [0, 0],
      [45_000, 15_000],
      [90_000, 60_000],
      [135_000, 105_000]
      // At 180 s she has been idle 150 s (over 2 minutes): no more heartbeats.
    ]);
  });

  it("an open but untouched tab never keeps someone online", async () => {
    const { beats, advance } = harness();
    await advance(60 * MINUTE);
    expect(beats.every((beat) => beat.idleMs < 2 * MINUTE)).toBe(true);
    expect(beats.length).toBeLessThanOrEqual(3);
  });

  it("interactions cost nothing while heartbeating, and wake an idle session at once", async () => {
    const { session, beats, advance } = harness();
    await advance(1_000);
    for (let i = 0; i < 100; i += 1) session.markActivity();
    expect(beats).toHaveLength(1);
    await advance(10 * MINUTE);
    const before = beats.length;
    session.markActivity();
    await advance(0);
    expect(beats).toHaveLength(before + 1);
    expect(beats.at(-1)).toMatchObject({ state: "active", idleMs: 0 });
    // A burst right after doesn't add writes.
    session.markActivity();
    await advance(MIN_ACTIVITY_GAP_MS - 1);
    expect(beats).toHaveLength(before + 1);
  });

  it("hidden or backgrounded: one background beat, then silence until it returns", async () => {
    const { session, beats, advance } = harness();
    await advance(10_000);
    session.background();
    await advance(10 * MINUTE);
    expect(beats.map((beat) => beat.state)).toEqual(["active", "background"]);
    session.markActivity(); // events while hidden don't count
    await advance(0);
    expect(beats).toHaveLength(2);
    session.foreground();
    await advance(0);
    expect(beats.at(-1)).toMatchObject({ state: "active", idleMs: 0 });
  });

  it("logging out ends the session and stops everything", async () => {
    const { session, beats, advance, timers } = harness();
    await advance(5_000);
    await session.end();
    expect(beats.at(-1)).toMatchObject({ state: "ended" });
    expect(timers).toHaveLength(0);
    session.markActivity();
    session.foreground();
    await advance(5 * MINUTE);
    expect(beats.at(-1)).toMatchObject({ state: "ended" });
  });

  it("stays quiet while presence is off for Paire", async () => {
    const { session, beats, advance } = harness({ enabled: false });
    await advance(5 * MINUTE);
    session.markActivity();
    session.foreground();
    await advance(4 * MINUTE);
    expect(beats).toHaveLength(1);
  });

  it("rechecks soon when the server hasn't yet seen sharing turned back on", async () => {
    const { session, beats, advance } = harness({ sharing: false });
    await advance(0); // the "not sharing" reply arrives
    await advance(10_000);
    session.markActivity();
    await advance(0);
    expect(beats).toHaveLength(1);
    await advance(10_000);
    session.markActivity();
    await advance(0);
    expect(beats).toHaveLength(2);
  });

  it("makes a fresh, well-formed id for each session", () => {
    expect(newSessionId()).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe("presence labels", () => {
  const now = 1_800_000_000_000;

  it("says Online only inside the online window, on this device's clock", () => {
    // The server's clock is 30 s ahead of this device: offset -30 s.
    const view = { state: "online" as const, onlineUntil: now + 30_000 + 60_000 };
    expect(presenceStatus(view, -30_000, now)).toEqual({ online: true });
    expect(presenceStatus(view, -30_000, now + 60_001)).toEqual({ online: false, lastActiveAt: now + 60_000 });
    expect(nextPresenceChange({ a: view }, -30_000, now)).toBe(now + 60_000);
  });

  it("never claims someone is online when presence is hidden, missing or unknown", () => {
    expect(presenceStatus(undefined, 0, now)).toBeNull();
    expect(presenceStatus({ state: "unavailable" }, 0, now)).toBeNull();
    expect(presenceLabel(null, now)).toBe("");
    expect(presenceLabel({ online: false, lastActiveAt: null }, now)).toBe("");
  });

  it("shows last active approximately", () => {
    const at = (ms: number) => presenceLabel({ online: false, lastActiveAt: now - ms }, now);
    expect(presenceLabel({ online: true }, now)).toBe("Online");
    expect(at(3 * MINUTE)).toBe("Active a few minutes ago");
    expect(at(27 * MINUTE)).toBe("Active 25 min ago");
    expect(at(5 * 60 * MINUTE)).toBe("Active 5 h ago");
    expect(at(30 * 60 * MINUTE)).toBe("Active yesterday");
    expect(at(4 * 24 * 60 * MINUTE)).toBe("Active 4 days ago");
    expect(at(40 * 24 * 60 * MINUTE)).toBe("");
  });
});
