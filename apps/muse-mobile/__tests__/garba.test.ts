import { activeGarbaSeason, garbaBadge, garbaNightLabel, myUpcomingNights, upcomingNights } from "../src/data/garba";

// Noon IST on a given day.
const at = (date: string) => Date.parse(`${date}T06:30:00Z`);

describe("Garba Nights", () => {
  test("open from 1 October until Dussehra 2026", () => {
    expect(activeGarbaSeason(at("2026-09-30"))).toBeNull();
    expect(activeGarbaSeason(at("2026-10-01"))?.id).toBe("2026");
    expect(activeGarbaSeason(at("2026-10-21"))).toBeNull();
  });

  test("lists the nights still to come, ending with Dussehra", () => {
    const nights = upcomingNights(at("2026-10-18"));
    expect(nights.map((night) => night.title)).toEqual(["Night 8", "Night 9", "Dussehra"]);
    expect(nights[0]).toEqual({ date: "2026-10-18", title: "Night 8", day: "Sun 18 Oct" });
    expect(upcomingNights(at("2026-10-05"))).toHaveLength(10);
    expect(upcomingNights(at("2026-11-01"))).toEqual([]);
  });

  test("keeps at most four nights", () => {
    expect(myUpcomingNights(["2026-10-15", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"], at("2026-10-11"))).toEqual([
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-14"
    ]);
  });

  test("keeps only the member's nights still to come", () => {
    expect(myUpcomingNights(["2026-10-19", "2026-10-12", "2026-10-19", "nope"], at("2026-10-14"))).toEqual(["2026-10-19"]);
    expect(myUpcomingNights(null, at("2026-10-14"))).toEqual([]);
  });

  test("labels", () => {
    expect(garbaNightLabel("2026-10-15")).toBe("Thu 15 Oct");
    expect(garbaBadge(1)).toBe("🪔 Going on 1 of your Garba nights");
    expect(garbaBadge(3)).toBe("🪔 Going on 3 of your Garba nights");
  });
});
