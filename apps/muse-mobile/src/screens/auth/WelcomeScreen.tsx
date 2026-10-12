import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, XStack, YStack } from "tamagui";
import { Icon, IconName } from "../../components/Icon";
import { LegalLinks } from "../../components/LegalText";
import { PrimaryButton, SecondaryButton } from "../../components/MuseButton";
import type { AuthStackParamList } from "../../navigation/types";
import { useState } from "react";
import { GoogleButton } from "../../components/GoogleButton";

const HIGHLIGHTS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "mail-unread-outline", title: "Likes that say something", text: "Add a note to any like. It opens your chat if you match." },
  { icon: "lock-closed-outline", title: "Your rules, free", text: "Incognito, private photos, notes only, and “I'll message first”." },
  { icon: "heart-outline", title: "See who likes you, free", text: "No paywall on the basics. Plus passes from ₹20, never auto-renewed." }
];

export function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const insets = useSafeAreaInsets();
  const [googleError, setGoogleError] = useState<string | null>(null);
  return (
    <YStack flex={1} backgroundColor="$background">
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: insets.top + 20, paddingBottom: 24, gap: 24 }}>
        <XStack justifyContent="space-between" alignItems="center" gap="$3" flexWrap="wrap">
          <Text fontSize={38} lineHeight={44} fontWeight="700" color="$primary" accessibilityLabel="Paire">paire<Text color="$text">.</Text></Text>
          <YStack paddingHorizontal="$3" paddingVertical="$2" borderRadius={999} borderWidth={1} borderColor="$border"><Text fontSize={10} lineHeight={14} fontWeight="700" color="$textMuted" letterSpacing={1}>MEN & WOMEN · 18+</Text></YStack>
        </XStack>
        <YStack gap="$3">
          <Text fontSize={42} lineHeight={48} fontWeight="700" letterSpacing={-1.5} accessibilityRole="header">Find your <Text color="$primary">Paire.</Text></Text>
          <Text color="$textMuted" fontSize="$4" lineHeight={25}>Women set the rules. Men get a fair chance. Send a note with your like, and see who likes you for free.</Text>
        </YStack>
        <YStack borderRadius={28} backgroundColor="$primarySoft" padding="$5" gap="$4" overflow="hidden" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <XStack alignItems="center" justifyContent="space-between" gap="$2">
            <Text color="$primary" fontSize={10} lineHeight={15} fontWeight="700" letterSpacing={1.6} flex={1}>THAT FIRST-DATE FEELING</Text>
            <Icon name="flower-outline" color="primary" size={30} />
          </XStack>
          <Text fontSize={29} lineHeight={38} fontWeight="600">Chai, a walk, and{"\n"}one more story.</Text>
          <XStack alignItems="center" gap="$2" flexWrap="wrap">
            <XStack backgroundColor="$backgroundStrong" borderRadius={999} paddingHorizontal="$3" paddingVertical="$2" gap={6} alignItems="center"><Icon name="musical-notes-outline" size={14} color="primary" /><Text fontSize="$2">A shared playlist</Text></XStack>
            <XStack backgroundColor="$backgroundStrong" borderRadius={999} paddingHorizontal="$3" paddingVertical="$2" gap={6} alignItems="center"><Icon name="cafe-outline" size={14} color="primary" /><Text fontSize="$2">A little chemistry</Text></XStack>
          </XStack>
        </YStack>
        <YStack gap="$4">
          {HIGHLIGHTS.map((item) => (
            <XStack key={item.title} gap="$3" alignItems="flex-start">
              <YStack width={40} height={40} borderRadius={14} backgroundColor="$backgroundSoft" alignItems="center" justifyContent="center"><Icon name={item.icon} color="primary" size={20} /></YStack>
              <YStack flex={1} gap={2}><Text fontWeight="700" fontSize="$3">{item.title}</Text><Text color="$textMuted" fontSize="$2" lineHeight={20}>{item.text}</Text></YStack>
            </XStack>
          ))}
        </YStack>
      </ScrollView>
        <YStack gap="$2" paddingHorizontal={24} paddingTop={12} paddingBottom={Math.max(insets.bottom, 12)} borderTopWidth={1} borderColor="$border" backgroundColor="$background">
          <PrimaryButton testID="welcome-create-account" onPress={() => navigation.navigate("SignUp")}>Find my kind of connection</PrimaryButton>
          <GoogleButton testID="welcome-google" onError={setGoogleError} />
          {googleError ? <Text color="$error" fontSize="$2" textAlign="center">{googleError}</Text> : null}
          <SecondaryButton testID="welcome-sign-in" onPress={() => navigation.navigate("SignIn")}>I already have an account</SecondaryButton>
          <LegalLinks prefix="Paire is for adults 18+. By continuing you agree to our" />
        </YStack>
    </YStack>
  );
}
