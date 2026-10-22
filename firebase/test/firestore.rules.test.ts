import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import firebase from "firebase/compat/app";
import "firebase/compat/firestore";
import fs from "fs";
import path from "path";

const projectId = "demo-muse";
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const increment = (n: number) => firebase.firestore.FieldValue.increment(n);

let testEnv: RulesTestEnvironment;

/** "host:port" from the variables `firebase emulators:exec` sets, or the default. */
function emulator(variable: string, fallback: string) {
  const [host, port] = (process.env[variable] || fallback).split(":");
  return { host, port: Number(port) };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "../rules/firestore.rules"), "utf8"),
      ...emulator("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, "../rules/storage.rules"), "utf8"),
      ...emulator("FIREBASE_STORAGE_EMULATOR_HOST", "127.0.0.1:9199")
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed({ "runtime/trust": { requireVerification: false } });
});

// Members have confirmed their email (Google sign-ins arrive confirmed).
const dbFor = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: true }).firestore();
const unconfirmedDbFor = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: false }).firestore();

function validProfile(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    uid,
    displayName: "Alexa",
    age: 28,
    gender: "woman",
    pronouns: "she/her",
    city: "Mumbai",
    bio: "Ceramics and jazz.",
    photoUrls: ["https://example.com/a.jpg"],
    interests: ["canvas"],
    intentions: ["long-term"],
    vibes: ["cozy"],
    quickAnswers: [],
    isDiscoverable: true,
    onboardingComplete: true,
    safetyConfirmed: true,
    createdAt: 1,
    updatedAt: 1,
    lastActiveAt: 1,
    ...overrides
  };
}

async function seed(writes: Record<string, Record<string, unknown>>) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [docPath, data] of Object.entries(writes)) {
      await db.doc(docPath).set(data);
    }
  });
}

function matchDoc(active = true) {
  return {
    id: "alexa_jules",
    participants: ["alexa", "jules"],
    active,
    createdAt: firebase.firestore.Timestamp.fromMillis(1),
    lastActivityAt: firebase.firestore.Timestamp.fromMillis(1),
    profiles: {},
    lastMessage: null,
    unread: { alexa: 0, jules: 0 },
    lastReadAt: {}
  };
}

describe("read-only support access", () => {
  const expiresAt = () => Date.now() + 15 * 60_000;
  async function supportAccess() {
    const expiry = expiresAt();
    await seed({
      "supportOperators/owner": { enabled: true },
      "supportSessions/session1": { actorUid: "owner", targetUid: "alexa", supportUid: "support_session1", expiresAt: expiry, endedAt: null },
      "users/alexa": validProfile("alexa"),
      "users/alexa/private/info": { email: "fiction@example.com" },
      "users/alexa/private/settings": { showMe: ["man"] },
      "users/alexa/devices/phone": { token: "private-push-token" },
      "users/stranger/private/info": { email: "stranger@example.com" },
      "matches/alexa_jules": matchDoc(),
      "matches/alexa_jules/messages/one": { senderId: "jules", text: "Fictional message", createdAt: firebase.firestore.Timestamp.now() },
      "matches/other_pair": { ...matchDoc(), participants: ["stranger", "other"] }
    });
    const context = testEnv.authenticatedContext("support_session1", { supportSession: "session1", supportTarget: "alexa", supportExpiresAt: expiry });
    return { db: context.firestore(), context, expiry };
  }
  test("reads the member's profile/settings/chats, and cannot read unrelated data, device tokens or audit records", async () => {
    const { db } = await supportAccess();
    for (const path of ["users/alexa", "users/alexa/private/info", "users/alexa/private/settings", "matches/alexa_jules", "matches/alexa_jules/messages/one"]) await assertSucceeds(db.doc(path).get());
    await assertSucceeds(db.collection("matches").where("participants", "array-contains", "alexa").get());
    for (const path of ["users/stranger/private/info", "matches/other_pair", "supportSessions/session1", "users/alexa/devices/phone"]) await assertFails(db.doc(path).get());
  });
  test("all write paths stay blocked, including read receipts and private data deletion", async () => {
    const { db, context } = await supportAccess();
    await assertFails(db.doc("users/alexa").update({ bio: "changed" }));
    await assertFails(db.doc("users/alexa/private/info").delete());
    await assertFails(db.doc("users/alexa/private/settings").set({ showMe: ["woman"] }));
    await assertFails(db.doc("users/alexa/devices/phone").delete());
    await assertFails(db.doc("matches/alexa_jules").update({ "unread.alexa": 0, "lastReadAt.alexa": serverTimestamp() }));
    await assertFails(db.doc("matches/alexa_jules").update({ active: false, endedBy: "alexa", endedAt: serverTimestamp(), endReason: "unmatch" }));
    await assertFails(db.doc("matches/alexa_jules/messages/new").set({ senderId: "alexa", text: "must not send", createdAt: serverTimestamp() }));
    await assertFails(context.storage().ref("user-uploads/alexa/photos/new.jpg").put(new Uint8Array([1]), { contentType: "image/jpeg" }).then(() => undefined));
    await assertFails(context.storage().ref("user-uploads/support_session1/photos/new.jpg").put(new Uint8Array([1]), { contentType: "image/jpeg" }).then(() => undefined));
    await assertFails(db.doc("supportSessions/session1").update({ endedAt: null, expiresAt: expiresAt() }));
  });
  test("expired, ended, mismatched, missing and revoked sessions lose reads", async () => {
    const { db, expiry } = await supportAccess();
    for (const change of [{ endedAt: Date.now() }, { expiresAt: Date.now() - 1 }, { targetUid: "stranger" }, { supportUid: "other" }]) {
      await seed({ "supportSessions/session1": { actorUid: "owner", targetUid: "alexa", supportUid: "support_session1", expiresAt: expiry, endedAt: null, ...change } });
      await assertFails(db.doc("users/alexa/private/info").get());
    }
    await seed({ "supportSessions/session1": { actorUid: "owner", targetUid: "alexa", supportUid: "support_session1", expiresAt: expiry, endedAt: null }, "supportOperators/owner": { enabled: false } });
    await assertFails(db.doc("users/alexa/private/info").get());
    const missing = testEnv.authenticatedContext("support_none", { supportSession: "missing", supportTarget: "alexa", supportExpiresAt: expiry }).firestore();
    await assertFails(missing.doc("users/alexa").get());
  });
});

