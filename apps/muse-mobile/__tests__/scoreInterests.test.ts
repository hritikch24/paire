import { scoreInterests } from "../src/utils/scoreInterests";

describe("scoreInterests", () => {
  it("returns 0 when no interests", () => {
    expect(scoreInterests([], ["a"])).toBe(0);
  });

  it("scores overlap ratio", () => {
    expect(scoreInterests(["a", "b", "c"], ["b", "c"])).toBeCloseTo(2 / 3);
  });
});
