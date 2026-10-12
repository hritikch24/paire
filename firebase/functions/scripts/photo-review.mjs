/** Moderator tool. Supply a current Firebase ID token for an account with moderator:true. */
const token = process.env.MUSE_MODERATOR_ID_TOKEN;
const project = process.env.GCLOUD_PROJECT;
const region = process.env.FUNCTIONS_REGION || "us-central1";
const args = process.argv.slice(2);
if (!token || !project || !/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(region)) throw new Error("Set GCLOUD_PROJECT and MUSE_MODERATOR_ID_TOKEN. The token must have moderator:true.");
const emulator = args.includes("--emulator");
if (emulator && !project.startsWith("demo-")) throw new Error("--emulator requires a demo project.");
const origin = emulator ? `http://127.0.0.1:5001/${project}/${region}` : `https://${region}-${project}.cloudfunctions.net`;
const command = args.find((arg) => arg === "--approve" || arg === "--reject");
let name = "getPhotoReviewQueue"; let data = {};
if (command) {
  const sessionId = args[args.indexOf(command) + 1];
  if (!sessionId || !/^[a-f0-9-]{36}$/.test(sessionId)) throw new Error("Provide a session ID.");
  const approve = command === "--approve";
  if (approve && (!args.includes("--reviewed-all-photos") || !args.includes("--authentic-photos"))) throw new Error("Compare every frozen photo against the live session and assess authenticity before providing both attestations.");
  name = "reviewPhotoVerification";
  data = { sessionId, approve, reviewedAllPhotos: args.includes("--reviewed-all-photos"), authenticPhotos: args.includes("--authentic-photos") };
}
const response = await fetch(`${origin}/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30000) });
const body = await response.json();
if (!response.ok || body.error) throw new Error(body.error?.message || "Review request failed.");
console.log(JSON.stringify(body.result ?? body.data, null, 2));