describe("profiles", () => {
  test("owners can create a valid adult profile", async () => {
    await assertSucceeds(dbFor("alexa").doc("users/alexa").set(validProfile("alexa")));
  });

  test("a profile needs a confirmed email", async () => {
    await assertFails(unconfirmedDbFor("alexa").doc("users/alexa").set(validProfile("alexa")));
    await seed({ "users/alexa": validProfile("alexa") });
    await assertFails(unconfirmedDbFor("alexa").doc("users/alexa").update({ bio: "Changed", updatedAt: 2 }));
    // Private settings can still be saved while the email is being confirmed.
    await assertSucceeds(unconfirmedDbFor("alexa").doc("users/alexa/private/info").set({ email: "alexa@example.com", termsAcceptedAt: 1, termsVersion: "2026-06" }));
  });

  test("under-18 ages, unknown fields and bad genders are rejected", async () => {
    const db = dbFor("alexa");
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { age: 17 })));
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { isAdmin: true })));
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { gender: "robot" })));
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { displayName: "" })));
  });

  test("Paire is for men and women; basics and languages are validated, and there is no caste field", async () => {
    const db = dbFor("alexa");
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { gender: "nonbinary" })));
    await assertSucceeds(
      db.doc("users/alexa").set(
        validProfile("alexa", {
          languages: ["hindi", "english"],
          basics: { heightCm: 165, education: "masters", work: "Architect", religion: "hindu", diet: "veg", drinking: "socially", smoking: "never" }
        })
      )
    );
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { basics: { caste: "any" } })));
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { basics: { heightCm: 400 } })));
    await assertFails(db.doc("users/alexa").set(validProfile("alexa", { languages: ["a", "b", "c", "d", "e", "f", "g"] })));
  });

  test("privacy and control settings are owner-only Booleans", async () => {
    const settings = dbFor("alexa").doc("users/alexa/private/settings");
    await assertSucceeds(
      settings.set({ requireNote: true, firstMove: true, incognito: true, privatePhotos: true, sameIntentOnly: true, sharedLanguageOnly: false })
    );
    await assertFails(settings.set({ incognito: "yes" }, { merge: true }));
    await assertFails(settings.set({ showMe: ["woman", "man", "nonbinary"] }));
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").set({ incognito: true }));
  });

  test("work sectors are optional owner-declared enum values, never a verified badge", async () => {
    const mine = dbFor("alexa").doc("users/alexa");
    for (const workSector of ["corporate", "government", "banking", "healthcare", "education", "business", "creative", "legal", "hospitality", "engineering", "other", null]) await assertSucceeds(mine.set(validProfile("alexa", { workSector })));
    for (const workSector of ["verified-government", "", ["banking"], { sector: "banking", verified: true }, 1]) await assertFails(mine.set(validProfile("alexa", { workSector })));
    await assertFails(mine.set(validProfile("alexa", { workSector: "government", workVerified: true })));
    await assertFails(dbFor("outsider").doc("users/alexa").update({ workSector: "banking" }));
  });

  test("nobody can write someone else's profile", async () => {
    await assertFails(dbFor("jules").doc("users/alexa").set(validProfile("alexa")));
  });

  test("profiles are private to the owner and active matches", async () => {
    await seed({ "users/alexa": validProfile("alexa") });
    await assertSucceeds(dbFor("alexa").doc("users/alexa").get());
    await assertFails(dbFor("jules").doc("users/alexa").get());
    await assertFails(dbFor("jules").collection("users").get());

    await seed({ "matches/alexa_jules": matchDoc(true) });
    await assertSucceeds(dbFor("jules").doc("users/alexa").get());

    await seed({ "matches/alexa_jules": matchDoc(false) });
    await assertFails(dbFor("jules").doc("users/alexa").get());
  });

  test("private data is owner-only and validated", async () => {
    const alexa = dbFor("alexa");
    await assertSucceeds(
      alexa.doc("users/alexa/private/settings").set({
        showMe: ["man"],
        ageMin: 25,
        ageMax: 35,
        maxDistanceKm: 50,
        locationEnabled: true,
        location: { lat: 19.07, lng: 72.87, updatedAt: 1 },
        notifications: { matches: true, messages: true }
      })
    );
    await assertSucceeds(alexa.doc("users/alexa/private/settings").set({ openToCasual: true }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ openToCasual: "yes" }, { merge: true }));
    // Age-gap side: one of the two sides, or cleared.
    await assertSucceeds(alexa.doc("users/alexa/private/settings").set({ ageGap: "intoOlder" }, { merge: true }));
    await assertSucceeds(alexa.doc("users/alexa/private/settings").set({ ageGap: null }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ ageGap: "sugarBaby" }, { merge: true }));
    // Garba Nights: a short list of nights, or cleared.
    await assertSucceeds(alexa.doc("users/alexa/private/settings").set({ garbaNights: ["2026-10-15", "2026-10-17"] }, { merge: true }));
    await assertSucceeds(alexa.doc("users/alexa/private/settings").set({ garbaNights: null }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ garbaNights: "2026-10-15" }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ garbaNights: Array.from({ length: 5 }, () => "2026-10-15") }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ garbaNights: ["2026-10-15", { night: 1 }] }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ garbaNights: ["tomorrow"] }, { merge: true }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ showMe: ["cats"] }));
    await assertFails(alexa.doc("users/alexa/private/settings").set({ ageMin: 16 }));
    await assertSucceeds(
      alexa.doc("users/alexa/private/info").set({ email: "a@example.com", birthDate: "1998-04-02" })
    );
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").get());
    await assertFails(dbFor("jules").doc("users/alexa/private/info").get());
  });

  test("push tokens are owner-only", async () => {
    await assertSucceeds(
      dbFor("alexa").doc("users/alexa/devices/tok").set({ token: "tok", platform: "android", updatedAt: 1 })
    );
    await assertFails(
      dbFor("jules").doc("users/alexa/devices/tok").set({ token: "tok", platform: "android", updatedAt: 1 })
    );
  });
});

