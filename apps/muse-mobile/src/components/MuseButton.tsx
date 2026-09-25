import { Button, styled } from "tamagui";
import { useWindowDimensions } from "react-native";
import type { ComponentProps } from "react";

const baseTextProps = {
  numberOfLines: 2,
  textAlign: "center",
  adjustsFontSizeToFit: true,
  minimumFontScale: 0.9
} as const;

const PrimaryButtonBase = styled(Button, {
  backgroundColor: "$primary",
  borderRadius: "$5",
  color: "$primaryForeground",
  fontWeight: "700",
  textProps: baseTextProps,
  minHeight: 56,
  paddingHorizontal: "$4",
  paddingVertical: "$3",
  flexShrink: 0,
  shadowColor: "#000000",
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 4,
  pressStyle: { opacity: 0.9, scale: 0.98 },
  hoverStyle: { opacity: 0.95 }
});

const SecondaryButtonBase = styled(Button, {
  backgroundColor: "$backgroundSoft",
  borderRadius: "$5",
  color: "$text",
  fontWeight: "600",
  textProps: baseTextProps,
  minHeight: 56,
  paddingHorizontal: "$4",
  paddingVertical: "$3",
  flexShrink: 0,
  borderWidth: 1,
  borderColor: "$border",
  pressStyle: { opacity: 0.85, scale: 0.98 }
});

type MuseButtonProps = ComponentProps<typeof PrimaryButtonBase>;

const useButtonSizing = () => {
  const { fontScale } = useWindowDimensions();
  if (fontScale >= 1.5) {
    return { minHeight: 72, paddingVertical: "$4" };
  }
  if (fontScale >= 1.3) {
    return { minHeight: 64, paddingVertical: "$3" };
  }
  return { minHeight: 56, paddingVertical: "$3" };
};

export function PrimaryButton(props: MuseButtonProps) {
  const sizing = useButtonSizing();
  return <PrimaryButtonBase {...sizing} {...props} />;
}

export function SecondaryButton(props: MuseButtonProps) {
  const sizing = useButtonSizing();
  return <SecondaryButtonBase {...sizing} {...props} />;
}
