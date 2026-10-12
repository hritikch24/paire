# Test server for your group (free, runs on your Mac)

Friends can try Muse on their own phones, on any Wi‑Fi or mobile data, without Firebase billing. Your Mac runs the Firebase emulators, a small gateway guards them, and a free Cloudflare quick tunnel gives them a public link. Nobody needs an account, and it costs nothing.

```
phones ──https──▶ Cloudflare ──tunnel──▶ gateway (this Mac) ──▶ Firebase emulators (this Mac only)
```

## What to expect
- **Online only while your Mac is.** The script keeps the Mac awake while it runs. Keep it plugged in with the lid open.
- **The link changes when the script restarts.** Share the new one. Testers tap **Open in Muse Test** or paste it into the app. They don't reinstall, and their accounts and chats stay.
- **Test data only.** The emulators keep passwords readable on this Mac, and the only backup is the folder `.test-backend/`. Ask testers to use a made-up name, photos they're happy for the group to see, and a password they use nowhere else. The invite page says the same.
- **No email.** You reset forgotten passwords yourself (see below).
- **Notifications:** out of the box, Muse Test alerts people to new messages and matches while the app is open or recently used. For real push when it's closed, see "Real push notifications" below.
- **Small groups.** Quick tunnels come with no uptime guarantee and handle about 200 requests at once. That's plenty for a few dozen testers.

## Run it
1. Build the test app once (again after code changes):
   ```bash
   ./scripts/android/build-test-apk.sh     # → dist/Muse-Test.apk
   ```
   "Muse Test" installs next to the Play version of Muse and only ever talks to a test server.
2. Start the server:
   ```bash
   ./scripts/test-backend.sh
   ```
   It prints an invite link like `https://some-random-words.trycloudflare.com`.
3. Share the link with your group. On their Android phone they:
   1. open the link and tap **Download Muse Test**. Chrome warns that this type of file can harm the device; they tap **OK**. Then they open the file, allow installs from the browser when asked, and choose **Install anyway** if Play Protect warns about an unknown app.
   2. go back to the page and tap **Open in Muse Test**, or open the app and paste the link.
   3. create an account and set up a profile.

Press **Ctrl+C** to stop. Data is saved when you stop, and every 10 minutes while it runs. Next time it all comes back, but the link is new.

Options:
- `--demo-profiles`: add five sample members (password `Password123!`) so the feed isn't empty while the group is small.
- `--fresh`: delete everything (accounts, profiles, chats, photos) before starting.

## Real push notifications (optional, free)
Android push always goes through Firebase Cloud Messaging, which is free on the Spark plan. It needs two files from your Firebase project (console.firebase.google.com → muse-352ba → Project settings):
1. **General → Your apps → Add app → Android.** Register `com.muse.app.test`, then `com.muse.app` for the Play app. Download `google-services.json` (one file covers both) to `apps/muse-mobile/google-services.json`.
2. **Service accounts → Generate new private key.** Save it as `.test-backend/push-service-account.json`. Keep it private: it can act on your whole project.

Then rebuild the app (`./scripts/android/build-test-apk.sh`) and restart the server. It prints "Push notifications: on (real FCM)".

## AI (optional)
Paire AI works out of the box, for free. Match reasons, icebreakers and bio ideas come from what people chose on their profiles. To have Claude write icebreakers and bios instead, put an Anthropic API key in `.test-backend/anthropic-api-key` and restart the server. It prints "AI features: Claude". The key is paid per use; the default model is `claude-opus-5-5`. Set `MUSE_AI_MODEL=claude-haiku-5-5` in your environment to cut the cost. If Claude fails or times out, the free writer takes over. For production, set the key as a Cloud Functions secret.

## If something breaks
- If the emulators crash, the script restarts them from the last save (every 5 minutes), and the invite link stays the same.
- The test server has its own temp folder (`.test-backend/tmp`). Starting another Firebase Storage emulator on this Mac can't wipe its photos. `./scripts/verify.sh` also uses separate ports and a separate folder, so you can run the tests while the server is up.

