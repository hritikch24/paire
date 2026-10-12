import { eligibleAgeGap, matchesAgeGapFilter } from "../src/lib/ageGap";
import { buildDiscoveryEntry } from "../src/lib/discovery";
import { parseFeedInput } from "../src/lib/validate";

const profile = (age: number) => ({ displayName: "A", gender: "man" as const, age, isDiscoverable: true, onboardingComplete: true });

describe("age-gap dating", () => {
  test("Silver Foxes and Cougars must be 35 or older", () => {
    expect(eligibleAgeGap("older", 35)).toBe("older");
    expect(eligibleAgeGap("older", 34)).toBeNull();
    expect(eligibleAgeGap("older", null)).toBeNull();
    expect(eligibleAgeGap("intoOlder", 21)).toBe("intoOlder");
    expect(eligibleAgeGap("sugar", 40)).toBeNull();
    expect(eligibleAgeGap(undefined, 40)).toBeNull();
  });

  test("the discovery index only keeps an eligible side", () => {
    expect(buildDiscoveryEntry("u1", profile(40), { ageGap: "older" }, undefined).ageGap).toBe("older");
    expect(buildDiscoveryEntry("u1", profile(30), { ageGap: "older" }, undefined).ageGap).toBeNull();
    expect(buildDiscoveryEntry("u1", profile(24), { ageGap: "intoOlder" }, undefined).ageGap).toBe("intoOlder");
    expect(buildDiscoveryEntry("u1", profile(40), {}, undefined).ageGap).toBeNull();
  });

  test("the filter shows the chosen side, older or younger than the viewer", () => {
    expect(matchesAgeGapFilter("older", 26, { ageGap: "older", age: 42 })).toBe(true);
    expect(matchesAgeGapFilter("older", 45, { ageGap: "older", age: 42 })).toBe(false);
    expect(matchesAgeGapFilter("older", 26, { ageGap: "intoOlder", age: 42 })).toBe(false);
    expect(matchesAgeGapFilter("intoOlder", 44, { ageGap: "intoOlder", age: 25 })).toBe(true);
    expect(matchesAgeGapFilter("intoOlder", 22, { ageGap: "intoOlder", age: 25 })).toBe(false);
    expect(matchesAgeGapFilter("older", 26, { ageGap: null, age: 42 })).toBe(false);
  });

  test("the feed accepts only known filter values", () => {
    expect(parseFeedInput({ cursor: null, ageGap: "older" })).toEqual({ cursor: null, ageGap: "older", garba: false });
    expect(parseFeedInput({ cursor: null })).toEqual({ cursor: null, ageGap: null, garba: false });
    expect(parseFeedInput(undefined)).toEqual({ cursor: null, ageGap: null, garba: false });
    expect(() => parseFeedInput({ ageGap: "sugarDaddy" })).toThrow("ageGap is invalid.");
  });
});
