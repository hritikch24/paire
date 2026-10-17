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
 * Pay Paire by UPI: this order's own QR and exact amount, then the UTR. Chat
 * unlocks only once Paire confirms the payment reached its account.
 */
export function UpiPayPanel({ order, onSubmitted }: Props) {
  const [utr, setUtr] = useState(order.utr ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const phoneWeb = Platform.OS === "web" && typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  const canOpenApp = Platform.OS !== "web" || phoneWeb;

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
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>
        The paise identify your payment, so please don't round it. It goes to {order.payeeName} ({order.vpa}). Reference {order.orderId}.
      </Text>
      <XStack justifyContent="center" paddingVertical="$2">
        <Image source={{ uri: order.qrDataUrl }} style={{ width: 200, height: 200 }} accessibilityLabel={`UPI QR code to pay ${order.amountLabel} to ${order.payeeName}`} />
      </XStack>
      {canOpenApp ? (
        <PrimaryButton testID="upi-open-app" onPress={() => void Linking.openURL(order.upiLink).catch(() => setError("No UPI app opened. Scan the QR code from another phone, or pay the UPI ID directly."))}>
          {`Pay ${order.amountLabel} in a UPI app`}
        </PrimaryButton>
      ) : (
        <Text fontSize="$2" color="$textMuted" textAlign="center">Scan with any UPI app: Google Pay, PhonePe, Paytm, BHIM or your bank's app.</Text>
      )}
      {Platform.OS === "web" ? (
        <SecondaryButton onPress={() => void copyId()}>{copied ? "UPI ID copied" : `Copy UPI ID (${order.vpa})`}</SecondaryButton>
      ) : null}

      <Text fontWeight="700" marginTop="$2">2. Enter the UPI reference number</Text>
      <Text fontSize="$2" color="$textMuted" lineHeight={20}>
        After paying, your UPI app shows a 12-digit UPI reference (UTR) or transaction ID. Paire checks it against the payment and then unlocks chat, usually within a few hours.
      </Text>
      <MuseInput testID="upi-utr" inputMode="numeric" maxLength={14} placeholder="12-digit UTR, e.g. 412345678901" value={utr} onChangeText={(value) => setUtr(value.replace(/[^0-9 ]/g, ""))} />
      <PrimaryButton testID="upi-submit" loading={busy} disabled={utr.replace(/\s/g, "").length !== 12} onPress={() => void submit()}>
        I've paid: confirm my payment
      </PrimaryButton>
      {error ? <Text fontSize="$2" color="$error">{error}</Text> : null}
      <Text fontSize="$1" color="$textMuted" lineHeight={18}>
        Pay only once. If something goes wrong, keep the UPI reference and contact Paire support; a payment that can't be matched is refunded.
      </Text>
    </YStack>
  );
}
