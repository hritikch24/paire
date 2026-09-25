declare module "@firebase/firestore/dist/index.cjs.js" {
  export const collection: (...args: any[]) => any;
  export const getDocs: (...args: any[]) => Promise<any>;
  export const limit: (...args: any[]) => any;
  export const query: (...args: any[]) => any;
  export const where: (...args: any[]) => any;
  export const orderBy: (...args: any[]) => any;
  export const doc: (...args: any[]) => any;
  export const getDoc: (...args: any[]) => Promise<any>;
  export const setDoc: (...args: any[]) => Promise<any>;
  export const updateDoc: (...args: any[]) => Promise<any>;
  export const addDoc: (...args: any[]) => Promise<any>;
  export const onSnapshot: (...args: any[]) => any;
  export const writeBatch: (...args: any[]) => any;
  export const getFirestore: (...args: any[]) => any;
  export const connectFirestoreEmulator: (...args: any[]) => any;
}
