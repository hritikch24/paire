import { formatDayLabel, formatLastActive, formatShortTime, isSameDay, toMillis } from "../src/utils/time";

const NOW = new Date(2026, 8, 26, 15, 0).getTime();
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("toMillis", () => {
  it("handles numbers, Firestore timestamps and pending server timestamps", () => {
    expect(toMillis(1234)).toBe(1234);
    expect(toMillis({ toMillis: () => 5000 })).toBe(5000);
    expect(toMillis({ seconds: 7 })).toBe(7000);
    expect(toMillis(null, 42)).toBe(42);
  });
});

describe("relative labels", () => {
  it("formats list timestamps compactly", () => {
    expect(formatShortTime(NOW - 20 * 1000, NOW)).toBe("now");
    expect(formatShortTime(NOW - 5 * MINUTE, NOW)).toBe("5m");
    expect(formatShortTime(NOW - 3 * HOUR, NOW)).toBe("3h");
  });

  it("labels chat days", () => {
    expect(formatDayLabel(NOW - HOUR, NOW)).toBe("Today");
    expect(formatDayLabel(NOW - DAY, NOW)).toBe("Yesterday");
    expect(isSameDay(NOW, NOW - HOUR)).toBe(true);
  });

  it("keeps activity coarse", () => {
    expect(formatLastActive(NOW - 30 * MINUTE, NOW)).toBe("Active recently");
    expect(formatLastActive(NOW - 5 * HOUR, NOW)).toBe("Active today");
    expect(formatLastActive(NOW - 3 * DAY, NOW)).toBe("Active this week");
    expect(formatLastActive(NOW - 30 * DAY, NOW)).toBe("");
    expect(formatLastActive(undefined, NOW)).toBe("");
  });
});
