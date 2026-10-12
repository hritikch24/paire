import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { db } from "./admin";
import { CHAT_SAFETY, MESSAGE_PREVIEW_LENGTH, REGION } from "./config";
import { askClaudeForJson, llmEnabled } from "./lib/llm";
import { CHAT_SAFETY_SYSTEM, SafetyFlag, applyReview, atLeast, reviewPrompt, scanMessage } from "./lib/chatSafety";
import { dailyLimitRef } from "./quota";
import { sendPushToUser } from "./push";
import { MatchProfileSnippet } from "./types";

function preview(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > MESSAGE_PREVIEW_LENGTH
    ? `${clean.slice(0, MESSAGE_PREVIEW_LENGTH - 1)}…`
    : clean;
}

/** Counts one AI review for the sender; false once today's allowance is used. */
async function takeReviewQuota(uid: string): Promise<boolean> {
  const ref = dailyLimitRef(uid);
  return db.runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).get("safetyReviews") as number | undefined) ?? 0;
    if (used >= CHAT_SAFETY.aiReviewsPerDay) return false;
    tx.set(ref, { safetyReviews: used + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

/** Claude's second opinion on a medium+ rule flag, when configured and within the sender's allowance. */
async function review(flag: SafetyFlag, text: string, senderId: string): Promise<SafetyFlag | null> {
  if (!llmEnabled() || !atLeast(flag.severity, "medium") || !(await takeReviewQuota(senderId))) return flag;
  const verdict = await askClaudeForJson(CHAT_SAFETY_SYSTEM, reviewPrompt(flag, text), 60, {
    model: CHAT_SAFETY.model,
    timeoutMs: CHAT_SAFETY.timeoutMs
  });
  return applyReview(flag, verdict);
}

/**
 * The recipients' warning lives in matches/{id}/safety/{messageId}, readable
 * only by them (everyone but the sender in a Duo chat): the sender never
 * learns what tripped the check.
 */
async function writeMarker(
  matchId: string,
  messageId: string,
  recipientIds: string[],
  flag: SafetyFlag | null
): Promise<void> {
  const ref = db.doc(`matches/${matchId}/safety/${messageId}`);
  if (!flag) {
    await ref.delete();
    return;
  }
  await ref.set({
    recipientIds,
    category: flag.category,
    severity: flag.severity,
    hidden: flag.hidden,
    createdAt: FieldValue.serverTimestamp()
  });
}

const sameMarker = (a: SafetyFlag | null, b: SafetyFlag | null) =>
  a?.category === b?.category && a?.severity === b?.severity && a?.hidden === b?.hidden;

/** Replaces the chat-list preview of a hidden message, unless a newer message has taken its place. */
async function maskPreview(matchId: string, senderId: string, text: string): Promise<void> {
  const matchRef = db.doc(`matches/${matchId}`);
  await db.runTransaction(async (tx) => {
    const last = (await tx.get(matchRef)).get("lastMessage") as { senderId?: string; text?: string } | undefined;
    if (last?.senderId === senderId && last.text === text.trim().slice(0, 1000)) {
      tx.update(matchRef, { "lastMessage.text": CHAT_SAFETY.hiddenPreview });
    }
  });
}

/**
 * Keeps a server-only record of a serious flag for moderators (one per message,
 * however often the trigger runs) and hides a sender from discovery for review
 * after repeated serious flags, or at once if they say they're under 18.
 */
async function recordFlag(
  matchId: string,
  messageId: string,
  senderId: string,
  recipientIds: string[],
  text: string,
  flag: SafetyFlag
): Promise<void> {
  try {
    await db.doc(`chatFlags/${matchId}_${messageId}`).create({
      matchId,
      messageId,
      senderId,
      recipientIds,
      category: flag.category,
      severity: flag.severity,
      signals: flag.signals,
      text: text.slice(0, 1000),
      status: "open",
      createdAt: FieldValue.serverTimestamp(),
      // Deleted by the TTL policy in firestore.indexes.json (deployed with the rules).
      expireAt: Timestamp.fromMillis(Date.now() + CHAT_SAFETY.flagRetentionDays * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    if ((error as { code?: number }).code === 6) return; // Already recorded by an earlier run.
    throw error;
  }
  logger.info("Chat message flagged", { matchId, messageId, senderId, category: flag.category, severity: flag.severity });
  if (flag.severity !== "high") return;

  const moderationRef = db.doc(`moderation/${senderId}`);
  const moderation = await moderationRef.get();
  if (["banned", "hidden"].includes(moderation.get("status"))) return;

  // Flags from before a moderator's last review don't count again.
  const reviewedAt = (moderation.get("reviewedAt") as Timestamp | undefined)?.toMillis() ?? 0;
  const since = Timestamp.fromMillis(Math.max(reviewedAt, Date.now() - CHAT_SAFETY.windowDays * 24 * 60 * 60 * 1000));
  const recent = await db.collection("chatFlags").where("senderId", "==", senderId).where("createdAt", ">=", since).get();
  const serious = recent.docs.filter((doc) => doc.get("severity") === "high" && doc.get("status") === "open");
  // Counted per conversation, so one Duo chat with three recipients counts once.
  const chats = new Set(serious.map((doc) => doc.get("matchId") as string));
  const hide =
    flag.category === "minor" ||
    (serious.length >= CHAT_SAFETY.hideAfterHighFlags && chats.size >= CHAT_SAFETY.minChats) ||
    serious.length >= CHAT_SAFETY.hideAfterHighFlagsAlone;
  if (!hide) return;

  await db.runTransaction(async (tx) => {
    const latest = await tx.get(moderationRef);
    if (["banned", "hidden"].includes(latest.get("status")) || ((latest.get("reviewedAt") as Timestamp | undefined)?.toMillis() ?? 0) > reviewedAt) return;
    tx.set(moderationRef, {
      status: "hidden",
      reason: flag.category === "minor" ? "auto:chat-underage" : "auto:chat-safety",
      highFlags: serious.length,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  });
}

/**
 * Chat safety, then the notification. Rules run first and their result is
 * written at once, so the recipient sees the warning from the start;
 * Claude's second opinion (when configured) then confirms, adjusts or clears it.
 * Only medium+ flags are kept for moderators. Disclosed in the Privacy Policy.
 */
export const onMessageCreated = onDocumentCreated(
  { document: "matches/{matchId}/messages/{messageId}", region: REGION, secrets: ["ANTHROPIC_API_KEY"] },
  async (event) => {
    const message = event.data?.data() as { senderId?: string; text?: string } | undefined;
    // "system" notes ("Riya left the chat") are written by the server and need neither.
    if (!message?.senderId || message.senderId === "system" || typeof message.text !== "string") return;

    const { matchId, messageId } = event.params;
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const participants = (matchSnap.get("participants") as string[] | undefined) ?? [];
    const recipients = participants.filter((participant) => participant !== message.senderId);
    if (!recipients.length) return;

    // Checked even if the match has already ended: unmatching mustn't dodge moderation.
    let flag: SafetyFlag | null = null;
    try {
      const ruled = scanMessage(message.text);
      if (ruled) {
        await writeMarker(matchId, messageId, recipients, ruled);
        if (ruled.hidden) await maskPreview(matchId, message.senderId, message.text);
        flag = await review(ruled, message.text, message.senderId);
        if (!sameMarker(flag, ruled)) await writeMarker(matchId, messageId, recipients, flag);
        if (flag && atLeast(flag.severity, "medium")) {
          await recordFlag(matchId, messageId, message.senderId, recipients, message.text, flag);
        }
      }
    } catch (error) {
      // Safety checks must never stop the message being delivered.
      logger.error("Chat safety check failed", { matchId, messageId, error: String(error) });
    }

    if (matchSnap.get("active") === false) return;
    const profiles = (matchSnap.get("profiles") as Record<string, MatchProfileSnippet> | undefined) ?? {};
    const text = message.text;
    const sender = profiles[message.senderId]?.displayName ?? "New message";
    const group = matchSnap.get("kind") === "duo";
    await Promise.all(
      recipients.map((recipient) =>
        sendPushToUser(recipient, {
          kind: "messages",
          title: group ? `${sender} · Duo chat` : sender,
          body: flag?.hidden ? "Sent a message. Paire flagged it, so open it with care." : preview(text),
          data: { type: "message", matchId },
          tag: `chat-${matchId}`
        })
      )
    );
  }
);
