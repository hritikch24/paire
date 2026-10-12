import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * True when the member asked their device (or browser) for less motion.
 * Delight animations then become simple fades or nothing at all.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => active && setReduced(value))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener?.("reduceMotionChanged", setReduced);
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);
  return reduced;
}
