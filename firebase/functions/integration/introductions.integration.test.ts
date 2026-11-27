import { randomUUID } from "node:crypto";
import { db } from "../src/admin";
import {
  discoveryIntroduction,
  listDiscoveryEvents,
} from "../src/introductions";
import { pairId } from "../src/lib/ids";
const req = (uid: string, data: object) =>
  ({ auth: { uid, token: {} }, data }) as never;
const call = (uid: string, action: string, extra = {}) =>
  discoveryIntroduction.run(req(uid, { mode: "vibes", action, ...extra }));
async function seed(gender: string, vibe: string) {
  const uid = randomUUID();
  await db.doc("users/" + uid).set({
    age: 29,
    gender,
    displayName: "Fixture",
    onboardingComplete: true,
    isDiscoverable: true,
    vibes: [vibe],
    photoUrls: [],
  });
  await db.doc("moderation/" + uid).set({ emailVerified: true, status: "ok" });
  return uid;
}
beforeEach(async () => {
  await db
    .doc("runtime/trust")
    .set({ requireVerification: false }, { merge: true });
});
test("automatic vibe introduction needs opt-in and two separate decisions; no swipe is written", async () => {
  const vibe = randomUUID(),
    a = await seed("man", vibe),
    b = await seed("woman", vibe);
  expect(await call(a, "status")).toMatchObject({ state: "off" });
  await call(a, "join");
  expect(await call(a, "check")).toMatchObject({ state: "waiting" });
  await call(b, "join");
  const intro = await call(b, "check");
  if (!("ticket" in intro)) throw Error("Expected a suggested pair");
  expect(intro).toMatchObject({
    state: "intro",
    shared: [vibe],
    profile: { uid: a },
  });
  const id = pairId(a, b);
  await call(b, "continue", { ticket: intro.ticket });
  expect((await db.doc("matches/" + id).get()).exists).toBe(false);
  await expect(call(a, "continue", { ticket: "stale" })).rejects.toThrow();
  await call(a, "continue", { ticket: intro.ticket });
  expect((await db.doc("matches/" + id).get()).get("source")).toBe("vibes");
  expect(await call(b, "status")).toMatchObject({
    state: "matched",
    matchId: id,
  });
  expect((await db.doc("swipes/" + a + "/outgoing/" + b).get()).exists).toBe(
    false,
  );
});
test("metro uses voluntary city membership and revokes an introduction on block", async () => {
  const a = await seed("man", "coffee"),
    b = await seed("woman", "art"),
    metro = { mode: "metro", city: "Kochi" };
  await call(a, "join", metro);
  await call(b, "join", { ...metro, city: "Pune" });
  expect((await call(b, "check", metro)).state).toBe("waiting");
  await call(b, "leave", metro);
  await call(b, "join", metro);
  const intro = await call(b, "check", metro);
  if (!("ticket" in intro)) throw Error("Expected a metro pair");
  expect(intro.state).toBe("intro");
  await db.doc(`blocks/${a}/blocked/${b}`).set({ targetUid: b });
  expect(
    (await call(b, "continue", { ...metro, ticket: intro.ticket })).state,
  ).toBe("waiting");
  expect((await db.doc("matches/" + pairId(a, b)).get()).exists).toBe(false);
  await call(a, "leave", metro);
  expect((await call(a, "status", metro)).state).toBe("off");
});
test("event directory only includes open published rooms and never exposes private room fields", async () => {
  const uid = await seed("man", "coffee"),
    now = Date.now(),
    refs = Array.from({ length: 3 }, () => db.collection("eventRooms").doc());
  await Promise.all(
    refs.map((r, i) =>
      r.set({
        title: r.id,
        status: i === 1 ? "draft" : "published",
        city: "Pune",
        category: "Social",
        timezone: "Asia/Kolkata",
        closesAt: now + (i === 2 ? -1000 : 60000),
        coverLicense: "private",
      }),
    ),
  );
  const result = await listDiscoveryEvents.run(req(uid, {}));
  expect(result.rooms.map((r) => r.id)).toContain(refs[0].id);
  expect(result.rooms.map((r) => r.id)).not.toContain(refs[1].id);
  expect(result.rooms.map((r) => r.id)).not.toContain(refs[2].id);
  expect(JSON.stringify(result)).not.toContain("coverLicense");
});

test("expiry between decisions prevents a match even before TTL removes the document", async () => {
  const vibe = randomUUID();
  const a = await seed("woman", vibe);
  const b = await seed("man", vibe);
  await call(a, "join");
  await call(b, "join");
  const intro = await call(b, "check");
  if (!("ticket" in intro)) throw Error("Expected an introduction");
  await call(a, "continue", { ticket: intro.ticket });
  await db.doc("vibeIntroMembers/" + a).update({until: Date.now() - 1});
  expect(await call(b, "continue", {ticket: intro.ticket})).toMatchObject({state:"waiting"});
  expect(await call(a, "status")).toMatchObject({state:"off"});
  expect((await db.doc("matches/" + pairId(a,b)).get()).exists).toBe(false);
});
