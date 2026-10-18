import { chooseReminder, DAY_MS, reminderDue } from "../src/lib/reminders";
import { buildDiscoveryEntry } from "../src/lib/discovery";
import { UserSettings } from "../src/types";

const now = Date.parse("2026-10-20T13:00:00Z"); // Tuesday, 18:30 IST.
const settings: UserSettings = { notifications: { reminders: true }, showMe: ["woman"], ageMin: 23, ageMax: 35, locationEnabled: true, location: { lat: 28.61, lng: 77.21, updatedAt: now - DAY_MS }, maxDistanceKm: 50 };
const viewer = buildDiscoveryEntry("viewer", { gender: "man", age: 28, onboardingComplete: true, lastActiveAt: now - 2 * DAY_MS }, settings, {});
const candidate = buildDiscoveryEntry("new", { gender: "woman", age: 27, onboardingComplete: true, createdAt: now - DAY_MS }, { showMe: ["man"], ageMin: 25, ageMax: 30, locationEnabled: true, location: { lat: 28.62, lng: 77.22 } }, {});

test("requires explicit reminder consent and a recent, genuinely inactive member", () => {
  expect(reminderDue(settings, {}, viewer.lastActiveAt, now)).toBe(true);
  for (const notifications of [undefined, { matches: true }, { reminders: false }]) expect(reminderDue({ ...settings, notifications }, {}, viewer.lastActiveAt, now)).toBe(false);
  for (const activity of [0, NaN, now, now - 31 * DAY_MS, now + DAY_MS]) expect(reminderDue(settings, {}, activity, now)).toBe(false);
});
test("caps attempts at two in seven days and spaces them by three days, even after toggling consent", () => {
  expect(reminderDue(settings, { recentAttempts: [now - DAY_MS] }, viewer.lastActiveAt, now)).toBe(false);
  expect(reminderDue(settings, { recentAttempts: [now - 4 * DAY_MS, now - 6 * DAY_MS] }, viewer.lastActiveAt, now)).toBe(false);
  expect(reminderDue(settings, { recentAttempts: [now - 4 * DAY_MS, now - 8 * DAY_MS] }, viewer.lastActiveAt, now)).toBe(true);
});
test("discovery reminders require a new mutually eligible profile since the last visit/reminder", () => {
  expect(chooseReminder(viewer, settings, [candidate], {}, now)?.type).toBe("people");
  expect(chooseReminder(viewer, settings, [], {}, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [{ ...candidate, visible: false }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [{ ...candidate, ageMin: 40 }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [{ ...candidate, createdAt: now + 1 }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [{ ...candidate, createdAt: now - 3 * DAY_MS }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [candidate], { recentAttempts: [now - DAY_MS / 2] }, now)).toBeNull();
  expect(chooseReminder(viewer, settings, [candidate], {}, now - DAY_MS)).toBeNull(); // Monday.
});
test("Garba reminders require shared upcoming nights, a current local position, and one per season", () => {
  const localSettings = { ...settings, garbaNights: ["2026-10-20"] };
  const going = { ...candidate, createdAt: 0, garbaNights: ["2026-10-20"] };
  expect(chooseReminder(viewer, localSettings, [going], {}, now)?.type).toBe("garba");
  expect(chooseReminder(viewer, localSettings, [going], { garbaSeason: "2026" }, now)).toBeNull();
  expect(chooseReminder(viewer, localSettings, [{ ...going, garbaNights: ["2026-10-19"] }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, localSettings, [{ ...going, lat: 19, lng: 72 }], {}, now)).toBeNull();
  expect(chooseReminder(viewer, { ...localSettings, location: { ...settings.location!, updatedAt: now - 8 * DAY_MS } }, [going], {}, now)).toBeNull();
  expect(chooseReminder(viewer, { ...localSettings, locationEnabled: false }, [going], {}, now)).toBeNull();
  expect(chooseReminder(viewer, localSettings, [going], {}, Date.parse("2026-10-21T13:00:00Z"))).toBeNull();
});
