import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import fs from "fs";
import path from "path";

const rules = fs.readFileSync(path.join(__dirname, "../rules/firestore.rules"), "utf8");

const projectId = "demo-muse";

let testEnv: Awaited<ReturnType<typeof initializeTestEnvironment>>;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules,
      host: "127.0.0.1",
      port: 8080
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

test("user cannot read another user's private fields", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await admin.doc("users/alexa/private/info").set({ email: "alexa@example.com" });
  });

  const alexa = testEnv.authenticatedContext("alexa");
  const jules = testEnv.authenticatedContext("jules");

  await assertSucceeds(alexa.firestore().doc("users/alexa/private/info").get());
  await assertFails(jules.firestore().doc("users/alexa/private/info").get());
});

test("messages are readable and writable only by match participants", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await admin.doc("matches/alexa_jules").set({
      id: "alexa_jules",
      participants: ["alexa", "jules"],
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  const alexa = testEnv.authenticatedContext("alexa");
  const jules = testEnv.authenticatedContext("jules");
  const outsider = testEnv.authenticatedContext("outsider");

  await assertSucceeds(
    alexa.firestore().collection("matches/alexa_jules/messages").add({
      matchId: "alexa_jules",
      senderId: "alexa",
      text: "Hello",
      createdAt: Date.now(),
      readBy: ["alexa"]
    })
  );

  await assertSucceeds(
    jules.firestore().collection("matches/alexa_jules/messages").add({
      matchId: "alexa_jules",
      senderId: "jules",
      text: "Hi",
      createdAt: Date.now(),
      readBy: ["jules"]
    })
  );

  await assertFails(
    outsider.firestore().collection("matches/alexa_jules/messages").add({
      matchId: "alexa_jules",
      senderId: "outsider",
      text: "Nope",
      createdAt: Date.now(),
      readBy: ["outsider"]
    })
  );
});

test("matches can be created only after mutual positive swipes", async () => {
  const alexa = testEnv.authenticatedContext("alexa");
  const jules = testEnv.authenticatedContext("jules");
  const alexaDb = alexa.firestore();
  const julesDb = jules.firestore();

  await assertSucceeds(
    alexaDb.doc("swipes/alexa/outgoing/jules").set({
      fromUid: "alexa",
      toUid: "jules",
      type: "like",
      createdAt: Date.now()
    })
  );

  await assertFails(
    alexaDb.doc("matches/alexa_jules").set({
      id: "alexa_jules",
      participants: ["alexa", "jules"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unreadCounts: { alexa: 0, jules: 0 }
    })
  );

  await assertSucceeds(
    julesDb.doc("swipes/jules/outgoing/alexa").set({
      fromUid: "jules",
      toUid: "alexa",
      type: "super",
      createdAt: Date.now()
    })
  );

  await assertSucceeds(
    alexaDb.doc("matches/alexa_jules").set({
      id: "alexa_jules",
      participants: ["alexa", "jules"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      unreadCounts: { alexa: 0, jules: 0 }
    })
  );
});