describe("server-only collections", () => {
  test("notification preview preferences are owner-only Boolean choices", async () => {
    const ref = dbFor("alexa").doc("users/alexa/private/settings");
    await assertSucceeds(ref.set({ notifications: { matches: true, messages: true, previews: false } }));
    await assertSucceeds(ref.update({ "notifications.previews": true }));
    await assertFails(ref.update({ "notifications.previews": "true" }));
    await assertSucceeds(ref.update({ "notifications.reminders": true }));
    await assertFails(ref.update({ "notifications.reminders": "true" }));
    await assertFails(ref.update({ "notifications.messages": "yes" }));
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").update({ "notifications.reminders": true }));
    await assertFails(dbFor("alexa").doc("notificationReminders/alexa").get());
    await assertFails(dbFor("alexa").doc("notificationReminders/alexa").set({ enabled: true }));
    await assertFails(dbFor("alexa").doc("notificationStats/2026-10-18").set({ opens: 100 }));
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").update({ "notifications.previews": true }));
  });
  test("clients cannot write swipes, matches, blocks or discovery data", async () => {
    const alexa = dbFor("alexa");
    await assertFails(alexa.doc("swipes/alexa/outgoing/jules").set({ type: "like" }));
    await assertFails(alexa.doc("matches/alexa_jules").set(matchDoc()));
    await assertFails(alexa.doc("blocks/alexa/blocked/jules").set({ targetUid: "jules" }));
    await assertFails(alexa.doc("discovery/alexa").get());
    await assertFails(alexa.doc("supportPlusGrants/alexa").get());
    await assertFails(alexa.doc("supportPlusGrants/alexa").set({ status: "active", expiresAt: 9999999999999 }));
    await assertFails(alexa.doc("complimentaryPlusGrants/alexa").get());
    await assertFails(alexa.doc("complimentaryPlusGrants/alexa").set({ status: "active", expiresAt: 9999999999999 }));
    await assertFails(alexa.doc("notificationCampaigns/run").get());
    await assertFails(alexa.doc("notificationCampaigns/run").set({ status: "running" }));
    await assertFails(alexa.doc("billingSupportAudit/receipt").get());
    await assertFails(alexa.doc("billingSupportAudit/receipt").set({ action: "payment-received", amountReportedPaise: 29900, confirmationSource: "owner_statement" }));
    await assertFails(alexa.collection("discovery").get());
    await assertFails(alexa.doc("moderation/alexa").get());
    await assertFails(alexa.doc("moderation/alexa").set({ verification: { status: "verified" } }));
    await assertFails(alexa.doc("limits/alexa/daily/20260101").set({ likes: 0 }));
    await assertFails(alexa.doc("chatFlags/f1").get());
    await assertFails(alexa.collection("chatFlags").add({ senderId: "jules", severity: "high" }));
  });

  test("owners can read their own swipes and blocks", async () => {
    await seed({ "swipes/alexa/outgoing/jules": { type: "like" } });
    await assertSucceeds(dbFor("alexa").doc("swipes/alexa/outgoing/jules").get());
    await assertFails(dbFor("jules").doc("swipes/alexa/outgoing/jules").get());
  });
});

