import { useAuthStore } from "../store/authStore";
import { callFunction } from "./firebase";
import { isSupportView } from "./supportMode";
export type PushPermission = "granted" | "denied" | "undetermined";
export const CHANNELS = { messages: "messages", matches: "matches", reminders: "reminders" } as const;
let activeChat: string | null = null;
let registeredUid: string | null = null;
let epoch = 0;
const suppressed = new Set<string>();
export const setActiveChat = (id: string | null) => { activeChat = id; };
export const getActiveChat = () => activeChat;
export const suppressMatchAlert = (id: string) => { suppressed.add(id); };
export const isMatchAlertSuppressed = (id: string) => suppressed.has(id);
export const isPushRegistered = () => registeredUid === useAuthStore.getState().user?.uid;
export const configureNotifications = () => undefined;
export const browserPushSupported = () => !isSupportView && window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
const flag = (uid: string) => `paire.webPush.${uid}`;
const notifyChange = () => window.dispatchEvent(new Event("paire-push-change"));

export async function getPushPermission(): Promise<PushPermission> {
  if (!browserPushSupported()) return "denied";
  return Notification.permission === "default" ? "undetermined" : Notification.permission;
}
export async function requestPushPermission(): Promise<PushPermission> {
  if (!browserPushSupported()) return "denied";
  const status = await Notification.requestPermission();
  return status === "default" ? "undetermined" : status;
}

async function worker() {
  const registration = await navigator.serviceWorker.register("/paire-push-sw.js", { scope: "/app/" });
  if (!registration.active) await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Notifications couldn't start. Please try again.")), 15_000);
    const waiting = registration.installing || registration.waiting;
    if (!waiting) { clearTimeout(timer); reject(new Error("Notifications couldn't start.")); return; }
    const check = () => { if (waiting.state === "activated") { clearTimeout(timer); resolve(); } else if (waiting.state === "redundant") { clearTimeout(timer); reject(new Error("Notifications couldn't start.")); } };
    waiting.addEventListener("statechange", check);
    check();
  });
  return registration;
}
async function bind(registration: ServiceWorkerRegistration, uid: string | null) {
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error("Notifications couldn't start.")); }, 10_000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
    if (!registration.active) { clearTimeout(timer); reject(new Error("Notifications couldn't start.")); return; }
    registration.active.postMessage({ type: "paire-push-bind", uid }, [channel.port2]);
  });
}

async function subscribe(uid: string) {
  if (isSupportView || useAuthStore.getState().user?.uid !== uid) return false;
  const operation = ++epoch;
  const current = () => epoch === operation && useAuthStore.getState().user?.uid === uid;
  const config = await callFunction<{ available: boolean; publicKey: string }>("getWebPushConfig");
  if (!config.available) throw new Error("Browser notifications aren't available yet.");
  if (!current()) return false;
  const registration = await worker();
  if (!current()) return false;
  const decoded = atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const applicationServerKey = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  if (!current()) return false;
  await bind(registration, uid);
  if (!current()) return false;
  try { await callFunction("registerWebPush", { subscription: subscription.toJSON() }); }
  catch (error) { if (current()) await bind(registration, null); throw error; }
  if (!current()) return false;
  localStorage.setItem(flag(uid), "on");
  registeredUid = uid;
  notifyChange();
  return true;
}
/** Called only from a member's deliberate Enable notifications click. */
export async function enableBrowserPush(uid: string) {
  if (await requestPushPermission() !== "granted") return false;
  return subscribe(uid);
}
/** Restore a previous opt-in; never opens a browser permission prompt. */
export async function registerPushToken(uid: string): Promise<boolean> {
  try {
    if (!browserPushSupported() || Notification.permission !== "granted" || localStorage.getItem(flag(uid)) !== "on") return false;
    return await subscribe(uid);
  } catch { registeredUid = null; notifyChange(); return false; }
}
export async function unregisterPushToken(uid: string) {
  if (isSupportView || !("serviceWorker" in navigator)) return;
  if (registeredUid && registeredUid !== uid) return;
  const operation = ++epoch;
  registeredUid = null;
  notifyChange();
  const registration = await navigator.serviceWorker.getRegistration("/app/");
  if (!registration || operation !== epoch) return;
  await bind(registration, null);
  const subscription = await registration.pushManager.getSubscription();
  if (subscription && operation === epoch) {
    try { await callFunction("unregisterWebPush", { endpoint: subscription.endpoint }); }
    finally { if (operation === epoch) await subscription.unsubscribe(); }
  }
}
export async function disableBrowserPush(uid: string) {
  localStorage.removeItem(flag(uid));
  await unregisterPushToken(uid);
}
/** Foreground alerts use the app toast; background alerts come only from the push worker. */
export async function showLocalAlert(_channel: keyof typeof CHANNELS, _title: string, _body: string, _data: Record<string, string>): Promise<boolean> { return false; }
export async function scheduleCheckIn(_minutes: number): Promise<string> { throw new Error("Browser safety timers need Paire to stay open."); }
export async function cancelScheduledNotification(_id: string) { return; }
