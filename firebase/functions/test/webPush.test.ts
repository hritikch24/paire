import { createECDH, randomBytes } from "node:crypto";
import { parseBrowserSubscription, subscriptionId } from "../src/lib/webPush";
const ecdh = createECDH("prime256v1");
ecdh.generateKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/fictional", keys: { auth: randomBytes(16).toString("base64url"), p256dh: ecdh.getPublicKey().toString("base64url") } };

test("accepts browser services and strips caller-supplied owner or payload fields", () => {
  for (const host of ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "example.notify.windows.com"]) {
    const input = { ...subscription, endpoint: `https://${host}/fictional`, uid: "victim", payload: "injected" };
    expect(parseBrowserSubscription(input)).toEqual({ endpoint: input.endpoint, keys: subscription.keys });
  }
  expect(subscriptionId(subscription.endpoint)).toHaveLength(64);
});
test("rejects SSRF targets, misleading domains, credentials, ports and malformed keys", () => {
  for (const endpoint of ["http://fcm.googleapis.com/send", "https://127.0.0.1/", "https://localhost/", "https://example.com/", "https://fcm.googleapis.com.evil.test/", "https://evilpush.apple.com/", "https://user:pass@fcm.googleapis.com/", "https://fcm.googleapis.com:444/", "https://fcm.googleapis.com/#fragment"]) {
    expect(parseBrowserSubscription({ ...subscription, endpoint })).toBeNull();
  }
  expect(parseBrowserSubscription({ ...subscription, keys: { ...subscription.keys, auth: "short" } })).toBeNull();
  expect(parseBrowserSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: "invalid" } })).toBeNull();
  expect(parseBrowserSubscription(null)).toBeNull();
});
