// Run against the isolated demo-muse UI emulators, Metro and the web QA proxy.
const { chromium } = require(
  process.env.MUSE_PLAYWRIGHT_MODULE || "playwright",
);
const { createRequire } = require("node:module");
const { resolve } = require("node:path");

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
    next = randomUUID(),
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
  for (const uid of [viewer, other, next]) {
    const isViewer = uid === viewer,
      email = uid + "@example.com";
    await auth.createUser({ uid, email, password, emailVerified: true });
    await db.doc("users/" + uid).set({
      uid,
      displayName: isViewer ? "QA viewer" : uid === other ? "Mira" : "Tara",
      gender: isViewer ? "man" : "woman",
      age: 28,
      city: "Pune",
      photoUrls: [],
      bio: "Fictional QA profile",
      interests: [],
      intentions: [],
      vibes: ["coffee"],
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

  await db.doc("vibeIntroMembers/" + other).set({
    bucket: "vibes",
    until: now + 86400000,
    expireAt: new Date(now + 86400000),
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    page.setDefaultTimeout(60000);
    await page.route("**/*", (route) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(route.request().url()).hostname,
      )
        ? route.continue()
        : route.abort(),
    );
    const shot = (name) =>
      page.screenshot({
        path: resolve(__dirname, "../docs/evidence/discovery/" + name + ".png"),
      });
    await page.goto("http://localhost:8082/app/");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const tab of ["vibes", "metro", "events", "wedding"])
        await page.getByTestId("route-" + tab).waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("welcome-390");
    await page.getByTestId("route-metro").click();
    await page.getByTestId("welcome-sign-in").click();
    await page.getByTestId("signin-email").fill(viewer + "@example.com");
    await page.getByTestId("signin-password").fill(password);
    await page.getByTestId("signin-submit").click();
    await page.getByText("Meet through your city.", { exact: true }).waitFor();
    await page.getByTestId("explore-profile").first().waitFor();
    await page.getByRole("button", { name: "More cities" }).click();
    await page.getByRole("button", { name: "Join Nagpur circle" }).waitFor();
    await page
      .getByRole("button", { name: "Join Pune circle", exact: true })
      .click();
    await page.getByText(/No eligible circle profile yet/).waitFor();
    await page.getByTestId("explore-profile").first().waitFor();
    await shot("metro-profiles-390");
    await page.getByTestId("explore-profile").first().click();
    await page.getByRole("button", { name: "Pass", exact: true }).waitFor();
    await page.goto("http://localhost:8082/app/?explore=metro");
    await page.getByTestId("explore-profile").first().waitFor();
    await page.getByText("Leave Metro circle", { exact: true }).waitFor();
    assert.equal(
      (await db.doc("metroCircleMembers/" + viewer).get()).get("city"),
      "Pune",
    );
    await page.getByText("Leave Metro circle", { exact: true }).click();
    await page.goto("http://localhost:8082/app/");
    await page.getByTestId("route-events").waitFor();
    await page.getByTestId("discover-like").waitFor();
    await shot("discover-390");
    await page.getByTestId("route-events").click();
    await page.getByText(title, { exact: true }).first().click();
    await page.getByText("Join this room", { exact: true }).waitFor();
    await room.update({ status: "closed" });
    await page.goto("http://localhost:8082/app/?explore=events");
    await page.getByText("No open event rooms yet").waitFor();
    await page.getByTestId("explore-profile").first().waitFor();
    await page.goto("http://localhost:8082/app/?explore=vibes");
    await page.getByText("Turn on vibe matches", { exact: true }).click();
    await page.getByText("I'd like to connect", { exact: true }).waitFor();
    await shot("vibe-390");
    assert(
      !(await db.doc("swipes/" + viewer + "/outgoing/" + other).get()).exists,
    );
    await page.getByText("I'd like to connect", { exact: true }).click();
    await page.getByText(/You chose to connect/).waitFor();
    await db.doc("vibeIntroMembers/" + next).set({
      bucket: "vibes",
      until: now + 86400000,
      expireAt: new Date(now + 86400000),
    });
    await page.getByText("Pass on this introduction", { exact: true }).click();
    await page.getByText("I'd like to connect", { exact: true }).waitFor();
    const slot = await db.doc("vibeIntroMembers/" + viewer).get();
    assert.equal(slot.get("peer"), next);
    assert(
      !(await db.doc("swipes/" + viewer + "/outgoing/" + next).get()).exists,
    );
    console.log(
      "Welcome shortcuts at 320/390/768/1440; Metro sign-in return, explicit join/leave, Discover → published room, automatic shared-vibe introduction and deliberate decision passed.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
