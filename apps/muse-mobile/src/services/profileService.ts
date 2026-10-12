import { doc, getDoc, setDoc, updateDoc } from "@firebase/firestore/dist/index.cjs.js";
import { Gender, PrivateInfo, QuickAnswer, UserProfile, UserSettings } from "../types/models";
import { ageFromBirthDate } from "../utils/age";
import { defaultSettings } from "../utils/profile";
import { db } from "./firebase";

const profileRef = (uid: string) => doc(db, "users", uid);
const settingsRef = (uid: string) => doc(db, "users", uid, "private", "settings");
const infoRef = (uid: string) => doc(db, "users", uid, "private", "info");

/** Fields a member may edit after onboarding. */
export type ProfileEdits = Partial<
  Pick<
    UserProfile,
    | "displayName"
    | "age"
    | "gender"
    | "pronouns"
    | "city"
    | "bio"
    | "photoUrls"
    | "interests"
    | "intentions"
    | "vibes"
    | "languages"
    | "basics"
    | "isDiscoverable"
    | "onboardingComplete"
    | "safetyConfirmed"
  > & { quickAnswers: QuickAnswer[] }
>;

export type BasicsInput = {
  displayName: string;
  birthDate: string;
  gender: Gender;
  showMe: Gender[];
};

/**
 * First onboarding step. Writes a complete, rules-valid profile document
 * (replacing any legacy fields), the private birth date, and default
 * discovery preferences the first time.
 */
export async function saveBasics(
  uid: string,
  input: BasicsInput,
  existing: UserProfile | null,
  existingSettings: UserSettings | null
): Promise<UserProfile> {
  const now = Date.now();
  const age = ageFromBirthDate(input.birthDate);
  const profile: UserProfile = {
    uid,
    displayName: input.displayName.trim(),
    age,
    gender: input.gender,
    pronouns: existing?.pronouns ?? "",
    city: existing?.city ?? "",
    bio: existing?.bio ?? "",
    photoUrls: existing?.photoUrls ?? [],
    interests: existing?.interests ?? [],
    intentions: existing?.intentions ?? [],
    vibes: (existing?.vibes ?? []).slice(0, 3),
    quickAnswers: existing?.quickAnswers ?? [],
    ...(existing?.languages?.length ? { languages: existing.languages } : {}),
    ...(existing?.basics ? { basics: existing.basics } : {}),
    isDiscoverable: existing?.isDiscoverable ?? true,
    onboardingComplete: existing?.onboardingComplete ?? false,
    safetyConfirmed: existing?.safetyConfirmed ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastActiveAt: now
  };

  await setDoc(infoRef(uid), { birthDate: input.birthDate, updatedAt: now }, { merge: true });
  const settings = existingSettings
    ? { showMe: input.showMe, updatedAt: now }
    : { ...defaultSettings(age, input.showMe), updatedAt: now };
  await setDoc(settingsRef(uid), settings, { merge: true });
  // A full write (no merge) also drops fields from older app versions that the rules no longer allow.
  await setDoc(profileRef(uid), profile);
  return profile;
}

export async function updateProfile(uid: string, edits: ProfileEdits): Promise<void> {
  await updateDoc(profileRef(uid), { ...edits, updatedAt: Date.now() });
}

export async function updateSettings(uid: string, edits: Partial<UserSettings>): Promise<void> {
  await setDoc(settingsRef(uid), { ...edits, updatedAt: Date.now() }, { merge: true });
}

export async function updatePrivateInfo(uid: string, edits: Partial<PrivateInfo>): Promise<void> {
  await setDoc(infoRef(uid), { ...edits, updatedAt: Date.now() }, { merge: true });
}

/** Keeps the public age in step with the private birth date (e.g. after a birthday). */
export async function refreshAgeIfNeeded(uid: string, profile: UserProfile, info: PrivateInfo | null) {
  if (!info?.birthDate) return;
  const age = ageFromBirthDate(info.birthDate);
  if (age !== profile.age && age >= 18 && age <= 100) {
    await updateDoc(profileRef(uid), { age, updatedAt: Date.now() });
  }
}

export async function touchLastActive(uid: string): Promise<void> {
  const now = Date.now();
  await updateDoc(profileRef(uid), { lastActiveAt: now, updatedAt: now });
}

export type SafetyPlan = { dateLocation: string; dateTime: string; notes: string };

const safetyPlanRef = (uid: string) => doc(db, "users", uid, "private", "safetyPlan");

export async function loadSafetyPlan(uid: string): Promise<SafetyPlan | null> {
  const snapshot = await getDoc(safetyPlanRef(uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  return { dateLocation: data.dateLocation ?? "", dateTime: data.dateTime ?? "", notes: data.notes ?? "" };
}

export async function saveSafetyPlan(uid: string, plan: SafetyPlan): Promise<void> {
  await setDoc(
    safetyPlanRef(uid),
    {
      dateLocation: plan.dateLocation.trim(),
      dateTime: plan.dateTime.trim(),
      notes: plan.notes.trim(),
      updatedAt: Date.now()
    },
    { merge: true }
  );
}
