/* global jest */

// Stand-in for the Firestore SDK in unit tests (mapped in jest.config.js).
module.exports = {
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  addDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  onSnapshot: jest.fn(),
  writeBatch: jest.fn(() => ({ set: jest.fn(), update: jest.fn(), commit: jest.fn() })),
  increment: jest.fn(),
  serverTimestamp: jest.fn(),
  initializeFirestore: jest.fn(),
  getFirestore: jest.fn(),
  connectFirestoreEmulator: jest.fn()
};
