import { createECDH, randomBytes } from "node:crypto";
jest.mock("../src/admin", () => ({ db: { collection: jest.fn(), runTransaction: jest.fn() } }));
jest.mock("web-push", () => ({ sendNotification: jest.fn() }));
import { db } from "../src/admin";
import * as webPush from "web-push";
import { sendWebPushToUser } from "../src/webPush";
const curve = createECDH("prime256v1"); curve.generateKeys();
const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/fictional", keys: { auth: randomBytes(16).toString("base64url"), p256dh: curve.getPublicKey().toString("base64url") } };
const fields: Record<string, unknown> = { uid: "member", updatedAt: 42 };
const doc = { data: () => subscription, get: (field: string) => fields[field], ref: {} };
const message = { kind: "messages" as const, title: "Private sender", body: "Private message", data: { type: "message", matchId: "match_123" }, tag: "match_123" };
const settings = { notifications: { matches: true, messages: true, previews: false } };
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FUNCTIONS_EMULATOR;
  process.env.WEB_PUSH_VAPID_PUBLIC_KEY = curve.getPublicKey().toString("base64url");
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = curve.getPrivateKey().toString("base64url");
  (db.collection as jest.Mock).mockReturnValue({ where: () => ({ limit: () => ({ get: async () => ({ docs: [doc] }) }) }) });
  (webPush.sendNotification as jest.Mock).mockResolvedValue({ statusCode: 201 });
});
test("push content stays generic until previews are explicitly enabled", async () => {
  await sendWebPushToUser("member", message, settings);
  const [, body, options] = (webPush.sendNotification as jest.Mock).mock.calls[0];
  expect(JSON.parse(body)).toMatchObject({ title: "Paire", body: "You have a new message.", uid: "member", matchId: "match_123" });
  expect(body).not.toContain("Private");
  expect(options).toMatchObject({ TTL: 3600, timeout: 10000 });
  await sendWebPushToUser("member", message, { notifications: { ...settings.notifications, previews: true } });
  expect(JSON.parse((webPush.sendNotification as jest.Mock).mock.calls[1][1]).body).toBe("Private message");
});
test("disabled preferences and emulators never send browser push", async () => {
  await sendWebPushToUser("member", message, { notifications: { ...settings.notifications, messages: false } });
  process.env.FUNCTIONS_EMULATOR = "true";
  await sendWebPushToUser("member", message, settings);
  expect(webPush.sendNotification).not.toHaveBeenCalled();
});
test("reminder transport requires its own explicit opt-in and carries a safe discovery destination", async () => {
  const reminder = { kind: "reminders" as const, title: "A little spark", body: "New people fit your preferences.", data: { type: "reminder", destination: "people", reminderId: "00000000-0000-0000-0000-000000000001" } };
  expect(await sendWebPushToUser("member", reminder, settings)).toEqual({ accepted: 0, failed: 0 });
  expect(webPush.sendNotification).not.toHaveBeenCalled();
  expect(await sendWebPushToUser("member", reminder, { notifications: { ...settings.notifications, reminders: true } })).toEqual({ accepted: 1, failed: 0 });
  expect(JSON.parse((webPush.sendNotification as jest.Mock).mock.calls[0][1])).toMatchObject({ title: reminder.title, destination: "people", reminderId: reminder.data.reminderId });
});
test("expired subscriptions are removed without deleting a newly rebound subscription", async () => {
  const remove = jest.fn();
  (db.runTransaction as jest.Mock).mockImplementation((fn) => fn({ get: async () => doc, delete: remove }));
  (webPush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });
  await sendWebPushToUser("member", message, settings);
  expect(remove).toHaveBeenCalledTimes(1);
  fields.uid = "new-owner";
  await sendWebPushToUser("member", message, settings);
  expect(remove).toHaveBeenCalledTimes(1);
});