## Updating a running server
- **Backend code:** run `npm --prefix firebase/functions run build`. The functions emulator reloads the new code by itself, and security-rule edits reload too. The link doesn't change.
- **A new callable function:** add its name to `config.callables` in `tools/test-backend/gateway.js`, otherwise the gateway refuses it. Then restart only the gateway with `kill $(lsof -tiTCP:8787 -sTCP:LISTEN)`. The server script starts it again within seconds and the invite link stays the same.
- **A new app build:** `./scripts/android/build-test-apk.sh` replaces `dist/Muse-Test.apk`, which the invite page offers straight away.

## Testing changes without touching the group's server
Never test with throwaway accounts on the group's server. Run a separate QA server instead: the emulators on the alternate ports in `firebase.verify.json`, a second gateway on port 18787 and its own quick tunnel.

```bash
QTMP=$(mktemp -d /tmp/muse-qa.XXXXXX)/          # short path: macOS limits socket paths to ~104 characters
TMPDIR=$QTMP firebase --config firebase.verify.json emulators:start --project demo-muse --only auth,firestore,functions,storage &
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 GCLOUD_PROJECT=demo-muse \
  node firebase/functions/scripts/seed.js
GATEWAY_PORT=18787 AUTH_EMULATOR_PORT=19099 FIRESTORE_EMULATOR_PORT=18080 FUNCTIONS_EMULATOR_PORT=15001 \
  STORAGE_EMULATOR_PORT=19199 GATEWAY_TOKEN_FILE=/tmp/muse-qa-tokens.json node tools/test-backend/gateway.js &
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:18787   # prints the QA link to paste into the app
```

It shares ports with `./scripts/verify.sh`, so stop it before running the tests. If an Android emulator can't reach a new tunnel link, its DNS is usually stuck: restart it with `emulator -avd <name> -dns-server 8.8.8.8`.

## Looking after testers
Open **http://127.0.0.1:4000** on the Mac (the Emulator UI; only this Mac can reach it).
- **Reset a password:** Authentication → the user's ⋮ menu → Edit user → enter a new password → Save.
- **Remove someone:** delete their user under Authentication. The deletion clean-up removes their profile, matches and photos.
- **See reports and data:** Firestore tab.

Logs are in `.test-backend/logs/`. The current link is in `.test-backend/url.txt`. To log every request the gateway forwards, run `kill -USR2 $(lsof -tiTCP:8787 -sTCP:LISTEN)`; run it again to stop.

## Why it's safe enough for testing
The emulators are developer tools and trust anyone who can reach them. Their login tokens aren't signed, their refresh tokens are plain JSON anyone can write, and `owner` or any `ya29.` token counts as an admin. So they only listen on this Mac. The only way in from outside is the gateway (`tools/test-backend/gateway.js`), which:
- forwards only what the app uses: sign-up and sign-in, the app's database traffic, the callable functions on its allowlist (`config.callables` in `gateway.js`) and photo storage. Emulator admin APIs, other projects and background functions stay private.
- adds a random nonce to every login and refresh token the emulator issues, and accepts only tokens it sealed this way. The emulator's own tokens are predictable (a refresh token is just the user ID in base64), so forged or rebuilt tokens are refused wherever they appear: headers, request bodies, and Firestore's live-connection handshake.
- refuses admin credentials, and custom-token or social sign-in (the emulator accepts those unchecked).
- limits sign-in and sign-up attempts to 30 per 10 minutes per address.

Security rules and Cloud Functions then apply exactly as in production. To check a running server:

```bash
node tools/test-backend/check.js "$(cat .test-backend/url.txt)"   # uses a throwaway account
```

This covers group testing. For real users, use Firebase itself (docs/RELEASE.md).
