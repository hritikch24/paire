import { AGE_GAP_FILTERS, ageGapLabel } from "../src/data/ageGap";

describe("age-gap labels", () => {
  it("names the older side by gender", () => {
    expect(ageGapLabel("older", "man")).toBe("🦊 Silver Fox");
    expect(ageGapLabel("older", "woman")).toBe("🦊 Cougar");
    expect(ageGapLabel("intoOlder", "man")).toBe("✨ Into someone older");
  });

  it("offers everyone plus both sides as filters", () => {
    expect(AGE_GAP_FILTERS.map((option) => option.id)).toEqual([null, "older", "intoOlder"]);
  });
});
