import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useTheme } from "tamagui";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type ThemeColor =
  | "text"
  | "textMuted"
  | "primary"
  | "primaryForeground"
  | "like"
  | "nope"
  | "superLike"
  | "error"
  | "success"
  | "warning";

type IconProps = {
  name: IconName;
  size?: number;
  /** A theme color name, or any CSS color. */
  color?: ThemeColor | string;
};

export function Icon({ name, size = 22, color = "text" }: IconProps) {
  const theme = useTheme();
  const themed = (theme as Record<string, { val?: string } | undefined>)[color]?.val;
  return <Ionicons name={name} size={size} color={themed ?? color} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
}
