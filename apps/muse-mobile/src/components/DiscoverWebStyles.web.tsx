import { useTheme } from "tamagui";

/** Browser viewport sizing. Scoped !important rules override React Native Web inline layout values. */
export function DiscoverWebStyles() {
  const theme = useTheme();
  return <style>{`
    [data-testid="discover-screen"] {
      --discover-surface: ${theme.backgroundStrong?.val};
      --discover-soft: ${theme.backgroundSoft?.val};
      --discover-primary: ${theme.primary?.val};
      --discover-border: ${theme.border?.val};
      min-height: 0 !important;
    }
    [data-testid="discover-screen"] > div {
      min-height: 0 !important; overflow-y: auto !important; overflow-x: hidden !important;
      overscroll-behavior-y: contain !important; scrollbar-width: none !important; padding-top: 0 !important;
    }
    [data-testid="discover-screen"] > div::-webkit-scrollbar { display: none !important; }
    [data-testid="discover-header"] {
      min-height: 66px !important; margin-bottom: 0 !important; padding: 8px 18px 6px !important; flex-shrink: 0 !important;
    }
    [data-testid="discover-header"] > div:first-child { min-width: 0 !important; }
    [data-testid="discover-city"] { max-width: 156px !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
    [data-testid="discover-intro"] { display: none !important; }
    [data-testid="discover-intro"]:has([data-testid="discover-diwali-edit"]) {
      display: flex !important; flex-shrink: 0 !important; margin-bottom: 8px !important;
    }
    [data-testid="discover-modes"] { flex-shrink: 0 !important; padding: 0 0 4px !important; }
    [data-testid="discover-modes"] > div {
      margin: 0 16px !important; padding: 3px !important; border-radius: 16px !important; background: var(--discover-soft) !important;
    }
    [data-testid="discover-modes"] [role="tab"] { border-radius: 13px !important; min-height: 44px !important; }
    [data-testid="discover-modes"] [role="tab"] > div { min-height: 44px !important; border-radius: 13px !important; }
    [data-testid="discover-filters"] { flex-shrink: 0 !important; padding: 0 0 4px !important; }
    [data-testid="discover-filters"] [role="button"] { min-height: 44px !important; }
    [data-testid="discover-card-area"] {
      flex: 1 0 clamp(320px, calc(100dvh - 444px), 560px) !important;
      min-height: 320px !important; padding: 0 14px !important; margin: 0 0 2px !important;
    }
    [data-testid="discover-card-area"]:has([data-testid^="discover-empty"]) {
      flex: 1 0 220px !important; min-height: 220px !important; padding: 16px !important;
    }
    [data-testid="discover-card-area"]:has([data-testid="discover-empty-diwali"]) {
      flex: 0 0 auto !important; min-height: 0 !important; padding-bottom: 24px !important;
    }
    [data-testid="discover-empty-diwali"] { min-height: 0 !important; padding: 8px 8px 0 !important; }
    [data-testid="discover-card-area"] > div { min-height: 0 !important; }
    [data-testid="discover-deck"] { min-height: 320px !important; }
    [data-testid="discover-card"] { box-shadow: 0 8px 28px #30101d14 !important; border-radius: 24px !important; }
    [data-testid="discover-card-info"] { padding: 84px 18px 18px !important; }
    [data-testid="discover-card-info"] > div { gap: 7px !important; }
    [data-testid="discover-card-reason"] { display: none !important; }
    [data-testid="discover-footer"] { padding: 0 18px !important; min-height: 44px !important; flex-shrink: 0 !important; }
    [data-testid="discover-hidden"] { flex-shrink: 0 !important; margin-top: 4px !important; }
    [data-testid="discover-screen"] [data-testid^="nudge-"] {
      flex-shrink: 0 !important; margin: 2px 16px 8px !important; padding: 5px 10px !important;
      gap: 8px !important; border-radius: 15px !important; min-height: 54px !important;
    }
    [data-testid="discover-screen"] [data-testid^="nudge-"] > div { min-width: 0 !important; }
    [data-testid="discover-screen"] button:focus-visible,
    [data-testid="discover-screen"] [role="button"]:focus-visible,
    [data-testid="discover-screen"] [role="tab"]:focus-visible {
      outline: 3px solid var(--discover-primary) !important; outline-offset: 3px !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .paire-discover-action { transition: none !important; }
    }
    @media (max-width: 350px) {
      [data-testid="discover-header"] { padding-left: 14px !important; padding-right: 10px !important; }
      [data-testid="discover-city"] { max-width: 134px !important; }
      [data-testid="discover-footer"] { gap: 8px !important; padding-left: 16px !important; padding-right: 16px !important; }
    }
  `}</style>;
}