describe("matches and messages", () => {
  const contacts = JSON.parse(fs.readFileSync(path.join(__dirname, "../../apps/muse-mobile/__tests__/fixtures/chatContact.json"), "utf8")) as { blocked: string[]; allowed: string[] };

  test("client contact patterns match the server write policy", () => {
    const policy = JSON.parse(fs.readFileSync(path.join(__dirname, "../../apps/muse-mobile/src/config/chatContactPolicy.json"), "utf8")) as Record<string, string>;
    const expression = `(?s).*(${Object.values(policy).join("|")}).*`.replace(/\\/g, "\\\\");
    expect(fs.readFileSync(path.join(__dirname, "../rules/firestore.rules"), "utf8")).toContain(`text.matches('${expression}')`);
  });

  test.each(contacts.blocked)("refuses direct SDK messages and preview leaks: %s", async text => {
    await seed({ "matches/alexa_jules": matchDoc() });
    const db = dbFor("alexa");
    const message = db.collection("matches/alexa_jules/messages").doc();
    await assertFails(message.set({ senderId: "alexa", text, createdAt: serverTimestamp() }));
    const update = { lastMessage: { text, senderId: "alexa", createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), "unread.jules": increment(1) };
    await assertFails(db.doc("matches/alexa_jules").update(update));
    const batch = db.batch();
    batch.set(message, { senderId: "alexa", text, createdAt: serverTimestamp() });
    // A shortened or forged clean preview must not let contact details through.
    batch.update(db.doc("matches/alexa_jules"), { ...update, lastMessage: { ...update.lastMessage, text: "Hello" } });
    await assertFails(batch.commit());
    expect((await db.doc("matches/alexa_jules").get()).get("lastMessage")).toBeNull();
    expect((await db.collection("matches/alexa_jules/messages").get()).empty).toBe(true);
  });

  test.each(contacts.allowed)("keeps ordinary messages working: %s", async text => {
    await seed({ "matches/alexa_jules": matchDoc() });
    await assertSucceeds(dbFor("alexa").collection("matches/alexa_jules/messages").add({ senderId: "alexa", text, createdAt: serverTimestamp() }));
  });

  test.each(contacts.blocked)("allows explicit contact sharing with a private preview: %s", async text => {
    await seed({ "matches/alexa_jules": matchDoc() });
    const db = dbFor("alexa");
    const message = db.collection("matches/alexa_jules/messages").doc();
    const batch = db.batch();
    batch.set(message, { senderId: "alexa", text, createdAt: serverTimestamp(), contactShareConfirmed: true });
    batch.update(db.doc("matches/alexa_jules"), { lastMessage: { text: "Shared contact details", senderId: "alexa", createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), "unread.jules": increment(1) });
    await assertSucceeds(batch.commit());
    expect((await message.get()).get("text")).toBe(text);
    expect((await db.doc("matches/alexa_jules").get()).get("unread.jules")).toBe(1);
    await assertFails(db.doc("matches/alexa_jules").update({ lastMessage: { text, senderId: "alexa", createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), "unread.jules": increment(1) }));
    await assertFails(db.collection("matches/alexa_jules/messages").add({ senderId: "alexa", text, createdAt: serverTimestamp() }));
    await assertFails(message.update({ contactShareConfirmed: false }));
  });

  test.each([false, "true", 1, null, {}])("requires a true boolean confirmation for contact details: %s", async contactShareConfirmed => {
    await seed({ "matches/alexa_jules": matchDoc() });
    await assertFails(dbFor("alexa").collection("matches/alexa_jules/messages").add({ senderId: "alexa", text: "IG: alex", createdAt: serverTimestamp(), contactShareConfirmed }));
  });

  test("sharing does not bypass membership, identity, first move, closed chat, verification or paid access", async () => {
    const send = (uid = "alexa", senderId = uid) => dbFor(uid).collection("matches/alexa_jules/messages").add({ senderId, text: "IG: alex", createdAt: serverTimestamp(), contactShareConfirmed: true });
    await seed({ "matches/alexa_jules": matchDoc() });
    await assertFails(send("outsider"));
    await assertFails(send("alexa", "jules"));
    await seed({ "matches/alexa_jules": { ...matchDoc(), firstMoveBy: "jules" } });
    await assertFails(send());
    await seed({ "matches/alexa_jules": matchDoc(false) });
    await assertFails(send());
    await seed({ "matches/alexa_jules": matchDoc(), "runtime/trust": { requireVerification: true } });
    await assertFails(send());
    await seed({ "runtime/trust": { requireVerification: false, enforcePaidChat: true }, "moderation/alexa": { status: "ok", emailVerified: true } });
    await assertFails(send());
    await seed({ "moderation/alexa": { status: "ok", emailVerified: true, chatAccess: { unlimited: true } } });
    await assertSucceeds(send());
    await seed({ "moderation/alexa": { status: "banned", emailVerified: true, chatAccess: { unlimited: true } } });
    await assertFails(send());
  });
  test("only participants can read a match", async () => {
    await seed({ "matches/alexa_jules": matchDoc() });
    await assertSucceeds(dbFor("alexa").doc("matches/alexa_jules").get());
    await assertFails(dbFor("outsider").doc("matches/alexa_jules").get());
  });

  test("participants can send messages only as themselves", async () => {
    await seed({ "matches/alexa_jules": matchDoc() });
    const messages = dbFor("alexa").collection("matches/alexa_jules/messages");
    await assertSucceeds(messages.add({ senderId: "alexa", text: "Hi!", createdAt: serverTimestamp() }));
    await assertFails(messages.add({ senderId: "jules", text: "Fake", createdAt: serverTimestamp() }));
    await assertFails(messages.add({ senderId: "alexa", text: "", createdAt: serverTimestamp() }));
    await assertFails(messages.add({ senderId: "alexa", text: "x".repeat(1001), createdAt: serverTimestamp() }));
    await assertFails(messages.add({ senderId: "alexa", text: "Old", createdAt: 5 }));
    await assertFails(
      dbFor("outsider")
        .collection("matches/alexa_jules/messages")
        .add({ senderId: "outsider", text: "Hey", createdAt: serverTimestamp() })
    );
  });

  test("with first move set, only that member can open the chat", async () => {
    await seed({ "matches/alexa_jules": { ...matchDoc(), firstMoveBy: "alexa" } });
    const open = (uid: string, other: string) => {
      const db = dbFor(uid);
      const batch = db.batch();
      batch.set(db.collection("matches/alexa_jules/messages").doc(), { senderId: uid, text: "Hi", createdAt: serverTimestamp() });
      batch.update(db.doc("matches/alexa_jules"), {
        lastMessage: { text: "Hi", senderId: uid, createdAt: serverTimestamp() },
        lastActivityAt: serverTimestamp(),
        [`unread.${other}`]: increment(1)
      });
      return batch.commit();
    };
    await assertFails(open("jules", "alexa"));
    await assertSucceeds(open("alexa", "jules"));
    await assertSucceeds(open("jules", "alexa"));
  });

  test("messages cannot be edited or deleted", async () => {
    await seed({
      "matches/alexa_jules": matchDoc(),
      "matches/alexa_jules/messages/m1": { senderId: "jules", text: "Hello", createdAt: 1 }
    });
    const message = dbFor("alexa").doc("matches/alexa_jules/messages/m1");
    await assertFails(message.update({ text: "Edited" }));
    await assertFails(message.delete());
    // Senders can't pre-mark their own message as safe (or anything else).
    await assertFails(
      dbFor("alexa")
        .collection("matches/alexa_jules/messages")
        .add({ senderId: "alexa", text: "Hi", createdAt: serverTimestamp(), safety: null })
    );
  });

  test("only the recipient can read a Paire AI warning, and nobody can write one", async () => {
    await seed({
      "matches/alexa_jules": matchDoc(),
      "matches/alexa_jules/safety/m1": { recipientIds: ["alexa"], category: "money", severity: "high", hidden: false }
    });
    await assertSucceeds(dbFor("alexa").doc("matches/alexa_jules/safety/m1").get());
    await assertSucceeds(
      dbFor("alexa").collection("matches/alexa_jules/safety").where("recipientIds", "array-contains", "alexa").get()
    );
    await assertFails(dbFor("jules").doc("matches/alexa_jules/safety/m1").get());
    await assertFails(dbFor("jules").collection("matches/alexa_jules/safety").get());
    await assertFails(dbFor("alexa").doc("matches/alexa_jules/safety/m1").delete());
    await assertFails(
      dbFor("jules").doc("matches/alexa_jules/safety/m2").set({ recipientIds: ["alexa"], category: "money" })
    );
  });

  test("nobody can message after an unmatch or block", async () => {
    await seed({ "matches/alexa_jules": matchDoc(false) });
    await assertFails(
      dbFor("alexa")
        .collection("matches/alexa_jules/messages")
        .add({ senderId: "alexa", text: "Hi", createdAt: serverTimestamp() })
    );
  });

  test("the send batch may bump only the other person's unread count by one", async () => {
    await seed({ "matches/alexa_jules": matchDoc() });
    const db = dbFor("alexa");
    const send = (unread: Record<string, unknown>) => {
      const batch = db.batch();
      batch.set(db.collection("matches/alexa_jules/messages").doc(), {
        senderId: "alexa",
        text: "Hi",
        createdAt: serverTimestamp()
      });
      batch.update(db.doc("matches/alexa_jules"), {
        lastMessage: { text: "Hi", senderId: "alexa", createdAt: serverTimestamp() },
        lastActivityAt: serverTimestamp(),
        ...unread
      });
      return batch.commit();
    };
    await assertSucceeds(send({ "unread.jules": increment(1) }));
    await assertFails(send({ "unread.jules": 100 }));
    await assertFails(send({ "unread.alexa": increment(1) }));
  });

  test("readers clear only their own unread count", async () => {
    await seed({ "matches/alexa_jules": { ...matchDoc(), unread: { alexa: 3, jules: 2 } } });
    const db = dbFor("alexa");
    await assertSucceeds(
      db.doc("matches/alexa_jules").update({ "unread.alexa": 0, "lastReadAt.alexa": serverTimestamp() })
    );
    await assertFails(
      db.doc("matches/alexa_jules").update({ "unread.jules": 0, "lastReadAt.jules": serverTimestamp() })
    );
  });

  test("participants can unmatch but not tamper with the match", async () => {
    await seed({ "matches/alexa_jules": matchDoc() });
    const db = dbFor("jules");
    await assertFails(db.doc("matches/alexa_jules").update({ participants: ["jules", "outsider"] }));
    await assertSucceeds(
      db.doc("matches/alexa_jules").update({
        active: false,
        endedAt: serverTimestamp(),
        endedBy: "jules",
        endReason: "unmatch"
      })
    );
    await assertFails(
      dbFor("alexa").doc("matches/alexa_jules").update({
        active: true,
        endedAt: serverTimestamp(),
        endedBy: "alexa",
        endReason: "unmatch"
      })
    );
  });
});

