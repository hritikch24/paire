import { Pressable } from "react-native";
import { YStack } from "tamagui";
import { Icon, IconName } from "./Icon";

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  /** solid: filled with `color`; soft: tinted card; plain: no background. */
  variant?: "solid" | "soft" | "plain";
  color?: "primary" | "like" | "nope" | "superLike" | "text" | "textMuted" | "warning";
  disabled?: boolean;
  testID?: string;
  elevated?: boolean;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 44,
  iconSize,
  variant = "plain",
  color = "text",
  disabled,
  testID,
  elevated
}: IconButtonProps) {
  const background =
    variant === "solid" ? `$${color}` : variant === "soft" ? "$backgroundStrong" : "transparent";
  // Android draws elevation shadows as solid shapes through translucent views,
  // so disabled (semi-transparent) buttons drop their shadow.
  const shadow = Boolean(elevated && !disabled);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] })}
    >
      <YStack
        width={size}
        height={size}
        borderRadius={size / 2}
        alignItems="center"
        justifyContent="center"
        backgroundColor={background as never}
        borderWidth={variant === "soft" ? 1 : 0}
        borderColor="$border"
        shadowColor="#000"
        shadowOpacity={shadow ? 0.12 : 0}
        shadowRadius={shadow ? 10 : 0}
        shadowOffset={{ width: 0, height: 4 }}
        elevation={shadow ? 4 : 0}
      >
        <Icon
          name={icon}
          size={iconSize ?? Math.round(size * 0.5)}
          color={variant === "solid" ? "primaryForeground" : color}
        />
      </YStack>
    </Pressable>
  );
}
