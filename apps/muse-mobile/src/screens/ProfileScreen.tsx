import { useState } from "react";
import { Image, Linking, ScrollView, Share, useWindowDimensions } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Screen } from "../components/Screen";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { useAuthStore } from "../store/authStore";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppStackParamList } from "../navigation/stacks/AppStack";
import { museCards } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { datingIntentionMap } from "../data/datingIntentions";
import { vibeMap } from "../data/vibes";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ProfileScreen() {
  const profile = useAuthStore((state) => state.profile);
  const isGuest = useAuthStore((state) => state.isGuest);
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { width } = useWindowDimensions();
  const photoWidth = Math.min(width - 32, 420);
  const photoHeight = Math.round(photoWidth * 1.25);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const extraBottomPadding = Math.max(0, tabBarHeight - insets.bottom);

  if (!profile) {
    return (
      <Screen>
        <Text color="$textMuted">Profile loading...</Text>
      </Screen>
    );
  }

  const interestMap = new Map(museCards.map((card) => [card.id, card]));
  const photos = profile.photoUrls ?? [];
  const quickAnswers = profile.quickAnswers ?? [];
  const quickAnswerItems = quickAnswers.map((entry) => ({
    question: rapidQuestionMap.get(entry.questionId)?.question ?? "Quick take",
    answer: entry.answer
  }));
  const intentionItems = (profile.intentions ?? [])
    .map((id) => datingIntentionMap.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const vibeItems = (profile.vibes ?? [])
    .map((id) => vibeMap.get(id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const completionItems = [
    profile.displayName,
    profile.age,
    profile.city,
    profile.bio,
    photos.length > 0,
    profile.interests?.length,
    profile.intentions?.length,
    profile.vibes?.length,
    quickAnswerItems.length
  ];
  const completedCount = completionItems.filter(Boolean).length;
  const totalCount = completionItems.length;
  const completionPercent = Math.round((completedCount / totalCount) * 100);
  const handleShareProfile = async () => {
    const link = `muse://profile/${profile.uid}`;
    await Share.share({
      message: `Check out my Muse profile: ${link}`
    });
  };

  return (
    <Screen scrollable extraBottomPadding={extraBottomPadding}>
      <YStack gap="$4">
        {isGuest ? (
          <YStack
            backgroundColor="$backgroundStrong"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$border"
            gap="$3"
          >
            <Text fontWeight="700">You’re exploring as a guest</Text>
            <Text color="$textMuted">
              Create an account to save your profile, chat, and book calls.
            </Text>
            <PrimaryButton onPress={resetAuth}>Create account</PrimaryButton>
          </YStack>
        ) : null}
        <YStack
          backgroundColor="$backgroundStrong"
          padding="$4"
          borderRadius="$5"
          borderWidth={1}
          borderColor="$border"
          gap="$2"
        >
          <Text fontWeight="700">Profile strength</Text>
          <Text color="$textMuted">{completionPercent}% complete</Text>
          <YStack height={10} borderRadius={999} backgroundColor="$backgroundSoft" overflow="hidden">
            <YStack
              height="100%"
              width={`${completionPercent}%`}
              backgroundColor="$primary"
              borderRadius={999}
            />
          </YStack>
          <Text fontSize="$2" color="$textMuted">
            Complete your profile to get better matches.
          </Text>
        </YStack>
        <YStack gap="$2">
          <Text fontSize="$8" fontWeight="700">
            {profile.displayName}
          </Text>
          <Text color="$textMuted">{profile.pronouns}</Text>
          {profile.city ? <Text color="$textMuted">{profile.city}</Text> : null}
          <YStack
            backgroundColor="$backgroundStrong"
            padding="$4"
            borderRadius="$5"
            borderWidth={1}
            borderColor="$border"
          >
            <Text>{profile.bio}</Text>
          </YStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="700">Vibes</Text>
          {vibeItems.length ? (
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
          ) : (
            <YStack
              backgroundColor="$backgroundSoft"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
            >
              <Text color="$textMuted">Pick a few vibes to show your energy.</Text>
            </YStack>
          )}
        </YStack>

        <YStack gap="$3">
          <Text fontWeight="700">Photo reel</Text>
          {photos.length ? (
            <>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={(event) => {
                  const index = Math.round(event.nativeEvent.contentOffset.x / photoWidth);
                  setActivePhotoIndex(index);
                }}
              >
                {photos.map((uri) => (
                  <Image
                    key={uri}
                    source={{ uri }}
                    style={{ width: photoWidth, height: photoHeight, borderRadius: 22, marginRight: 12 }}
                  />
                ))}
              </ScrollView>
              <XStack justifyContent="center" gap="$2">
                {photos.map((_, index) => (
                  <YStack
                    key={`photo-dot-${index}`}
                    width={8}
                    height={8}
                    borderRadius={999}
                    backgroundColor={index === activePhotoIndex ? "$primary" : "$border"}
                  />
                ))}
              </XStack>
            </>
          ) : (
            <YStack
              height={photoHeight}
              borderRadius="$5"
              backgroundColor="$backgroundSoft"
              alignItems="center"
              justifyContent="center"
            >
              <Text color="$textMuted">Add photos to share your vibe.</Text>
            </YStack>
          )}
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="700">Muse Cards</Text>
          <XStack gap="$2" flexWrap="wrap">
            {profile.interests.map((interest) => {
              const card = interestMap.get(interest);
              const label = card ? `${card.emoji} ${card.title}` : interest;
              return (
                <Text
                  key={interest}
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor="$backgroundSoft"
                  borderRadius="$5"
                  fontSize="$2"
                >
                  {label}
                </Text>
              );
            })}
          </XStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="700">Looking for</Text>
          {intentionItems.length ? (
            <XStack gap="$2" flexWrap="wrap">
              {intentionItems.map((item) => (
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
          ) : (
            <YStack
              backgroundColor="$backgroundSoft"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
            >
              <Text color="$textMuted">Add what you’re looking for to guide matches.</Text>
            </YStack>
          )}
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="700">Rapid questions</Text>
          {quickAnswerItems.length ? (
            <YStack gap="$2">
              {quickAnswerItems.map((item, index) => (
                <YStack
                  key={`${item.question}-${index}`}
                  backgroundColor="$backgroundStrong"
                  padding="$3"
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$border"
                >
                  <Text fontWeight="600">{item.question}</Text>
                  <Text color="$textMuted">{item.answer}</Text>
                </YStack>
              ))}
            </YStack>
          ) : (
            <YStack
              backgroundColor="$backgroundSoft"
              padding="$3"
              borderRadius="$4"
              borderWidth={1}
              borderColor="$border"
              gap="$2"
            >
              <Text color="$textMuted">Answer quick questions to boost Blind Dates.</Text>
              <SecondaryButton onPress={() => navigation.navigate("EditProfile")}>
                Add quick answers
              </SecondaryButton>
            </YStack>
          )}
        </YStack>

        <PrimaryButton onPress={() => navigation.navigate("EditProfile")}>Edit profile</PrimaryButton>
        <SecondaryButton onPress={() => navigation.navigate("EditPhotos")}>Edit photos</SecondaryButton>
        <SecondaryButton onPress={handleShareProfile}>Share profile</SecondaryButton>
        <SecondaryButton testID="profile-settings" onPress={() => navigation.navigate("Settings")}>
          Settings
        </SecondaryButton>
        <YStack gap="$2">
          <Text fontWeight="600">Support</Text>
          <Text color="$textMuted">support@muse.com</Text>
          <SecondaryButton onPress={() => Linking.openURL("mailto:support@muse.com")}>
            Email support
          </SecondaryButton>
        </YStack>
      </YStack>
    </Screen>
  );
}