function duoChat() {
  return {
    id: "duo_a_b__c_d",
    kind: "duo",
    duoIds: ["a_b", "c_d"],
    sides: { a_b: ["a", "b"], c_d: ["c", "d"] },
    participants: ["a", "b", "c", "d"],
    active: true,
    createdAt: firebase.firestore.Timestamp.fromMillis(1),
    lastActivityAt: firebase.firestore.Timestamp.fromMillis(1),
    profiles: {},
    lastMessage: null,
    unread: { a: 0, b: 0, c: 0, d: 0 },
    lastReadAt: {}
  };
}

describe("duos and duo chats", () => {
  const sendAs = (uid: string, unread: Record<string, unknown>) => {
    const db = dbFor(uid);
    const batch = db.batch();
    batch.set(db.collection("matches/duo_a_b__c_d/messages").doc(), {
      senderId: uid,
      text: "Hi all!",
      createdAt: serverTimestamp()
    });
    batch.update(db.doc("matches/duo_a_b__c_d"), {
      lastMessage: { text: "Hi all!", senderId: uid, createdAt: serverTimestamp() },
      lastActivityAt: serverTimestamp(),
      ...unread
    });
    return batch.commit();
  };

  test("a message in a Duo chat bumps everyone else's unread count by exactly one", async () => {
    await seed({ "matches/duo_a_b__c_d": duoChat() });
    await assertSucceeds(
      sendAs("a", { "unread.b": increment(1), "unread.c": increment(1), "unread.d": increment(1) })
    );
    // Missing someone, bumping yourself, or bumping by more than one are all refused.
    await assertFails(sendAs("a", { "unread.b": increment(1), "unread.c": increment(1) }));
    await assertFails(
      sendAs("a", { "unread.a": increment(1), "unread.b": increment(1), "unread.c": increment(1), "unread.d": increment(1) })
    );
    await assertFails(sendAs("a", { "unread.b": increment(1), "unread.c": increment(1), "unread.d": 9 }));
    await assertFails(sendAs("outsider", { "unread.a": increment(1) }));
  });

  test("Duo chats can't be ended by one person's unmatch", async () => {
    await seed({ "matches/duo_a_b__c_d": duoChat() });
    await assertFails(
      dbFor("a").doc("matches/duo_a_b__c_d").update({
        active: false,
        endedAt: serverTimestamp(),
        endedBy: "a",
        endReason: "unmatch"
      })
    );
    // Everyone in the chat reads it; outsiders don't.
    await assertSucceeds(dbFor("c").collection("matches/duo_a_b__c_d/messages").get());
    await assertFails(dbFor("e").collection("matches/duo_a_b__c_d/messages").get());
  });

  test("members read their duo and its likes; nobody else can, and nobody writes them", async () => {
    await seed({
      "duos/a_b": { id: "a_b", members: ["a", "b"], status: "active" },
      "duoSwipes/a_b/outgoing/c_d": { type: "like", byUid: "a" },
      "duoInvites/ABC234": { fromUid: "a" }
    });
    await assertSucceeds(dbFor("b").doc("duos/a_b").get());
    await assertSucceeds(
      dbFor("a").collection("duos").where("members", "array-contains", "a").where("status", "==", "active").get()
    );
    // Ended duos (and their likes) are closed to both ex-partners.
    await seed({ "duos/a_x": { id: "a_x", members: ["a", "x"], status: "ended" }, "duoSwipes/a_x/outgoing/c_d": { type: "like" } });
    await assertFails(dbFor("a").doc("duos/a_x").get());
    await assertFails(dbFor("a").doc("duoSwipes/a_x/outgoing/c_d").get());
    await assertFails(dbFor("c").doc("duos/a_b").get());
    await assertSucceeds(dbFor("b").doc("duoSwipes/a_b/outgoing/c_d").get());
    await assertFails(dbFor("c").doc("duoSwipes/a_b/outgoing/c_d").get());
    await assertFails(dbFor("a").doc("duos/a_b").update({ status: "ended" }));
    await assertFails(dbFor("a").doc("duoSwipes/a_b/outgoing/e_f").set({ type: "like" }));
    await assertFails(dbFor("a").doc("duoInvites/ABC234").get());
    await assertFails(dbFor("c").doc("duoInvites/XYZ234").set({ fromUid: "c" }));
  });
});

