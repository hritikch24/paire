import { Alert } from "../services/dialog";
import { useNavigation } from "@react-navigation/native";
import { useEffect } from "react";

/** Asks before leaving a screen with unsaved edits. */
export function useUnsavedChangesGuard(dirty: boolean, onDiscard?: () => void) {
  const navigation = useNavigation();
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (!dirty) return;
        event.preventDefault();
        Alert.alert("Discard changes?", "You have unsaved changes.", [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Discard",
            style: "destructive",
            onPress: () => {
              onDiscard?.();
              navigation.dispatch(event.data.action);
            }
          }
        ]);
      }),
    [dirty, navigation, onDiscard]
  );
}
