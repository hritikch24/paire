import { useState } from "react";
import { Image, Linking, Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { submitUpiReference, UpiOrder } from "../services/chatAccessService";
import { friendlyError } from "../services/errors";
import { MuseInput } from "./MuseInput";
import { PrimaryButton, SecondaryButton } from "./MuseButton";

type Props = {
  order: UpiOrder;
  onSubmitted: (order: UpiOrder) => void;
};

/**
 * Pay Paire by UPI: this order's own QR and exact amount (or straight into
 * PhonePe, Google Pay, Paytm or any UPI app on a phone), then the UTR. Nothing
 * unlocks until Paire confirms the payment reached its account.
 */
export function UpiPayPanel({ order, onSubmitted }: Props) {
  const [utr, setUtr] = useState(order.utr ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showUtr, setShowUtr] = useState(Boolean(order.utr));
  const phoneWeb = Platform.OS === "web" && typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  const canOpenApp = Platform.OS !== "web" || phoneWeb;
  const what = order.kind === "plus" ? "starts your pass" : "unlocks chat";
  // The same payment request, opened straight in a chosen app (or the phone's chooser).
  const query = order.upiLink.slice(order.upiLink.indexOf("?"));
  const apps = [
    { label: "PhonePe", url: `phonepe://pay${query}` },
    { label: "Google Pay", url: `tez://upi/pay${query}` },
    { label: "Paytm", url: `paytmmp://pay${query}` },
    { label: "Any UPI app", url: order.upiLink }
  ];
  const openApp = (url: string) =>
    void Linking.openURL(url).catch(() => setError("That app didn't open. Try another one, or scan the QR code with any UPI app."));

  const copyId = async () => {
    try {
      await navigator.clipboard?.writeText(order.vpa);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      onSubmitted(await submitUpiReference(order.orderId, utr));
    } catch (failure) {
      setError(friendlyError(failure, "We couldn't save that reference. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack testID="upi-pay-panel" gap="$2" padding="$3" borderRadius="$4" borderWidth={1} borderColor="$border" backgroundColor="$backgroundStrong">
      <Text fontWeight="700">1. Pay exactly {order.amountLabel} by UPI</Text>
      <Text fontSize="$2" fontWeight="600">{order.product}</Text>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>
        The paise identify your payment, so please don't round it. It goes to {order.payeeName} ({order.vpa}). Reference {order.orderId}.
      </Text>
      <XStack justifyContent="center" paddingVertical="$2">
        <Image source={{ uri: order.qrDataUrl }} style={{ width: 200, height: 200 }} accessibilityLabel={`UPI QR code to pay ${order.amountLabel} to ${order.payeeName}`} />
      </XStack>
      <Text fontSize="$2" color="$textMuted" textAlign="center">Scan the QR code with PhonePe, Google Pay, Paytm, BHIM or your bank's app{canOpenApp ? ", or open an app directly:" : "."}</Text>
      {canOpenApp ? (
        <YStack gap="$2" testID="upi-open-app">
          <PrimaryButton onPress={() => openApp(apps[0].url)}>{`Pay ${order.amountLabel} with PhonePe`}</PrimaryButton>
          <XStack gap="$2" flexWrap="wrap">
            {apps.slice(1).map((app) => (
              <YStack key={app.label} flexGrow={1} flexBasis={120}>
                <SecondaryButton onPress={() => openApp(app.url)}>{app.label}</SecondaryButton>
              </YStack>
            ))}
          </XStack>
        </YStack>
      ) : null}
      {Platform.OS === "web" ? (
        <SecondaryButton onPress={() => void copyId()}>{copied ? "UPI ID copied" : `Copy UPI ID (${order.vpa})`}</SecondaryButton>
      ) : null}

      <Text fontWeight="700" marginTop="$2">2. Tell us you've paid</Text>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>
        {`Paire finds your payment by its exact amount (${order.amountLabel}) and then ${what}, usually within a few hours.`}
      </Text>
      <PrimaryButton testID="upi-submit" loading={busy} disabled={utr.replace(/\s/g, "").length > 0 && utr.replace(/\s/g, "").length !== 12} onPress={() => void submit()}>
        I've paid
      </PrimaryButton>
      {showUtr ? (
        <MuseInput testID="upi-utr" inputMode="numeric" maxLength={14} placeholder="12-digit UPI reference (optional)" value={utr} onChangeText={(value) => setUtr(value.replace(/[^0-9 ]/g, ""))} />
      ) : (
        <Text fontSize="$1" color="$primary" accessibilityRole="button" onPress={() => setShowUtr(true)}>Have the 12-digit UPI reference (UTR)? Add it to speed things up (optional)</Text>
      )}
      {error ? <Text fontSize="$2" color="$error">{error}</Text> : null}
      <Text fontSize="$1" color="$textMuted" lineHeight={18}>
        Pay only once, and only the exact amount. If something goes wrong, contact Paire support with a screenshot of the payment; a payment that can't be matched is refunded.
      </Text>
    </YStack>
  );
}
