import { getFirestore } from "firebase-admin/firestore";
import { getMetrics } from "../src/metrics";
import { DUET_EVENTS, istDay } from "../src/lib/metrics";

const db = getFirestore();
const host = process.env.MUSE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1:15001";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host) || process.env.GCLOUD_PROJECT !== "demo-muse") throw Error("Loopback demo-muse only");
const endpoint = `http://${host}/demo-muse/us-central1/trackVisit`;
const send = (body: unknown) => fetch(endpoint, { method: "POST", headers: { "content-type": "text/plain", "user-agent": "Mozilla/5.0 Paire QA" }, body: JSON.stringify(body) });
const today = istDay();
const rows = () => db.collection("metricsDays").where("day", "==", today).get();
const total = (docs: FirebaseFirestore.QuerySnapshot, field: string) => docs.docs.reduce((n, doc) => n + (Number(doc.get(field)) || 0), 0);

test("planner events count actions only, whitelist the page/event and never persist supplied choices", async () => {
  const before = await rows();
  for (const e of DUET_EVENTS) expect((await send({ p: "/date-duet/", e, n: 1, a: { email: "never-store@example.com" } })).status).toBe(204);
  const after = await rows();
  for (const e of DUET_EVENTS) expect(total(after, `dateDuet.${e}`) - total(before, `dateDuet.${e}`)).toBe(1);
  expect(total(after, "views")).toBe(total(before, "views"));
  expect(total(after, "visitors")).toBe(total(before, "visitors"));
  expect(JSON.stringify(after.docs.map(doc => doc.data()))).not.toContain("never-store@example.com");
  for (const body of [{ p: "/", e: "duet_created" }, { p: "/date-duet/", e: "invented" }, { p: "/date-duet/", e: { hacked: true } }]) expect((await send(body)).status).toBe(400);
  const rejected = await rows();
  expect(total(rejected, "dateDuet.duet_created")).toBe(total(after, "dateDuet.duet_created"));
  expect((await send({ p: "/date-duet/#d=private-choices", n: 1 })).status).toBe(204);
  const pageView = await rows();
  expect(total(pageView, "views") - total(after, "views")).toBe(1);
  expect(total(pageView, "pages.date-duet") - total(after, "pages.date-duet")).toBe(1);
  expect(JSON.stringify(pageView.docs.map(doc => doc.data()))).not.toContain("private-choices");
});

test("owner dashboard uses seven IST calendar days, excluding older and future events", async () => {
  const now = Date.now(), id = `duet_qa_${now}`;
  const fixtures = [[6, 3], [7, 100], [-1, 200]];
  const refs = fixtures.map(([days]) => db.doc(`metricsDays/${id}_${days}`));
  try {
    const before = await rows();
    await Promise.all(refs.map((ref, i) => ref.set({ day: istDay(now - fixtures[i][0] * 86400000), dateDuet: { duet_created: fixtures[i][1] } })));
    const result = await getMetrics.run({ data: { key: "admin" }, rawRequest: {}, acceptsStreaming: false } as never);
    expect((result.dateDuet as Record<string, number>).duet_created).toBe(total(before, "dateDuet.duet_created") + 3);
    expect(Object.keys(result.dateDuet as object).sort()).toEqual([...DUET_EVENTS].sort());
  } finally { await Promise.all(refs.map(ref => ref.delete())); }
});
