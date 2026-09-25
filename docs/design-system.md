# Muse Design System

## Visual Direction
Warm, editorial, and tactile. Coral accents with sand neutrals. Typography uses Space Grotesk for a confident, modern feel.

## Tokens
Defined in `apps/muse-mobile/tamagui.config.ts`:
- Colors: ink, fog, sand, blush, ember, night, moon.
- Space: 4–40 scale for padding and margin.
- Radius: 8–28 for soft corners.

## Components
- `PrimaryButton`: primary CTA.
- `SecondaryButton`: neutral action.
- `MuseInput`: consistent input styles.
- `Screen`: layout wrapper with consistent padding.
- `SwipeDeck`: discovery card stack.

## Motion & Haptics
- Swipe gestures use reanimated springs.
- Haptic feedback on swipe actions.

## Accessibility
- High contrast text.
- Large tap targets (52px buttons).
- VoiceOver labels added for tests and accessibility.

