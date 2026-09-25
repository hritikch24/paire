type AppReadyInput = {
  fontsLoaded: boolean;
  splashTimeout: boolean;
  loading: boolean;
  user: unknown | null;
  profileLoading: boolean;
  profileFetched: boolean;
  isGuest: boolean;
  isDemo: boolean;
  profileLoaded: boolean;
};

export function isAppReady({
  fontsLoaded,
  splashTimeout,
  loading,
  user,
  profileLoading,
  profileFetched,
  isGuest,
  isDemo,
  profileLoaded
}: AppReadyInput) {
  const profileReady = !user || profileFetched || isGuest || isDemo || profileLoaded;
  const profileLoadingGate =
    !user || isGuest || isDemo || profileLoaded || !profileLoading;

  return (
    (fontsLoaded || splashTimeout) &&
    !loading &&
    profileLoadingGate &&
    (!user || profileReady)
  );
}
