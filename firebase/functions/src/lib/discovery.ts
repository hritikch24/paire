import { DIWALI_SEASON, diwaliCityKey, normalizeDiwaliPlan } from "./diwali";
import { isWorkSector } from "./workCircles";
import { SPARKS } from "../config";
import {
  DiscoverProfile,
  DiscoveryEntry,
  LatLng,
  ModerationRecord,
  ProfileBasics,
  PublicProfile,
  QuickAnswer,
  UserSettings
} from "../types";
import { eligibleAgeGap } from "./ageGap";
import { activeGarbaSeason, upcomingGarbaNights } from "./garba";
import { coarsen, displayDistanceKm, distanceKm, isValidLatLng } from "./geo";
import { Traits, matchInsight } from "./insights";
import { MAX_AGE, MIN_AGE, candidateLatLng, isGender, normalizeAgeRange, normalizeShowMe } from "./prefs";

const HOUR_MS = 60 * 60 * 1000;

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0).slice(0, max);
}

function quickAnswers(value: unknown): QuickAnswer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is QuickAnswer =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as QuickAnswer).questionId === "string" &&
        typeof (item as QuickAnswer).answer === "string"
    )
    .slice(0, 6)
    .map(({ questionId, answer }) => ({ questionId, answer }));
}

const BASIC_TEXT_KEYS = ["education", "work", "religion", "diet", "drinking", "smoking"] as const;

/** Public "basics", keeping only well-formed values. */
export function sanitizeBasics(value: unknown): ProfileBasics {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const basics: ProfileBasics = {};
  if (typeof raw.heightCm === "number" && Number.isFinite(raw.heightCm) && raw.heightCm >= 120 && raw.heightCm <= 230) {
    basics.heightCm = Math.round(raw.heightCm);
  }
  for (const key of BASIC_TEXT_KEYS) {
    const item = raw[key];
    if (typeof item === "string" && item.trim() && item.length <= 60) basics[key] = item.trim();
  }
  return basics;
}

/** Joined within the "new here" window. Future or missing times never count. */
export function isNewMember(createdAt: number | undefined, now = Date.now()): boolean {
  if (typeof createdAt !== "number" || !createdAt) return false;
  const age = now - createdAt;
  return age >= 0 && age < SPARKS.newMemberHours * HOUR_MS;
}

/**
 * Builds the server-only discovery index entry for a user from their public
 * profile, private settings and moderation state.
 */
export function buildDiscoveryEntry(
  uid: string,
  profile: Partial<PublicProfile> | undefined,
  settings: UserSettings | undefined,
  moderation: ModerationRecord | undefined,
  now = Date.now()
): DiscoveryEntry {
  const diwaliPlan = normalizeDiwaliPlan(settings?.diwaliPlan, now);
  const gender = isGender(profile?.gender) ? profile!.gender! : null;
  const rawAge = profile?.age;
  const age =
    typeof rawAge === "number" && rawAge >= MIN_AGE && rawAge <= MAX_AGE ? Math.floor(rawAge) : null;
  const photos = stringList(profile?.photoUrls, 6);
  const hidden = moderation?.status !== undefined && moderation.status !== "ok";
  const { ageMin, ageMax } = normalizeAgeRange(settings?.ageMin, settings?.ageMax);
  const location =
    settings?.locationEnabled && isValidLatLng(settings.location) ? coarsen(settings.location) : null;
  const garbaNights = upcomingGarbaNights(settings?.garbaNights);
  const maxDistanceKm =
    typeof settings?.maxDistanceKm === "number" && settings.maxDistanceKm > 0
      ? settings.maxDistanceKm
      : null;

  return {
    uid,
    city: diwaliCityKey(profile?.city),
    diwali: diwaliPlan ? DIWALI_SEASON.id : null,
    diwaliPlan,
    workSector: isWorkSector(profile?.workSector) ? profile.workSector : null,
    // Photos are optional: profiles without one are shown, just ranked lower.
    visible: Boolean(
      profile &&
        profile.isDiscoverable !== false &&
        profile.onboardingComplete === true &&
        gender &&
        age !== null &&
        !hidden
    ),
    cohort: moderation?.cohort === "test" ? "test" : "public",
    gender,
    age,
    showMe: normalizeShowMe(settings?.showMe),
    ageMin,
    ageMax,
    maxDistanceKm,
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    interests: stringList(profile?.interests, 20),
    vibes: stringList(profile?.vibes, 10),
    intentions: stringList(profile?.intentions, 4),
    casual: settings?.openToCasual === true,
    hasPhoto: photos.length > 0,
    languages: stringList(profile?.languages, 6),
    sameIntentOnly: settings?.sameIntentOnly === true,
    sharedLanguageOnly: settings?.sharedLanguageOnly === true,
    incognito: settings?.incognito === true,
    privatePhotos: settings?.privatePhotos === true,
    requireNote: settings?.requireNote === true,
    ageGap: eligibleAgeGap(settings?.ageGap, age),
    garba: garbaNights.length ? activeGarbaSeason()?.id ?? null : null,
    garbaNights,
    createdAt: typeof profile?.createdAt === "number" && Number.isFinite(profile.createdAt) ? profile.createdAt : 0,
    presenceHidden: settings?.showPresence === false,
    lastActiveAt: typeof profile?.lastActiveAt === "number" ? profile.lastActiveAt : 0
  };
}

