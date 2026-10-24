import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { LIMITS, REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { garbaNightLabel, sharedGarbaNights } from "./lib/garba";
import { AiProvider, aiProvider, askAiForJson, cleanLines, llmEnabled } from "./lib/llm";
import { sharedDiwaliPlans, DIWALI_LABELS } from "./lib/diwali";
import { Person, describe, diwaliOpener, garbaOpener, templateBios, templateGroupOpeners, templateOpeners } from "./lib/suggestions";
import { parseMatchInput } from "./lib/validate";
import { consumeDailyQuota } from "./quota";
import { PublicProfile, QuickAnswer } from "./types";

type Suggestions = { suggestions: string[]; source: AiProvider | "muse" };

function toPerson(profile: Partial<PublicProfile> | undefined): Person {
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    name: typeof profile?.displayName === "string" ? profile.displayName : "",
    interests: list(profile?.interests),
    vibes: list(profile?.vibes),
    intentions: list(profile?.intentions),
    quickAnswers: Array.isArray(profile?.quickAnswers) ? (profile!.quickAnswers as QuickAnswer[]) : [],
    bio: typeof profile?.bio === "string" ? profile.bio : undefined,
    city: typeof profile?.city === "string" ? profile.city : undefined
  };
}

const OPENERS_SYSTEM =
  "You write opening messages for Paire, a dating app. Write 3 different first messages the sender could send " +
  "to their new match. Each must be friendly, specific to the details given (shared interests, their answers " +
  "or bio), under 140 characters, and end with an easy question. Never mention looks, bodies, sex or anything " +
  "suggestive; never be pushy or negging. Mix styles: one playful, one curious, one warm. Use at most one emoji " +
  'in total. Reply with JSON only: {"suggestions": ["...", "...", "..."]}';

const GROUP_OPENERS_SYSTEM =
  "You write opening messages for a Duo chat on Paire, a dating app: two friends matched with another pair of " +
  "friends. Write 3 different first messages the sender could send to the whole group, friendly and specific to " +
  "what the other pair share (interests, vibes), under 140 characters, each ending with an easy question for " +
  "everyone. Suggest group-friendly plans. Never mention looks, bodies, sex or anything suggestive. At most one " +
  'emoji in total. Reply with JSON only: {"suggestions": ["...", "...", "..."]}';

const BIOS_SYSTEM =
  "You help people write the bio on their Paire dating profile. Write 3 different first-person bios from the " +
  "details given, each under 180 characters: one playful, one sincere, one short and punchy. Sound like a real " +
  "person, not an advert. Don't invent facts beyond the details, nothing suggestive, at most one emoji each. " +
  'Reply with JSON only: {"suggestions": ["...", "...", "..."]}';