describe("mandatory photo verification", () => {
  const approval = (photos: string[]) => ({ status: "ok", emailVerified: true, verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } });
  const send = (uid: string, id: string) => dbFor(uid).collection(`matches/${id}/messages`).add({ senderId: uid, text: "Hello", createdAt: serverTimestamp() });
  test("a banned member cannot continue contact even in a closed verification preview", async () => {
    await seed({ "matches/alexa_jules": matchDoc(), "moderation/jules": { status: "banned" } });
    await assertFails(send("alexa", "alexa_jules"));
    await assertSucceeds(dbFor("alexa").doc("matches/alexa_jules").get());
  });
  test("the default policy denies unverified contact, while preserving read and unmatch", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => { await context.firestore().doc("runtime/trust").delete(); });
    await seed({ "matches/alexa_jules": matchDoc() });
    await assertFails(send("alexa", "alexa_jules"));
    await assertSucceeds(dbFor("alexa").doc("matches/alexa_jules").get());
    await assertSucceeds(dbFor("alexa").doc("matches/alexa_jules").update({ active: false, endedAt: serverTimestamp(), endedBy: "alexa", endReason: "unmatch" }));
    await assertFails(dbFor("alexa").doc("runtime/trust").set({ requireVerification: false }));
  });
  test("both pair members must have current immutable approvals", async () => {
    const photos = ["https://example.com/frozen.jpg"];
    await seed({ "runtime/trust": { requireVerification: true }, "matches/alexa_jules": matchDoc(), "users/alexa": validProfile("alexa", { photoUrls: photos }), "users/jules": validProfile("jules", { photoUrls: photos }), "moderation/alexa": approval(photos) });
    await assertFails(send("alexa", "alexa_jules"));
    await seed({ "moderation/jules": approval(photos) });
    await assertSucceeds(send("alexa", "alexa_jules"));
    await assertSucceeds(dbFor("jules").doc("users/jules").update({ photoUrls: ["changed"] }));
    await assertFails(send("alexa", "alexa_jules"));
    await seed({ "users/jules": validProfile("jules", { photoUrls: photos }), "moderation/jules": { emailVerified: true, verification: { ...approval(photos).verification, expiresAt: Date.now() - 1 } } });
    await assertFails(send("alexa", "alexa_jules"));
  });
  test("shared test-cohort accounts chat without a photo check, unless banned", async () => {
    await seed({ "runtime/trust": { requireVerification: true }, "matches/alexa_jules": matchDoc(), "users/alexa": validProfile("alexa"), "users/jules": validProfile("jules"), "moderation/alexa": { cohort: "test", emailVerified: true }, "moderation/jules": { cohort: "test", emailVerified: true } });
    await assertSucceeds(send("alexa", "alexa_jules"));
    await seed({ "moderation/jules": { cohort: "test", emailVerified: false } });
    await assertFails(send("alexa", "alexa_jules"));
    await seed({ "moderation/jules": { cohort: "test", emailVerified: true, status: "banned" } });
    await assertFails(send("alexa", "alexa_jules"));
  });
  test("all four Duo members are checked within the rules access budget", async () => {
    const photos = ["https://example.com/frozen.jpg"];
    await seed({ "runtime/trust": { requireVerification: true }, "matches/duo_a_b__c_d": duoChat(), ...Object.fromEntries(["a", "b", "c", "d"].flatMap((uid) => [[`users/${uid}`, validProfile(uid, { photoUrls: photos })], [`moderation/${uid}`, approval(photos)]])) });
    const db = dbFor("a"); const batch = db.batch();
    batch.set(db.collection("matches/duo_a_b__c_d/messages").doc(), { senderId: "a", text: "Hi everyone", createdAt: serverTimestamp() });
    batch.update(db.doc("matches/duo_a_b__c_d"), { lastMessage: { text: "Hi everyone", senderId: "a", createdAt: serverTimestamp() }, lastActivityAt: serverTimestamp(), "unread.b": increment(1), "unread.c": increment(1), "unread.d": increment(1) });
    await assertSucceeds(batch.commit());
    await seed({ "runtime/trust": { requireVerification: false } });
    await assertSucceeds(send("a", "duo_a_b__c_d"));
    await seed({ "runtime/trust": { requireVerification: true } });
    await seed({ "moderation/d": { verification: { status: "unverified" } } });
    await assertFails(send("a", "duo_a_b__c_d"));
  });
  test("clients cannot forge paid access or a verification review", async () => {
    for (const path of ["billing/alexa", "billingTransactions/receipt", "verificationSessions/session", "verificationLocks/alexa", "verificationAudit/event", "callRooms/alexa_jules"]) {
      await assertFails(dbFor("alexa").doc(path).set({ active: true, approved: true }));
      await assertFails(dbFor("alexa").doc(path).get());
    }
    await assertSucceeds(dbFor("alexa").doc("users/alexa/private/settings").set({ aiVibeMatching: true }));
    await assertFails(dbFor("alexa").doc("users/alexa/private/settings").set({ aiVibeMatching: "true" }));
  });
});

