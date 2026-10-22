import { buildDiscoveryEntry, toDiscoverProfile } from "../src/lib/discovery";
import { parseFeedInput } from "../src/lib/validate";
import { WORK_SECTORS } from "../src/lib/workCircles";

test("each explicit work circle parses without changing ordinary feed inputs", () => {
  for (const circle of WORK_SECTORS) expect(parseFeedInput({ circle, cursor: { uid: "candidate", lastActiveAt: 12 } })).toMatchObject({ circle, cursor: { uid: "candidate", lastActiveAt: 12 } });
  expect(parseFeedInput({})).not.toHaveProperty("circle");
});
test("invalid sectors and combined editions cannot broaden or bypass the feed", () => {
  for (const circle of [null, "", "verified-government", "__proto__", ["banking"], { id: "banking" }, 1]) expect(() => parseFeedInput({ circle })).toThrow(/circle is invalid/);
  expect(() => parseFeedInput({ circle: "banking", ageGap: "older" })).toThrow(/one filter/);
  expect(() => parseFeedInput({ circle: "banking", garba: true })).toThrow(/one filter/);
});
test("employment is never inferred from work text and cannot claim a verified sector", () => {
  expect(buildDiscoveryEntry("member", { basics: { work: "Doctor" } }, undefined, undefined).workSector).toBeNull();
  expect(buildDiscoveryEntry("member", { workSector: "healthcare" }, undefined, undefined).workSector).toBe("healthcare");
  expect(buildDiscoveryEntry("member", { workSector: "verified-government" } as never, undefined, undefined).workSector).toBeNull();
});
test("work badges do not override private photos or expose workplace details", () => {
  const profile = { displayName: "Fictional member", gender: "woman" as const, age: 28, workSector: "banking" as const, photoUrls: ["https://example.com/private.jpg"], onboardingComplete: true };
  const entry = buildDiscoveryEntry("member", profile, { privatePhotos: true } as never, undefined);
  const card = toDiscoverProfile(profile, entry, null, false, { interests: [], vibes: [], intentions: [], quickAnswers: [], casual: false });
  expect(card).toMatchObject({ workSector: "banking", photosPrivate: true, photoUrls: [] });
  expect(card).not.toHaveProperty("employer");
  expect(card).not.toHaveProperty("workVerified");
});
