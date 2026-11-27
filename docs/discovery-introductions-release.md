# Browser discovery • 27 November 2026

The homepage, welcome screen and signed-in Discover surface four labelled shortcuts. Regular likes, notes, passes, Super Likes and free rewind remain available. The heart, pass and Super Like have distinct colours, icons and accessible names.

| Entry | What members can expect |
|---|---|
| [Vibe match](https://www.paire.in/app/?explore=vibes) | Opt in for 24 hours. Paire introduces two eligible adults with at least one shared profile vibe. Each independently chooses whether to connect. |
| [Metro](https://www.paire.in/app/?explore=metro) | Choose a city circle for 24 hours. Paire uses the selected city. It collects no station, route, journey time or commuter location. |
| [Events](https://www.paire.in/app/?explore=events) | Signed-in members can browse published, open rooms. A shared event link still opens the guest preview directly. An empty directory means there are no published rooms available. |
| [Weddings](https://www.paire.in/app/?wedding=1) | The existing private Wedding Nods flow. |

**Campaign line** “Meet through your kind of vibe. You both choose where it goes.” For adults 18+. An introduction depends on an eligible participant. Sending messages requires each sender’s own Plus or Unlimited Chat access.

Both introduction flows recheck eligibility and blocks before a mutual connection. Introduction choices spend no like allowance. Firestore TTL removes expired enrolments and 30-day pairing history asynchronously. Established mutual connections follow the usual match, safety and account deletion rules.

The labelled entry points draw on Tinder’s themed Explore and Bumble’s Discover. The individual introduction and decision are informed by Hinge’s Most Compatible. [Tinder Explore](https://www.help.tinder.com/hc/en-us/articles/38094560737677-Explore) · [Bumble Discover](https://support.bumble.com/hc/en-us/articles/28423668110621-Using-the-Discover-tab) · [Hinge Most Compatible](https://help.hinge.co/hc/en-us/articles/360011233073-What-is-Most-Compatible).

Local emulator screenshots show the [welcome screen](evidence/discovery/welcome-390.png), [Discover](evidence/discovery/discover-390.png) and [introduction](evidence/discovery/vibe-390.png). The profiles are QA fixtures.

**Rollback order** Roll the web deployment back to c4f2a91 first. Keep account deletion cleanup, expiry policies and established match records. If introduction writes must stop immediately, restrict invocation of the new discoveryIntroduction function as part of the incident response.

## Production evidence

Product commit `51cd789` reached [Vercel production](https://vercel.com/team-rockstar/paire/FGMYSr79CxpSDta9JooVnpxzCwhF). Firebase CLI deployed the event directory index and TTL fields, discoveryIntroduction, listDiscoveryEvents, deleteAccount and onAuthUserDeleted. Both discovery callables returned HTTP 401 to signed-out requests. A read-only aggregate found zero open published rooms at verification time. The event directory composite index was READY.

The full verification run passed 297 app unit tests, 426 function unit tests, 161 rules tests and 284 emulator integration tests. A subsequent targeted run included an additional passing expiry-between-decisions regression. Final web typecheck and production build passed. The signed-in browser path ran solely against emulators with fictional adults. The live public homepage and guest routes were tested in Chromium at 320 and 768 pixels, WebKit at 390 pixels and Firefox at 1440 pixels. Each preserved campaign attribution after changing routes. A Chromium touch session with an Android Instagram-style user agent, reduced motion, 4× CPU throttling and 120 ms network latency also passed. Physical devices and the actual Instagram webview were outside the tested coverage. [Live WebKit screenshot](evidence/discovery/live-webkit-390.png).
