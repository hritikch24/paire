import { HttpsError } from "firebase-functions/v2/https";
import { SPARKS } from "../config";
import { AgeGapSide, FeedCursor, SwipeType } from "../types";
import { isAgeGapSide } from "./ageGap";
import { scanMessage } from "./chatSafety";

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SWIPE_TYPES: SwipeType[] = ["like", "nope", "super"];

function asRecord(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new HttpsError("invalid-argument", "Request body must be an object.");
  }
  return data as Record<string, unknown>;
}

export function parseUid(value: unknown, field = "targetUid"): string {
  if (typeof value !== "string" || !UID_PATTERN.test(value)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

/**
 * A note sent with a like ("Spark"): trimmed, single paragraph, up to 140
 * characters. Anything the chat-safety scanner flags (money, numbers, links,
 * abuse) is refused outright: a first note to a stranger needs none of those.
 */
export function parseNote(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new HttpsError("invalid-argument", "note must be text.");
  // eslint-disable-next-line no-control-regex
  const note = value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
  if (!note) return null;
  if (note.length > SPARKS.noteMaxLength) {
    throw new HttpsError("invalid-argument", `Keep your note under ${SPARKS.noteMaxLength} characters.`);
  }
  if (scanMessage(note)) {
    throw new HttpsError(
      "invalid-argument",
      "That note can't be sent. Keep it friendly, with no numbers, links or money talk."
    );
  }
  return note;
}

export function parseSwipeInput(data: unknown): { targetUid: string; type: SwipeType; note: string | null } {
  const body = asRecord(data);
  const targetUid = parseUid(body.targetUid);
  const type = body.type;
  if (typeof type !== "string" || !SWIPE_TYPES.includes(type as SwipeType)) {
    throw new HttpsError("invalid-argument", "type must be like, nope or super.");
  }
  const note = parseNote(body.note);
  if (note && type === "nope") throw new HttpsError("invalid-argument", "Notes go with likes, not passes.");
  return { targetUid, type: type as SwipeType, note };
}

export function parseTargetInput(data: unknown): { targetUid: string } {
  return { targetUid: parseUid(asRecord(data).targetUid) };
}

export type FeedInput = { cursor: FeedCursor | null; ageGap: AgeGapSide | null; garba: boolean };

/** A feed page request. `garba` (the Garba Nights edition) and `ageGap` are one filter at a time. */
export function parseFeedInput(data: unknown): FeedInput {
  if (data === null || data === undefined) return { cursor: null, ageGap: null, garba: false };
  const body = asRecord(data);
  if (body.ageGap !== null && body.ageGap !== undefined && !isAgeGapSide(body.ageGap)) {
    throw new HttpsError("invalid-argument", "ageGap is invalid.");
  }
  if (body.garba !== undefined && typeof body.garba !== "boolean") {
    throw new HttpsError("invalid-argument", "garba is invalid.");
  }
  const ageGap = isAgeGapSide(body.ageGap) ? body.ageGap : null;
  const garba = body.garba === true;
  if (ageGap && garba) throw new HttpsError("invalid-argument", "Choose one filter at a time.");
  if (body.cursor === null || body.cursor === undefined) return { cursor: null, ageGap, garba };
  const cursor = asRecord(body.cursor);
  if (typeof cursor.lastActiveAt !== "number" || !Number.isFinite(cursor.lastActiveAt)) {
    throw new HttpsError("invalid-argument", "cursor.lastActiveAt is invalid.");
  }
  return { cursor: { lastActiveAt: cursor.lastActiveAt, uid: parseUid(cursor.uid, "cursor.uid") }, ageGap, garba };
}

export function parseDuoSwipeInput(data: unknown): { targetDuoId: string; type: "like" | "nope" } {
  const body = asRecord(data);
  const targetDuoId = body.targetDuoId;
  if (typeof targetDuoId !== "string" || !/^[A-Za-z0-9_-]{3,260}$/.test(targetDuoId)) {
    throw new HttpsError("invalid-argument", "targetDuoId is invalid.");
  }
  if (body.type !== "like" && body.type !== "nope") {
    throw new HttpsError("invalid-argument", "type must be like or nope.");
  }
  return { targetDuoId, type: body.type };
}

const MATCH_ID_PATTERN = /^[A-Za-z0-9_-]{1,300}$/;

export function parseMatchInput(data: unknown): { matchId: string } {
  const matchId = (data as { matchId?: unknown } | null)?.matchId;
  if (typeof matchId !== "string" || !MATCH_ID_PATTERN.test(matchId)) {
    throw new HttpsError("invalid-argument", "matchId is invalid.");
  }
  return { matchId };
}