/** What the matchmaker compares: the viewer's own choices. */
export function viewerTraits(entry: DiscoveryEntry, profile: Partial<PublicProfile> | undefined): Traits {
  return {
    interests: entry.interests ?? [],
    vibes: entry.vibes ?? [],
    intentions: entry.intentions ?? stringList(profile?.intentions, 4),
    quickAnswers: quickAnswers(profile?.quickAnswers),
    casual: entry.casual === true
  };
}

/**
 * Shapes a candidate for the client. Only public profile fields are returned;
 * distance comes from the coarsened index location and is rounded to whole km.
 * Photos are left out for members who keep them private until a match, unless
 * `revealPhotos` (the viewer is already matched with them).
 */
export function toDiscoverProfile(
  profile: Partial<PublicProfile>,
  entry: DiscoveryEntry,
  viewerLocation: LatLng | null,
  superLikedYou: boolean,
  viewer: Traits,
  now = Date.now(),
  revealPhotos = false
): DiscoverProfile | null {
  if (!profile.displayName || !isGender(profile.gender) || typeof profile.age !== "number") {
    return null;
  }
  const candidateLocation = candidateLatLng(entry);
  const km =
    viewerLocation && candidateLocation
      ? displayDistanceKm(distanceKm(viewerLocation, candidateLocation))
      : null;
  // Members who hide their activity never show "Active today" (nor does the matchmaker mention it).
  const lastActive = entry.presenceHidden !== true && typeof profile.lastActiveAt === "number" ? profile.lastActiveAt : 0;
  const interests = stringList(profile.interests, 20);
  const vibes = stringList(profile.vibes, 10);
  const intentions = stringList(profile.intentions, 4);
  const answers = quickAnswers(profile.quickAnswers);
  const photosPrivate = entry.privatePhotos === true && !revealPhotos;
  const insight = matchInsight(
    viewer,
    { interests, vibes, intentions, quickAnswers: answers, casual: entry.casual === true, distanceKm: km, lastActiveAt: lastActive },
    now
  );

  return {
    uid: entry.uid,
    displayName: profile.displayName,
    age: profile.age,
    gender: profile.gender,
    pronouns: profile.pronouns || undefined,
    city: profile.city || undefined,
    bio: profile.bio || undefined,
    photoUrls: photosPrivate ? [] : stringList(profile.photoUrls, 6),
    interests,
    intentions,
    vibes,
    quickAnswers: answers,
    languages: stringList(profile.languages, 6),
    basics: sanitizeBasics(profile.basics),
    ...(isWorkSector(profile.workSector) ? { workSector: profile.workSector } : {}),
    // Rounded to the hour: enough for "Active today" without exposing exact habits.
    lastActiveAt: Math.floor(lastActive / HOUR_MS) * HOUR_MS,
    distanceKm: km,
    superLikedYou,
    requiresNote: entry.requireNote === true,
    photosPrivate,
    isNew: isNewMember(entry.createdAt, now),
    ...insight
  };
}
