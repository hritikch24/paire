import { initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithCustomToken, updatePassword } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, getDoc, doc, updateDoc, terminate } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { initializeApp as initializeAdminApp, getApps } from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { adminStartSupportSession } from "../src/supportAdmin";

if (!getApps().length) initializeAdminApp({ projectId: "demo-muse" });
const admin = adminDb();
const apps: FirebaseApp[] = [];
let sequence = 0;
const address = (variable: string, fallback: string): [string, number] => {
  const [host, port] = (process.env[variable] || fallback).split(":");
  return [host, Number(port)];
};
function client() {
  const app = initializeApp({ projectId: "demo-muse", apiKey: "demo-key" }, `support-test-${Date.now()}-${++sequence}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, ...address("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080"));
  const functions = getFunctions(app, "us-central1");
  connectFunctionsEmulator(functions, ...address("MUSE_FUNCTIONS_EMULATOR_HOST", "127.0.0.1:5001"));
  return { app, auth, db, call: async <T,>(name: string, data: unknown = {}) => (await httpsCallable(functions, name)(data)).data as T };
}
async function member(claims: Record<string, boolean> = {}) {
  const c = client();
  const { user } = await createUserWithEmailAndPassword(c.auth, `support${Date.now()}-${sequence}@example.com`, "Password123!");
  await adminAuth().updateUser(user.uid, { emailVerified: true });
  await adminAuth().setCustomUserClaims(user.uid, claims);
  await user.getIdToken(true);
  await admin.doc(`users/${user.uid}`).set({ uid: user.uid, displayName: "Fictional member", gender: "woman", age: 28, createdAt: Date.now(), photoUrls: [], onboardingComplete: true });
  await admin.doc(`users/${user.uid}/private/settings`).set({ showMe: ["man"], ageMin: 18, ageMax: 60, notifications: { matches: false, messages: false } });
  await admin.doc(`moderation/${user.uid}`).set({ status: "ok", emailVerified: true, cohort: "test" });
  if (claims.supportAccess) await admin.doc(`supportOperators/${user.uid}`).set({ enabled: true });
  return { ...c, uid: user.uid };
}
type Start = { token: string; uid: string; sessionId: string; expiresAt: number };
const reason = "Ticket 104: investigate missing matches";
afterAll(async () => {
  await Promise.all(apps.map(async (app) => { await terminate(getFirestore(app)); await deleteApp(app); }));
});

test("only enabled support owners can mint sessions; validates reason, target, staff and recent sign-in", async () => {
  const owner = await member({ moderator: true, supportAccess: true });
  const mod = await member({ moderator: true });
  const target = await member();
  await expect(target.call("adminStartSupportSession", { uid: owner.uid, reason })).rejects.toMatchObject({ code: "functions/permission-denied" });
  await expect(mod.call("adminStartSupportSession", { uid: target.uid, reason })).rejects.toMatchObject({ code: "functions/permission-denied" });
  await expect(owner.call("adminStartSupportSession", { uid: target.uid, reason: "" })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  await expect(owner.call("adminStartSupportSession", { uid: "bad/id", reason })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  await expect(owner.call("adminStartSupportSession", { uid: mod.uid, reason })).rejects.toMatchObject({ code: "functions/permission-denied" });
  await expect(owner.call("adminStartSupportSession", { uid: owner.uid, reason })).rejects.toMatchObject({ code: "functions/invalid-argument" });
  await adminAuth().updateUser(target.uid, { disabled: true });
  await expect(owner.call("adminStartSupportSession", { uid: target.uid, reason })).rejects.toMatchObject({ code: "functions/failed-precondition" });
  await adminAuth().updateUser(target.uid, { disabled: false });
  // Exercise expiry of the operator's original sign-in without waiting 15 minutes.
  const token = await owner.auth.currentUser!.getIdTokenResult();
  await expect(adminStartSupportSession.run({ data: { uid: target.uid, reason }, auth: { uid: owner.uid, token: { ...token.claims, auth_time: Math.floor(Date.now() / 1000) - 901 } }, rawRequest: {}, acceptsStreaming: false } as never)).rejects.toThrow(/sign back in/);
  await admin.doc(`supportOperators/${owner.uid}`).update({ enabled: false });
  await expect(owner.call("adminStartSupportSession", { uid: target.uid, reason })).rejects.toMatchObject({ code: "functions/permission-denied" });
});

test("separate support identity reads the target, blocks actions, keeps the owner's login and records/ends access", async () => {
  const owner = await member({ moderator: true, supportAccess: true });
  const target = await member();
  const outsider = await member();
  const original = await adminAuth().getUser(target.uid);
  const started = await owner.call<Start>("adminStartSupportSession", { uid: target.uid, reason });
  expect(started.expiresAt - Date.now()).toBeGreaterThan(14 * 60_000);
  const support = client();
  const signed = await signInWithCustomToken(support.auth, started.token);
  expect(signed.user.uid).toBe(`support_${started.sessionId}`);
  expect(owner.auth.currentUser!.uid).toBe(owner.uid);
  expect((await getDoc(doc(support.db, "users", target.uid))).get("displayName")).toBe("Fictional member");
  await getDoc(doc(support.db, "users", target.uid, "private", "settings"));
  await expect(getDoc(doc(support.db, "users", outsider.uid, "private", "settings"))).rejects.toMatchObject({ code: "permission-denied" });
  await expect(getDoc(doc(support.db, "supportSessions", started.sessionId))).rejects.toMatchObject({ code: "permission-denied" });
  await expect(updateDoc(doc(support.db, "users", target.uid), { displayName: "Changed" })).rejects.toMatchObject({ code: "permission-denied" });
  await expect(support.call("swipe", { targetUid: outsider.uid, type: "like" })).rejects.toMatchObject({ code: "functions/permission-denied" });
  for (const name of ["deleteAccount", "createUpiUnlockOrder", "presenceBeat", "touchActivity", "syncAccountChecks", "registerWebPush", "unregisterWebPush", "getWebPushConfig", "recordReminderOpen", "adminListMembers", "adminStartSupportSession", "adminPreviewPlusGrant", "adminGrantPlusMonth"]) {
    await expect(support.call(name, { uid: outsider.uid, gender: "woman", reason })).rejects.toMatchObject({ code: "functions/permission-denied" });
  }
  await support.call("getDailyAllowance");
  await support.call("getChatAccess");
  await support.call("getPremiumStatus");
  // Support billing reads never create or update member billing state.
  expect((await admin.doc(`billing/${target.uid}`).get()).exists).toBe(false);
  expect((await admin.collection(`limits/${target.uid}/daily`).get()).empty).toBe(true);
  // Auth mutations address only the disposable identity, never the target account.
  await updatePassword(signed.user, "DisposableOnly123!");
  expect((await adminAuth().getUser(target.uid)).metadata.lastSignInTime).toBe(original.metadata.lastSignInTime);
  expect((await adminAuth().getUser(target.uid)).email).toBe(original.email);
  const history = await owner.call<{ sessions: Array<{ id: string; reason: string; actorUid: string }> }>("adminGetSupportHistory", { uid: target.uid });
  expect(history.sessions).toContainEqual(expect.objectContaining({ id: started.sessionId, reason, actorUid: owner.uid }));
  await owner.call("adminEndSupportSession", { sessionId: started.sessionId });
  await expect(support.call("getSupportSessionState")).rejects.toMatchObject({ code: "functions/permission-denied" });
  await expect(getDoc(doc(support.db, "users", target.uid, "private", "settings"))).rejects.toMatchObject({ code: "permission-denied" });
  await expect(adminAuth().getUser(signed.user.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
});

test("expiry, target binding and operator revocation are enforced server-side even with an existing token", async () => {
  const owner = await member({ moderator: true, supportAccess: true });
  const target = await member();
  for (const revoke of ["expiry", "target", "operator"] as const) {
    const started = await owner.call<Start>("adminStartSupportSession", { uid: target.uid, reason });
    const support = client();
    await signInWithCustomToken(support.auth, started.token);
    await support.call("getSupportSessionState");
    if (revoke === "expiry") await admin.doc(`supportSessions/${started.sessionId}`).update({ expiresAt: Date.now() - 1 });
    if (revoke === "target") await admin.doc(`supportSessions/${started.sessionId}`).update({ targetUid: owner.uid });
    if (revoke === "operator") await admin.doc(`supportOperators/${owner.uid}`).update({ enabled: false });
    await expect(support.call("getDailyAllowance")).rejects.toMatchObject({ code: "functions/permission-denied" });
    await expect(getDoc(doc(support.db, "users", target.uid, "private", "settings"))).rejects.toMatchObject({ code: "permission-denied" });
  }
});

test("can inspect accounts before profile creation without creating a member profile or confirming their email", async () => {
  const owner = await member({ moderator: true, supportAccess: true });
  const incomplete = client();
  const { user } = await createUserWithEmailAndPassword(incomplete.auth, `incomplete-${Date.now()}@example.com`, "Password123!");
  const detail = await owner.call<{ uid: string; account: { emailVerified: boolean }; profile: { photoUrls: string[] } }>("adminGetMember", { uid: user.email });
  expect(detail.uid).toBe(user.uid);
  expect(detail.account.emailVerified).toBe(false);
  expect(detail.profile.photoUrls).toEqual([]);
  const started = await owner.call<Start & { email: string; emailVerified: boolean }>("adminStartSupportSession", { uid: user.uid, reason });
  expect(started.email).toBe(user.email);
  expect(started.emailVerified).toBe(false);
  const support = client();
  await signInWithCustomToken(support.auth, started.token);
  expect((await getDoc(doc(support.db, "users", user.uid))).exists()).toBe(false);
  expect((await admin.doc(`users/${user.uid}`).get()).exists).toBe(false);
  expect((await adminAuth().getUser(user.uid)).emailVerified).toBe(false);
  await support.call("adminEndSupportSession");
});
