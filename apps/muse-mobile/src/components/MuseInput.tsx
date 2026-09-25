import { forwardRef, type ComponentProps } from "react";
import type { TextInput, TextInputProps } from "react-native";
import { Input, styled } from "tamagui";

const StyledInput = styled(Input, {
  backgroundColor: "$backgroundStrong",
  borderColor: "$border",
  borderWidth: 1,
  borderRadius: "$4",
  color: "$text",
  minHeight: 56,
  paddingHorizontal: "$3",
  paddingVertical: "$2"
});

type StyledInputProps = ComponentProps<typeof StyledInput>;
type MuseInputProps = TextInputProps &
  Omit<StyledInputProps, keyof TextInputProps | "onChange" | "onChangeText">;

export const MuseInput = forwardRef<TextInput, MuseInputProps>((props, ref) => (
  <StyledInput ref={ref as any} {...(props as any)} />
));

MuseInput.displayName = "MuseInput";
