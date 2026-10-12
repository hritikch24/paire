# Releasing Muse on Google Play

Run `./scripts/release-preflight.sh` at any time: it lists what is still missing.

## 0. Decide the name first
The application ID (`com.muse.app`) can never change after the first upload. "Muse" clashes with an existing dating app and with trademarks, so settle the public name before uploading (`docs/product/naming.md`).

## 1. Firebase (one time)
1. Upgrade the project `muse-352ba` to the **Blaze** plan and set a budget alert.
2. Authentication → enable **Email/Password** and **email enumeration protection**.
3. Check the Firestore location. For an India launch, create the database in **Mumbai (`asia-south1`)**: it's faster for users, keeps data in India, and can't be changed later. If it isn't `us-central1`, set the same region in `firebase/functions/.env` (`FUNCTIONS_REGION=...`) and `apps/muse-mobile/.env.production` (`EXPO_PUBLIC_FUNCTIONS_REGION=...`).
4. Delete old test users and data. Older profiles lack the fields the new rules require.
5. Project settings → Android app `com.muse.app` → download `google-services.json` into `apps/muse-mobile/`. This enables push.
6. Deploy: `firebase login && firebase deploy --only firestore,storage,functions,hosting`. `firestore` includes the indexes and the TTL policies in `firebase/rules/firestore.indexes.json`, which delete expired `chatFlags` (12 months) and `duoInvites` (48 hours).
7. Optional: for Claude-written icebreakers and AI review of chat-safety flags, set `ANTHROPIC_API_KEY` as a Cloud Functions secret. `MUSE_AI_MODEL` and `MUSE_SAFETY_MODEL` choose the models (safety defaults to Claude Haiku 4.5).

## 2. Your details
- Replace every `[PLACEHOLDER]` in `firebase/hosting/*.html`: name, address, Grievance Officer, emails, dates. Then deploy hosting again.
- Add `EXPO_PUBLIC_SUPPORT_EMAIL=you@yourdomain` to `apps/muse-mobile/.env.production`.

## 3. Upload key and build
- `./scripts/android/create-upload-keystore.sh` creates the key and keeps it outside the repo. Back it up.
- `./scripts/android/build-release.sh` writes `dist/muse-<version>-<code>.aab`.
- Bump `ANDROID_VERSION_CODE` in `app.config.js` before every upload.

## 4. Play Console
- **Privacy policy:** `https://muse-352ba.web.app/privacy`
- **Account deletion URL:** `https://muse-352ba.web.app/delete-account`
- **Target audience:** 18+ only. **Ads:** none.
- **App access:** give reviewers a login for a *test-cohort* account. In Firestore, create `moderation/{uid}` = `{ status: "ok", cohort: "test" }` for the reviewer and a few test profiles. They only see each other and are invisible to real members.
- **Data safety (collected, not shared, encrypted in transit, deletable):**
  - approximate location (optional);
  - name, email, user IDs;
  - date of birth, gender, and sexual orientation (inferred from "Show me");
  - photos;
  - in-app messages (including Duo group chats; flagged messages are kept up to 12 months for safety review);
  - app interactions and other user content;
  - device IDs (push token).
- **Permissions:** no photo/video permission (the system picker is used), approximate location only, no background location.
- **Testing:** new personal developer accounts need a closed test with **12 testers for 14 continuous days** before production access.
- **Store assets:** `store/icon-512.png` and `store/feature-graphic.png`. Phone screenshots still need to be captured from a device.

## 5. After launch
- Review `chatFlags` (status `open`) alongside reports; see the chat-safety runbook in `docs/safety.md`.
- Review `reports` in Firestore regularly. Three distinct reporters auto-hide a profile by setting `moderation/{uid}.status = "hidden"`; set it back to `"ok"` to restore.
- To ban someone, set the status to `"banned"` and disable the user in Authentication.
- Deleting a user in the console also erases their data (the `onAuthUserDeleted` function).
