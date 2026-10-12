import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { museCardMap } from "../data/museCards";
import { rapidQuestionMap } from "../data/rapidQuestions";
import { DiscoverProfile } from "../types/models";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { GhostButton, PrimaryButton } from "./MuseButton";
import { TextField } from "./MuseInput";

export const NOTE_MAX = 140;

/** Starters drawn only from what they chose to share, so a note never feels generic. */
export function noteStarters(profile: Pick<DiscoverProfile, "quickAnswers" | "interests" | "displayName">): string[] {
  const starters: string[] = [];
  const answer = profile.quickAnswers.find((item) => rapidQuestionMap.has(item.questionId));
  if (answer) starters.push(`“${answer.answer}”, really? I need the story behind that.`);
  const card = profile.interests.map((id) => museCardMap.get(id)).find(Boolean);
  if (card) starters.push(`A fellow ${card.title.toLowerCase()} person! What got you into it?`);
  starters.push("Your profile made me smile. Chai or coffee for a first chat?");
  return starters.map((text) => text.slice(0, NOTE_MAX));
}

type Props = {
  profile: DiscoverProfile | null;
  /** "super" when the note goes with a Super Like. */
  kind: "like" | "super";
  /** A note to start from, e.g. one the server just refused, so nothing typed is lost. */
  draft?: string;
  onSend: (note: string | null) => void;
  onClose: () => void;
};

/**
 * "Send a spark": a like with a short note. Notes stand out in their likes and
 * open your chat if you match. Some members only accept likes with a note.
 */
export function SparkComposer({ profile, kind, draft, onSend, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState(draft ?? "");
  useEffect(() => setNote(draft ?? ""), [profile?.uid, draft]);
  const starters = useMemo(() => (profile ? noteStarters(profile) : []), [profile]);
  if (!profile) return null;
  const name = profile.displayName.split(" ")[0];
  const required = profile.requiresNote === true;
  const trimmed = note.trim();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close">
          <YStack flex={1} backgroundColor="$overlay" justifyContent="flex-end">
            <Pressable onPress={() => undefined}>
              <YStack
                testID="spark-composer"
                backgroundColor="$backgroundStrong"
                borderTopLeftRadius="$6"
                borderTopRightRadius="$6"
                padding="$4"
                paddingBottom={insets.bottom + 16}
                gap="$3"
                maxWidth={560}
                width="100%"
                alignSelf="center"
              >
                <XStack alignItems="center" gap="$2">
                  <Icon name={kind === "super" ? "star" : "chatbubble-ellipses"} size={22} color={kind === "super" ? "superLike" : "primary"} />
                  <Text flex={1} fontSize="$6" fontWeight="700" accessibilityRole="header">
                    {kind === "super" ? `Super Like ${name} with a note` : `Send ${name} a note`}
                  </Text>
                </XStack>
                <Text color="$textMuted" fontSize="$2" lineHeight={20}>
                  {required
                    ? `${name} only accepts likes with a note. Say why you'd click: it's the first thing they'll read.`
                    : "A short note travels with your like. It's the first thing they read, and it opens your chat if you match."}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {starters.map((starter) => (
                    <Chip key={starter} label={starter} size="sm" onPress={() => setNote(starter)} />
                  ))}
                </ScrollView>
                <TextField
                  testID="spark-note"
                  placeholder={`Write something only ${name} would get…`}
                  value={note}
                  onChangeText={setNote}
                  maxLength={NOTE_MAX}
                  multiline
                  minHeight={88}
                  paddingTop="$3"
                  textAlignVertical="top"
                  showCount
                  autoFocus
                  helper="Keep it kind. Numbers, links and money talk can't be sent."
                />
                <PrimaryButton testID="spark-send" disabled={!trimmed} onPress={() => onSend(trimmed)}>
                  {kind === "super" ? "Send Super Like" : "Send like with note"}
                </PrimaryButton>
                {required ? (
                  <GhostButton onPress={onClose}>Not now</GhostButton>
                ) : (
                  <GhostButton testID="spark-skip" onPress={() => onSend(null)}>
                    {kind === "super" ? "Send without a note" : "Like without a note"}
                  </GhostButton>
                )}
              </YStack>
            </Pressable>
          </YStack>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
