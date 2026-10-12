import { nextDailyReset, remainingAllowance } from "../src/lib/allowance";

describe("daily allowance", () => {
  it("resets at the next UTC boundary, including month/year changes", () => {
    expect(nextDailyReset(Date.UTC(2026, 9, 10, 23, 59, 59))).toBe(Date.UTC(2026, 9, 11));
    expect(nextDailyReset(Date.UTC(2026, 11, 31, 23))).toBe(Date.UTC(2027, 0, 1));
    expect(nextDailyReset(Date.UTC(2026, 9, 10))).toBe(Date.UTC(2026, 9, 11));
  });
  it("doesn't expose negative or nonfinite remaining balances", () => {
    expect(remainingAllowance(99, 100)).toBe(1);
    expect(remainingAllowance(105, 100)).toBe(0);
    expect(remainingAllowance(undefined, 100)).toBe(100);
    expect(remainingAllowance(NaN, 100)).toBe(100);
    expect(remainingAllowance(-1, 100)).toBe(100);
  });
});
