import { randomUUID } from "node:crypto";
import { adminAuth, db } from "../src/admin";
import {
  cleanupEventParticipants,
  getEventRoom,
  saveEventRoom,
  previewEventDeck,
  setEventParticipation,
} from "../src/eventRooms";

const request = (data: object, uid?: string) =>
  ({
    data,
    auth: uid
      ? { uid, token: { moderator: true, supportAccess: true } }
      : undefined,
  }) as never;
test("event authorization, exact closing instant and private preview", async () => {
  const uid = randomUUID();
  const fields = {
    title: uid,
    city: "Test",
    venue: "Fixture",
    category: "Social",
    timezone: "Asia/Kolkata",
    start: "2026-11-10T18:00:00+05:30",
    end: "2026-11-10T20:00:00+05:30",
    status: "published",
  };
  await expect(
    saveEventRoom.run(request({ ...fields, key: "admin" })),
  ).rejects.toThrow();
  await adminAuth().createUser({ uid });
  await expect(saveEventRoom.run(request(fields, uid))).rejects.toThrow();
  await adminAuth().setCustomUserClaims(uid, {
    moderator: true,
    supportAccess: true,
  });
  await db.doc(`supportOperators/${uid}`).set({ enabled: true });
  const { id } = await saveEventRoom.run(request(fields, uid));
  await expect(saveEventRoom.run(request(fields, uid))).rejects.toThrow(
    "already exists",
  );
  const closes = Date.parse("2026-11-17T14:30:00Z");
  const clock = jest.spyOn(Date, "now").mockReturnValue(closes - 1);
  try {
    await expect(getEventRoom.run(request({ id }))).resolves.toMatchObject({
      open: true,
      closesAt: closes,
    });
    await expect(
      setEventParticipation.run(request({ id, join: true })),
    ).rejects.toThrow();
    await db
      .doc("runtime/trust")
      .set({ requireVerification: false }, { merge: true });
    await db.doc(`users/${uid}`).set({
      onboardingComplete: true,
      age: 29,
      gender: "woman",
      photoUrls: ["https://private.invalid/original.jpg"],
    });
    await db.doc(`moderation/${uid}`).set({ emailVerified: true });
    const preview = () =>
      previewEventDeck.run(request({ id, adult: true, gender: "woman" }));
    expect(await preview()).toEqual({ count: 0 });
    await setEventParticipation.run(request({ id, join: true }, uid));
    expect(await preview()).toEqual({
      count: 1,
      deck: expect.stringMatching(/^[a-f0-9-]{36}$/),
    });
    await db.doc(`users/${uid}/private/settings`).set({ incognito: true });
    expect(await preview()).toEqual({ count: 0 });
    clock.mockReturnValue(closes);
    await expect(getEventRoom.run(request({ id }))).resolves.toMatchObject({
      open: false,
    });
    await expect(preview()).rejects.toThrow("closed");
    await expect(
      setEventParticipation.run(request({ id, join: true }, uid)),
    ).rejects.toThrow("closed");
    await saveEventRoom.run(
      request({ ...fields, id, end: "2026-11-12T20:00:00+05:30" }, uid),
    );
    await cleanupEventParticipants.run({
      scheduleTime: new Date(closes).toISOString(),
    });
    const membership = db.doc(`eventRooms/${id}/eventParticipants/${uid}`);
    expect((await membership.get()).exists).toBe(true);
    clock.mockReturnValue(closes + 2 * 86400000);
    await cleanupEventParticipants.run({
      scheduleTime: new Date(closes + 2 * 86400000).toISOString(),
    });
    expect((await membership.get()).exists).toBe(false);
  } finally {
    clock.mockRestore();
  }
});

test("rewind bounds, withdrawal, fresh privacy and concurrent decisions", async () => {
  const { swipe, undoSwipe } = await import("../src/swipes");
  const uid = randomUUID(),
    targets = Array.from({ length: 4 }, () => randomUUID());
  await db.doc("runtime/trust").set({ requireVerification: false });
  for (const person of [uid, ...targets]) {
    await db.doc(`users/${person}`).set({
      onboardingComplete: true,
      displayName: "QA",
      age: 29,
      gender: person === uid ? "man" : "woman",
    });
    await db
      .doc(`moderation/${person}`)
      .set({ emailVerified: true, status: "ok" });
  }
  for (const targetUid of targets)
    await swipe.run(request({ targetUid, type: "nope" }, uid));
  await expect(
    undoSwipe.run(request({ targetUid: targets[0] }, uid)),
  ).rejects.toThrow();
  await db.doc(`blocks/${targets[2]}/blocked/${uid}`).set({ targetUid: uid });
  await expect(
    undoSwipe.run(request({ targetUid: targets[2] }, uid)),
  ).rejects.toThrow();
  const latest = targets[3];
  const attempts = await Promise.allSettled(
    [1, 2].map(() => undoSwipe.run(request({ targetUid: latest }, uid))),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await db.doc(`users/${latest}`).update({ isDiscoverable: false });
  await expect(
    swipe.run(request({ targetUid: latest, type: "like" }, uid)),
  ).rejects.toThrow();
  expect(
    (await db.doc(`swipes/${uid}/outgoing/${latest}`).get()).get("type"),
  ).toBe("rewound");
});

test("preview sessions and replayed outcomes count once outside account totals", async () => {
  const { countPreview, attributeEventVisit, countEventFirstSend } =
    await import("../src/eventMetrics");
  const session = randomUUID(),
    campaign = randomUUID(),
    uid = randomUUID(),
    id = db.collection("eventRooms").doc().id;
  // Auth exposes creationTime at whole-second precision. Model the time a
  // real adult takes to leave the preview and finish registration.
  const previewClock = jest
    .spyOn(Date, "now")
    .mockReturnValue(Date.now() - 2000);
  try {
    await Promise.all([
      countPreview(session, campaign, id),
      countPreview(session, campaign, id),
    ]);
  } finally {
    previewClock.mockRestore();
  }
  const totals = db.doc(
    "eventFunnelDaily/" +
      new Date().toISOString().slice(0, 10) +
      "_" +
      campaign,
  );
  expect((await totals.get()).data()).toEqual({ preview: 1 });
  expect((await db.doc("users/" + session).get()).exists).toBe(false);
  await adminAuth().createUser({ uid });
  await attributeEventVisit.run(request({ session, id }, uid));
  await attributeEventVisit.run(request({ session, id }, uid));
  const message = { data: { get: () => uid } } as never;
  await Promise.all([
    countEventFirstSend.run(message),
    countEventFirstSend.run(message),
  ]);
  expect((await totals.get()).data()).toEqual({
    preview: 1,
    registration: 1,
    firstSend: 1,
  });
});
