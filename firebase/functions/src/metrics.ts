import { DocumentSnapshot, FieldValue, Query, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { adminAuth, db } from "./admin";
import { REGION } from "./config";
import { deviceKey, istDay, isBot, METRICS_SHARDS, pageKey, sourceKey } from "./lib/metrics";
import { readRevenueMetrics } from "./revenue";

/**
 * Page views from www.paire.in (sent through the site's own /v/ address). Counts
 * only: one sharded daily document gets +1 for the page, source and device.
 */
export const trackVisit = onRequest({ region: REGION, maxInstances: 10, memory: "256MiB" }, async (request, response) => {
  response.set("Cache-Control", "no-store");
  if (request.method !== "POST") { response.sendStatus(405); return; }
  const userAgent = request.get("user-agent");
  let body: Record<string, unknown> = {};
  try {
    const raw = typeof request.body === "string" ? request.body : request.rawBody?.toString("utf8") ?? "";
    if (raw.length > 2000) { response.sendStatus(413); return; }
    body = typeof request.body === "object" && request.body && !Buffer.isBuffer(request.body) ? request.body : JSON.parse(raw || "{}");
  } catch { response.sendStatus(400); return; }
  if (isBot(userAgent)) { response.sendStatus(204); return; }
  const day = istDay();
  const page = pageKey(body.p);
  const source = sourceKey({ utm: body.s, referrer: body.r, fbclid: body.f, gclid: body.g });
  const shard = Math.floor(Math.random() * METRICS_SHARDS);
  const firstToday = body.n === 1;
  await db.doc(`metricsDays/${day}_${shard}`).set({
    day,
    views: FieldValue.increment(1),
    ...(firstToday ? { visitors: FieldValue.increment(1) } : {}),
    pages: { [page]: FieldValue.increment(1) },
    ...(firstToday ? { sources: { [source]: FieldValue.increment(1) }, devices: { [deviceKey(userAgent as string)]: FieldValue.increment(1) } } : {})
  }, { merge: true });
  response.sendStatus(204);
});

type Counts = Record<string, number>;
const addInto = (target: Counts, source: unknown) => {
  if (!source || typeof source !== "object") return;
  for (const [key, value] of Object.entries(source as Counts)) if (typeof value === "number") target[key] = (target[key] ?? 0) + value;
};
const top = (counts: Counts, limit = 10) => Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));
const count = async (query: Query) => (await query.count().get()).data().count;

/**
 * The open dashboard at www.paire.in/metrics?key=admin. No sign-in (owner's
 * call). Totals, plus first names of the newest sign-ups and logins; never
 * emails or ids. Answers are reused for a minute so
 * repeated loads don't re-read every account.
 */
let cached: { at: number; value: Promise<Record<string, unknown>> } | undefined;
export const getMetrics = onCall({ region: REGION, memory: "512MiB", timeoutSeconds: 60, maxInstances: 2 }, async (request) => {
  if ((request.data as { key?: unknown } | null)?.key !== "admin") throw new HttpsError("not-found", "Not found.");
  if (!cached || Date.now() - cached.at > 60_000) {
    const value = buildMetrics();
    cached = { at: Date.now(), value };
    value.catch(() => { if (cached?.value === value) cached = undefined; });
  }
  return cached.value;
});

