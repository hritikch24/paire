import { ageFromBirthDate, formatBirthDate, maskBirthDateInput, parseBirthDate } from "../src/utils/age";

const NOW = new Date(2026, 8, 26); // 26 Sep 2026

describe("parseBirthDate", () => {
  it("accepts real DD/MM/YYYY dates", () => {
    expect(parseBirthDate("02/04/1998", NOW)).toBe("1998-04-02");
    expect(parseBirthDate("29/02/2000", NOW)).toBe("2000-02-29");
  });

  it("rejects impossible, future and malformed dates", () => {
    expect(parseBirthDate("31/02/2000", NOW)).toBeNull();
    expect(parseBirthDate("29/02/2001", NOW)).toBeNull();
    expect(parseBirthDate("01/01/2030", NOW)).toBeNull();
    expect(parseBirthDate("1/1/2000", NOW)).toBeNull();
    expect(parseBirthDate("01/01/1800", NOW)).toBeNull();
    expect(parseBirthDate("", NOW)).toBeNull();
  });
});

describe("ageFromBirthDate", () => {
  it("counts whole years and respects the birthday", () => {
    expect(ageFromBirthDate("2008-09-26", NOW)).toBe(18);
    expect(ageFromBirthDate("2008-09-27", NOW)).toBe(17);
    expect(ageFromBirthDate("1998-04-02", NOW)).toBe(28);
  });
});

describe("birthday input formatting", () => {
  it("adds slashes while typing and ignores non-digits", () => {
    expect(maskBirthDateInput("0")).toBe("0");
    expect(maskBirthDateInput("0204")).toBe("02/04");
    expect(maskBirthDateInput("02041998")).toBe("02/04/1998");
    expect(maskBirthDateInput("02/04/19985")).toBe("02/04/1998");
    expect(maskBirthDateInput("ab12")).toBe("12");
  });

  it("round-trips stored dates for display", () => {
    expect(formatBirthDate("1998-04-02")).toBe("02/04/1998");
    expect(formatBirthDate(undefined)).toBe("");
  });
});
