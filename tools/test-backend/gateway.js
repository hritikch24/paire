/**
 * Muse test-server gateway.
 *
 * The only way in to the Firebase emulators when they are shared over a
 * Cloudflare tunnel (scripts/test-backend.sh). The emulators are developer
 * tools, not a security boundary: they accept login tokens without checking
 * signatures, their refresh tokens are plain JSON anyone can write, and "owner"
 * or any "ya29." bearer token counts as an administrator. This gateway:
 *
 *   - forwards only the endpoints the app uses; emulator admin APIs stay private
 *   - adds a random nonce to every login and refresh token the Auth emulator
 *     issues (its own are predictable: refresh tokens are the user ID in base64
 *     JSON), and accepts only tokens it sealed this way
 *   - rejects "owner" and other admin credentials
 *   - rate-limits sign-in and sign-up attempts per address
 *   - serves an invite page (and the test APK, when present) at /
 *
 * It does not make the emulators production-grade: passwords are stored readable
 * on this computer and the only backup is the local export. Test data and
 * throwaway passwords only.
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const STATE_DIR = process.env.MUSE_TEST_STATE_DIR || path.join(ROOT, ".test-backend");

const config = {
  host: process.env.GATEWAY_HOST || "127.0.0.1",
  port: Number(process.env.GATEWAY_PORT || 8787),
  project: process.env.GATEWAY_PROJECT || "demo-muse",
  region: process.env.GATEWAY_REGION || "us-central1",
  // HTTPS callable functions the app calls (firebase/functions/src/index.ts).
  callables: new Set([
    "getDiscoverFeed",
    "getLikesYou",
    "getDailyAllowance",
    "getVerificationStatus", "createCallSession", "beginPhotoVerification", "getPremiumStatus",
    "swipe",
    "undoSwipe",
    "blockUser",
    "submitReport",
    "getMyReports",
    "deleteAccount",
    "suggestOpeners",
    "suggestBio",
    "createDuoInvite",
    "cancelDuoInvite",
    "acceptDuoInvite",
    "answerDuoRequest",
    "cancelDuoRequest",
    "getDuoFeed",
    "duoSwipe",
    "undoDuoSwipe",
    "leaveDuo",
    "leaveChat",
    "getChatProfiles"
  ]),
  tokenFile: process.env.GATEWAY_TOKEN_FILE || path.join(STATE_DIR, "gateway-tokens.json"),
  apkFile: process.env.GATEWAY_APK || "",
  appScheme: process.env.GATEWAY_APP_SCHEME || "musetest",
  appPackage: process.env.GATEWAY_APP_PACKAGE || "com.muse.app.test",
  verbose: process.env.GATEWAY_LOG === "verbose",
  upstreamHost: "127.0.0.1",
  upstreams: {
    auth: Number(process.env.AUTH_EMULATOR_PORT || 9099),
    firestore: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
    functions: Number(process.env.FUNCTIONS_EMULATOR_PORT || 5001),
    storage: Number(process.env.STORAGE_EMULATOR_PORT || 9199)
  }
};

const BUCKET = `${config.project}.appspot.com`;
const DATABASE = `projects/${config.project}/databases/(default)`;
const DOCUMENTS_PATH = new RegExp(`^/v1/projects/${config.project}/databases/(\\(default\\)|%28default%29)/documents([/:]|$)`);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ID_TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // emulator ID tokens expire after 1 hour
const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

// Auth emulator endpoints the app uses. Everything else (custom-token and IdP
// sign-in, which the emulator accepts unverified; admin APIs) is refused.
const AUTH_ACTIONS = {
  signUp: { limited: true },
  signInWithPassword: { limited: true },
  lookup: { idToken: true },
  update: { idToken: true },
  delete: { idToken: true }
};

// Headers Firestore's WebChannel may pack into its handshake body.
const WEBCHANNEL_HEADERS = new Set([
  "authorization",
  "content-type",
  "x-goog-api-client",
  "x-firebase-gmpid",
  "x-firebase-appcheck",
  "google-cloud-resource-prefix",
  "x-goog-request-params",
  "x-client-protocol",
  "x-webchannel-content-type",
  "x-webchannel-client-profile"
]);

// ---------------------------------------------------------------- issued tokens

const registry = { id: new Map(), refresh: new Map() };
const digest = (token) => crypto.createHash("sha256").update(token).digest("base64url");

const REGISTRY_VERSION = 2; // 2: tokens are sealed with a nonce

function loadRegistry() {
  try {
    const saved = JSON.parse(fs.readFileSync(config.tokenFile, "utf8"));
    if (saved.version !== REGISTRY_VERSION) return; // older, unsealed tokens: sign in again
    const now = Date.now();
    for (const kind of ["id", "refresh"]) {
      for (const [hash, expiresAt] of Object.entries(saved[kind] || {})) {
        if (expiresAt > now) registry[kind].set(hash, expiresAt);
      }
    }
  } catch {
    // First run: nothing saved yet.
  }
}

let saveTimer = null;
function saveRegistrySoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const now = Date.now();
    const out = { version: REGISTRY_VERSION };
    for (const kind of ["id", "refresh"]) {
      for (const [hash, expiresAt] of registry[kind]) if (expiresAt <= now) registry[kind].delete(hash);
      out[kind] = Object.fromEntries(registry[kind]);
    }
    try {
      fs.mkdirSync(path.dirname(config.tokenFile), { recursive: true });
      const temp = `${config.tokenFile}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(out), { mode: 0o600 });
      fs.renameSync(temp, config.tokenFile);
    } catch (error) {
      log(`could not save the token registry: ${error.message}`);
    }
  }, 500);
}

function remember(kind, token) {
  if (typeof token !== "string" || token.length < 20) return;
  registry[kind].set(digest(token), Date.now() + (kind === "id" ? ID_TOKEN_TTL_MS : REFRESH_TOKEN_TTL_MS));
  saveRegistrySoon();
}

function isIssued(kind, token) {
  const expiresAt = registry[kind].get(digest(token));
  return Boolean(expiresAt && expiresAt > Date.now());
}

const nonce = () => crypto.randomBytes(16).toString("base64url");

/** Emulator ID tokens are unsigned JWTs; a random claim makes them unguessable. */
function sealIdToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    payload.gateway_nonce = nonce();
    return `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
  } catch {
    return null;
  }
}

/** Emulator refresh tokens are base64 JSON built from the user ID alone. */
function sealRefreshToken(token) {
  try {
    const record = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    if (!record || typeof record !== "object" || !record.localId) return null;
    record.gatewayNonce = nonce();
    return Buffer.from(JSON.stringify(record)).toString("base64");
  } catch {
    return null;
  }
}

/**
 * Seals the tokens in an Auth emulator response and records them as issued.
 * Tokens that can't be sealed are removed, so a predictable one never goes out.
 */
function sealIssuedTokens(json) {
  if (!json || typeof json !== "object") return false;
  let changed = false;
  const idKeys = ["idToken", "id_token", "access_token"].filter((key) => typeof json[key] === "string");
  if (idKeys.length) {
    const sealed = sealIdToken(json[idKeys[0]]); // id_token and access_token are the same token
    for (const key of idKeys) {
      if (sealed) json[key] = sealed;
      else delete json[key];
    }
    if (sealed) remember("id", sealed);
    changed = true;
  }
  for (const key of ["refreshToken", "refresh_token"]) {
    if (typeof json[key] !== "string") continue;
    const sealed = sealRefreshToken(json[key]);
    if (sealed) {
      json[key] = sealed;
      remember("refresh", sealed);
    } else {
      delete json[key];
    }
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- credentials

const stripScheme = (value) =>
  String(value)
    .trim()
    .replace(/^(bearer|firebase)\s+/i, "")
    .trim();

/**
 * Pulls credentials out of a WebChannel header blob ("Name: value" lines).
 * Returns false if the blob holds anything we don't expect, so nothing slips
 * past in a form the gateway can't read.
 */
function readHeaderBlob(blob, tokens) {
  for (const line of String(blob).split(/[\r\n]+/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) return false;
    const name = line.slice(0, separator).trim().toLowerCase();
    if (!WEBCHANNEL_HEADERS.has(name)) return false;
    if (name === "authorization") tokens.push(stripScheme(line.slice(separator + 1)));
  }
  return true;
}

function readParams(params, tokens, depth = 0) {
  for (const [rawKey, value] of params) {
    const key = rawKey.toLowerCase();
    if (key === "access_token" || key === "oauth_token") {
      tokens.push(stripScheme(value));
    } else if (key === "$httpheaders" || key === "headers") {
      if (!readHeaderBlob(value, tokens)) return false;
    } else if (key === "$req" && depth === 0) {
      if (!readParams(new URLSearchParams(value), tokens, 1)) return false;
    }
  }
  return true;
}

/** Every credential in a request: real headers, query and form parameters. */
function collectCredentials(req, url, form) {
  const tokens = [];
  if (req.headers.authorization !== undefined) tokens.push(stripScheme(req.headers.authorization));
  let readable = readParams(url.searchParams, tokens);
  if (form) readable = readParams(form, tokens) && readable;
  return { tokens: tokens.filter(Boolean), readable };
}

function checkCredentials(req, url, form) {
  const { tokens, readable } = collectCredentials(req, url, form);
  if (!readable) return denial(400, "INVALID_ARGUMENT", "Unexpected request headers.");
  for (const token of tokens) {
    if (token.toLowerCase() === "owner" || token.startsWith("ya29.")) {
      return denial(403, "PERMISSION_DENIED", "Admin credentials are not accepted here.");
    }
    if (!isIssued("id", token)) {
      return denial(401, "UNAUTHENTICATED", "Your session wasn't recognised. Please sign in again.");
    }
  }
  return null;
}

/**
 * The Firestore emulator serves any project ID it's asked for (with open rules
 * for projects that have none), so requests must name this project's database.
 */
function checkFirestoreScope(url, body, form) {
  const texts = [];
  for (const [key, value] of url.searchParams) texts.push(key, value);
  if (form) for (const [key, value] of form) texts.push(key, value);
  if (body) texts.push(body.toString("utf8"));
  for (const text of texts) {
    // JSON may spell "/" as "\/" or "\u002f"; check the unescaped form too.
    const unescaped = text
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\\//g, "/");
    for (const candidate of [text, unescaped]) {
      for (const match of candidate.matchAll(/projects\/([^/\s"'&]+)\/databases\/([^/\s"'&]+)/g)) {
        const database = `projects/${match[1]}/databases/${match[2].replace(/%28/gi, "(").replace(/%29/gi, ")")}`;
        if (database !== DATABASE) return denial(403, "PERMISSION_DENIED", "This server only serves the Muse test project.");
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- rate limits

const attempts = new Map(); // client address -> recent attempt times
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 30;

const clientAddress = (req) => String(req.headers["cf-connecting-ip"] || req.socket.remoteAddress || "unknown");

function rateLimited(req) {
  const address = clientAddress(req);
  const now = Date.now();
  const recent = (attempts.get(address) || []).filter((time) => now - time < ATTEMPT_WINDOW_MS);
  recent.push(now);
  attempts.set(address, recent);
  return recent.length > MAX_ATTEMPTS;
}

setInterval(() => {
  const now = Date.now();
  for (const [address, times] of attempts) {
    if (times.every((time) => now - time >= ATTEMPT_WINDOW_MS)) attempts.delete(address);
  }
}, ATTEMPT_WINDOW_MS).unref();

// ---------------------------------------------------------------- routing

function route(url, method) {
  const p = url.pathname;

  const authAction = p.match(/^\/identitytoolkit\.googleapis\.com\/v1\/accounts:([A-Za-z]+)$/);
  if (authAction) {
    const rule = AUTH_ACTIONS[authAction[1]];
    if (!rule || method !== "POST") return { deny: denial(403, "OPERATION_NOT_ALLOWED", "OPERATION_NOT_ALLOWED") };
    return { upstream: "auth", kind: "auth", ...rule };
  }
  if (p === "/securetoken.googleapis.com/v1/token") {
    return method === "POST" ? { upstream: "auth", kind: "refresh" } : null;
  }

  if (/^\/google\.firestore\.v1\.Firestore\/(Listen|Write)\/channel$/.test(p)) {
    return method === "GET" || method === "POST" ? { upstream: "firestore", kind: "firestore" } : null;
  }
  if (DOCUMENTS_PATH.test(p) && method === "POST") {
    return { upstream: "firestore", kind: "firestore" };
  }

  const callable = p.match(new RegExp(`^/${config.project}/${config.region}/([A-Za-z]+)$`));
  if (callable && config.callables.has(callable[1]) && method === "POST") {
    return { upstream: "functions", kind: "functions" };
  }

  const objects = `/v0/b/${BUCKET}/o`;
  if ((p === objects || p.startsWith(`${objects}/`)) && ["GET", "POST", "DELETE"].includes(method)) {
    return { upstream: "storage", kind: "storage", stream: true };
  }
  return null;
}

// ---------------------------------------------------------------- responses

function denial(status, code, message) {
  return { status, code, message };
}

function sendDenial(res, { status, code, message }, kind) {
  // Shaped like the real services' errors so the Firebase SDKs react sensibly:
  // Auth reads `message` as its error code; Firestore and Functions read `status`.
  const authCode = status === 429 ? "TOO_MANY_ATTEMPTS_TRY_LATER" : status === 401 ? "TOKEN_EXPIRED" : code;
  const body =
    kind === "auth" || kind === "refresh"
      ? { error: { code: status, message: authCode, errors: [{ message: authCode, domain: "global", reason: "invalid" }] } }
      : { error: { code: status, message, status: code } };
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJson(buffer) {
  try {
    return buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
  } catch {
    return undefined;
  }
}

/** Checks the tokens that Auth endpoints take in their bodies. */
function checkAuthBody(req, url, target, body) {
  const json = parseJson(body);
  if (target.kind === "refresh") {
    const form = new URLSearchParams(body.toString("utf8"));
    const tokens = [form.get("refresh_token"), form.get("refreshToken"), url.searchParams.get("refresh_token")];
    if (json) tokens.push(json.refresh_token, json.refreshToken);
    const presented = tokens.filter((token) => typeof token === "string" && token);
    if (!presented.length || !presented.every((token) => isIssued("refresh", token))) {
      return denial(401, "TOKEN_EXPIRED", "Your session wasn't recognised. Please sign in again.");
    }
    return null;
  }
  if (json === undefined || Array.isArray(json)) return denial(400, "INVALID_ARGUMENT", "INVALID_ARGUMENT");
  const presented = [json.idToken, json.id_token, url.searchParams.get("idToken"), url.searchParams.get("id_token")].filter(
    (token) => token !== undefined && token !== null
  );
  if (target.idToken && !presented.length) return denial(400, "MISSING_ID_TOKEN", "MISSING_ID_TOKEN");
  if (!presented.every((token) => typeof token === "string" && isIssued("id", token))) {
    return denial(401, "TOKEN_EXPIRED", "Your session wasn't recognised. Please sign in again.");
  }
  return null;
}

function forward(req, res, url, target, body) {
  const started = Date.now();
  const headers = { ...req.headers, host: `${config.upstreamHost}:${config.upstreams[target.upstream]}` };
  delete headers["x-forwarded-for"];
  if (body) {
    delete headers["transfer-encoding"];
    headers["content-length"] = String(body.length);
  }
  const upstream = http.request(
    {
      host: config.upstreamHost,
      port: config.upstreams[target.upstream],
      method: req.method,
      path: url.pathname + url.search,
      headers,
      agent: upstreamAgent
    },
    (upstreamRes) => {
      const status = upstreamRes.statusCode || 502;
      if (config.verbose) log(`${req.method} ${url.pathname} -> ${status} (${Date.now() - started} ms)`);
      if (target.upstream !== "auth") {
        res.writeHead(status, upstreamRes.headers);
        upstreamRes.pipe(res);
        return;
      }
      // Auth responses are small JSON: read them to record the tokens they issue.
      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        let payload = Buffer.concat(chunks);
        const json = status < 400 ? parseJson(payload) : undefined;
        if (json && sealIssuedTokens(json)) payload = Buffer.from(JSON.stringify(json));
        const outHeaders = { ...upstreamRes.headers, "content-length": String(payload.length) };
        delete outHeaders["transfer-encoding"];
        res.writeHead(status, outHeaders);
        res.end(payload);
      });
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) sendDenial(res, denial(502, "UNAVAILABLE", "The test server is starting or unavailable."), target.kind);
    else res.destroy();
  });
  // Firestore long-polls: stop the upstream request if the phone goes away.
  res.on("close", () => {
    if (!res.writableFinished) upstream.destroy();
  });
  if (body) upstream.end(body);
  else req.pipe(upstream);
}

const upstreamAgent = new http.Agent({ keepAlive: true, maxSockets: 512 });

// ---------------------------------------------------------------- invite page

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function publicOrigin(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `127.0.0.1:${config.port}`).split(",")[0].trim();
  const local = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
  const proto = String(req.headers["x-forwarded-proto"] || (local ? "http" : "https")).split(",")[0].trim();
  return `${proto}://${host}`;
}