async function buildMetrics(): Promise<Record<string, unknown>> {
  const now = Date.now();
  const days = Array.from({ length: 30 }, (_, i) => istDay(now - (29 - i) * 86_400_000));
  const dayMs = 86_400_000;

  // Visits
  const visitDocs = await db.collection("metricsDays").where("day", ">=", days[0]).get();
  const daily = Object.fromEntries(days.map((day) => [day, { views: 0, visitors: 0, signups: 0 }]));
  const pages: Counts = {}, sources: Counts = {}, devices: Counts = {};
  for (const doc of visitDocs.docs) {
    const row = daily[doc.get("day")];
    if (!row) continue;
    row.views += doc.get("views") ?? 0;
    row.visitors += doc.get("visitors") ?? 0;
    addInto(pages, doc.get("pages")); addInto(sources, doc.get("sources")); addInto(devices, doc.get("devices"));
  }

  // Accounts (Firebase Auth), without the shared test accounts
  const testUids = new Set((await db.collection("moderation").where("cohort", "==", "test").get()).docs.map((doc) => doc.id));
  const excludedReturnUids = new Set(testUids);
  const returning = { signIns24h: 0, signIns7d: 0, active24h: 0, active7d: 0 };
  const accounts = { total: 0, google: 0, email: 0, emailConfirmed: 0, signedInToday: 0, signedIn7d: 0, new7d: 0 };
  type Person = { uid: string; at: number; via: "Google" | "Email"; authName?: string };
  const newPeople: Person[] = [], seenPeople: Person[] = [];
  let pageToken: string | undefined;
  let pagesRead = 0;
  do {
    const batch = await adminAuth().listUsers(1000, pageToken);
    for (const user of batch.users) {
      if (testUids.has(user.uid) || user.uid.startsWith("support_")) continue;
      accounts.total++;
      if (user.providerData.some((provider) => provider.providerId === "google.com")) accounts.google++;
      else accounts.email++;
      if (user.emailVerified) accounts.emailConfirmed++;
      const created = Date.parse(user.metadata.creationTime);
      const seen = Date.parse(user.metadata.lastRefreshTime || user.metadata.lastSignInTime || "");
      if (user.customClaims?.moderator === true || user.disabled) excludedReturnUids.add(user.uid);
      const signedIn = Date.parse(user.metadata.lastSignInTime || "");
      if (!excludedReturnUids.has(user.uid) && signedIn - created >= dayMs) {
        if (signedIn <= now && now - signedIn < dayMs) returning.signIns24h++;
        if (signedIn <= now && now - signedIn < 7 * dayMs) returning.signIns7d++;
      }
      const person = { uid: user.uid, via: user.providerData.some((provider) => provider.providerId === "google.com") ? "Google" as const : "Email" as const, authName: user.displayName };
      if (now - created < 7 * dayMs) newPeople.push({ ...person, at: created });
      if (now - seen < dayMs) seenPeople.push({ ...person, at: seen });
      if (now - seen < dayMs) accounts.signedInToday++;
      if (now - seen < 7 * dayMs) accounts.signedIn7d++;
      if (now - created < 7 * dayMs) accounts.new7d++;
      const row = daily[istDay(created)];
      if (row) row.signups++;
    }
    pageToken = batch.pageToken;
  } while (pageToken && ++pagesRead < 50);

  // Newest sign-ups and recent logins, by first name (as members see it in the app)
  newPeople.sort((a, b) => b.at - a.at).splice(30);
  seenPeople.sort((a, b) => b.at - a.at).splice(30);
  const listed = [...new Set([...newPeople, ...seenPeople].map((person) => person.uid))];
  const profileOf = new Map(listed.length ? (await db.getAll(...listed.map((uid) => db.doc(`users/${uid}`)))).map((doc) => [doc.id, doc]) : []);
  const firstName = (name: unknown) => (typeof name === "string" ? name.trim().split(/\s+/)[0] : "") || "";
  const describe = (person: Person) => {
    const profile = profileOf.get(person.uid);
    const has = profile?.exists === true;
    return {
      name: firstName(has ? profile.get("displayName") : "") || firstName(person.authName) || "No name yet",
      gender: has ? (profile.get("gender") ?? null) : null,
      city: has ? (profile.get("city") ?? null) : null,
      profile: has && profile.get("onboardingComplete") === true,
      via: person.via,
      at: person.at
    };
  };

  // Profiles and activity (Firestore counts), minus test accounts
  const users = db.collection("users");
  const testDocs = testUids.size ? (await db.getAll(...[...testUids].map((uid) => users.doc(uid)))).filter((doc) => doc.exists) : [];
  const testCount = (predicate: (doc: DocumentSnapshot) => boolean) => testDocs.filter(predicate).length;
  const since = (ms: number) => now - ms;
  const [profiles, women, men, active24h, active7d, verified] = await Promise.all([
    count(users),
    count(users.where("gender", "==", "woman")),
    count(users.where("gender", "==", "man")),
    count(users.where("lastActiveAt", ">=", since(dayMs))),
    count(users.where("lastActiveAt", ">=", since(7 * dayMs))),
    count(db.collection("moderation").where("verification.status", "==", "verified"))
  ]);
  const activeMembers = await users.where("lastActiveAt", ">=", since(7 * dayMs)).select("createdAt", "lastActiveAt").get();
  for (const doc of activeMembers.docs) {
    if (excludedReturnUids.has(doc.id) || doc.id.startsWith("support_")) continue;
    const active = Number(doc.get("lastActiveAt"));
    const created = Number(doc.get("createdAt"));
    if (active <= now && active - created >= dayMs) {
      returning.active7d++;
      if (now - active < dayMs) returning.active24h++;
    }
  }
  const revenue = await readRevenueMetrics(now, testUids);
  const [matches, matches24h, messages, swipes] = await Promise.all([
    count(db.collection("matches")),
    count(db.collection("matches").where("createdAt", ">=", Timestamp.fromMillis(since(dayMs)))),
    count(db.collectionGroup("messages")),
    count(db.collectionGroup("outgoing"))
  ]);
  const [pushBrowsers, reminderDays] = await Promise.all([
    count(db.collection("webPushSubscriptions")),
    db.collection("notificationStats").where("__name__", ">=", days[23]).get()
  ]);
  const notifications = { browsers: pushBrowsers, attempts7d: 0, acceptedMembers7d: 0, acceptedPushes7d: 0, opens7d: 0 };
  for (const doc of reminderDays.docs) {
    notifications.attempts7d += Number(doc.get("attempts")) || 0;
    notifications.acceptedMembers7d += Number(doc.get("acceptedMembers")) || 0;
    notifications.acceptedPushes7d += Number(doc.get("acceptedPushes")) || 0;
    notifications.opens7d += Number(doc.get("opens")) || 0;
  }

  return {
    generatedAt: now,
    visits: {
      today: daily[days[29]],
      last7: days.slice(23).reduce((sum, day) => ({ views: sum.views + daily[day].views, visitors: sum.visitors + daily[day].visitors }), { views: 0, visitors: 0 }),
      daily: days.map((day) => ({ day, ...daily[day] })),
      pages: top(pages), sources: top(sources), devices: top(devices)
    },
    accounts,
    returning,
    notifications,
    people: { newSignups: newPeople.map(describe), recentLogins: seenPeople.map(describe) },
    profiles: {
      total: profiles - testDocs.length,
      women: women - testCount((doc) => doc.get("gender") === "woman"),
      men: men - testCount((doc) => doc.get("gender") === "man"),
      active24h: active24h - testCount((doc) => doc.get("lastActiveAt") >= since(dayMs)),
      active7d: active7d - testCount((doc) => doc.get("lastActiveAt") >= since(7 * dayMs)),
      verified
    },
    activity: { matches, matches24h, messages, swipes },
    ...revenue,
    testAccounts: testUids.size
  };
}
