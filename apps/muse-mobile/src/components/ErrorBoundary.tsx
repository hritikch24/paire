import React from "react";
import { Text, YStack } from "tamagui";
import { PrimaryButton } from "./MuseButton";

type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean; message?: string };

/** Last-resort screen for render errors, so a bug never leaves a blank app. */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Paire render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <YStack flex={1} backgroundColor="$background" alignItems="center" justifyContent="center" padding="$6" gap="$3">
        <Text fontSize="$7" fontWeight="700" textAlign="center">
          Something went wrong
        </Text>
        <Text color="$textMuted" textAlign="center">
          Sorry about that. Try again, and if it keeps happening, restart the app.
        </Text>
        {__DEV__ && this.state.message ? (
          <Text fontSize="$2" color="$error" textAlign="center">
            {this.state.message}
          </Text>
        ) : null}
        <PrimaryButton onPress={() => this.setState({ hasError: false, message: undefined })}>Try again</PrimaryButton>
      </YStack>
    );
  }
}