function apkInfo() {
  if (!config.apkFile) return null;
  try {
    const stat = fs.statSync(config.apkFile);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

function invitePage(req) {
  const origin = publicOrigin(req);
  const apk = apkInfo();
  const connectLink =
    `intent://connect?server=${encodeURIComponent(origin)}#Intent;scheme=${config.appScheme};` +
    `package=${config.appPackage};S.browser_fallback_url=${encodeURIComponent(`${origin}/#install`)};end`;
  const size = apk ? `${Math.round(apk.size / (1024 * 1024))} MB` : "";
  const built = apk ? apk.mtime.toISOString().slice(0, 10) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Muse test group</title>
<style>
  :root { --bg: #fbf8f6; --card: #ffffff; --text: #1f1a1c; --muted: #6b6166; --brand: #b83a5e; --border: #eadfe3; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141113; --card: #1f1a1d; --text: #f5eef1; --muted: #b3a7ad; --brand: #e0678b; --border: #3a3035; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 520px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 0 0 8px; }
  p { margin: 0 0 12px; }
  .muted { color: var(--muted); }
  section { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 20px; margin-top: 16px; }
  .button { display: block; text-align: center; background: var(--brand); color: #fff; text-decoration: none; font-weight: 600; padding: 14px 16px; border-radius: 999px; margin: 12px 0 8px; border: 0; width: 100%; font-size: 16px; }
  .button.secondary { background: transparent; color: var(--brand); border: 1.5px solid var(--brand); }
  code { display: block; word-break: break-all; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; font-size: 14px; }
  ul { padding-left: 20px; margin: 0; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>
<main>
  <h1>Muse test group</h1>
  <p class="muted">You're invited to try Muse, a dating app that's still in development. This test server runs on a developer's computer, so it's only online while that computer is.</p>

  <section id="install">
    <h2>1. Install the test app (Android)</h2>
    ${
      apk
        ? `<a class="button" href="/download/muse-test.apk">Download Muse Test (${escapeHtml(size)})</a>
    <p class="muted">Built ${escapeHtml(built)}. Chrome warns that this type of file can harm your device: tap OK. Then open the file, allow installs from your browser when asked, and if Play Protect warns about an unknown app, choose "Install anyway".</p>`
        : `<p class="muted">Ask the person who invited you for the Muse Test app.</p>`
    }
  </section>

  <section>
    <h2>2. Connect the app</h2>
    <a class="button" href="${escapeHtml(connectLink)}">Open in Muse Test</a>
    <p class="muted">Or open Muse Test and paste this server address:</p>
    <code id="address">${escapeHtml(origin)}</code>
    <button class="button secondary" id="copy" type="button">Copy address</button>
  </section>

  <section>
    <h2>Before you start</h2>
    <ul>
      <li>You must be 18 or older.</li>
      <li>Use a made-up name and photos you're happy for the group to see. No ID documents or nudity.</li>
      <li>Use a password you don't use anywhere else.</li>
      <li>This is a test: data can be reset, and password-reset emails aren't sent. Ask the host if you get locked out.</li>
    </ul>
  </section>
</main>
<script>
  document.getElementById("copy").addEventListener("click", function () {
    var text = document.getElementById("address").textContent;
    var button = this;
    navigator.clipboard.writeText(text).then(function () { button.textContent = "Copied"; }, function () { button.textContent = "Press and hold the address to copy it"; });
  });
</script>
</body>
</html>`;
}

function serveInvitePage(req, res) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
  });
  res.end(req.method === "HEAD" ? undefined : invitePage(req));
}

// Legal pages, so test builds' Terms/Privacy links work before Firebase Hosting is deployed.
const LEGAL_DIR = path.join(ROOT, "firebase", "hosting");
const LEGAL_PAGES = new Set(["privacy", "terms", "community-guidelines", "safety", "delete-account"]);

function serveLegal(req, res, name) {
  const file = name === "styles.css" ? path.join(LEGAL_DIR, "styles.css") : path.join(LEGAL_DIR, `${name}.html`);
  fs.readFile(file, (error, content) => {
    if (error) return sendDenial(res, denial(404, "NOT_FOUND", "Not found"), "page");
    res.writeHead(200, {
      "content-type": name === "styles.css" ? "text/css; charset=utf-8" : "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(req.method === "HEAD" ? undefined : content);
  });
}

function serveApk(req, res) {
  const apk = apkInfo();
  if (!apk) return sendDenial(res, denial(404, "NOT_FOUND", "The test app isn't available here yet."), "page");
  res.writeHead(200, {
    "content-type": "application/vnd.android.package-archive",
    "content-length": String(apk.size),
    "content-disposition": 'attachment; filename="Muse-Test.apk"',
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(config.apkFile).pipe(res);
}

// ---------------------------------------------------------------- server

function log(message) {
  console.log(`[gateway ${new Date().toISOString()}] ${message}`);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://gateway.invalid");
  const method = req.method || "GET";

  if (url.pathname === "/healthz" && (method === "GET" || method === "HEAD")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(method === "HEAD" ? undefined : JSON.stringify({ service: "muse-test-server", project: config.project }));
  }
  if (url.pathname === "/" && (method === "GET" || method === "HEAD")) return serveInvitePage(req, res);
  if (url.pathname === "/download/muse-test.apk" && (method === "GET" || method === "HEAD")) return serveApk(req, res);
  const page = url.pathname.slice(1);
  if ((LEGAL_PAGES.has(page) || page === "styles.css") && (method === "GET" || method === "HEAD")) {
    return serveLegal(req, res, page);
  }

  const target = route(url, method);
  if (!target) return sendDenial(res, denial(404, "NOT_FOUND", "Not found"), "page");
  if (target.deny) return sendDenial(res, target.deny, "auth");
  if (target.limited && rateLimited(req)) {
    log(`rate limit hit for ${clientAddress(req)}`);
    return sendDenial(res, denial(429, "RESOURCE_EXHAUSTED", "Too many attempts. Try again in a few minutes."), target.kind);
  }

  let body = null;
  if (!target.stream) {
    try {
      body = await readBody(req);
    } catch (error) {
      return sendDenial(res, denial(error.status || 400, "INVALID_ARGUMENT", "Request too large."), target.kind);
    }
  }

  // WebChannel bodies are form-encoded; read them as forms whatever the declared type.
  const form = body && target.kind === "firestore" ? new URLSearchParams(body.toString("utf8")) : null;
  const problem =
    checkCredentials(req, url, form) ||
    (target.kind === "auth" || target.kind === "refresh" ? checkAuthBody(req, url, target, body) : null) ||
    (target.kind === "firestore" ? checkFirestoreScope(url, body, form) : null);
  if (problem) {
    if (config.verbose || problem.status !== 401) log(`refused ${method} ${url.pathname}: ${problem.status} ${problem.code}`);
    return sendDenial(res, problem, target.kind);
  }
  forward(req, res, url, target, body);
}

function createServer() {
  loadRegistry();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      log(`error: ${error.message}`);
      if (!res.headersSent) sendDenial(res, denial(500, "INTERNAL", "Something went wrong."), "page");
      else res.destroy();
    });
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;
  server.requestTimeout = 0; // Firestore long-polls hold requests open
  return server;
}

module.exports = { createServer, config, registry };

if (require.main === module) {
  // `kill -USR2 <pid>` turns request logging on or off without a restart.
  process.on("SIGUSR2", () => {
    config.verbose = !config.verbose;
    log(`request logging ${config.verbose ? "on" : "off"}`);
  });
  createServer().listen(config.port, config.host, () => {
    log(`listening on http://${config.host}:${config.port} for project ${config.project}`);
    if (!apkInfo()) log("no test APK to serve (set GATEWAY_APK); the invite page will say to ask for the app");
  });
}