describe("paid chat: Paire Plus or Unlimited Chat to send", () => {
  const HOUR = 60 * 60 * 1000;
  // The paid-chat switches live in runtime/trust (one document read for the rules).
  const enforced = (extra: Record<string, unknown> = {}) => ({ "runtime/trust": { requireVerification: false, enforcePaidChat: true, ...extra } });
  const member = (chatAccess?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ status: "ok", emailVerified: true, ...(chatAccess ? { chatAccess } : {}), ...extra });
  const unlimited = { unlimited: true, premiumUntil: 0 };
  const plus = (until: number) => ({ unlimited: false, premiumUntil: until });
  /** The app's send: message, preview and the other person's unread count in one batch. */
  const sendBatch = (uid: string, matchId: string, others: string[]) => {
    const db = dbFor(uid);
    const batch = db.batch();
    batch.set(db.collection(`matches/${matchId}/messages`).doc(), { senderId: uid, text: "Hi", createdAt: serverTimestamp() });
    batch.update(db.doc(`matches/${matchId}`), {
      lastMessage: { text: "Hi", senderId: uid, createdAt: serverTimestamp() },
      lastActivityAt: serverTimestamp(),
      ...Object.fromEntries(others.map((other) => [`unread.${other}`, increment(1)]))
    });
    return batch.commit();
  };
  const messageOnly = (uid: string, matchId = "alexa_jules") =>
    dbFor(uid).collection(`matches/${matchId}/messages`).add({ senderId: uid, text: "Hi", createdAt: serverTimestamp() });
  const previewOnly = (uid: string, other: string) =>
    dbFor(uid).doc("matches/alexa_jules").update({
      lastMessage: { text: "Hi", senderId: uid, createdAt: serverTimestamp() },
      lastActivityAt: serverTimestamp(),
      [`unread.${other}`]: increment(1)
    });

  test("without a policy (or with it off) sending stays free, as before", async () => {
    await seed({ "matches/alexa_jules": matchDoc(), "moderation/alexa": member() });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    await seed({ "runtime/trust": { requireVerification: false, enforcePaidChat: false } });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    // An announced date still in the future: free until then.
    await seed(enforced({ enforceFrom: Date.now() + HOUR }));
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
  });

  test("with no policy document at all, verified members still send free (the gate never fails closed on a missing policy)", async () => {
    const photos = ["https://example.com/frozen.jpg"];
    const approval = { status: "ok", emailVerified: true, verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } };
    await testEnv.withSecurityRulesDisabled(async (context) => { await context.firestore().doc("runtime/trust").delete(); });
    await seed({ "matches/alexa_jules": matchDoc(), "users/alexa": validProfile("alexa", { photoUrls: photos }), "users/jules": validProfile("jules", { photoUrls: photos }), "moderation/alexa": approval, "moderation/jules": approval });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
  });

  test("unpaid members can't send through the batch, a lone message or a lone preview", async () => {
    await seed({ ...enforced(), "matches/alexa_jules": matchDoc(), "moderation/alexa": member(), "moderation/jules": member() });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    await assertFails(messageOnly("alexa"));
    await assertFails(previewOnly("alexa", "jules"));
    // No moderation record at all is no access either.
    await testEnv.withSecurityRulesDisabled(async (context) => { await context.firestore().doc("moderation/alexa").delete(); });
    await assertFails(messageOnly("alexa"));
  });

  test("a running Plus pass sends; an expired one doesn't, unless Unlimited Chat is owned", async () => {
    await seed({ ...enforced(), "matches/alexa_jules": matchDoc(), "moderation/jules": member(), "moderation/alexa": member(plus(Date.now() + HOUR)) });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    await seed({ "moderation/alexa": member(plus(Date.now() - 1000)) });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    await seed({ "moderation/alexa": member({ unlimited: true, premiumUntil: Date.now() - 1000 }) });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
  });

  test("Unlimited Chat works in every match, current and future", async () => {
    await seed({
      ...enforced(),
      "moderation/alexa": member(unlimited),
      "matches/alexa_jules": matchDoc(),
      "matches/alexa_kai": { ...matchDoc(), id: "alexa_kai", participants: ["alexa", "kai"], unread: { alexa: 0, kai: 0 }, createdAt: firebase.firestore.Timestamp.now() }
    });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    await assertSucceeds(sendBatch("alexa", "alexa_kai", ["kai"]));
  });

  test("a paying sender reaches an unpaid recipient, who can read but not reply until they get access", async () => {
    await seed({ ...enforced(), "matches/alexa_jules": matchDoc(), "moderation/alexa": member(unlimited), "moderation/jules": member() });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    const jules = dbFor("jules");
    await assertSucceeds(jules.doc("matches/alexa_jules").get());
    await assertSucceeds(jules.collection("matches/alexa_jules/messages").get());
    await assertSucceeds(jules.doc("matches/alexa_jules").update({ "unread.jules": 0, "lastReadAt.jules": serverTimestamp() }));
    await assertFails(sendBatch("jules", "alexa_jules", ["alexa"]));
    await seed({ "moderation/jules": member(plus(Date.now() + HOUR)) });
    await assertSucceeds(sendBatch("jules", "alexa_jules", ["alexa"]));
  });

  test("safety stays free: unpaid members can still unmatch", async () => {
    await seed({ ...enforced(), "matches/alexa_jules": matchDoc(), "moderation/jules": member() });
    await assertSucceeds(dbFor("jules").doc("matches/alexa_jules").update({ active: false, endedAt: serverTimestamp(), endedBy: "jules", endReason: "unmatch" }));
  });

  test("paying never bypasses matching, blocks, bans, verification or first-message controls", async () => {
    await seed({ ...enforced(), "moderation/alexa": member(unlimited), "moderation/jules": member() });
    // Ended (unmatched or blocked) matches.
    await seed({ "matches/alexa_jules": matchDoc(false) });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    // Not a participant.
    await seed({ "matches/jules_kai": { ...matchDoc(), id: "jules_kai", participants: ["jules", "kai"], unread: { jules: 0, kai: 0 } } });
    await assertFails(messageOnly("alexa", "jules_kai"));
    // "I'll message first" by the other person.
    await seed({ "matches/alexa_jules": { ...matchDoc(), firstMoveBy: "jules" } });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    // Banned sender, or banned recipient.
    await seed({ "matches/alexa_jules": matchDoc(), "moderation/alexa": member(unlimited, { status: "banned" }) });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    await seed({ "moderation/alexa": member(unlimited), "moderation/jules": member(undefined, { status: "banned" }) });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
    // Mandatory photo verification: a paying, unverified sender is still refused.
    await seed({ ...enforced({ requireVerification: true }), "moderation/jules": member(), "users/alexa": validProfile("alexa"), "users/jules": validProfile("jules") });
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
  });

  test("chats from before the gate may keep a grace period; newer chats don't", async () => {
    const start = Date.now() - HOUR;
    await seed({
      ...enforced({ enforceFrom: start, legacyGraceUntil: Date.now() + HOUR }),
      "moderation/alexa": member(),
      "matches/alexa_jules": { ...matchDoc(), createdAt: firebase.firestore.Timestamp.fromMillis(start - HOUR) },
      "matches/alexa_kai": { ...matchDoc(), id: "alexa_kai", participants: ["alexa", "kai"], unread: { alexa: 0, kai: 0 }, createdAt: firebase.firestore.Timestamp.fromMillis(start + 1000) }
    });
    await assertSucceeds(sendBatch("alexa", "alexa_jules", ["jules"]));
    await assertFails(sendBatch("alexa", "alexa_kai", ["kai"]));
    await seed(enforced({ enforceFrom: start, legacyGraceUntil: Date.now() - 1000 }));
    await assertFails(sendBatch("alexa", "alexa_jules", ["jules"]));
  });

  test("a four-person Duo chat checks only the sender's access, within the rules access budget", async () => {
    const photos = ["https://example.com/frozen.jpg"];
    const approved = (chatAccess?: Record<string, unknown>) => ({ status: "ok", emailVerified: true, ...(chatAccess ? { chatAccess } : {}), verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } });
    await seed({
      ...enforced({ requireVerification: true }),
      "matches/duo_a_b__c_d": duoChat(),
      ...Object.fromEntries(["a", "b", "c", "d"].flatMap((uid) => [[`users/${uid}`, validProfile(uid, { photoUrls: photos })], [`moderation/${uid}`, approved(uid === "a" ? unlimited : undefined)]]))
    });
    await assertSucceeds(sendBatch("a", "duo_a_b__c_d", ["b", "c", "d"]));
    await assertFails(sendBatch("b", "duo_a_b__c_d", ["a", "c", "d"]));
    await seed(enforced());
    await assertSucceeds(sendBatch("a", "duo_a_b__c_d", ["b", "c", "d"]));
    await assertFails(sendBatch("c", "duo_a_b__c_d", ["a", "b", "d"]));
  });

  test("the costliest Duo path (preview mode, last member's approval expired) stays within budget, gate off or on", async () => {
    const photos = ["https://example.com/frozen.jpg"];
    const approved = (chatAccess?: Record<string, unknown>, expiresAt = Date.now() + 60000) => ({ status: "ok", emailVerified: true, ...(chatAccess ? { chatAccess } : {}), verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt } });
    const members = Object.fromEntries(["a", "b", "c", "d"].flatMap((uid) => [[`users/${uid}`, validProfile(uid, { photoUrls: photos })], [`moderation/${uid}`, approved(uid === "a" ? unlimited : undefined, uid === "d" ? Date.now() - 1 : Date.now() + 60000)]]));
    // Every flag off (production today): match + 4 moderation + 4 profiles + runtime/trust.
    await seed({ "runtime/trust": { requireVerification: false }, "matches/duo_a_b__c_d": duoChat(), ...members });
    await assertSucceeds(sendBatch("b", "duo_a_b__c_d", ["a", "c", "d"]));
    await assertSucceeds(sendBatch("a", "duo_a_b__c_d", ["b", "c", "d"]));
    // Gate on: the paid sender still sends, the unpaid one doesn't.
    await seed(enforced());
    await assertSucceeds(sendBatch("a", "duo_a_b__c_d", ["b", "c", "d"]));
    await assertFails(sendBatch("b", "duo_a_b__c_d", ["a", "c", "d"]));
  });

  test("clients can't grant themselves access, change the policy or touch payment records", async () => {
    await seed({ "moderation/alexa": member() });
    const db = dbFor("alexa");
    await assertFails(db.doc("moderation/alexa").set({ chatAccess: unlimited }, { merge: true }));
    await assertFails(db.doc("moderation/alexa").update({ "chatAccess.unlimited": true }));
    for (const path of ["runtime/trust", "chatUnlocks/alexa", "chatUnlockOrders/order_FAKE1234", "chatUnlockCheckout/alexa"]) {
      await assertFails(db.doc(path).set({ enforcePaidChat: false, status: "active", uid: "alexa" }));
      await assertFails(db.doc(path).get());
    }
  });
});

