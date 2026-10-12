/**
 * Checks a running Muse test server: the app's endpoints work, and the holes the
 * gateway exists to close stay closed (forged tokens, admin keys, emulator APIs).
 *
 *   node tools/test-backend/check.js https://<name>.trycloudflare.com
 *
 * Creates a throwaway account and deletes it at the end. Its three sign-in
 * attempts count towards the gateway's per-address limit.
 */
"use strict";

const base = (process.argv[2] || process.env.MUSE_TEST_SERVER || "").replace(/\/+$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node tools/test-backend/check.js <server URL>");
  process.exit(1);
}

const PROJECT = "demo-muse";
const REGION = "us-central1";
const KEY = "demo-api-key";
const DATABASE = `projects/${PROJECT}/databases/(default)`;
const EMAIL = `check+${Date.now().toString(36)}@example.com`;
const PASSWORD = `Check-${Math.random().toString(36).slice(2)}!`;
const SOMEONE_ELSE = "check-someone-else";

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
}

async function call(path, { method = "POST", headers = {}, body, json } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers["content-type"] = "application/json";
  } else if (body !== undefined) {
    init.body = body;
  }
  const response = await fetch(`${base}${path}`, init);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, text };
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** An unsigned token like the Auth emulator's, for a user we never signed in as. */
function forgedIdToken(uid) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    auth_time: now,
    user_id: uid,
    sub: uid,
    iat: now,
    exp: now + 3600,
    email: `${uid}@example.com`,
    email_verified: false,
    firebase: { identities: {}, sign_in_provider: "password" }
  })}.`;
}

const forgedRefreshToken = (uid) =>
  Buffer.from(
    JSON.stringify({ _AuthEmulatorRefreshToken: "DO NOT MODIFY", localId: uid, provider: "password", extraClaims: {}, projectId: PROJECT })
  ).toString("base64");

const settingsDoc = (uid) => `/v1/${DATABASE}/documents/users/${uid}/private/settings`;
const authPath = (action) => `/identitytoolkit.googleapis.com/v1/accounts:${action}?key=${KEY}`;

function listenHandshake(token, uid = SOMEONE_ELSE) {
  const request = JSON.stringify({ database: DATABASE, addTarget: { documents: { documents: [`${DATABASE}/documents/users/${uid}/private/settings`] }, targetId: 2 } });
  const headers = `X-Goog-Api-Client:gl-js/ fire/10.12.5\r\nContent-Type:text/plain\r\nAuthorization:Bearer ${token}\r\n`;
  return {
    path: `/google.firestore.v1.Firestore/Listen/channel?database=${encodeURIComponent(DATABASE)}&VER=8&RID=1234&CVER=22&X-HTTP-Session-Id=gsessionid&zx=check&t=1`,
    body: `headers=${encodeURIComponent(headers)}&count=1&ofs=0&req0___data__=${encodeURIComponent(request)}`
  };
}

async function main() {
  console.log(`Checking ${base}\n`);

  const health = await call("/healthz", { method: "GET" });
  check("health check answers", health.status === 200 && health.data.service === "muse-test-server", health.text);

  const page = await call("/", { method: "GET" });
  check("invite page shows this server's address", page.status === 200 && page.text.includes(base), `status ${page.status}`);

  // ---------------------------------------------------------------- the app's own flow
  const signUp = await call(authPath("signUp"), { json: { email: EMAIL, password: PASSWORD, returnSecureToken: true } });
  check("sign up works", signUp.status === 200 && Boolean(signUp.data.idToken), signUp.text);

  const signIn = await call(authPath("signInWithPassword"), { json: { email: EMAIL, password: PASSWORD, returnSecureToken: true } });
  check("sign in with the right password works", signIn.status === 200 && Boolean(signIn.data.idToken), signIn.text);
  const idToken = signIn.data.idToken;
  const refreshToken = signIn.data.refreshToken;
  const uid = signIn.data.localId;
  const bearer = { authorization: `Bearer ${idToken}` };

  const wrongPassword = await call(authPath("signInWithPassword"), { json: { email: EMAIL, password: "wrong-password", returnSecureToken: true } });
  check("sign in with a wrong password fails", wrongPassword.status === 400, wrongPassword.text);

  const lookup = await call(authPath("lookup"), { json: { idToken } });
  check("account lookup with a real session works", lookup.status === 200, lookup.text);

  const ownSettings = await call(settingsDoc(uid), { method: "GET", headers: bearer });
  // Firestore REST reads are GETs, which the gateway doesn't forward (the app uses the channel); use runQuery.
  check("Firestore document GETs are not exposed", ownSettings.status === 404, `status ${ownSettings.status}`);

  const privateQuery = { structuredQuery: { from: [{ collectionId: "private" }], limit: 5 } };
  const query = await call(`/v1/${DATABASE}/documents/users/${uid}:runQuery`, { headers: bearer, json: privateQuery });
  check("Firestore query of your own private data works", query.status === 200, query.text.slice(0, 300));

  const otherQuery = await call(`/v1/${DATABASE}/documents/users/${SOMEONE_ELSE}:runQuery`, { headers: bearer, json: privateQuery });
  check("security rules still block other members' private data", otherQuery.status === 403, `status ${otherQuery.status}`);

  // A new account has no profile yet, so the feed answers "finish your profile": it ran, with a session.
  const reachedFeed = (res) => res.status === 200 || (res.data && res.data.error && res.data.error.status === "FAILED_PRECONDITION");
  const feed = await call(`/${PROJECT}/${REGION}/getDiscoverFeed`, { headers: bearer, json: { data: {} } });
  check("discover feed (Cloud Function) runs for a signed-in member", reachedFeed(feed), feed.text.slice(0, 300));

  const channel = listenHandshake(idToken, uid);
  const handshake = await call(channel.path, { body: channel.body, headers: { "content-type": "application/x-www-form-urlencoded" } });
  check("Firestore live connection opens with a real session", handshake.status === 200, `status ${handshake.status} ${handshake.text.slice(0, 200)}`);

  const refresh = await call(`/securetoken.googleapis.com/v1/token?key=${KEY}`, {
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  check("session refresh works", refresh.status === 200 && Boolean(refresh.data.id_token), refresh.text);
  if (refresh.data.id_token) {
    const refreshed = await call(`/${PROJECT}/${REGION}/getDiscoverFeed`, { headers: { authorization: `Bearer ${refresh.data.id_token}` }, json: { data: {} } });
    check("refreshed session is accepted", reachedFeed(refreshed), refreshed.text.slice(0, 200));
  }

  // ---------------------------------------------------------------- holes that must stay closed
  const forged = forgedIdToken(uid);
  const forgedQuery = await call(`/v1/${DATABASE}/documents/users/${uid}:runQuery`, {
    headers: { authorization: `Bearer ${forged}` },
    json: { structuredQuery: { from: [{ collectionId: "private" }], limit: 5 } }
  });
  check("forged login token is refused (Firestore)", forgedQuery.status === 401, `status ${forgedQuery.status}`);

  const forgedFeed = await call(`/${PROJECT}/${REGION}/getDiscoverFeed`, { headers: { authorization: `Bearer ${forged}` }, json: { data: {} } });
  check("forged login token is refused (Cloud Functions)", forgedFeed.status === 401, `status ${forgedFeed.status}`);

  const forgedChannel = listenHandshake(forged, uid);
  const forgedHandshake = await call(forgedChannel.path, { body: forgedChannel.body, headers: { "content-type": "text/plain" } });
  check("forged login token inside a Firestore live connection is refused", forgedHandshake.status === 401, `status ${forgedHandshake.status}`);

  // The emulator's own token for this session is predictable; only the gateway's sealed copy works.
  const [header, payload] = idToken.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  delete claims.gateway_nonce;
  const unsealed = `${header}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.`;
  const unsealedFeed = await call(`/${PROJECT}/${REGION}/getDiscoverFeed`, { headers: { authorization: `Bearer ${unsealed}` }, json: { data: {} } });
  check("your own token without the gateway's nonce is refused", unsealedFeed.status === 401, `status ${unsealedFeed.status}`);

  const forgedLookup = await call(authPath("lookup"), { json: { idToken: forged } });
  check("forged login token is refused (account lookup)", forgedLookup.status === 401, forgedLookup.text);

  const forgedUpdate = await call(authPath("update"), { json: { idToken: forged, password: "hijacked-password", returnSecureToken: true } });
  check("forged login token can't change someone's password", forgedUpdate.status === 401, forgedUpdate.text);

  const forgedRefresh = await call(`/securetoken.googleapis.com/v1/token?key=${KEY}`, {
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(forgedRefreshToken(uid))}`,
    headers: { "content-type": "application/x-www-form-urlencoded" }
  });
  check("refresh token rebuilt from a user ID is refused", forgedRefresh.status === 401, forgedRefresh.text.slice(0, 200));

  for (const [label, token] of [["owner", "owner"], ["service-account style", "ya29.fake"]]) {
    const admin = await call(`/v1/${DATABASE}/documents/users/${uid}:runQuery`, {
      headers: { authorization: `Bearer ${token}` },
      json: { structuredQuery: { from: [{ collectionId: "private" }], limit: 5 } }
    });
    check(`${label} admin key is refused`, admin.status === 403, `status ${admin.status}`);
  }

  const customToken = await call(authPath("signInWithCustomToken"), { json: { token: "x", returnSecureToken: true } });
  check("custom-token sign-in is blocked", customToken.status === 403, customToken.text);

  const idp = await call(authPath("signInWithIdp"), { json: { postBody: "id_token=x&providerId=google.com", requestUri: "http://localhost", returnSecureToken: true } });
  check("social sign-in is blocked", idp.status === 403, idp.text);

  const emulatorAdmin = await call(`/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  check("emulator admin API is not reachable", emulatorAdmin.status === 404, `status ${emulatorAdmin.status}`);

  const otherProject = await call(`/v1/projects/someone-else/databases/(default)/documents:commit`, { json: { writes: [] } });
  check("other projects are not reachable", otherProject.status === 404, `status ${otherProject.status}`);

  const sneaky = listenHandshake(idToken, uid);
  const sneakyBody = sneaky.body.replace(encodeURIComponent(DATABASE), encodeURIComponent("projects/someone-else/databases/(default)"));
  const sneakyHandshake = await call(sneaky.path, { body: sneakyBody, headers: { "content-type": "application/x-www-form-urlencoded" } });
  check("live connections to other projects are refused", sneakyHandshake.status === 403, `status ${sneakyHandshake.status}`);

  const gcsApi = await call(`/storage/v1/b/${PROJECT}.appspot.com/o`, { method: "GET" });
  check("Storage admin API is not reachable", gcsApi.status === 404, `status ${gcsApi.status}`);

  const unknownFunction = await call(`/${PROJECT}/${REGION}/onReportCreated`, { headers: bearer, json: { data: {} } });
  check("background functions can't be called directly", unknownFunction.status === 404, `status ${unknownFunction.status}`);

  const noSession = await call(`/${PROJECT}/${REGION}/getDiscoverFeed`, { json: { data: {} } });
  check("functions refuse calls without a session", noSession.status === 401, `status ${noSession.status}`);

  const deleted = await call(authPath("delete"), { json: { idToken } });
  check("the throwaway account can delete itself", deleted.status === 200, deleted.text);

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
