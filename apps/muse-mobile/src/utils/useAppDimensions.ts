import { Platform, useWindowDimensions } from "react-native";

/** Width of the app panel, including when it sits beside the desktop sidebar. */
export function useAppDimensions() {
  const dimensions = useWindowDimensions();
  return { ...dimensions, width: Platform.OS === "web" ? Math.min(520, dimensions.width) : dimensions.width };
}
