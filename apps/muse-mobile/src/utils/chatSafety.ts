import type { IconName } from "../components/Icon";
import type { MessageSafety, ReportReason, SafetyCategory } from "../types/models";

export type SafetyNotice = {
  icon: IconName;
  title: string;
  body: string;
  /** Serious enough to suggest reporting. */
  suggestReport: boolean;
  /** Quiet one-line tip rather than a card. */
  subtle: boolean;
};

/** The report reason that fits a flag, pre-selected when reporting from a warning. */
export const REPORT_REASON_FOR: Record<SafetyCategory, ReportReason> = {
  money: "scam_or_spam",
  off_platform: "scam_or_spam",
  link: "scam_or_spam",
  harassment: "harassment",
  threat: "harassment",
  minor: "underage",
  solicitation: "inappropriate_content"
};

/** What the recipient sees under a message the chat-safety check flagged. Null: say nothing. */
export function safetyNotice(safety: MessageSafety): SafetyNotice | null {
  const serious = safety.severity !== "low";
  switch (safety.category) {
    case "money":
      if (!serious) {
        return {
          icon: "cash-outline",
          title: "Talking money?",
          body: "Never send money or OTPs to someone you haven't met.",
          suggestReport: false,
          subtle: true
        };
      }
      return {
        icon: "cash-outline",
        title: "Careful: money request",
        body: "Never send money, gift cards, OTPs or bank details to someone you haven't met, however urgent it sounds.",
        suggestReport: serious,
        subtle: false
      };
    case "off_platform":
      return {
        icon: "chatbubbles-outline",
        title: "Moving off Paire?",
        body: "No rush. Many scams start by leaving the app, so keep chatting here until you trust them.",
        suggestReport: false,
        subtle: true
      };
    case "link":
      return {
        icon: "link-outline",
        title: serious ? "Suspicious link" : "Link shared",
        body: serious
          ? "This link hides where it goes. Don't open it or enter passwords or payment details."
          : "Only open links you trust, and never enter passwords or payment details.",
        suggestReport: serious,
        subtle: !serious
      };
    case "harassment":
      if (!serious) return null;
      return {
        icon: "hand-left-outline",
        title: "This message may be abusive",
        body: "You never have to put up with this. You can report or block them at any time.",
        suggestReport: true,
        subtle: false
      };
    case "threat":
      // Low: a joke ("I'll kill you lol"); not worth a warning.
      if (!serious) return null;
      return {
        icon: "warning-outline",
        title: "This message may be a threat",
        body: "If you feel unsafe, block and report them. In an emergency call 112 (India) or your local emergency number.",
        suggestReport: true,
        subtle: false
      };
    case "minor":
      return {
        icon: "alert-circle-outline",
        title: "They may be under 18",
        body: "Paire is for adults only. Please stop chatting and report them so our team can review.",
        suggestReport: true,
        subtle: false
      };
    case "solicitation":
      if (!serious) return null;
      return {
        icon: "ban-outline",
        title: "Paid sex isn't allowed on Paire",
        body: "Offers of paid sex or escort services break our rules and are often scams. Please report them.",
        suggestReport: true,
        subtle: false
      };
    default:
      return null;
  }
}
