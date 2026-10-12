/**
 * Seeds the Firebase emulators with demo members for local development and E2E.
 * Never run this against production.
 *
 *   firebase emulators:start --project demo-muse
 *   npm --prefix firebase/functions run build && npm --prefix firebase/functions run seed:emulator
 *
 * Every seeded account uses the password Password123!
 */
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { buildDiscoveryEntry } = require("../lib/lib/discovery");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("Refusing to seed: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must point at the emulators.");
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT || "demo-muse";
initializeApp({ projectId });
const db = getFirestore();
const auth = getAuth();

const PASSWORD = "Password123!";
const NCR_LOCATION = { lat: 28.6139, lng: 77.209 };
const now = Date.now();
const photo = (seed) => `https://picsum.photos/seed/muse-${seed}/800/1000`;

const members = [
  { uid: "muse_alexa", name: "Alexa", age: 28, gender: "woman", showMe: ["man"], city: "South Delhi",
    bio: "Ceramic artist. Sunset walks and jazz vinyl.", interests: ["canvas", "soundscape", "craft"], vibes: ["artsy", "cozy"],
    basics: { heightCm: 163, education: "masters", work: "Ceramic artist", diet: "veg", drinking: "socially", smoking: "never" } },
  { uid: "muse_jules", name: "Jules", age: 30, gender: "man", showMe: ["woman"], city: "Gurugram",
    bio: "Creative director who loves gallery nights.", interests: ["frame", "design", "lens"], vibes: ["artsy", "night-owl"],
    languages: ["hindi", "english", "punjabi"], basics: { heightCm: 180, education: "bachelors", work: "Creative director", diet: "non-veg", drinking: "socially", smoking: "never" } },
  { uid: "muse_casey", name: "Casey", age: 27, gender: "woman", showMe: ["woman", "man"], city: "Noida",
    bio: "Film photographer. Coffee, climbing and community art nights.", interests: ["lens", "frame", "movement"], vibes: ["adventurous", "curious"] },
  { uid: "muse_dev", name: "Dev", age: 29, gender: "man", showMe: ["woman"], city: "New Delhi",
    bio: "UX designer by day, DJ by night.", interests: ["design", "soundscape", "taste"], vibes: ["night-owl", "foodie"] },
  { uid: "muse_kai", name: "Kai", age: 31, gender: "man", showMe: ["woman", "man"], city: "Faridabad",
    bio: "Architect and nature nerd. Weekend hikes and sketchbooks.", interests: ["design", "nature", "words"], vibes: ["outdoorsy", "curious"] }
];

// Signs in but has no profile yet: used by the onboarding E2E flow.
const onboardingMember = { uid: "muse_onboard", email: "muse+onboard@example.com" };

async function ensureAuthUser(uid, email) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (existing.uid === uid) return;
    await auth.deleteUser(existing.uid);
  } catch {
    // Not found: create below.
  }
  await auth.createUser({ uid, email, password: PASSWORD });
}

async function seedMember(member) {
  const email = `muse+${member.uid.replace("muse_", "")}@example.com`;
  await ensureAuthUser(member.uid, email);
  const profile = {
    uid: member.uid,
    displayName: member.name,
    age: member.age,
    gender: member.gender,
    pronouns: "",
    city: member.city,
    bio: member.bio,
    photoUrls: [photo(`${member.uid}-1`), photo(`${member.uid}-2`)],
    interests: member.interests,
    intentions: ["long-term"],
    vibes: member.vibes,
    quickAnswers: [{ questionId: "first-date", answer: "Coffee + walk" }],
    languages: member.languages ?? ["hindi", "english"],
    basics: member.basics ?? {},
    isDiscoverable: true,
    onboardingComplete: true,
    safetyConfirmed: true,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now
  };
  const settings = {
    showMe: member.showMe,
    ageMin: 18,
    ageMax: 60,
    maxDistanceKm: 100,
    locationEnabled: true,
    location: { ...NCR_LOCATION, updatedAt: now },
    sharedVibesOnly: false,
    notifications: { matches: true, messages: true },
    updatedAt: now
  };
  await db.doc(`users/${member.uid}`).set(profile);
  await db.doc(`users/${member.uid}/private/settings`).set(settings);
  await db.doc(`users/${member.uid}/private/info`).set({ email, birthDate: `${new Date().getFullYear() - member.age}-01-15` });
  // Written directly so feeds work even without the functions emulator running.
  await db.doc(`discovery/${member.uid}`).set(buildDiscoveryEntry(member.uid, profile, settings, undefined));
}

async function resetMember(uid) {
  const matches = await db.collection("matches").where("participants", "array-contains", uid).get();
  for (const match of matches.docs) await db.recursiveDelete(match.ref);
  await db.recursiveDelete(db.doc(`swipes/${uid}`));
  await db.recursiveDelete(db.doc(`limits/${uid}`));
  await db.recursiveDelete(db.doc(`superLikes/${uid}`));
  await db.recursiveDelete(db.doc(`blocks/${uid}`));
}

async function seed() {
  await db.doc("runtime/trust").set({ requireVerification: false, purpose: "emulator-only UI fixtures" });
  await ensureAuthUser(onboardingMember.uid, onboardingMember.email);
  await db.recursiveDelete(db.doc(`users/${onboardingMember.uid}`));
  await db.doc(`discovery/${onboardingMember.uid}`).delete();

  for (const member of members) {
    await resetMember(member.uid);
    await seedMember(member);
  }

  // Alexa and Jules already liked each other: a ready-made match with one message.
  const [alexa, jules] = members;
  const matchId = [alexa.uid, jules.uid].sort().join("_");
  await db.recursiveDelete(db.doc(`matches/${matchId}`));
  for (const [from, to] of [[alexa, jules], [jules, alexa]]) {
    await db.doc(`swipes/${from.uid}/outgoing/${to.uid}`).set({
      fromUid: from.uid,
      toUid: to.uid,
      type: "like",
      createdAt: FieldValue.serverTimestamp()
    });
  }
  const participants = [alexa.uid, jules.uid].sort();
  await db.doc(`matches/${matchId}`).set({
    id: matchId,
    participants,
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    lastActivityAt: FieldValue.serverTimestamp(),
    profiles: {
      [alexa.uid]: { displayName: alexa.name, photoUrl: photo(`${alexa.uid}-1`) },
      [jules.uid]: { displayName: jules.name, photoUrl: photo(`${jules.uid}-1`) }
    },
    lastMessage: { text: "Can't wait to meet!", senderId: jules.uid, createdAt: FieldValue.serverTimestamp() },
    unread: { [alexa.uid]: 1, [jules.uid]: 0 },
    lastReadAt: {},
    superLikedBy: []
  });
  await db.collection(`matches/${matchId}/messages`).add({
    senderId: jules.uid,
    text: "Can't wait to meet!",
    createdAt: FieldValue.serverTimestamp()
  });

  // Casey already liked Dev, so Dev liking Casey back creates a match (used by E2E).
  await db.doc(`swipes/muse_casey/outgoing/muse_dev`).set({
    fromUid: "muse_casey",
    toUid: "muse_dev",
    type: "like",
    createdAt: FieldValue.serverTimestamp()
  });

  console.log(`Seeded ${members.length} members (password ${PASSWORD}), a mutual match, and muse+onboard@example.com.`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
