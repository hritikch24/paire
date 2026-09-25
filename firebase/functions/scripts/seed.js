const admin = require("firebase-admin");

const projectId = process.env.GCLOUD_PROJECT || "demo-muse";
admin.initializeApp({
  projectId
});

const db = admin.firestore();
const auth = admin.auth();

const now = Date.now();

const users = [
  {
    uid: "muse_alexa",
    email: "muse+alexa@example.com",
    password: "Password123!",
    displayName: "Alexa",
    pronouns: "she/her",
    age: 28,
    city: "San Francisco",
    bio: "Ceramic artist. Sunset walks and jazz vinyl.",
    interests: ["canvas", "soundscape", "craft"],
    photoUrls: []
  },
  {
    uid: "muse_jules",
    email: "muse+jules@example.com",
    password: "Password123!",
    displayName: "Jules",
    pronouns: "they/them",
    age: 30,
    city: "Oakland",
    bio: "Creative director, love gallery nights.",
    interests: ["frame", "design", "lens"],
    photoUrls: []
  },
  {
    uid: "muse_casey",
    email: "muse+casey@example.com",
    password: "Password123!",
    displayName: "Casey",
    pronouns: "she/they",
    age: 27,
    city: "Berkeley",
    bio: "Film photographer. Coffee, climbing, and community art nights.",
    interests: ["lens", "frame", "movement"],
    photoUrls: []
  },
  {
    uid: "muse_dani",
    email: "muse+dani@example.com",
    password: "Password123!",
    displayName: "Dani",
    pronouns: "he/him",
    age: 29,
    city: "San Jose",
    bio: "UX designer by day, DJ by night. Always building playlists.",
    interests: ["design", "soundscape", "taste"],
    photoUrls: []
  },
  {
    uid: "muse_kai",
    email: "muse+kai@example.com",
    password: "Password123!",
    displayName: "Kai",
    pronouns: "they/he",
    age: 31,
    city: "Palo Alto",
    bio: "Architect + nature nerd. Weekend hikes and sketchbooks.",
    interests: ["design", "nature", "words"],
    photoUrls: []
  }
];

const onboardingUser = {
  uid: "muse_onboard",
  email: "muse+onboard@example.com",
  password: "Password123!"
};

async function seed() {
  let onboardingUid = onboardingUser.uid;
  try {
    const existing = await auth.getUserByEmail(onboardingUser.email);
    if (existing.uid !== onboardingUser.uid) {
      await auth.deleteUser(existing.uid);
      await auth.createUser({
        uid: onboardingUser.uid,
        email: onboardingUser.email,
        password: onboardingUser.password
      });
      onboardingUid = onboardingUser.uid;
    } else {
      onboardingUid = existing.uid;
    }
  } catch (error) {
    await auth.createUser({
      uid: onboardingUser.uid,
      email: onboardingUser.email,
      password: onboardingUser.password
    });
    onboardingUid = onboardingUser.uid;
  }

  await db.doc(`users/${onboardingUid}`).delete().catch(() => null);
  await db.doc(`users/${onboardingUid}/private/info`).delete().catch(() => null);

  const resolvedUsers = await Promise.all(
    users.map(async (user) => {
      let uid = user.uid;
      let needsCreate = false;
      try {
        const existing = await auth.getUserByEmail(user.email);
        if (existing.uid !== user.uid) {
          await auth.deleteUser(existing.uid);
          needsCreate = true;
        } else {
          uid = existing.uid;
        }
      } catch (error) {
        needsCreate = true;
      }

      if (needsCreate) {
        await auth.createUser({
          uid: user.uid,
          email: user.email,
          password: user.password
        });
      }

      await db.doc(`users/${uid}`).set(
        {
          uid,
          displayName: user.displayName,
          pronouns: user.pronouns,
          age: user.age,
          city: user.city,
          bio: user.bio,
          photoUrls: user.photoUrls,
          interests: user.interests,
          createdAt: now,
          updatedAt: now,
          onboardingComplete: true,
          safetyConfirmed: true,
          lastActiveAt: now,
          isDiscoverable: true
        },
        { merge: true }
      );

      await db.doc(`users/${uid}/private/info`).set({
        email: user.email
      });

      return { ...user, uid };
    })
  );

  const [alexa, jules] = resolvedUsers;

  await db.doc(`swipes/${alexa.uid}/outgoing/${jules.uid}`).set({
    fromUid: alexa.uid,
    toUid: jules.uid,
    type: "like",
    createdAt: now
  });

  await db.doc(`swipes/${jules.uid}/outgoing/${alexa.uid}`).set({
    fromUid: jules.uid,
    toUid: alexa.uid,
    type: "like",
    createdAt: now
  });

  const matchId = [alexa.uid, jules.uid].sort().join("_");

  const messageRefs = await db.collection(`matches/${matchId}/messages`).listDocuments();
  await Promise.all(messageRefs.map((ref) => ref.delete().catch(() => null)));

  await db.doc(`matches/${matchId}`).set({
    id: matchId,
    participants: [alexa.uid, jules.uid],
    createdAt: now,
    updatedAt: now,
    lastMessage: "Can't wait to meet!",
    lastMessageAt: now,
    unreadCounts: {
      [alexa.uid]: 0,
      [jules.uid]: 0
    }
  });

  console.log("Seeded users and a mutual match.");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
