const store = new Map<string, Record<string, unknown>>();
let queue: Promise<unknown> = Promise.resolve();
const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path), get: (field: string) => store.get(path)?.[field] });
const ref = (path: string) => ({ path });

jest.mock("../src/admin", () => ({
  db: {
    doc: (path: string) => ref(path),
    // Transactions run one after another, like Firestore retrying a contended commit.
    runTransaction: (fn: (tx: unknown) => Promise<unknown>) => {
      const run = queue.then(async () => {
        const writes: Array<[string, Record<string, unknown>]> = [];
        const tx = {
          getAll: async (...refs: Array<{ path: string }>) => refs.map((r) => snap(r.path)),
          get: async (r: { path: string }) => snap(r.path),
          set: (r: { path: string }, data: Record<string, unknown>) => { writes.push([r.path, data]); }
        };
        const result = await fn(tx);
        writes.forEach(([path, data]) => store.set(path, data));
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    }
  }
}));
jest.mock("../src/push", () => ({ sendPushToUser: jest.fn(async () => undefined) }));
jest.mock("../src/quota", () => ({ consumeDailyQuota: jest.fn(async () => 1) }));
jest.mock("../src/chatEntitlement", () => ({ chatPolicy: jest.fn(async () => ({ acceptFlow: true })) }));
jest.mock("../src/trust", () => ({
  requireVerifiedUsers: jest.fn(async () => undefined),
  verifiedUsers: jest.fn(async (uids: string[]) => new Set(uids))
}));
import { acceptLike } from "../src/acceptLike";
import { sendPushToUser } from "../src/push";
import { consumeDailyQuota } from "../src/quota";

const call = (uid: string, targetUid: string) =>
  acceptLike.run({ auth: { uid, token: {} }, data: { targetUid } } as unknown as Parameters<typeof acceptLike.run>[0]);

const profile = (gender: "woman" | "man", name: string) => ({
  displayName: name, age: 27, gender, photoUrls: ["https://example.com/p.jpg"], isDiscoverable: true, onboardingComplete: true
});
const settings = (showMe: string) => ({ showMe: [showMe], ageMin: 18, ageMax: 60 });

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  store.set("users/she", profile("woman", "Asha"));
  store.set("users/he", profile("man", "Dev"));
  store.set("users/she/private/settings", settings("man"));
  store.set("users/he/private/settings", settings("woman"));
  store.set("swipes/he/outgoing/she", { fromUid: "he", toUid: "she", type: "like", note: "Hi" });
});

test("accepting creates the match and sends one push to him", async () => {
  await expect(call("she", "he")).resolves.toEqual({ matched: true, matchId: "he_she" });
  expect(store.get("matches/he_she")).toMatchObject({ active: true, participants: ["he", "she"] });
  expect(store.get("swipes/she/outgoing/he")).toMatchObject({ type: "like" });
  expect(sendPushToUser).toHaveBeenCalledTimes(1);
  expect(sendPushToUser).toHaveBeenCalledWith("he", expect.objectContaining({ kind: "matches", tag: "match-he_she" }));
  expect(consumeDailyQuota).toHaveBeenCalledWith("she", "acceptChecks", 300);
});

test("parallel accepts (double tap, two tabs) make one match and send one push", async () => {
  const results = await Promise.all([call("she", "he"), call("she", "he"), call("she", "he"), call("she", "he")]);
  expect(new Set(results.map((r) => r.matchId))).toEqual(new Set(["he_she"]));
  expect(sendPushToUser).toHaveBeenCalledTimes(1);
  expect([...store.keys()].filter((key) => key.startsWith("matches/"))).toEqual(["matches/he_she"]);
});

test("an ended match is not brought back, and sends nothing", async () => {
  store.set("matches/he_she", { active: false, endReason: "block" });
  await expect(call("she", "he")).rejects.toMatchObject({ code: "not-found" });
  expect(store.get("matches/he_she")).toEqual({ active: false, endReason: "block" });
  expect(sendPushToUser).not.toHaveBeenCalled();
});

test.each([
  ["blocked by her", "blocks/she/blocked/he"],
  ["blocked by him", "blocks/he/blocked/she"]
])("a stale like (%s) makes no match and sends nothing", async (_, path) => {
  store.set(path, { targetUid: "x" });
  await expect(call("she", "he")).rejects.toMatchObject({ code: "not-found" });
  expect(store.has("matches/he_she")).toBe(false);
  expect(sendPushToUser).not.toHaveBeenCalled();
});

test("a banned or hidden man is no longer available", async () => {
  store.set("moderation/he", { status: "banned" });
  await expect(call("she", "he")).rejects.toMatchObject({ code: "not-found" });
  expect(store.has("matches/he_she")).toBe(false);
});

test("only women accept", async () => {
  store.set("users/she", profile("man", "Asha"));
  await expect(call("she", "he")).rejects.toMatchObject({ code: "permission-denied" });
  expect(store.has("matches/he_she")).toBe(false);
  expect(sendPushToUser).not.toHaveBeenCalled();
});

test("a pass is not a like", async () => {
  store.set("swipes/he/outgoing/she", { type: "nope" });
  await expect(call("she", "he")).rejects.toMatchObject({ code: "not-found" });
  expect(store.has("matches/he_she")).toBe(false);
});

test("switch off: refused before anything is read or counted", async () => {
  const { chatPolicy } = jest.requireMock("../src/chatEntitlement");
  chatPolicy.mockResolvedValueOnce({ acceptFlow: false });
  await expect(call("she", "he")).rejects.toMatchObject({ code: "failed-precondition", details: { reason: "accept-off" } });
  expect(consumeDailyQuota).not.toHaveBeenCalled();
  expect(store.has("matches/he_she")).toBe(false);
});
