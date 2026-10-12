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

const dbFor = (uid: string) => testEnv.authenticatedContext(uid).firestore();

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

describe("profiles", () => {
  test("owners can create a valid adult profile", async () => {
    await assertSucceeds(dbFor("alexa").doc("users/alexa").set(validProfile("alexa")));
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
    await assertFails(dbFor("jules").doc("users/alexa/private/settings").update({ "notifications.previews": true }));
  });
  test("clients cannot write swipes, matches, blocks or discovery data", async () => {
    const alexa = dbFor("alexa");
    await assertFails(alexa.doc("swipes/alexa/outgoing/jules").set({ type: "like" }));
    await assertFails(alexa.doc("matches/alexa_jules").set(matchDoc()));
    await assertFails(alexa.doc("blocks/alexa/blocked/jules").set({ targetUid: "jules" }));
    await assertFails(alexa.doc("discovery/alexa").get());
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
  const approval = (photos: string[]) => ({ status: "ok", verification: { schemaVersion: 2, storageBound: true, status: "verified", photoUrls: photos, verifiedAt: Date.now() - 1000, expiresAt: Date.now() + 60000 } });
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
    await seed({ "users/jules": validProfile("jules", { photoUrls: photos }), "moderation/jules": { verification: { ...approval(photos).verification, expiresAt: Date.now() - 1 } } });
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
