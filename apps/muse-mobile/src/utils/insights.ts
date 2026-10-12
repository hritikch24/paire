import { datingIntentionMap } from "../data/datingIntentions";
import { museCardMap } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { vibeMap } from "../data/vibes";
import type { MatchReason } from "../types/models";

/** "a", "a and b", "a, b and c". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const labels = (ids: string[], lookup: (id: string) => string | undefined) =>
  ids.map(lookup).filter((label): label is string => Boolean(label));

/** One line explaining a reason two people might click. Null if it can't be described. */
export function reasonText(reason: MatchReason): string | null {
  switch (reason.kind) {
    case "casual":
      return "You're both open to a one-night stand";
    case "interests": {
      const names = labels(reason.ids, (id) => {
        const card = museCardMap.get(id);
        return card ? `${card.emoji} ${card.title}` : undefined;
      });
      return names.length ? `You both love ${listOf(names)}` : null;
    }
    case "intentions": {
      const names = labels(reason.ids, (id) => datingIntentionMap.get(id)?.label.toLowerCase());
      return names.length ? `You both want ${listOf(names)}` : null;
    }
    case "vibes": {
      const names = labels(reason.ids, (id) => vibeMap.get(id)?.label.toLowerCase());
      return names.length ? `Same vibe: ${listOf(names)}` : null;
    }
    case "answer": {
      const question = rapidQuestionMap.get(reason.questionId);
      return question ? `Same answer to “${question.question}”: ${reason.answer}` : null;
    }
    case "nearby":
      return `Just ${reason.km} km away`;
    case "active":
      return "Active today";
    default:
      return null;
  }
}

export function reasonLines(reasons: MatchReason[] | undefined): string[] {
  return (reasons ?? []).map(reasonText).filter((line): line is string => Boolean(line));
}

/** A ranking hint, never a probability of romance or safety. */
export function compatibilityLabel(compatibility: number | undefined): string | null {
  return typeof compatibility === "number" && Number.isFinite(compatibility)
    ? `${Math.round(Math.max(0, Math.min(100, compatibility)))}/100 vibe`
    : null;
}
