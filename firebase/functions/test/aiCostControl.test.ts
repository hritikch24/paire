jest.mock("../src/admin", () => ({ db: { doc: jest.fn(), getAll: jest.fn() } }));
jest.mock("../src/quota", () => ({ consumeDailyQuota: jest.fn() }));
jest.mock("../src/lib/faces", () => ({ decodeImage: jest.fn(), detectFaces: jest.fn() }));
jest.mock("../src/lib/didit", () => ({ diditCaptureAvailable: () => false }));
import { db } from "../src/admin";
import { suggestBio, suggestOpeners } from "../src/ai";
import { rerankVibes } from "../src/vibeMatching";
import { DiscoverProfile } from "../src/types";
import { selfieCheckAvailable, startSelfieCheck, submitSelfieCheck } from "../src/selfie";
import { SELFIE_CONSENT_VERSION } from "../src/lib/selfieCheck";
import { decodeImage } from "../src/lib/faces";

const saved = { ...process.env };
beforeEach(() => {
  process.env.MUSE_PAID_AI_ENABLED = "false";
  process.env.MUSE_GEMINI_ENABLED = "true";
  process.env.ANTHROPIC_API_KEY = "sk-present-but-disabled";
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("No provider traffic allowed"));
  const profile = { displayName: "Alex", interests: ["nature", "taste"], vibes: ["curious"], intentions: ["long-term"] };
  (db.doc as jest.Mock).mockReturnValue({ get: async () => ({ exists: true, data: () => profile, get: (field: string) => field === "participants" ? ["me", "them"] : undefined }) });
  (db.getAll as jest.Mock).mockResolvedValue([profile, profile, {}, {}].map(data => ({ data: () => data, get: () => undefined })));
});
afterEach(() => { process.env = { ...saved }; jest.restoreAllMocks(); jest.clearAllMocks(); });

test("bios and match icebreakers still return three suggestions with all paid providers blocked", async () => {
  const auth = { uid: "me", token: {} };
  const bio = await suggestBio.run({ auth, data: {} } as Parameters<typeof suggestBio.run>[0]);
  const openers = await suggestOpeners.run({ auth, data: { matchId: "match-1" } } as Parameters<typeof suggestOpeners.run>[0]);
  for (const result of [bio, openers]) {
    expect(result.source).toBe("muse");
    expect(result.suggestions).toHaveLength(3);
    expect(result.suggestions.every(line => line.length > 0)).toBe(true);
  }
  expect(fetch).not.toHaveBeenCalled();
});

test("new and in-flight selfie submissions pause before database, image or provider work; nobody is approved", async () => {
  process.env.MUSE_VERIFICATION_ENABLED = "true";
  (db.doc as jest.Mock).mockClear();
  expect(selfieCheckAvailable()).toBe(false);
  const auth = { uid: "me", token: {} };
  await expect(startSelfieCheck.run({ auth, data: { consent: true, consentVersion: SELFIE_CONSENT_VERSION } } as Parameters<typeof startSelfieCheck.run>[0])).rejects.toMatchObject({ code: "unavailable" });
  await expect(submitSelfieCheck.run({ auth, data: { attempt: "12345678-1234-1234-1234-123456789abc", image: "aGVsbG8=" } } as Parameters<typeof submitSelfieCheck.run>[0])).rejects.toMatchObject({ code: "unavailable" });
  expect(db.doc).not.toHaveBeenCalled();
  expect(decodeImage).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test("matching keeps the existing ranking without model calls or additional candidate-settings reads", async () => {
  (db.getAll as jest.Mock).mockClear();
  const profiles = [{ uid: "them", compatibility: 80 }] as DiscoverProfile[];
  expect(await rerankVibes("me", {}, { aiVibeMatching: true }, profiles)).toBe(profiles);
  expect(db.getAll).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
