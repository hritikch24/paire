# Muse

Muse is a premium dating experience designed around creativity. Discover matches by shared Muse Cards, spark conversations fast, and stay safe with block/report tools.

## Product pitch
Muse connects people through their creative rituals. Your interests shape who you see, and your profile is designed like a mini portfolio. The result: fewer swipes, more real sparks.

## One-time setup
```
./scripts/bootstrap-macos.sh
```

## Doctor
```
./scripts/doctor-macos.sh
```

## Scripts detail + revert
- `scripts/bootstrap-macos.sh`: installs watchman, expo CLI, firebase-tools, android-platform-tools, maestro if missing.
- Revert: `brew uninstall <pkg>` and `npm uninstall -g <pkg>` as needed.
- `scripts/doctor-macos.sh`: read-only checks for toolchain and SDKs.

## Firebase setup
1) Create a Firebase project (or use emulator-only).
2) In `apps/muse-mobile`, copy `.env.example` to `.env` and fill values.
3) Optional: `firebase use --add` in repo root to link the project.
4) If you need Firebase config: Project Settings → General → Your apps → Config.

## Run emulators
```
firebase emulators:start
```

Seed sample users (Auth + Firestore):
```
cd firebase/functions
npm run seed:emulator
```

## Run the app
```
cd apps/muse-mobile
npm install
npm run ios
```

## Run all tests
```
./scripts/verify.sh
```
Use Android instead of iOS:
```
E2E_PLATFORM=android ./scripts/verify.sh
```

## Troubleshooting
- Xcode: open Xcode once and accept the license, then run `xcode-select -p`.
- E2E: iOS requires Xcode with simulators; Android requires SDK + AVD. Set `E2E_PLATFORM=android` if you prefer Android.
- Android SDK: ensure `ANDROID_HOME` or `ANDROID_SDK_ROOT` is set.
- Metro cache: `expo start -c` if bundler gets stuck.

## Docs
- `docs/architecture.md`
- `docs/design-system.md`
- `docs/testing.md`
- `docs/safety.md`
