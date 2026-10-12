# Muse design system

## Direction
Warm and editorial: a rose/wine brand colour matching the app icon, cream surfaces, rounded cards, and Space Grotesk type. Members can pick a colour theme and light/dark mode (Settings → Appearance or Profile → Themes).

## Themes
Defined once in `apps/muse-mobile/src/theme/palettes.ts`, which `tamagui.config.ts` turns into `light_<id>` / `dark_<id>` themes. The app wraps everything in `<Theme name={palette}>` (`src/app/MainApp.tsx`), and `store/appearanceStore.ts` saves the palette and mode (System / Light / Dark, applied with `Appearance.setColorScheme`) on the phone.

| Palette | Feel | Light primary | Hero gradient |
| --- | --- | --- | --- |
| Muse Rose (default) | Warm rose on cream | `#B83A5E` | plum → rose |
| Classic Ivory | Ivory paper and deep wine | `#7B2334` | dark wine |
| Noir | Black and white only | `#111111` (dark mode: near-white, with dark text on it) | charcoal |
| Ocean | Teal and navy | `#1B6C8C` | navy → teal |
| Lavender Dusk | Soft violet | `#6B4FA0` | aubergine → lilac |
| Sunset | Coral and amber | `#B9452B` | wine → amber |
| Forest | Sage and pine | `#2F6B4F` | pine → sage |

Rules:
- Every palette passes WCAG AA (4.5:1) for text and button labels in both modes. White text must reach at least 3:1 on every gradient stop. `__tests__/palettes.test.ts` enforces both.
- Never hard-code brand colours. Use `$primary` and friends in Tamagui props, and `useThemeColors()` (`src/theme/useThemeColors.ts`) for gradients (`gradient`), highlights on photos (`glow`) and other non-Tamagui components.
- Text on `$primary` always uses `$primaryForeground` (Noir's dark mode has a near-white primary).
- Tamagui's default text colour comes from the theme's `color` key; every palette sets it, so un-styled `Text` works in dark mode.
- The Android navigation bar is transparent and its button style follows the theme (`expo-navigation-bar`).

## Type and logo
- One typeface (Space Grotesk) and one scale (13–34). No negative letter spacing: Android clips the last glyph of tightly tracked bold text.
- The "muse" wordmark on the splash and welcome screens is an image (`assets/wordmark.png`, made by `tools/generate_brand_assets.py`). The splash renders before the font loads, so live text would be measured with the system font and clipped.

## Theme tokens (use `$token` in Tamagui props)
| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FBF8F6` | `#141016` | Screen background |
| `backgroundStrong` / `card` | `#FFFFFF` | `#1D171F` | Cards, sheets, inputs |
| `backgroundSoft` | `#F3ECE9` | `#2A222C` | Subtle fills |
| `text` / `textMuted` | `#1F1A24` / `#6D6672` | `#F3EEF2` / `#B3A9B6` | Copy |
| `primary` / `primaryPressed` / `primarySoft` | `#B83A5E` / `#9E2F4F` / `#F8E4EA` | `#C2476C` / `#A93C5E` / `#3A2330` | Brand, selected states (Muse Rose values; other palettes in `palettes.ts`) |
| `like` / `nope` / `superLike` | green / red / blue | lighter variants | Swipe actions and stamps |
| `success` / `warning` / `warningSoft` / `error` | | | Feedback (`warningSoft` is the chat-safety card fill) |
| `gradientStart` / `gradientMid` / `gradientEnd`, `glow` | per palette | per palette | Hero gradients and highlights on photos |
| `border`, `overlay` | | | Dividers, modal scrims |

## Components (`src/components`)
- **Buttons:** `PrimaryButton`, `SecondaryButton`, `GhostButton` (pill shape, `loading` spinner, taller at large font scales); `IconButton` (round: `solid`, `soft` or `plain`).
- **Inputs:** `MuseInput`; `TextField` (label, helper/error text, counter, trailing accessory); `PasswordField` (show/hide).
- **Selection:** `Chip` / `ChipGroup`, `Checkbox`, `RangeSlider` (one or two thumbs; saves on release), `ToggleRow`.
- **Layout:** `Screen` (safe areas, keyboard-aware scroll, sticky footer that rides above the keyboard), `ScreenHeader`, `OnboardingLayout` (progress bar), `SettingsSection` / `SettingsRow`.
- **Feedback:** `ToastHost` / `showToast`, `ActionSheet`, `EmptyState`, `LoadingView`, `ErrorBoundary`.
- **Dating UI:** `SwipeDeck` (card stack with LIKE/NOPE/SUPER stamps, photo tap-through, blind-date mode), `MatchMoment` (optional title/subtitle, used for Duo matches), `PhotoGrid`, `PhotoCarousel`, `ProfileDetails` / `ProfileHeadline`, `Avatar` and `AvatarPair` (two overlapping faces for a pair), `LikesYouRow` (with "See everyone who likes you"), `AiSuggestions`, `DeleteAccountSheet`.
- **Duos:** `duo/DuoCardView` (both friends side by side, match %, "You all love…"), `duo/DuoMode` (intro, invite code, confirm request, pending request, Duo deck with swipe and undo).
- **Screens worth reusing as patterns:** `AppearanceScreen` (live theme previews), `LikesGalleryScreen` (two-column staggered photo gallery with one-tap like-back), `ChatMembersScreen`.

## Interaction and accessibility
- Swipe or tap the round buttons; haptics fire on commit (heavier for a Super Muse).
- Every control has an accessibility label. Cards expose screen-reader actions (like, pass, super, open profile).
- Minimum touch targets are 44–54 px; layouts scroll rather than clip at large font sizes.
- Brief confirmations use toasts; only destructive actions (unmatch, block, delete account, sign out) ask for confirmation.

## Delhi NCR iteration (2026-10-10)

The welcome screen uses the existing warm ivory/rose tokens, a large editorial headline and a pinned auth footer. Discovery offers People, Vibe first and Duos, with a visible Safety Centre entry. Vibe-first cards present an answer before photos, scroll internally, and keep Reveal photo accessible in a pinned footer. Revealing never sends a like; the separate Pass and Like controls act through the existing services. Reveal state resets for each person and on undo. Full profiles remain available.

Premium, verification and matching explanation screens use pinned navigation through Screen's optional `header` prop. Pricing selection reports upfront totals and exact fixed durations. Unavailable purchases and verification capture are clearly labelled. Verification shields are not issued from client profile data. Vibe scores are labelled as rankings out of 100 rather than relationship probabilities. Notification names and previews require an explicit free opt-in in Settings.
