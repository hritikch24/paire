import React from "react";
import { DevSettings } from "react-native";
import { Screen } from "./Screen";
import { PrimaryButton, SecondaryButton } from "./MuseButton";
import { Text, YStack } from "tamagui";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: undefined
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    console.error("Muse ErrorBoundary", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Screen scrollable>
        <YStack gap="$3">
          <Text fontSize="$7" fontWeight="700">
            We hit a snag
          </Text>
          <Text color="$textMuted">
            Something went wrong. Try reloading the app.
          </Text>
          {this.state.message ? (
            <Text fontSize="$2" color="$textMuted">
              {this.state.message}
            </Text>
          ) : null}
          {__DEV__ ? (
            <PrimaryButton onPress={() => DevSettings.reload()}>Reload</PrimaryButton>
          ) : null}
          <SecondaryButton
            onPress={() => this.setState({ hasError: false, message: undefined })}
          >
            Try again
          </SecondaryButton>
        </YStack>
      </Screen>
    );
  }
}
