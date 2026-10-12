jest.mock("../src/admin", () => ({ db: { getAll: jest.fn(), doc: (path: string) => path } }));
jest.mock("../src/lib/llm", () => ({ llmEnabled: () => true, askAiForJson: jest.fn() }));
jest.mock("../src/quota", () => ({ consumeDailyQuota: jest.fn() }));
import { db } from "../src/admin";
import { askAiForJson } from "../src/lib/llm";
import { consumeDailyQuota } from "../src/quota";
import { rerankVibes } from "../src/vibeMatching";
import { DiscoverProfile } from "../src/types";
const profiles = [{ uid: "private-uid", displayName: "Private name", bio: "Private biography", photoUrls: ["private-photo"], interests: ["taste"], vibes: ["foodie"], intentions: ["long-term"], compatibility: 80 }] as DiscoverProfile[];
beforeEach(() => jest.clearAllMocks());
it("does not call the model without the viewer's explicit consent", async () => {
  expect(await rerankVibes("me", {}, {}, profiles)).toBe(profiles);
  expect(askAiForJson).not.toHaveBeenCalled(); expect(db.getAll).not.toHaveBeenCalled();
});
it("does not call the model when the candidate has not opted in", async () => {
  (db.getAll as jest.Mock).mockResolvedValue([{ get: () => false }]);
  expect(await rerankVibes("me", {}, { aiVibeMatching: true }, profiles)).toBe(profiles);
  expect(askAiForJson).not.toHaveBeenCalled();
});
it("sends no identifiers or free text even when both people opt in", async () => {
  (db.getAll as jest.Mock).mockResolvedValue([{ get: () => true }]);
  (askAiForJson as jest.Mock).mockResolvedValue({ scores: [{ index: 0, score: 100 }] });
  await rerankVibes("me", { bio: "Private viewer", interests: ["taste"] }, { aiVibeMatching: true }, profiles);
  const payload = JSON.parse((askAiForJson as jest.Mock).mock.calls[0][1]);
  expect(payload).toEqual({ viewer: { interests: ["taste"], vibes: [], intentions: [] }, candidates: [{ index: 0, interests: ["taste"], vibes: ["foodie"], intentions: ["long-term"] }] });
});
it("falls back without a model call when the daily AI budget is exhausted", async () => {
  (db.getAll as jest.Mock).mockResolvedValue([{ get: () => true }]);
  (consumeDailyQuota as jest.Mock).mockRejectedValueOnce(new Error("limit"));
  expect(await rerankVibes("me", {}, { aiVibeMatching: true }, profiles)).toBe(profiles);
  expect(askAiForJson).not.toHaveBeenCalled();
});