describe("presence privacy", () => {
  test("presence is server-only: members can't read anyone's sessions, or write their own directly", async () => {
    await seed({ "matches/alexa_jules": matchDoc(), "presence/jules": { sessions: {}, lastActiveAt: 1 } });
    await assertFails(dbFor("alexa").doc("presence/jules").get());
    await assertFails(dbFor("jules").doc("presence/jules").get());
    await assertFails(dbFor("jules").doc("presence/jules").set({ lastActiveAt: Date.now() }));
    await assertFails(dbFor("alexa").doc("runtime/presence").set({ enabled: true }));
  });

  test("hiding activity is an owner-only Boolean setting", async () => {
    await assertSucceeds(dbFor("alexa").doc("users/alexa/private/settings").set({ showPresence: false }));
    await assertFails(dbFor("alexa").doc("users/alexa/private/settings").set({ showPresence: "no" }));
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").set({ showPresence: true }));
  });
});

describe("reports", () => {
  const report = (overrides: Record<string, unknown> = {}) => ({
    reporterId: "alexa",
    targetId: "jules",
    reason: "harassment",
    details: "Rude messages",
    createdAt: serverTimestamp(),
    ...overrides
  });

  test("reports and review audits are accessible only through authenticated server workflows", async () => {
    const reports = dbFor("alexa").collection("reports");
    await assertFails(reports.add(report()));
    await assertFails(reports.add(report({ reporterId: "jules", targetId: "alexa" })));
    await assertFails(reports.add(report({ reason: "dislike" })));
    await assertFails(reports.add(report({ targetId: "alexa" })));
    await assertFails(reports.get());
    await seed({ "reports/r1": report(), "reportReviews/a1": { reviewer: "alexa", note: "private" } });
    await assertFails(dbFor("alexa").doc("reports/r1").get());
    await assertFails(dbFor("alexa").doc("reports/r1").update({ status: "closed" }));
    await assertFails(dbFor("jules").doc("reports/r1").get());
    await assertFails(dbFor("alexa").doc("reportReviews/a1").get());
    await assertFails(dbFor("alexa").doc("reportReviews/a1").delete());
  });
});

describe("storage", () => {
  const upload = (asUid: string, ownerUid: string, file: string, bytes: Uint8Array, contentType: string) =>
    testEnv
      .authenticatedContext(asUid)
      .storage()
      .ref(`user-uploads/${ownerUid}/photos/${file}`)
      .put(bytes, { contentType })
      .then(() => undefined);

  test("verified snapshots cannot be created, replaced or deleted by members", async () => {
    const ref = testEnv.authenticatedContext("alexa").storage().ref("verified-photos/alexa/check/0");
    await assertFails(ref.put(new Uint8Array([1]), { contentType: "image/jpeg" }).then(() => undefined));
    await testEnv.withSecurityRulesDisabled(async (context) => { await context.storage().ref("verified-photos/alexa/check/0").put(new Uint8Array([1]), { contentType: "image/jpeg" }); });
    await assertFails(ref.put(new Uint8Array([2]), { contentType: "image/jpeg" }).then(() => undefined));
    await assertFails(ref.delete());
  });

  test("owners can upload images under 10 MB", async () => {
    await assertSucceeds(upload("alexa", "alexa", "p.jpg", new Uint8Array([1, 2, 3]), "image/jpeg"));
  });

  test("only the owner can list their photo folder; members can still fetch a photo they were given", async () => {
    await assertSucceeds(upload("alexa", "alexa", "p.jpg", new Uint8Array([1, 2, 3]), "image/jpeg"));
    const folder = (uid: string) => testEnv.authenticatedContext(uid).storage().ref("user-uploads/alexa/photos");
    await assertSucceeds(folder("alexa").listAll().then(() => undefined));
    await assertFails(folder("jules").listAll().then(() => undefined));
    await assertSucceeds(testEnv.authenticatedContext("jules").storage().ref("user-uploads/alexa/photos/p.jpg").getMetadata().then(() => undefined));
    await assertFails(testEnv.authenticatedContext("jules").storage().ref("verified-photos/alexa").listAll().then(() => undefined));
  });

  test("other users, non-images and oversized files are rejected", async () => {
    await assertFails(upload("jules", "alexa", "x.jpg", new Uint8Array([1]), "image/jpeg"));
    await assertFails(upload("alexa", "alexa", "x.exe", new Uint8Array([1]), "application/octet-stream"));
    await assertFails(
      upload("alexa", "alexa", "big.jpg", new Uint8Array(10 * 1024 * 1024 + 1), "image/jpeg")
    );
  });
});
