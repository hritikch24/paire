import { Text, XStack } from "tamagui";
import { workCircle } from "../data/workCircles";
import { Icon } from "./Icon";
export function WorkCircleBadge({ sector }: { sector?: unknown }) {
  const circle = workCircle(sector);
  return circle ? <XStack gap="$2" alignItems="center" padding="$3" borderRadius={16} backgroundColor="$primarySoft"><Icon name={circle.icon} color="primary" size={20} /><Text color="$primary" flexShrink={1}>{circle.label} · Self-declared</Text></XStack> : null;
}