/** Three icebreakers for an active match, written for the caller to send. */
export const suggestOpeners = onCall({ region: REGION, timeoutSeconds: 30, secrets: ["ANTHROPIC_API_KEY"] }, async (request): Promise<Suggestions> => {
  const uid = requireAuth(request);
  const { matchId } = parseMatchInput(request.data);
  const matchSnap = await db.doc(`matches/${matchId}`).get();
  const participants = (matchSnap.get("participants") as string[] | undefined) ?? [];
  if (!matchSnap.exists || !participants.includes(uid) || matchSnap.get("active") === false) {
    throw new HttpsError("permission-denied", "This chat isn't available.");
  }
  const other = participants.find((participant) => participant !== uid);
  if (!other) throw new HttpsError("failed-precondition", "This chat isn't available.");
  await consumeDailyQuota(uid, "aiOpeners", LIMITS.aiOpenersPerDay);

  if (matchSnap.get("kind") === "duo") {
    // Written for the other pair; the sender's own Duo partner is left out.
    const sides = (matchSnap.get("sides") as Record<string, string[]> | undefined) ?? {};
    const theirs = Object.values(sides).find((members) => !members.includes(uid)) ?? [];
    const snaps = await db.getAll(...[uid, ...theirs].map((member) => db.doc(`users/${member}`)));
    const [me, ...them] = snaps.map((snap) => toPerson(snap.data() as Partial<PublicProfile> | undefined));
    if (llmEnabled() && them.length) {
      const reply = await askAiForJson(
        GROUP_OPENERS_SYSTEM,
        `Sender:\n${describe({ ...me, bio: undefined, city: undefined })}\n\nThe other pair:\n${them
          .map((person) => describe({ ...person, city: undefined }))
          .join("\n\n")}`
      );
      const suggestions = cleanLines((reply as { suggestions?: unknown } | null)?.suggestions, 3, 180);
      if (suggestions.length === 3) return { suggestions, source: aiProvider() ?? "muse" };
    }
    return { suggestions: templateGroupOpeners(me, them), source: "muse" };
  }

  const [meSnap, themSnap, mySettings, theirSettings] = await db.getAll(
    db.doc(`users/${uid}`),
    db.doc(`users/${other}`),
    db.doc(`users/${uid}/private/settings`),
    db.doc(`users/${other}/private/settings`)
  );
  const me = toPerson(meSnap.data() as Partial<PublicProfile> | undefined);
  const them = toPerson(themSnap.data() as Partial<PublicProfile> | undefined);
  // A Garba night both picked: only named to two people who already matched.
  const garba = sharedGarbaNights(mySettings.get("garbaNights"), theirSettings.get("garbaNights")).map(garbaNightLabel);

  // Activities both picked for Diwali; dates stay private even between matches.
  const diwali = sharedDiwaliPlans(mySettings.get("diwaliPlan"), theirSettings.get("diwaliPlan"))?.vibes ?? [];

  if (llmEnabled()) {
    const reply = await askAiForJson(
      OPENERS_SYSTEM,
      `Sender:\n${describe({ ...me, bio: undefined, city: undefined })}\n\nTheir match:\n${describe(them)}` +
        (garba.length ? `\n\nThey're both going to Garba this Navratri on: ${garba.join(", ")}. Make one message about meeting up for Garba or Dandiya.` : "") +
        (diwali.length ? `\n\nThey both said they'd like Diwali company: ${diwali.map((vibe) => DIWALI_LABELS[vibe]).join(", ")}. Make one message suggesting a public, easy plan like that. Don't mention dates.` : "")
    );
    const suggestions = cleanLines((reply as { suggestions?: unknown } | null)?.suggestions, 3, 180);
    if (suggestions.length === 3) return { suggestions, source: aiProvider() ?? "muse" };
  }
  const templates = templateOpeners(me, them);
  const themed = [...(garba.length ? [garbaOpener(them, garba[0])] : []), ...(diwali.length ? [diwaliOpener(them, diwali[0])] : [])];
  return { suggestions: themed.length ? [...themed, ...templates].slice(0, 3) : templates, source: "muse" };
});

/** Three bio drafts from the caller's own profile choices. */
export const suggestBio = onCall({ region: REGION, timeoutSeconds: 30, secrets: ["ANTHROPIC_API_KEY"] }, async (request): Promise<Suggestions> => {
  const uid = requireAuth(request);
  await consumeDailyQuota(uid, "aiBios", LIMITS.aiBiosPerDay);
  const snap = await db.doc(`users/${uid}`).get();
  const me = toPerson(snap.data() as Partial<PublicProfile> | undefined);

  if (llmEnabled()) {
    const reply = await askAiForJson(BIOS_SYSTEM, describe({ ...me, bio: undefined }));
    const suggestions = cleanLines((reply as { suggestions?: unknown } | null)?.suggestions, 3, 220);
    if (suggestions.length === 3) return { suggestions, source: aiProvider() ?? "muse" };
  }
  return { suggestions: templateBios(me), source: "muse" };
});
