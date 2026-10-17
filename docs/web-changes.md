# Web changes

Every commit that changes the web product: www.paire.in, the browser app at `/app/`, the backend and rules it uses, and legal copy. Newest first. See `CLAUDE.md` for the rules.

**Status key:** *pushed* = on GitHub `main` only (a push never deploys) · *Vercel* = website and browser app deployed · *Firebase* = functions/rules deployed.

| Date | Commit | Change | Status |
|---|---|---|---|
| 2026-10-17 | — | Configured the Firebase runtime service account to sign its own support tokens. No member or moderator support grants applied yet. | Firebase live |
| 2026-10-17 | `8958b5c` | Mobile browser Discover: compact header, large profile card, labelled actions, smaller setup prompt, readable tabs and vertical scrolling on short screens. | pushed; Vercel pending |
| 2026-10-17 | `5bb698e` | Finish member admin, email/uid lookup, owner-only 15-minute read-only support views with separate identities, expiry/revocation, audit history, rules and Terms/Privacy disclosure. Includes the inherited member-admin/payment-notice/UPI-metrics work left by Claude. | pushed, Firebase (functions, Firestore/indexes, Storage); Vercel pending |
| 2026-10-17 | `ecd152b` | UPI payments: buyers just tap "I've paid"; the UTR is optional. Moderators match the exact amount (unique paise) and time. | pushed, Vercel, Firebase |
| 2026-10-17 | — | `razorpayPlusSales` off: **no Razorpay checkout anywhere** for new purchases. Earlier Razorpay payments still confirm and refund through the webhook. | live |
| 2026-10-17 | `4e4f908` | Paire Plus paid by UPI to paire.in@ybl, like Unlimited Chat (moderator approves; approval starts the pass, revoke ends it). The pay panel has a QR plus PhonePe / Google Pay / Paytm / any-UPI-app buttons on phones. Site and legal copy no longer offer Razorpay. | pushed, Vercel, Firebase |
| 2026-10-17 | — | Switched ₹49 Unlimited Chat from Razorpay to **UPI into paire.in@ybl** (`upiSales` on, Razorpay `unlockSales` off); moderator claim given to er.hritik.24@gmail.com and hritikchaudhary016@gmail.com so they can approve payments (Settings → UPI payments to confirm). Paire Plus still sells through Razorpay. | live |
| 2026-10-17 | `8859d77` | Pay Unlimited Chat by UPI: a unique amount (₹49.01–₹49.99), QR and UPI link per order; the buyer enters the 12-digit UTR; a moderator approves it against the bank statement before chat unlocks. Terms, Refunds, Privacy and the pricing page updated. | pushed, Vercel, Firebase |
| 2026-10-17 | — | **Switched on in production** (`scripts/set-runtime-flags.mjs`, owner's request): presence (2-min idle), the paid-sending gate from 2026-10-17 01:29 IST with no grace period, and live ₹49 Unlimited Chat sales (`MUSE_CHAT_UNLOCK_ENABLED`/`MUSE_CHAT_UNLOCK_LIVE` in functions `.env`). No Plus holders needed backfilling. | live |
| 2026-10-17 | `380f867` | Unlimited Chat price ₹49 (4,900 paise), in the app, server, site and legal copy. | pushed, Vercel, Firebase |
| 2026-10-17 | `29c453d` | Activity-based presence ("Online" / "Active 2 h ago" for matches, with a "Show when I'm active" setting) and paid sending: your own Paire Plus or a ₹50 one-time Unlimited Chat unlock to send messages; reading and safety stay free. Razorpay unlock with server verification, webhooks, refunds and chargebacks. Site, pricing, FAQ and legal copy updated. See `docs/presence-and-paid-chat.md`. | pushed, Vercel, Firebase |
| 2026-10-16 | `3fc2562` | "Built by KraftAI" credit in the website footer. | pushed |
| 2026-10-13 | `577581e` | Photo check optional; add photos in place; smoother sign-up. | pushed |
| 2026-10-13 | `660be27` | Metrics: first names of new sign-ups and recent logins. | pushed |
| 2026-10-13 | `8c72829` | Metrics dashboard open at `/metrics?key=admin`, never indexed. | pushed |
| 2026-10-13 | `bdc55c4` | Metrics dashboard only at `/metrics?key=admin`; not in robots.txt. | pushed |
| 2026-10-13 | `d8033fc` | SEO/GEO: 30 content pages, full sitemap, llms-full.txt, IndexNow. | pushed |
| 2026-10-13 | `3d3b08e` | Private `/metrics/` dashboard and anonymous visit counts. | pushed |
| 2026-10-13 | `6ba42c3` | Paire's own confirm and reset emails (Firebase templates locked). | pushed |
| 2026-10-13 | `63e0cfd` | Confirmed emails required; free selfie photo check. | pushed |
| 2026-10-13 | `41df507` | Tab labels no longer clip; 10 themes with a one-tap picker. | pushed |
| 2026-10-13 | `43c996d` | Launch readiness: SEO/GEO, Gemini AI, account page, birthday fix, ads. | pushed |
| 2026-10-13 | `df563b5` | Founder's name removed from the landing page footer. | pushed |
| 2026-10-12 | `d647f9a` | India web launch, Razorpay Plus, age-gap and Garba Nights. | pushed |

Entries before 2026-10-17 were reconstructed from `git log`; which of them reached Vercel or Firebase wasn't recorded. From 2026-10-17 on, record every deploy here.
