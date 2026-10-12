import { ageGapLabel } from "../data/ageGap";
import { garbaBadge } from "../data/garba";
import type { ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";
import { basicsLines, languageLabels } from "../data/basics";
import { datingIntentionMap } from "../data/datingIntentions";
import { museCardMap } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { vibeMap } from "../data/vibes";
import { AgeGapSide, MatchReason, ProfileBasics, QuickAnswer } from "../types/models";
import { compatibilityLabel, reasonLines } from "../utils/insights";
import { formatLastActive } from "../utils/time";
import { GENDER_LABELS } from "../utils/profile";
import { Chip } from "./Chip";
import { Icon } from "./Icon";

export type ProfileViewData = {
  uid: string;
  displayName: string;
  age: number;
  gender?: keyof typeof GENDER_LABELS;
  pronouns?: string;
  city?: string;
  bio?: string;
  photoUrls: string[];
  interests: string[];
  intentions?: string[];
  vibes?: string[];
  quickAnswers?: QuickAnswer[];
  languages?: string[];
  basics?: ProfileBasics;
  photosPrivate?: boolean;
  isNew?: boolean;
  note?: string;
  lastActiveAt?: number;
  distanceKm?: number | null;
  superLikedYou?: boolean;
  photoVerified?: boolean;
  matchingSource?: "rules" | "ai";
  compatibility?: number;
  reasons?: MatchReason[];
  casualMatch?: boolean;
  ageGap?: AgeGapSide;
  garbaShared?: number;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="$2" backgroundColor="$backgroundStrong" borderRadius="$5" borderWidth={1} borderColor="$border" padding="$4">
      <Text fontSize="$2" fontWeight="700" color="$textMuted" textTransform="uppercase">
        {title}
      </Text>
      {children}
    </YStack>
  );
}

export function ProfileHeadline({ profile }: { profile: ProfileViewData }) {
  const meta = [
    profile.gender ? GENDER_LABELS[profile.gender] : null,
    profile.pronouns || null,
    profile.city || null
  ].filter(Boolean);
  const active = formatLastActive(profile.lastActiveAt);
  return (
    <YStack gap="$1">
      <Text fontSize="$8" fontWeight="700">
        {profile.displayName}, {profile.age}
      </Text>
      {meta.length ? <Text color="$textMuted">{meta.join(" · ")}</Text> : null}
      <XStack gap="$3" flexWrap="wrap" alignItems="center">
        {typeof profile.distanceKm === "number" ? (
          <XStack gap="$1" alignItems="center">
            <Icon name="location-outline" size={16} color="textMuted" />
            <Text color="$textMuted" fontSize="$2">
              {profile.distanceKm} km away
            </Text>
          </XStack>
        ) : null}
        {active ? (
          <XStack gap="$1" alignItems="center">
            <YStack width={8} height={8} borderRadius={4} backgroundColor="$like" />
            <Text color="$textMuted" fontSize="$2">
              {active}
            </Text>
          </XStack>
        ) : null}
      </XStack>
    </YStack>
  );
}

