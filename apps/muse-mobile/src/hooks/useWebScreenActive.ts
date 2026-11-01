import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/** Hidden tabs and mounted background screens must not keep polling Firebase. */
export function useWebScreenActive(): boolean {
  const focused = useIsFocused();
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  // Preserve native behavior while native development is paused.
  return Platform.OS !== "web" || (focused && visible);
}
