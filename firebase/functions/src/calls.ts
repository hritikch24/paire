import { createHash, randomUUID, sign } from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db } from "./admin";
import { REGION } from "./config";
import { requireAuth } from "./lib/auth";
import { consumeDailyQuota } from "./quota";
import { requireVerifiedUsers } from "./trust";

/** Short-lived room-specific JaaS access, issued only for an active, verified match. */
export const createCallSession = onCall({ region: REGION, secrets: ["JAAS_PRIVATE_KEY"] }, async (request) => {
  const uid = requireAuth(request);
  const matchId = request.data?.matchId;
  if (typeof matchId !== "string" || !matchId || matchId.length > 300 || matchId.includes("/")) throw new HttpsError("invalid-argument", "Choose an available chat.");
  const appId = process.env.JAAS_APP_ID; const keyId = process.env.JAAS_KEY_ID; const key = process.env.JAAS_PRIVATE_KEY;
  if (!appId || !/^vpaas-magic-cookie-[a-zA-Z0-9]+$/.test(appId) || !keyId || !key || key === "disabled") throw new HttpsError("unavailable", "Calls aren’t available yet.");
  await consumeDailyQuota(uid, "callSessions", 60);
  const room = await db.runTransaction(async (tx) => {
    const match = await tx.get(db.doc(`matches/${matchId}`));
    const participants = match.get("participants") as string[] | undefined;
    if (!match.exists || match.get("active") !== true || !participants?.includes(uid)) throw new HttpsError("permission-denied", "This call isn’t available.");
    await requireVerifiedUsers(participants, tx, uid);
    const blocked = await tx.getAll(...participants.filter((member) => member !== uid).flatMap((member) => [db.doc(`blocks/${uid}/blocked/${member}`), db.doc(`blocks/${member}/blocked/${uid}`)]));
    if (blocked.some((snap) => snap.exists)) throw new HttpsError("permission-denied", "This call isn’t available.");
    const ref = db.doc(`callRooms/${matchId}`); const existing = await tx.get(ref);
    const roomId = existing.get("room") as string | undefined ?? randomUUID();
    if (!existing.exists) tx.set(ref, { room: roomId, participants });
    return roomId;
  });
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = encode({ alg: "RS256", typ: "JWT", kid: keyId });
  const body = encode({ aud: "jitsi", iss: "chat", sub: appId, room, nbf: now - 10, exp: now + 300,
    context: { user: { id: createHash("sha256").update(uid).digest("hex"), name: "Paire member", moderator: "false" },
      features: { recording: false, livestreaming: false, transcription: false, "outbound-call": false }, room: { regex: false } } });
  const jwt = `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key.replace(/\\n/g, "\n")).toString("base64url")}`;
  return { url: `https://8x8.vc/${appId}/${room}?jwt=${encodeURIComponent(jwt)}`, expiresAt: (now + 300) * 1000 };
});
