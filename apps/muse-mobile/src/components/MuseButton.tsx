import type { ComponentProps, ReactElement } from "react";
import { useWindowDimensions } from "react-native";
import { Button, Spinner, styled, useTheme } from "tamagui";

const textProps = {
  numberOfLines: 2,
  textAlign: "center",
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.9
} as const;

// Tamagui's Button size variant sets `height: 44`. A larger minHeight alone
// makes the button draw taller than the space its parent gives it, so it spills
// into what comes next (e.g. under the navigation bar). Set the height itself.
const PrimaryButtonBase = styled(Button, {
  backgroundColor: "$primary",
  borderRadius: 999,
  color: "$primaryForeground",
  fontWeight: "700",
  textProps,
  height: 54,
  minHeight: 54,
  paddingHorizontal: "$5",
  flexShrink: 0,
  borderWidth: 0,
  pressStyle: { backgroundColor: "$primaryPressed", scale: 0.98 },
  disabledStyle: { opacity: 0.5 }
});

const SecondaryButtonBase = styled(Button, {
  backgroundColor: "$backgroundStrong",
  borderRadius: 999,
  color: "$text",
  fontWeight: "600",
  textProps,
  height: 54,
  minHeight: 54,
  paddingHorizontal: "$5",
  flexShrink: 0,
  borderWidth: 1,
  borderColor: "$border",
  pressStyle: { backgroundColor: "$backgroundSoft", scale: 0.98 },
  disabledStyle: { opacity: 0.5 }
});

const GhostButtonBase = styled(Button, {
  backgroundColor: "transparent",
  borderRadius: 999,
  color: "$primary",
  fontWeight: "600",
  textProps,
  minHeight: 44,
  paddingHorizontal: "$3",
  borderWidth: 0,
  pressStyle: { backgroundColor: "$backgroundSoft" },
  disabledStyle: { opacity: 0.5 }
});

type BaseProps = ComponentProps<typeof PrimaryButtonBase>;
type MuseButtonProps = BaseProps & { loading?: boolean; leftIcon?: ReactElement };

/** Taller hit targets when the system font is enlarged. */
function useSizing() {
  const { fontScale } = useWindowDimensions();
  if (fontScale >= 1.5) return { height: 68, minHeight: 68 };
  if (fontScale >= 1.3) return { height: 62, minHeight: 62 };
  return {};
}

function useLoadingIcon(loading: boolean | undefined, colorToken: "primaryForeground" | "text" | "primary") {
  const theme = useTheme();
  return loading ? <Spinner size="small" color={theme[colorToken]?.val} /> : undefined;
}

export function PrimaryButton({ loading, leftIcon, disabled, ...props }: MuseButtonProps) {
  const sizing = useSizing();
  const spinner = useLoadingIcon(loading, "primaryForeground");
  return (
    <PrimaryButtonBase
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      {...sizing}
      {...props}
      disabled={disabled || loading}
      icon={spinner ?? leftIcon}
    />
  );
}

export function SecondaryButton({ loading, leftIcon, disabled, ...props }: MuseButtonProps) {
  const sizing = useSizing();
  const spinner = useLoadingIcon(loading, "text");
  return (
    <SecondaryButtonBase
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      {...sizing}
      {...props}
      disabled={disabled || loading}
      icon={spinner ?? leftIcon}
    />
  );
}

export function GhostButton({ loading, leftIcon, disabled, ...props }: MuseButtonProps) {
  const spinner = useLoadingIcon(loading, "primary");
  return (
    <GhostButtonBase
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      {...props}
      disabled={disabled || loading}
      icon={spinner ?? leftIcon}
    />
  );
}
