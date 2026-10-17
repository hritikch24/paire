# Paire on the web (Vercel)

Full launch order and every environment variable: [launch-web.md](launch-web.md).

The website and the full browser app deploy to Vercel from this repo. Use the web version until the Android app is live: it is the same app, with the same accounts, matches and chats.

| Path | What it is | Source |
|---|---|---|
| `/` | Landing page (features, pricing) | `apps/web/site` |
| `/app/` | The Paire app in the browser | `apps/muse-mobile` (Expo web export) |
| `/privacy/`, `/terms/`, `/refunds/`, `/contact/`, `/community-guidelines/`, `/safety/`, `/delete-account/` | Legal pages (details filled from `PAIRE_*` variables) | `apps/web/legal` |

Build: `node apps/web/scripts/build.mjs` writes `apps/web/dist`. `vercel.json` at the repo root tells Vercel how to install, build and serve it, including the `/app/*` fallback and security headers.

## One-time setup

1. **Backend.** The browser app needs the Firebase backend live (Auth, Firestore, Storage, Cloud Functions). Follow `docs/RELEASE.md` §1: Blaze plan with a budget alert, Email/Password sign-in, then `firebase deploy --only firestore,storage,functions,hosting`. Blaze stays free at beta scale (see `docs/product/costs.md`).
2. **Vercel project.** On vercel.com, choose **Add New → Project**, import this Git repository and leave **Root Directory** as the repo root. Vercel reads `vercel.json`, so leave the framework preset as **Other** and don't override the build settings.

   Or, from your Mac, without Git hosting: `npm i -g vercel`, then run `vercel` (preview) or `vercel --prod` from the repo root. `.vercelignore` keeps native folders, secrets and test data out of the upload.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables). All are optional:

   | Name | When to set it |
   |---|---|
   | `EXPO_PUBLIC_FUNCTIONS_REGION` | If your functions aren't in `us-central1` (for example `asia-south1`). Must match `FUNCTIONS_REGION`. |
   | `EXPO_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID` | Only to use a different Firebase project than `muse-352ba` (the default baked into `src/config/env.ts`). |
   | `PAIRE_SUPPORT_EMAIL`, `PAIRE_POSTAL_ADDRESS`, `PAIRE_JURISDICTION_CITY` | **Required for launch.** Fill the legal, refund and contact pages, and remove the draft banner. |
   | `PAIRE_SITE_URL` | Your custom domain, such as `https://yourbrand.in`. Legal links inside the app use it. It defaults to the Vercel production URL. |
   | `PAIRE_ALLOW_INDEXING` | `true` only at public launch. Until then `robots.txt` blocks search engines. |

4. **Allow the domain in Firebase.** Firebase console → Authentication → Settings → **Authorized domains** → add `your-project.vercel.app` and any custom domain. Without this, sign-in fails on the web.
5. **Storage CORS for photo uploads.** Allow your web origin on the Storage bucket:
   ```sh
   cat > /tmp/cors.json <<'EOF'
   [{"origin": ["https://your-project.vercel.app", "https://yourbrand.in"], "method": ["GET", "POST", "PUT"], "maxAgeSeconds": 3600}]
   EOF
   gsutil cors set /tmp/cors.json gs://muse-352ba.firebasestorage.app
   ```

## Every deploy

The current `team-rockstar/paire` project is **not connected to Git** (verified 2026-10-17). Pushing to `main` does not deploy. Deploy manually from the repository root with `npx vercel deploy --prod --scope team-rockstar`, then `node apps/web/scripts/indexnow.mjs`. A build installs the browser dependencies and exports the app, which takes a few minutes. Git pushes would deploy automatically only after a Git connection is explicitly configured.

Check after each deploy: the landing page loads; `/app/` shows Welcome; you can sign in, see Discover, send a like with a note, and open a chat; `/privacy/` loads.

## Local preview

```sh
node apps/web/scripts/build.mjs
python3 -m http.server 4173 --directory apps/web/dist   # http://127.0.0.1:4173
```
This preview has no `/app/*` fallback, so open `/app/` itself. To test the browser app against the emulators, use the Metro flow in `docs/web-preview.md`.

## What the web can't do yet
- **Payments** use Razorpay on the web (see launch-web.md §2); the Plus screen shows "coming soon" until `MUSE_BILLING_ENABLED` and the Razorpay keys are set.
- **Push notifications and check-in reminders.** In-app alerts work while the tab is open.
- **Screenshot blocking.** Browsers can't prevent screenshots.

The older owner-private "Sites" preview (`apps/muse-site`, `docs/web-preview.md`) still works, but Vercel (`apps/web`) is now the main web deployment.
