/* global jest */

module.exports = {
  doc: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  orderBy: jest.fn(),
  addDoc: jest.fn(),
  onSnapshot: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(() => ({ update: jest.fn(), commit: jest.fn() })),
  increment: jest.fn()
};
