import { YStack } from "tamagui";
import type { PresenceStatus } from "../utils/presence";

/** Hidden and unknown activity stay neutral; they are never labelled offline. */
export function matchPresence(status: PresenceStatus | null) {
  if (!status) return { label: "Status unavailable", color: "$textMuted" as const, state: "unknown" };
  return status.online
    ? { label: "Online", color: "$success" as const, state: "online" }
    : { label: "Offline", color: "$error" as const, state: "offline" };
}

export function MatchPresenceDot({ status, size }: { status: PresenceStatus | null; size: number }) {
  const view = matchPresence(status);
  return <YStack testID={`presence-dot-${view.state}`} position="absolute" left={size - 15} bottom={1} width={14} height={14} borderRadius={7} backgroundColor={view.color} borderWidth={2} borderColor="$background" accessible={false} />;
}
