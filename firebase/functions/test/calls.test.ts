jest.mock("../src/admin", () => ({ db: { doc: (path: string) => path, runTransaction: jest.fn() } }));
jest.mock("../src/trust", () => ({ requireVerifiedUsers: jest.fn() }));
jest.mock("../src/quota", () => ({ consumeDailyQuota: jest.fn() }));
import { generateKeyPairSync, verify } from "crypto";
import { db } from "../src/admin";
import { createCallSession } from "../src/calls";
import { requireVerifiedUsers } from "../src/trust";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const old = { app: process.env.JAAS_APP_ID, key: process.env.JAAS_PRIVATE_KEY, kid: process.env.JAAS_KEY_ID };
let participants: string[]; let blocked: boolean;
beforeEach(() => {
  jest.clearAllMocks(); participants = ["me", "other"]; blocked = false;
  process.env.JAAS_APP_ID = "vpaas-magic-cookie-test"; process.env.JAAS_KEY_ID = "test-key";
  process.env.JAAS_PRIVATE_KEY = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  (db.runTransaction as jest.Mock).mockImplementation((fn) => fn({
    get: async (path: string) => path.startsWith("matches/") ? { exists: true, get: (key: string) => key === "active" ? true : participants } : { exists: false, get: () => undefined },
    getAll: async () => [{ exists: blocked }], set: jest.fn()
  }));
});
afterAll(() => {
  for (const [key, value] of [["JAAS_APP_ID", old.app], ["JAAS_PRIVATE_KEY", old.key], ["JAAS_KEY_ID", old.kid]]) {
    if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
  }
});
const call = () => createCallSession.run({ auth: { uid: "me", token: {} }, data: { matchId: "pair" } } as never);
it("issues a valid room-specific, short-lived signature without recording permissions or profile identity", async () => {
  const session = await call(); const url = new URL(session.url); const jwt = url.searchParams.get("jwt")!;
  const [head, encoded, signature] = jwt.split("."); const payload = JSON.parse(Buffer.from(encoded, "base64url").toString());
  expect(verify("RSA-SHA256", Buffer.from(`${head}.${encoded}`), keys.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  expect(url.origin).toBe("https://8x8.vc"); expect(payload.room).not.toBe("*"); expect(url.pathname.endsWith(payload.room)).toBe(true);
  expect(payload.exp - payload.nbf).toBe(310); expect(payload.context.features.recording).toBe(false);
  expect(payload.context.user.id).not.toBe("me"); expect(payload.context.user.moderator).toBe("false");
  expect(requireVerifiedUsers).toHaveBeenCalledWith(["me", "other"], expect.anything());
});
it("denies nonparticipants and blocked matches", async () => {
  participants = ["someone", "other"]; await expect(call()).rejects.toThrow(/isn’t available/);
  participants = ["me", "other"]; blocked = true; await expect(call()).rejects.toThrow(/isn’t available/);
});
it("never issues access when a member's verification fails", async () => {
  (requireVerifiedUsers as jest.Mock).mockRejectedValueOnce(new Error("verification required"));
  await expect(call()).rejects.toThrow(/verification required/);
});
