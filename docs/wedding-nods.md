# Wedding Nods

*"Shaadi mein ek nod."* Browser only. Adults going to the same wedding can privately signal interest in each other, without family or friends seeing. Open **Profile → Going to a wedding?**; there is no section on Discover or on the public homepage. The public landing page is https://www.paire.in/wedding/ (app link `/app/?wedding=1`).

Marketing may use only the claims in [`docs/marketing/wedding-nods-facts.md`](marketing/wedding-nods-facts.md).

## How it works

1. **Add your wedding.** Bride's first name, groom's first name, wedding date, venue PIN code, and an optional photo of the invitation. No link, no host, no list of weddings. Two people who type the same details land in the same wedding automatically. One-letter typos in a name still match (names of 4+ letters). A member only ever lands in a wedding they typed themselves: weddings cannot be listed or searched.
2. **Your spot.** A nickname chosen by the server (for example "Saffron Peacock"), your side (bride's or groom's), your age band (18-24, 25-29, 30-34, 35+, worked out from your profile age) and a short "spot me" clue (for example "navy sherwani near the stage"). No photo, real name, phone, links or location. The clue goes through the chat-safety scanner plus extra checks for contact details and your own name.
3. **The guests.** Anonymous cards (nickname, side, age band, clue) for the same wedding only. Your gender and age preferences, distance, shared-trait choices, blocks, bans, incognito, cohort isolation and verification apply exactly as in `getDiscoverFeed`. Under 10 guests the app shows only "Guests are still joining".
4. **Nod.** 3 nods per wedding. A nod is secret: the other person is never told and nobody can see who nodded them. If both nod each other the server creates a normal 1:1 match (`buildMatchDoc`, with `source: "wedding"`), both profiles open through the normal match rules, and the usual "It's a match" push is sent. After that it is the existing chat: chat safety, blocks, reports and paid-chat rules are unchanged.
5. **Closing.** The wedding closes 7 days after its date. A daily cleanup then deletes nods, nicknames, clues, guest cards and invitation photos. Matches that already happened stay.

## Data model

| Path | Contents | Access |
| --- | --- | --- |
| `weddings/{id}` | `bucket` (hash of date + PIN, to find candidates), `keyHash` (hash of the exact key), `names` (the two normalised first names, sorted: needed for typo matching), `date`, `pin`, `status` (`open` / `hidden`), `closesAt` (ms), `createdAt` | Functions and admins only. No client can read it. |
| `weddings/{id}/guests/{uid}` | `uid`, `nickname`, `side`, `ageBand`, `clue`, `cardId` (random opaque id shown to others instead of the uid), `active`, `hidden`, `reporters` (hashes, never uids), `nodsUsed`, `invitePath`, `joinedAt`, `updatedAt` | Functions only |
| `weddings/{id}/nods/{from_to}` | `from`, `to`, `createdAt` | Functions only. Never exposed through any callable. |
| `users/{uid}/weddingSpots/{weddingId}` | The member's own spot, mirrored for the app: label (as they typed it), date, `closesAt`, nickname, side, ageBand, clue, `active`, `nodsUsed` | Owner reads; functions write. Also the index `deleteAccount` uses to erase everything. |
| `limits/{uid}/wedding/joins` | Join timestamps of the last 7 days | Functions only |
| `limits/{uid}/daily/{day}` | `weddingJoinCalls`, `weddingGuestCalls`, `weddingNodCalls`, `weddingSafetyCalls` counters | Functions only |
| Storage `wedding-invites/{uid}/{file}` | Optional invitation photo (image, under 8 MB) | Owner may upload and delete; **only moderators can read**. Deleted after 30 days, when the wedding closes, on leaving, and on account deletion. |
| `matches/{id}` | Same as any match, plus `source: "wedding"` | Unchanged |
| `swipes/{uid}/outgoing/{target}` | On a mutual nod only: a `like` with `source: "wedding"` for each side, so both people disappear from each other's Discover feed. A single nod never writes a swipe. | Unchanged |

### Callables (functions write everything)

| Callable | What it does |
| --- | --- |
| `joinWedding` | Normalises the typed details, finds or creates the wedding in one transaction, creates or updates your spot. Calling it again for the same wedding updates your side and clue and rejoins you; it does not count as a new join. |
| `getWeddingGuests` | Your wedding's anonymous cards for you, or `status: "joining"` below 10 guests. |
| `sendNod` | Spends one of your 3 nods. Returns `matched: true` only when the other person had already nodded you. |
| `leaveWedding` | Leaves the wedding: your card disappears and your clue is erased. Your nods stay counted so leaving and rejoining cannot reset them. |
| `weddingGuestSafety` | Report and/or block a guest from their card (the card has no uid). Three different reporters hide that guest from the wedding. |
| `cleanupWeddings` (scheduled, daily) | Closes weddings, deletes their data and invitation photos older than 30 days. |

### Limits

- 2 weddings joined per rolling 7 days (rejoining a wedding you already have does not count).
- 3 nods per wedding, never refunded.
- Daily call counters in `limits/`: 20 joins, 120 guest-list loads, 60 nods, 60 reports/blocks.
- At most 500 guests are read per wedding.

## Rules the server enforces

- Photo-verification gate (`requireVerifiedUsers`), confirmed email, 18+, a complete visible profile.
- Support sessions are read-only and cannot use any of this.
- A guest hidden by 3 reports, a wedding hidden by an admin, or a closed wedding returns nothing and accepts nothing.
- Incognito members appear in a wedding only to people they have liked (same as Discover). Nothing about nods is used to decide this, so a nod can never be inferred from who appears.
- A nod does not need a note even if the other person usually asks for notes: it is only ever answered, never delivered.
- Admin tools: set `weddings/{id}.status` to `hidden` (or back to `open`) with `scripts/set-wedding-status.mjs`.

## Copy: do and don't

- Do say: "self-declared", "private", "nobody is told unless you both nod", "18+ only", "we don't store your location".
- Don't say: that anyone is a verified wedding guest, that the wedding is verified, that it is safe, that matches are guaranteed, that the host or family can see or approve anything, or any member count.
- Always remind: attendance is self-declared and not verified. Meet in public and use the existing report and block.

## Deploy order

1. `firebase deploy --only firestore,storage --project muse-352ba` (rules; no new indexes are needed, so there is nothing to wait for. Check with `firebase firestore:indexes` that every index is READY anyway).
2. `firebase deploy --only functions:joinWedding,functions:getWeddingGuests,functions:sendNod,functions:leaveWedding,functions:weddingGuestSafety,functions:cleanupWeddings,functions:deleteAccount,functions:onAuthUserDeleted,functions:blockUser --project muse-352ba` (`deleteAccount` and `onAuthUserDeleted` also erase wedding data; `blockUser` shares code with the new safety callable).
3. Browser: push to `main` (Vercel) or `npx vercel deploy --prod --scope team-rockstar`, then `node apps/web/scripts/indexnow.mjs`.

No payment, presence or paid-chat switch is touched.

## Testing

- Unit: `firebase/functions/test/wedding.test.ts`
- Rules: `firebase/test/firestore.rules.test.ts` (weddings, weddingSpots, wedding-invites)
- Functions on emulators: `firebase/functions/integration/weddingNods.integration.test.ts`
- Browser: `MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/wedding-nods.cjs` (fictional members, local emulators only)
- `./scripts/verify.sh` and `node apps/web/scripts/build.mjs`
