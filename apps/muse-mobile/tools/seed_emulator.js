const { initializeApp } = require('firebase/app');
const { connectFirestoreEmulator, getFirestore, doc, setDoc } = require('firebase/firestore');

const app = initializeApp({
  apiKey: 'AIzaSyD-LOCAL-DEV-KEY-0000000000000',
  authDomain: 'demo-muse.firebaseapp.com',
  projectId: 'demo-muse',
  storageBucket: 'demo-muse.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000'
});

const db = getFirestore(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);

(async () => {
  const now = Date.now();
  const profile = {
    uid: 'demo-local',
    displayName: 'Muse Demo',
    pronouns: 'they/them',
    age: 25,
    city: 'Mumbai',
    bio: 'Here to test Muse. Coffee walks, museum dates, and music nights.',
    photoUrls: [],
    interests: ['soundscape', 'canvas', 'taste'],
    intentions: ['long-term', 'short-term'],
    vibes: ['cozy', 'adventurous', 'curious'],
    vibePreference: 'any',
    maxDistanceKm: 25,
    quickAnswers: [
      { questionId: 'ideal_date', answer: 'Coffee + walk' },
      { questionId: 'perfect_sunday', answer: 'Brunch + market' },
      { questionId: 'texting_style', answer: 'Long chats' }
    ],
    location: null,
    shareLocation: false,
    createdAt: now,
    updatedAt: now,
    onboardingComplete: true,
    safetyConfirmed: true,
    lastActiveAt: now,
    isDiscoverable: true
  };
  await setDoc(doc(db, 'users', 'demo-local'), profile, { merge: true });
  console.log('Seeded demo-local');
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
