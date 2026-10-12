import { Linking } from "react-native";
import { Text } from "tamagui";
import { legal } from "../config/legal";

type Tone = "muted" | "onDark";

function Link({ label, url, tone }: { label: string; url: string; tone: Tone }) {
  return (
    <Text
      color={tone === "onDark" ? "white" : "$primary"}
      fontWeight="700"
      textDecorationLine="underline"
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
    >
      {label}
    </Text>
  );
}

/** "…our Terms, Privacy Policy and Community Guidelines" with tappable links. */
export function LegalLinks({ prefix, tone = "muted" }: { prefix: string; tone?: Tone }) {
  return (
    <Text color={tone === "onDark" ? "rgba(255,255,255,0.85)" : "$textMuted"} fontSize="$2" lineHeight={20}>
      {prefix} <Link label="Terms of Service" url={legal.termsUrl} tone={tone} />,{" "}
      <Link label="Privacy Policy" url={legal.privacyUrl} tone={tone} /> and{" "}
      <Link label="Community Guidelines" url={legal.guidelinesUrl} tone={tone} />.
    </Text>
  );
}
