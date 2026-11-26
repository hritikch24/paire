// Run against the isolated demo-muse UI emulators, Metro and the web QA proxy.
const { chromium } = require(
  process.env.MUSE_PLAYWRIGHT_MODULE || "playwright",
);
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const { readFile } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
if (process.env.MUSE_WEB_QA !== "demo-muse")
  throw Error("Requires isolated demo-muse emulators.");
Object.assign(process.env, {
  GCLOUD_PROJECT: "demo-muse",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
});
const backend = createRequire(
  resolve(__dirname, "../firebase/functions/package.json"),
);
backend("firebase-admin/app").initializeApp({ projectId: "demo-muse" });
const db = backend("firebase-admin/firestore").getFirestore(),
  auth = backend("firebase-admin/auth").getAuth();
(async () => {
  const room = db.collection("eventRooms").doc(),
    viewer = randomUUID(),
    other = randomUUID(),
    now = Date.now(),
    password = "LocalFixtureOnly123!";
  const title = "QA fixture · Shared occasion";
  await room.set({
    title,
    status: "published",
    category: "Social",
    city: "Pune",
    venue: "Fictional venue",
    timezone: "Asia/Kolkata",
    start: now - 3600000,
    end: now,
    closesAt: now + 604800000,
  });
  await db
    .doc("runtime/trust")
    .set({ requireVerification: false }, { merge: true });
  for (const uid of [viewer, other]) {
    const isViewer = uid === viewer,
      email = uid + "@example.com";
    await auth.createUser({ uid, email, password, emailVerified: true });
    await db.doc("users/" + uid).set({
      uid,
      displayName: isViewer ? "QA viewer" : "QA participant",
      gender: isViewer ? "man" : "woman",
      age: 28,
      city: "Pune",
      photoUrls: [],
      bio: "Fictional QA profile",
      interests: [],
      intentions: [],
      vibes: [],
      quickAnswers: [],
      isDiscoverable: true,
      onboardingComplete: true,
      safetyConfirmed: true,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });
    await db.doc("users/" + uid + "/private/settings").set({
      showMe: [isViewer ? "woman" : "man"],
      ageMin: 20,
      ageMax: 40,
      locationEnabled: false,
      notifications: { matches: false, messages: false, reminders: false },
    });
    await db
      .doc("moderation/" + uid)
      .set({ emailVerified: true, status: "ok" });
  }
  await room
    .collection("eventParticipants")
    .doc(other)
    .set({ uid: other, gender: "woman" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    page.setDefaultTimeout(90000);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
        return route.abort();
      if (url.pathname.startsWith("/events/api/")) {
        const name = url.pathname.split("/")[3];
        assert(["getEventRoom", "previewEventDeck"].includes(name));
        const upstream = await route.fetch({
          url: "http://127.0.0.1:5001/demo-muse/us-central1/" + name,
        });
        return route.fulfill({ response: upstream });
      }
      if (url.pathname.startsWith("/events/")) {
        const name = url.pathname.split("/").pop() || "index.html";
        assert(["index.html", "room.css", "room.js"].includes(name));
        return route.fulfill({
          contentType: {
            "index.html": "text/html",
            "room.js": "text/javascript",
            "room.css": "text/css",
          }[name],
          body: await readFile(
            resolve(__dirname, "../apps/web/site/events", name),
          ),
        });
      }
      return route.continue();
    });
    await page.goto(
      "http://localhost:8082/events/?id=" + room.id + "&utm_campaign=browserqa",
    );
    await page.locator("#adult").check();
    await page.locator("#load").click();
    await page.getByText(/1 of 1 in this preview/).waitFor();
    await page.locator("#join").click();
    await page.getByTestId("welcome-sign-in").click();
    await page.getByTestId("signin-email").fill(viewer + "@example.com");
    await page.getByTestId("signin-password").fill(password);
    await page.getByTestId("signin-submit").click();
    await page.getByText(title, { exact: true }).first().waitFor();
    assert(
      !(await room.collection("eventParticipants").doc(viewer).get()).exists,
    );
    const swipe = db.doc("swipes/" + viewer + "/outgoing/" + other);
    assert(!(await swipe.get()).exists);
    await page.getByText("Join this room", { exact: true }).click();
    await page.getByText(/QA participant, 28/).waitFor();
    assert(!(await swipe.get()).exists);
    await page.getByRole("button", { name: "Pass", exact: true }).click();
    await page.getByText("Rewind previous pass · free").click();
    await page.getByText(/QA participant, 28/).waitFor();
    assert.equal((await swipe.get()).get("type"), "rewound");
    await page.screenshot({
      path: resolve(__dirname, "../docs/evidence/event-rooms/member-390.png"),
      fullPage: true,
    });
    await page.getByText("View messaging access", { exact: true }).click();
    await page.getByTestId("premium-plan-month").waitFor();
    await page.goto("http://localhost:8082/app/?kraftai=cancelled&kind=plus");
    await page.getByText(title, { exact: true }).first().waitFor();
    await page.getByText(/QA participant, 28/).waitFor();
    assert.equal((await swipe.get()).get("type"), "rewound");

    await page.getByText("Send like", { exact: true }).click();
    await page.getByText("Like sent.", { exact: true }).waitFor();
    assert.equal((await swipe.get()).get("type"), "like");
    console.log(
      "Passed guest preview → real emulator sign-in → original room → opt-in → pass → rewind → cancelled checkout return → same eligible card → deliberate like.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
