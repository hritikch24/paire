import { useQuery } from "@tanstack/react-query";
import { Image } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { RouteProp, useRoute } from "@react-navigation/native";
import { Screen } from "../components/Screen";
import { SecondaryButton } from "../components/MuseButton";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { doc, getDoc } from "@firebase/firestore/dist/index.cjs.js";
import { db } from "../services/firebase";
import { UserProfile } from "../types/models";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { datingIntentionMap } from "../data/datingIntentions";
import { useNavigation } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/RootNavigator";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../store/authStore";
import { distanceKm, formatDistanceKm } from "../utils/distance";
import { vibeMap } from "../data/vibes";
import { formatLastActive } from "../utils/formatLastActive";

export function PublicProfileScreen() {
  const route = useRoute<RouteProp<AppStackParamList, "PublicProfile">>();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const profile = useAuthStore((state) => state.profile);
  const { uid } = route.params;

  const { data } = useQuery({
    queryKey: ["public-profile", uid],
    queryFn: async () => {
      const snapshot = await getDoc(doc(db, "users", uid));
      return snapshot.data() as UserProfile | undefined;
    }
  });

  if (!data) {
    return (
      <Screen>
        <Text color="$textMuted">Profile unavailable.</Text>
      </Screen>
    );
  }

  const canShowDistance =
    Boolean(profile?.shareLocation && profile?.location) &&
    Boolean(data.shareLocation && data.location);
  const distanceLabel = canShowDistance
    ? formatDistanceKm(
        distanceKm(
          { lat: profile!.location!.lat, lng: profile!.location!.lng },
          { lat: data.location!.lat, lng: data.location!.lng }
        )
      )
    : "";
  const vibeItems = (data.vibes ?? [])
    .map((id) => vibeMap.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <Screen scrollable>
      <YStack gap="$4">
        <Text fontSize="$7" fontWeight="700">
          {data.displayName}
        </Text>
        <YStack gap="$1">
          <Text color="$textMuted">
            {[data.pronouns, data.age ? `${data.age}` : null, data.city]
              .filter(Boolean)
              .join(" • ")}
          </Text>
          {data.lastActiveAt ? (
            <Text color="$textMuted" fontSize="$2">
              {formatLastActive(data.lastActiveAt)}
            </Text>
          ) : null}
          {distanceLabel ? (
            <Text color="$textMuted" fontSize="$2">
              {distanceLabel}
            </Text>
          ) : null}
        </YStack>
        <XStack gap="$2" flexWrap="wrap">
          {data.photoUrls?.map((uri) => (
            <Image key={uri} source={{ uri }} style={{ width: 140, height: 180, borderRadius: 18 }} />
          ))}
        </XStack>
        <Text>{data.bio}</Text>
        {vibeItems.length ? (
          <YStack gap="$2">
            <Text fontWeight="700">Vibes</Text>
            <XStack gap="$2" flexWrap="wrap">
              {vibeItems.map((item) => (
                <Text
                  key={item.id}
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor="$backgroundSoft"
                  borderRadius="$5"
                  fontSize="$2"
                >
                  {item.emoji} {item.label}
                </Text>
              ))}
            </XStack>
          </YStack>
        ) : null}
        {data.intentions?.length ? (
          <YStack gap="$2">
            <Text fontWeight="700">Looking for</Text>
            <XStack gap="$2" flexWrap="wrap">
              {data.intentions
                .map((id) => datingIntentionMap.get(id))
                .filter((item): item is NonNullable<typeof item> => Boolean(item))
                .map((item) => (
                  <Text
                    key={item.id}
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    backgroundColor="$backgroundSoft"
                    borderRadius="$5"
                    fontSize="$2"
                  >
                    {item.emoji} {item.label}
                  </Text>
                ))}
            </XStack>
          </YStack>
        ) : null}
        {data.quickAnswers?.length ? (
          <YStack gap="$2">
            <Text fontWeight="700">Rapid questions</Text>
            {data.quickAnswers.map((entry, index) => (
              <YStack
                key={`${entry.questionId}-${index}`}
                backgroundColor="$backgroundStrong"
                padding="$3"
                borderRadius="$4"
                borderWidth={1}
                borderColor="$border"
              >
                <Text fontWeight="600">
                  {rapidQuestionMap.get(entry.questionId)?.question ?? "Quick take"}
                </Text>
                <Text color="$textMuted">{entry.answer}</Text>
              </YStack>
            ))}
          </YStack>
        ) : null}
        <SecondaryButton onPress={() => rootNavigation?.navigate("ReportBlock", { targetUid: uid })}>
          Report or block
        </SecondaryButton>
      </YStack>
    </Screen>
  );
}
