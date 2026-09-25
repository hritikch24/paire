# Muse Testing

## Unit Tests
- Interest scoring utility.
- Match ID generation.
- Swipe store reducer logic.

Run:
```
cd apps/muse-mobile
npm run test:unit
```

## Firestore Rules Tests
Uses `@firebase/rules-unit-testing`.

Run:
```
firebase emulators:exec --only firestore "npm --prefix firebase run test:rules"
```

## E2E (Maestro)
Runs onboarding, discovery, match, and chat flows.

Run:
```
./scripts/test-e2e.sh ios
```

