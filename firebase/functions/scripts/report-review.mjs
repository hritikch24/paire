/** Private operator tool. Tokens require the moderator:true Firebase custom claim. */
const token = process.env.MUSE_MODERATOR_ID_TOKEN;
const project = process.env.GCLOUD_PROJECT;
const region = process.env.FUNCTIONS_REGION || "us-central1";
const args = process.argv.slice(2);
const allowed = new Set(["--emulator", "--reviewing", "--close", "--outcome", "--action", "--note", "--cursor"]);
if (!token || !project || !/^[a-z0-9-]+$/.test(project) || !/^[a-z0-9-]+$/.test(region)) throw new Error("Set GCLOUD_PROJECT and MUSE_MODERATOR_ID_TOKEN for a moderator account.");
const options = {};
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!allowed.has(key) || key in options) throw new Error(`Unknown or repeated option: ${key}`);
  if (key === "--emulator") options[key] = true;
  else {
    if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing value for ${key}`);
    options[key] = args[++i];
  }
}
if (options["--emulator"] && !project.startsWith("demo-")) throw new Error("--emulator requires a demo project.");
if (options["--reviewing"] && options["--close"]) throw new Error("Choose reviewing or close.");
let name = "getReportReviewQueue";
let data = options["--cursor"] ? { cursor: JSON.parse(options["--cursor"]) } : {};
const id = options["--reviewing"] || options["--close"];
if (id) {
  if (!/^[A-Za-z0-9]{20}$/.test(id) || !options["--note"]) throw new Error("Supply a valid report reference and a private --note.");
  if (options["--cursor"]) throw new Error("A review cannot have a queue cursor.");
  name = "reviewReport";
  data = { reportId: id, status: options["--close"] ? "closed" : "reviewing", action: options["--action"] || "none", note: options["--note"], ...(options["--outcome"] ? { outcome: options["--outcome"] } : {}) };
} else if (options["--outcome"] || options["--action"] || options["--note"]) throw new Error("Decision options need --reviewing or --close.");
const origin = options["--emulator"] ? `http://127.0.0.1:5001/${project}/${region}` : `https://${region}-${project}.cloudfunctions.net`;
const response = await fetch(`${origin}/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(30000) });
const body = await response.json();
if (!response.ok || body.error) throw new Error(body.error?.message || "Report review request failed.");
console.log(JSON.stringify(body.result ?? body.data, null, 2));
