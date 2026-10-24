import { ageGapLabel } from "../data/ageGap";
import { diwaliBadge } from "../data/diwali";
import { garbaBadge } from "../data/garba";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { cardBasics } from "../data/basics";
import { datingIntentionMap } from "../data/datingIntentions";
import { museCardMap } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { resolveServerUrl } from "../services/testServer";
import type { DiscoverProfile } from "../types/models";
import { compatibilityLabel, reasonLines } from "../utils/insights";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { SecondaryButton } from "./MuseButton";

/** Key by uid in the parent: each new person begins with their photo covered. */
export function VibeFirstCard({ profile, onOpen }: { profile: DiscoverProfile; onOpen: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const reasons = reasonLines(profile.reasons).filter((line) => line !== "Active today").slice(0, 2);
  const answer = profile.quickAnswers.find((item) => rapidQuestionMap.has(item.questionId));
  const intentions = profile.intentions.map((id) => datingIntentionMap.get(id)).filter(Boolean);
  const interests = profile.interests.map((id) => museCardMap.get(id)).filter(Boolean).slice(0, 4);
  const score = compatibilityLabel(profile.compatibility);
  const basicsLine = cardBasics(profile.basics, profile.languages);
  return (
    <YStack testID="vibe-card" flex={1} borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong" borderRadius={28} overflow="hidden">
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}>
        {revealed && profile.photoUrls[0] ? (
          <YStack height={240} borderRadius={20} overflow="hidden" backgroundColor="$backgroundSoft" alignItems="center" justifyContent="center" gap="$2" padding="$3">
            {photoError ? <><Icon name="cloud-offline-outline" color="textMuted" size={28} /><Text color="$textMuted" textAlign="center">We couldn’t load this photo.</Text><SecondaryButton onPress={() => { setPhotoError(false); setPhotoLoaded(false); setPhotoAttempt((value) => value + 1); }}>Try again</SecondaryButton></> : <>
              {!photoLoaded ? <><Icon name="image-outline" size={28} color="textMuted" /><Text color="$textMuted">Loading photo…</Text></> : null}
              <Image key={photoAttempt} testID="vibe-revealed-photo" source={{ uri: resolveServerUrl(profile.photoUrls[0]) }} style={{ position: "absolute", inset: 0 }} contentFit="cover" transition={180} onLoad={() => setPhotoLoaded(true)} onError={() => setPhotoError(true)} accessibilityLabel={`${profile.displayName}’s profile photo`} />
            </>}
          </YStack>
        ) : revealed ? <Text color="$textMuted" fontSize="$2">{profile.photosPrivate ? "Their photos unlock when you match." : "No photo added yet."}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${profile.displayName}’s full profile`} onPress={onOpen}>
          <XStack alignItems="center" justifyContent="space-between" gap="$2" minHeight={48}>
            <YStack flex={1} gap={2}>
              <Text fontSize={25} lineHeight={31} fontWeight="700" accessibilityRole="header">{profile.displayName}, {profile.age}</Text>
              {profile.photoVerified ? <XStack gap={4} alignItems="center"><Icon name="shield-checkmark" size={14} color="primary" /><Text fontSize={10} color="$primary">Photos checked</Text></XStack> : null}
              <Text color="$textMuted" fontSize="$1">{profile.city || "Location not shared"}</Text>
              {basicsLine ? <Text color="$textMuted" fontSize="$1">{basicsLine}</Text> : null}
              {profile.requiresNote ? <XStack gap={4} alignItems="center"><Icon name="chatbubble-ellipses" size={12} color="primary" /><Text fontSize={11} color="$primary" fontWeight="700">Likes with a note only</Text></XStack> : null}
              {profile.ageGap ? <Text fontSize={11} color="$primary" fontWeight="700">{ageGapLabel(profile.ageGap, profile.gender)}</Text> : null}
              {profile.diwaliShared ? <Text testID="vibe-diwali" fontSize={11} color="$primary" fontWeight="700">{diwaliBadge(profile.diwaliShared)}</Text> : null}
              {profile.garbaShared ? <Text fontSize={11} color="$primary" fontWeight="700">{garbaBadge(profile.garbaShared)}</Text> : null}
            </YStack>
            <YStack alignItems="flex-end" gap={5}>
              {score ? <Text fontSize="$1" fontWeight="700" color="$primary">{score}</Text> : null}
              {profile.matchingSource === "ai" ? <Text fontSize={10} color="$textMuted">AI-assisted order</Text> : null}
              <Icon name="arrow-forward" size={17} color="primary" />
            </YStack>
          </XStack>
        </Pressable>
        {answer ? (
          <YStack gap="$1" padding={10} borderRadius={16} backgroundColor="$primarySoft">
            <Text color="$textMuted" fontSize="$1">{rapidQuestionMap.get(answer.questionId)!.question}</Text>
            <Text fontSize={24} lineHeight={31} fontWeight="600">“{answer.answer}”</Text>
          </YStack>
        ) : profile.bio ? (
          <Text fontSize="$4" lineHeight={25}>{profile.bio}</Text>
        ) : <Text color="$textMuted">They haven’t added a prompt answer yet. Explore their interests below.</Text>}
        {intentions.length ? <XStack gap="$2" flexWrap="wrap">{intentions.map((item) => <Chip key={item!.id} label={item!.label} emoji={item!.emoji} size="sm" />)}</XStack> : null}
        {reasons.length ? <YStack gap="$2">{reasons.map((reason) => <XStack key={reason} gap="$2" alignItems="flex-start"><Icon name="git-compare-outline" size={17} color="primary" /><Text flex={1} fontSize="$2" lineHeight={21}>{reason}</Text></XStack>)}</YStack> : null}
        {interests.length ? <XStack gap="$2" flexWrap="wrap">{interests.map((item) => <Chip key={item!.id} label={item!.title} emoji={item!.emoji} size="sm" />)}</XStack> : null}
      </ScrollView>
      <YStack padding="$3" borderTopWidth={1} borderColor="$border" gap="$1">
        {!revealed ? <SecondaryButton testID="vibe-reveal" onPress={() => { setRevealed(true); scrollRef.current?.scrollTo({ y: 0, animated: true }); }} leftIcon={<Icon name="eye-outline" size={18} />}>Reveal photo</SecondaryButton> : <SecondaryButton testID="vibe-full-profile" onPress={onOpen}>Explore full profile</SecondaryButton>}
        <Text textAlign="center" color="$textMuted" fontSize={10} lineHeight={14}>Revealing never sends a like. Full profiles are always available.</Text>
      </YStack>
    </YStack>
  );
}
