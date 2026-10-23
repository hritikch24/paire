import { Platform } from "react-native";
import { Alert } from "./dialog";
import { errorCode } from "./errors";

type LimitDetails = { reason?: string; upgradeAvailable?: boolean; kind?: string };
export function offerPlusForLikeLimit(error: unknown, onUpgrade: () => void): boolean {
  if (Platform.OS !== "web" || errorCode(error) !== "functions/resource-exhausted") return false;
  const details = (error as { details?: LimitDetails }).details;
  if (details?.reason !== "daily-swipe-limit" || details.upgradeAvailable !== true) return false;
  showLikeLimitOffer(details.kind === "super", onUpgrade);
  return true;
}

export function showLikeLimitOffer(superLike: boolean, onUpgrade: () => void) {
  if (Platform.OS !== "web") return;
  Alert.alert(superLike ? "Your free Super Like is used" : "You've used today's free likes", "Keep connecting with Paire Plus. Monthly and lifetime plans include unlimited regular likes; day and week passes include 100 daily. Every Plus plan includes 5 Super Likes daily and reveals who likes you.", [
    { text: "Maybe later", style: "cancel" }, { text: "Get Paire Plus", onPress: onUpgrade }
  ]);
}
