import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryDocumentSnapshot,
  serverTimestamp,
  startAfter,
  Unsubscribe,
  where,
  writeBatch
} from "@firebase/firestore/dist/index.cjs.js";
import { ChatMessage, MessageSafety } from "../types/models";
import { toMillis } from "../utils/time";
import { db } from "./firebase";
import { Platform } from "react-native";
import { chatContactIssue } from "../utils/chatContact";

export const MESSAGE_PAGE_SIZE = 40;
export const MAX_MESSAGE_LENGTH = 1000;

const messagesCollection = (matchId: string) => collection(db, "matches", matchId, "messages");

const CATEGORIES = new Set(["money", "off_platform", "harassment", "threat", "minor", "solicitation", "link"]);
const SEVERITIES = new Set(["low", "medium", "high"]);

export function toSafety(value: unknown): MessageSafety | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { category, severity, hidden } = value as Record<string, unknown>;
  if (!CATEGORIES.has(category as string) || !SEVERITIES.has(severity as string)) return undefined;
  return {
    category: category as MessageSafety["category"],
    severity: severity as MessageSafety["severity"],
    hidden: hidden === true
  };
}

function toMessage(snap: QueryDocumentSnapshot): ChatMessage {
  const data = snap.data({ serverTimestamps: "estimate" });
  return {
    id: snap.id,
    senderId: String(data.senderId ?? ""),
    text: String(data.text ?? ""),
    createdAt: toMillis(data.createdAt),
    pending: snap.metadata.hasPendingWrites
  };
}

/**
 * Paire AI warnings on messages you received (matches/{id}/safety/{messageId},
 * readable only by the recipient), keyed by message id.
 */
export function subscribeToSafetyWarnings(
  matchId: string,
  uid: string,
  onData: (warnings: Map<string, MessageSafety>) => void
): Unsubscribe {
  const mine = query(collection(db, "matches", matchId, "safety"), where("recipientIds", "array-contains", uid));
  return onSnapshot(
    mine,
    (snapshot) => {
      const warnings = new Map<string, MessageSafety>();
      for (const warning of snapshot.docs) {
        const safety = toSafety(warning.data());
        if (safety) warnings.set(warning.id, safety);
      }
      onData(warnings);
    },
    // Warnings are extra: the chat works without them.
    () => onData(new Map())
  );
}

export type MessagePage = { messages: ChatMessage[]; oldest: QueryDocumentSnapshot | null; hasMore: boolean };

/** Live view of the newest messages (newest first). */
export function subscribeToLatestMessages(
  matchId: string,
  onData: (page: MessagePage) => void,
  onError: (error: Error) => void
): Unsubscribe {
  const latest = query(messagesCollection(matchId), orderBy("createdAt", "desc"), limit(MESSAGE_PAGE_SIZE));
  return onSnapshot(
    latest,
    { includeMetadataChanges: true },
    (snapshot) =>
      onData({
        messages: snapshot.docs.map(toMessage),
        oldest: snapshot.docs.at(-1) ?? null,
        hasMore: snapshot.size === MESSAGE_PAGE_SIZE
      }),
    onError
  );
}

export async function loadOlderMessages(matchId: string, before: QueryDocumentSnapshot): Promise<MessagePage> {
  const older = query(
    messagesCollection(matchId),
    orderBy("createdAt", "desc"),
    startAfter(before),
    limit(MESSAGE_PAGE_SIZE)
  );
  const snapshot = await getDocs(older);
  return {
    messages: snapshot.docs.map(toMessage),
    oldest: snapshot.docs.at(-1) ?? null,
    hasMore: snapshot.size === MESSAGE_PAGE_SIZE
  };
}

/**
 * Writes the message and the match preview/unread count in one atomic batch,
 * which is exactly what the security rules allow.
 */
export async function sendChatMessage(
  matchId: string, senderId: string, recipientIds: string[], text: string,
  options: { shareContactDetails?: boolean } = {}
) {
  const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return;
  const issue = Platform.OS === "web" ? chatContactIssue(trimmed) : null;
  const contactShareConfirmed = Boolean(issue) && options.shareContactDetails === true;
  if (issue && !contactShareConfirmed) throw Object.assign(new Error(issue.message), { code: "chat/contact-details" });
  const batch = writeBatch(db);
  batch.set(doc(messagesCollection(matchId)), {
    senderId,
    text: trimmed,
    createdAt: serverTimestamp(),
    ...(contactShareConfirmed ? { contactShareConfirmed: true } : {})
  });
  batch.update(doc(db, "matches", matchId), {
    lastMessage: { text: contactShareConfirmed ? "Shared contact details" : trimmed, senderId, createdAt: serverTimestamp() },
    lastActivityAt: serverTimestamp(),
    // Everyone else in the chat (one person, or three in a Duo chat).
    ...Object.fromEntries(recipientIds.map((uid) => [`unread.${uid}`, increment(1)]))
  });
  await batch.commit();
}
