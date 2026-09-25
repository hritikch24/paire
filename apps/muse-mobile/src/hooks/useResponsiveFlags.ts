import { useWindowDimensions } from "react-native";

type ResponsiveFlags = {
  width: number;
  height: number;
  fontScale: number;
  isSmallWidth: boolean;
  isShort: boolean;
  isLargeText: boolean;
  isCompact: boolean;
};

export function useResponsiveFlags(): ResponsiveFlags {
  const { width, height, fontScale } = useWindowDimensions();
  const isSmallWidth = width <= 360;
  const isShort = height <= 760;
  const isLargeText = fontScale >= 1.1;
  const isCompact = isSmallWidth || isShort || isLargeText;

  return {
    width,
    height,
    fontScale,
    isSmallWidth,
    isShort,
    isLargeText,
    isCompact
  };
}
