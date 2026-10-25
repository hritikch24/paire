import { YStack } from "tamagui";
import type { DiscoverProfile } from "../types/models";
import { PrimaryButton, SecondaryButton } from "./MuseButton";

/**
 * A woman's two answers to a like. Both lock while either is being sent, so a
 * double tap never sends twice.
 */
export function AcceptButtons({
  profile,
  idPrefix,
  pending,
  onAccept,
  onNotNow
}: {
  profile: DiscoverProfile;
  /** Test/DOM id prefix, e.g. "liked-you" gives liked-you-accept-<uid>. */
  idPrefix: string;
  pending: boolean;
  onAccept: (profile: DiscoverProfile) => void;
  onNotNow: (profile: DiscoverProfile) => void;
}) {
  const name = profile.displayName.split(" ")[0];
  return (
    <YStack gap={6} alignSelf="stretch">
      <PrimaryButton
        testID={`${idPrefix}-accept-${profile.uid}`}
        accessibilityLabel={`Accept ${name}'s like and start a chat`}
        height={40}
        minHeight={40}
        paddingHorizontal="$2"
        disabled={pending}
        onPress={() => onAccept(profile)}
      >
        Accept
      </PrimaryButton>
      <SecondaryButton
        testID={`${idPrefix}-notnow-${profile.uid}`}
        accessibilityLabel={`Not now for ${name}`}
        height={40}
        minHeight={40}
        paddingHorizontal="$2"
        disabled={pending}
        onPress={() => onNotNow(profile)}
      >
        Not now
      </SecondaryButton>
    </YStack>
  );
}
