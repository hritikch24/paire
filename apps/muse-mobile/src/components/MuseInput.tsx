import { forwardRef, useState, type ComponentProps, type ReactNode, type ChangeEvent, type KeyboardEvent } from "react";
import { Platform } from "react-native";
import type { TextInput, TextInputProps } from "react-native";
import { Input, Text, XStack, YStack, styled } from "tamagui";
import { IconButton } from "./IconButton";

const StyledInput = styled(Input, {
  backgroundColor: "$backgroundStrong",
  borderColor: "$border",
  borderWidth: 1,
  borderRadius: "$4",
  color: "$text",
  minHeight: 54,
  paddingHorizontal: "$4",
  placeholderTextColor: "$textMuted",
  focusStyle: { borderColor: "$primary", borderWidth: 1.5 }
});

type StyledInputProps = ComponentProps<typeof StyledInput>;
export type MuseInputProps = TextInputProps &
  Omit<StyledInputProps, keyof TextInputProps | "onChange" | "onChangeText">;

/**
 * Tamagui's native Input derives `secureTextEntry` and `inputMode` from its web
 * style `type` prop and overrides the React Native props of the same purpose,
 * so passwords would show in plain text and email/number keyboards would never
 * appear. Translate the RN props into `type` here.
 */
export function inputTypeFor(props: Pick<TextInputProps, "secureTextEntry" | "keyboardType">) {
  if (props.secureTextEntry) return "password" as const;
  switch (props.keyboardType) {
    case "email-address":
      return "email" as const;
    case "number-pad":
    case "numeric":
    case "decimal-pad":
      return "number" as const;
    case "phone-pad":
      return "tel" as const;
    case "url":
      return "url" as const;
    default:
      return undefined;
  }
}

export const MuseInput = forwardRef<TextInput, MuseInputProps>((props, ref) => {
  const web = Platform.OS === "web" ? {
    tag: props.multiline ? "textarea" : "input",
    disabled: props.editable === false,
    onChange: (event: ChangeEvent<HTMLInputElement>) => props.onChangeText?.(event.target.value),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" && !props.multiline) props.onSubmitEditing?.({ nativeEvent: { text: event.currentTarget.value } } as never);
    }
  } : {};
  return <StyledInput ref={ref as never} {...(props as object)} {...(web as object)} type={inputTypeFor(props)} />;
});
MuseInput.displayName = "MuseInput";

type TextFieldProps = MuseInputProps & {
  label?: string;
  helper?: string;
  error?: string | null;
  /** Trailing control rendered inside the field (e.g. show/hide password). */
  accessory?: ReactNode;
  showCount?: boolean;
};

/** Labelled input with helper/error text and an optional counter. */
export const TextField = forwardRef<TextInput, TextFieldProps>(
  ({ label, helper, error, accessory, showCount, ...inputProps }, ref) => {
    const length = typeof inputProps.value === "string" ? inputProps.value.length : 0;
    return (
      <YStack gap="$1">
        {label ? (
          <Text fontWeight="600" fontSize="$2">
            {label}
          </Text>
        ) : null}
        <XStack alignItems="center" position="relative">
          <MuseInput
            ref={ref}
            flex={1}
            accessibilityLabel={label ?? inputProps.placeholder}
            borderColor={error ? "$error" : "$border"}
            paddingRight={accessory ? 52 : undefined}
            {...inputProps}
          />
          {accessory ? (
            <XStack position="absolute" right={6} height="100%" alignItems="center">
              {accessory}
            </XStack>
          ) : null}
        </XStack>
        <XStack justifyContent="space-between" gap="$2">
          <Text fontSize="$1" color={error ? "$error" : "$textMuted"} flex={1}>
            {error || helper || ""}
          </Text>
          {showCount && inputProps.maxLength ? (
            <Text fontSize="$1" color="$textMuted">
              {length}/{inputProps.maxLength}
            </Text>
          ) : null}
        </XStack>
      </YStack>
    );
  }
);
TextField.displayName = "TextField";

/** Password field with a show/hide toggle. */
export const PasswordField = forwardRef<TextInput, Omit<TextFieldProps, "accessory" | "secureTextEntry">>(
  (props, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <TextField
        ref={ref}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        secureTextEntry={!visible}
        accessory={
          <IconButton
            icon={visible ? "eye-off-outline" : "eye-outline"}
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            onPress={() => setVisible((value) => !value)}
            size={40}
            color="textMuted"
          />
        }
      />
    );
  }
);
PasswordField.displayName = "PasswordField";