/** Everything below the photos on a full profile. */
export function ProfileDetails({ profile }: { profile: ProfileViewData }) {
  const intentions = (profile.intentions ?? []).map((id) => datingIntentionMap.get(id)).filter(Boolean);
  const vibes = (profile.vibes ?? []).map((id) => vibeMap.get(id)).filter(Boolean);
  const cards = profile.interests.map((id) => museCardMap.get(id)).filter(Boolean);
  const answers = (profile.quickAnswers ?? []).filter((entry) => rapidQuestionMap.has(entry.questionId));
  const reasons = reasonLines(profile.reasons);
  const basics = basicsLines(profile.basics);
  const languages = languageLabels(profile.languages);
  const match = compatibilityLabel(profile.compatibility);

  return (
    <YStack gap="$3">
      {reasons.length ? (
        <YStack gap="$2" backgroundColor="$primarySoft" borderRadius="$5" padding="$4">
          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <XStack alignItems="center" gap="$2">
              <Icon name="sparkles" size={18} color="primary" />
              <Text fontSize="$2" fontWeight="700" color="$primary" textTransform="uppercase">
                Why you'd click
              </Text>
            </XStack>
            {match ? (
              <Text fontSize="$2" fontWeight="700" color="$primary">
                {match}
              </Text>
            ) : null}
          </XStack>
          {reasons.map((line) => (
            <Text key={line} fontSize="$3">
              {line}
            </Text>
          ))}
          <Text fontSize="$1" color="$textMuted">
            {profile.matchingSource === "ai" ? "AI-assisted ordering based on your selected interests, vibes and intentions. " : "Based on shared profile choices. "}A vibe score is a ranking hint, not a relationship prediction.
          </Text>
        </YStack>
      ) : null}
      {profile.note ? (
        <YStack gap="$2" backgroundColor="$backgroundStrong" borderRadius="$5" borderWidth={2} borderColor="$primary" padding="$4">
          <XStack alignItems="center" gap="$2">
            <Icon name="chatbubble-ellipses" size={18} color="primary" />
            <Text fontSize="$2" fontWeight="700" color="$primary" textTransform="uppercase">
              Their note to you
            </Text>
          </XStack>
          <Text fontSize="$5" lineHeight={26}>
            “{profile.note}”
          </Text>
        </YStack>
      ) : null}
      {profile.photosPrivate ? (
        <XStack gap="$2" alignItems="center" backgroundColor="$backgroundSoft" borderRadius="$5" padding="$3">
          <Icon name="lock-closed-outline" size={18} color="textMuted" />
          <Text flex={1} fontSize="$2" color="$textMuted">
            {profile.displayName} keeps photos private until you match. Get to know their vibe first.
          </Text>
        </XStack>
      ) : null}
      {profile.photoVerified ? <Text color="$primary" fontSize="$2">Photos checked · a photo check doesn’t guarantee safety</Text> : null}
      {profile.ageGap ? <Text testID="profile-agegap" color="$primary" fontSize="$2" fontWeight="700">{ageGapLabel(profile.ageGap, profile.gender)}</Text> : null}
      {profile.garbaShared ? <Text testID="profile-garba" color="$primary" fontSize="$2" fontWeight="700">{garbaBadge(profile.garbaShared)}</Text> : null}
      {profile.bio ? (
        <Section title="About me">
          <Text fontSize="$4" lineHeight={24}>
            {profile.bio}
          </Text>
        </Section>
      ) : null}
      {intentions.length ? (
        <Section title="Looking for">
          <XStack gap="$2" flexWrap="wrap">
            {intentions.map((item) => (
              <Chip key={item!.id} label={item!.label} emoji={item!.emoji} />
            ))}
          </XStack>
        </Section>
      ) : null}
      {basics.length || languages.length ? (
        <Section title="Basics">
          <XStack gap="$2" flexWrap="wrap">
            {basics.map((line) => (
              <Chip key={line.key} label={line.label} emoji={line.icon} />
            ))}
            {languages.length ? <Chip label={languages.join(", ")} emoji="🗣️" /> : null}
          </XStack>
        </Section>
      ) : null}
      {vibes.length ? (
        <Section title="Vibes">
          <XStack gap="$2" flexWrap="wrap">
            {vibes.map((item) => (
              <Chip key={item!.id} label={item!.label} emoji={item!.emoji} />
            ))}
          </XStack>
        </Section>
      ) : null}
      {cards.length ? (
        <Section title="Interests">
          <XStack gap="$2" flexWrap="wrap">
            {cards.map((item) => (
              <Chip key={item!.id} label={item!.title} emoji={item!.emoji} />
            ))}
          </XStack>
        </Section>
      ) : null}
      {answers.map((entry) => (
        <Section key={entry.questionId} title={rapidQuestionMap.get(entry.questionId)!.question}>
          <Text fontSize="$5" fontWeight="600">
            {entry.answer}
          </Text>
        </Section>
      ))}
    </YStack>
  );
}
