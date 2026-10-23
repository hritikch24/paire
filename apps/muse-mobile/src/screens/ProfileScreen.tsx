import { useQuery } from "@tanstack/react-query";
import { fetchPremiumStatus } from "../services/billingService";
import { ProfileSharing } from "../components/ProfileSharing";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Linking, Platform, Pressable } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { PrimaryButton, SecondaryButton } from "../components/MuseButton";
import { Screen } from "../components/Screen";
import { SettingsRow, SettingsSection } from "../components/SettingsRow";
import { LoadingView } from "../components/States";
import { ThemeQuickPicker } from "../components/ThemeQuickPicker";
import { PREMIUM_PLANS } from "../config/premium";
import { legal } from "../config/legal";
import { useAuthStore } from "../store/authStore";
import { profileCompleteness } from "../utils/profile";
import type { AppStackParamList } from "../navigation/types";

export function ProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const profile = useAuthStore((state) => state.profile);
  const uid = useAuthStore((state) => state.user?.uid);
  const premium = useQuery({ queryKey: ["premium", uid], queryFn: fetchPremiumStatus, enabled: Boolean(uid && Platform.OS === "web"), staleTime: 60_000 });
  const lifetime = Platform.OS === "web" && premium.data?.lifetime === true;

  if (!profile) {
    return (
      <Screen edges={["top"]}>
        <LoadingView />
      </Screen>
    );
  }

  const { percent, missing } = profileCompleteness(profile);

  return (
    <Screen scroll edges={["top"]}>
      <XStack alignItems="center" justifyContent="space-between" marginBottom="$4">
        <Text fontSize="$8" fontWeight="700" accessibilityRole="header">
          Profile
        </Text>
        <IconButton testID="profile-settings" icon="settings-outline" accessibilityLabel="Settings" onPress={() => navigation.navigate("Settings")} />
      </XStack>

      <YStack alignItems="center" gap="$3" marginBottom="$5">
        <Pressable accessibilityRole="button" accessibilityLabel="Edit photos" onPress={() => navigation.navigate("EditPhotos")}>
          <Avatar uri={profile.photoUrls[0]} name={profile.displayName} size={128} ring />
          <YStack position="absolute" right={4} bottom={4} width={34} height={34} borderRadius={17} backgroundColor="$primary" alignItems="center" justifyContent="center" borderWidth={3} borderColor="$background">
            <Icon name="camera-outline" size={16} color="primaryForeground" />
          </YStack>
        </Pressable>
        <Text fontSize="$7" fontWeight="700">
          {profile.displayName}, {profile.age}
        </Text>
        <XStack gap="$3" width="100%">
          <YStack flex={1}>
            <PrimaryButton testID="profile-edit" onPress={() => navigation.navigate("EditProfile")}>
              Edit profile
            </PrimaryButton>
          </YStack>
          <YStack flex={1}>
            <SecondaryButton testID="profile-preview" onPress={() => navigation.navigate("ProfileView", { source: "self" })}>
              Preview
            </SecondaryButton>
          </YStack>
        </XStack>
        <ProfileSharing />
      </YStack>

      {percent < 100 ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate("EditProfile")}>
          <YStack gap="$2" padding="$4" borderRadius="$5" backgroundColor="$primarySoft" marginBottom="$5">
            <XStack justifyContent="space-between" alignItems="center">
              <Text fontWeight="700">Profile strength</Text>
              <Text fontWeight="700" color="$primary">
                {percent}%
              </Text>
            </XStack>
            <YStack height={8} borderRadius={4} backgroundColor="$backgroundStrong" overflow="hidden">
              <YStack height={8} width={`${percent}%`} backgroundColor="$primary" borderRadius={4} />
            </YStack>
            <Text color="$textMuted" fontSize="$2">
              Next: {missing[0]}. Complete profiles get more matches.
            </Text>
          </YStack>
        </Pressable>
      ) : null}

      <YStack gap="$5">
        <Pressable testID="profile-verification" accessibilityRole="button" accessibilityLabel="View photo verification status" onPress={() => navigation.navigate("Verification")}>
          <XStack padding="$4" borderRadius={24} backgroundColor="$backgroundStrong" borderColor="$border" borderWidth={1} gap="$3" alignItems="center">
            <YStack width={48} height={48} borderRadius={16} backgroundColor="$primarySoft" alignItems="center" justifyContent="center"><Icon name="scan-outline" color="primary" size={25} /></YStack>
            <YStack flex={1} gap={3}><Text fontWeight="700" fontSize="$4">A more trusted beginning</Text><Text fontSize="$2" color="$textMuted">Photo verification · check your status</Text></YStack>
            <Icon name="chevron-forward" size={18} color="textMuted" />
          </XStack>
        </Pressable>
        <Pressable testID="profile-premium" accessibilityRole="button" accessibilityLabel={lifetime ? "View your Lifetime Plus benefits" : `Explore Paire Plus from ${PREMIUM_PLANS[0].priceInr} rupees`} onPress={() => navigation.navigate("Premium")}>
          <YStack gap="$3" padding="$5" backgroundColor="$primarySoft" borderRadius={24}>
            <XStack alignItems="center" justifyContent="space-between"><Text color="$primary" fontWeight="700" fontSize="$2" letterSpacing={1}>PAIRE PLUS</Text><Icon name="sparkles-outline" color="primary" /></XStack>
            <Text fontSize={26} lineHeight={32} fontWeight="700">{lifetime ? "Lifetime Plus is yours." : "A little more possibility."}</Text>
            <Text color="$textMuted" fontSize="$3">{lifetime ? "Unlimited regular likes, messaging and all Plus benefits. No expiry." : Platform.OS === "web" ? "Monthly Plus: unlimited likes. Lifetime Plus: ₹1,499 once. Day and week passes also available." : `₹${PREMIUM_PLANS[0].priceInr} a day, ₹99 a week or ₹299 a month. No auto-renewal.`}</Text>
            <XStack alignItems="center" gap="$1"><Text color="$primary" fontWeight="700">{lifetime ? "View benefits" : "Explore plans"}</Text><Icon name="arrow-forward" size={17} color="primary" /></XStack>
          </YStack>
        </Pressable>
        {Platform.OS === "web" ? <SettingsSection><SettingsRow testID="profile-work-circles" icon="briefcase-outline" label="Work Circles" description="Corporate, government, banking, healthcare & more" onPress={() => navigation.navigate("WorkCircles")} showDivider={false} /></SettingsSection> : null}
        {Platform.OS === "web" ? <SettingsSection><SettingsRow testID="profile-date-duet" icon="planet-outline" label="Date Duet" description="Two people. One first-date blueprint." onPress={() => void Linking.openURL("/date-duet/")} showDivider={false} /></SettingsSection> : null}
        <ThemeQuickPicker onMore={() => navigation.navigate("Appearance")} />
        <SettingsSection>
          <SettingsRow icon="images-outline" label="Photos" value={`${profile.photoUrls.length}/6`} onPress={() => navigation.navigate("EditPhotos")} showDivider={false} />
          <SettingsRow icon="options-outline" label="Discovery preferences" onPress={() => navigation.navigate("Settings")} />
          {Platform.OS === "web" ? <SettingsRow testID="profile-notifications" icon="notifications-outline" label="Browser notifications" description="Matches, messages & optional event reminders" onPress={() => navigation.navigate("Settings")} /> : null}
          <SettingsRow testID="profile-privacy" icon="lock-closed-outline" label="Privacy & control" description="Incognito, private photos, notes only, I'll message first" onPress={() => navigation.navigate("Settings")} />
          <SettingsRow testID="profile-safety" icon="shield-checkmark-outline" label="Safety center" onPress={() => navigation.navigate("SafetyCenter")} />
          <SettingsRow icon="sparkles-outline" label="How vibe matching works" onPress={() => navigation.navigate("VibeGuide")} />
          <SettingsRow testID="profile-appearance" icon="color-palette-outline" label="Themes" onPress={() => navigation.navigate("Appearance")} />
        </SettingsSection>
        <SettingsSection>
          {legal.supportEmail ? (
            <SettingsRow
              icon="mail-outline"
              label="Contact support"
              value={legal.supportEmail}
              showDivider={false}
              onPress={() => void Linking.openURL(`mailto:${legal.supportEmail}?subject=Paire%20support`)}
            />
          ) : null}
          <SettingsRow
            icon="help-circle-outline"
            label="Safety tips"
            showDivider={Boolean(legal.supportEmail)}
            onPress={() => void Linking.openURL(legal.safetyUrl)}
          />
        </SettingsSection>
      </YStack>
    </Screen>
  );
}
