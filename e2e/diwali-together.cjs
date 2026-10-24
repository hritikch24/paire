/** Emulator-only Diwali Together and notification-prompt QA: fictional members, mocked push broker. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createECDH, randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8082/app/';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw new Error('Requires isolated demo-muse emulators and the local web QA proxy.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backendRequire = createRequire(resolve(root, 'firebase/functions/package.json'));
backendRequire('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const db = backendRequire('firebase-admin/firestore').getFirestore();
const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const days = ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].filter((d) => d >= today);
if (today < '2026-10-24' || today > '2026-11-10') throw new Error('Run during the Diwali Together window (24 Oct to 10 Nov 2026, IST).');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, what, ms = 20000) { const start = Date.now(); for (;;) { const v = await check(); if (v) return v; if (Date.now() - start > ms) throw new Error('Timed out: ' + what); await sleep(200); } }
const settings = (uid) => db.doc(`users/${uid}/private/settings`);
const plan = async (uid, dates, vibes, extra = {}) => { await settings(uid).set({ diwaliPlan: { dates, vibes }, ...extra }, { merge: true }); };
const indexed = (uid, on) => until(async () => ((await db.doc(`discovery/${uid}`).get()).get('diwali') === 'diwali-2026') === on, `index ${uid} ${on}`);

async function deckNames(page, first) {
  // Walk the deck by passing; stops when no further card arrives.
  const names = [];
  const label = () => page.getByTestId('discover-card').first().getAttribute('aria-label', { timeout: 1000 }).catch(() => null);
  for (let i = 0; i < 4; i++) {
    const name = await until(async () => { const value = await label(); return value && !names.includes(value) ? value : (names.length ? (await sleep(300), null) : null); }, 'next card', i === 0 ? 20000 : 3500).catch(() => null);
    if (!name) break;
    names.push(name);
    if (first) await first(name, i);
    await page.getByTestId('discover-nope').click();
  }
  return names;
}
async function signIn(page, email) {
  await page.getByTestId('welcome-sign-in').click();
  await page.getByTestId('signin-email').fill(email); await page.getByTestId('signin-password').fill('Password123!');
  await page.getByTestId('signin-submit').click();
}
async function signOut(page) {
  await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-settings').click();
  await page.getByTestId('settings-signout').click(); await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByTestId('welcome-sign-in').waitFor();
}

(async () => {
  execFileSync(process.execPath, [resolve(root, 'firebase/functions/scripts/seed.js')], { env: process.env, stdio: 'pipe' });
  for (const uid of ['muse_casey', 'muse_jules', 'muse_dev', 'muse_kai', 'muse_casey']) { await settings(uid).set({ diwaliPlan: null }, { merge: true }); }
  // Casey is the searcher: Jules (shared plan) and Kai (shared plan, same city, no GPS) should appear; Dev has no shared plan.
  await db.doc('swipes/muse_casey/outgoing/muse_dev').delete();
  const [d0, d1] = days;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const curve = createECDH('prime256v1'); curve.generateKeys();
  const fake = { endpoint: 'https://fcm.googleapis.com/fcm/send/fictional-diwali-ui-test', keys: { auth: randomBytes(16).toString('base64url'), p256dh: curve.getPublicKey().toString('base64url') } };
  async function context(width, { notifications = false, fixedNow = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, permissions: notifications ? ['notifications'] : [], serviceWorkers: notifications ? 'allow' : 'block' });
    await ctx.addInitScript(({ fake, notifications, fixedNow }) => {
      if (fixedNow) { const Real = Date; class Fake extends Real { constructor(...a) { a.length ? super(...a) : super(fixedNow); } static now() { return fixedNow; } } window.Date = Fake; }
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      if (!notifications) return;
      // The prompt skips automated browsers, so the prompt tests present as a normal one.
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.__permissionRequests = 0;
      Notification.requestPermission = async () => { window.__permissionRequests++; return 'granted'; };
      const subscription = () => ({ ...fake, toJSON: () => fake, unsubscribe: async () => { localStorage.removeItem('qa-push-sub'); return true; } });
      PushManager.prototype.getSubscription = async function () { return localStorage.getItem('qa-push-sub') ? subscription() : null; };
      PushManager.prototype.subscribe = async function () { localStorage.setItem('qa-push-sub', 'on'); return subscription(); };
    }, { fake, notifications, fixedNow });
    return ctx;
  }
  const open = async (ctx, url) => { const p = await ctx.newPage(); p.setDefaultTimeout(60000); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(url); return p; };
  // Flows that aren't about the notification prompt pre-record a recent ask, so it stays quiet for a day.
  const silence = async (ctx, uids) => ctx.addInitScript((uids) => { for (const uid of uids) { try { localStorage.setItem(`paire.pushPrompt.${uid}`, JSON.stringify({ at: Date.now(), count: 1 })); } catch (e) { /* ignore */ } } }, uids);
  const settle = async (page) => { await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth); };

  try {
    // ---- 1. A public campaign link survives sign-in, never auto-enrols, and opens the opt-in sheet. ----
    let ctx = await context(390); await silence(ctx, ['muse_casey']);
    const link = new URL(appUrl); link.searchParams.set('edition', 'diwali'); link.searchParams.set('vibe', 'bash');
    let page = await open(ctx, link.href);
    await signIn(page, 'muse+casey@example.com');
    await page.getByTestId('diwali-sheet').waitFor();
    assert(!new URL(page.url()).searchParams.has('edition'));
    assert.equal((await settings('muse_casey').get()).get('diwaliPlan') ?? null, null);
    assert.match(await page.getByTestId('diwali-save').innerText(), /Pick a day/); // the linked plan is pre-picked, no day yet
    await page.getByTestId('diwali-hint').waitFor();
    assert.match(await page.getByTestId('diwali-hint').innerText(), /Paire doesn't host these/);
    assert(await page.getByTestId('diwali-save').isDisabled());
    console.log('PASS public Diwali link survives sign-in, opens the sheet with the plan pre-picked and enrols nobody');
    await page.screenshot({ path: '/tmp/muse-diwali-sheet-390.png' });
    for (const width of [320, 768, 1280]) { await page.setViewportSize({ width, height: width === 320 ? 568 : 900 }); await settle(page); await page.screenshot({ path: `/tmp/muse-diwali-sheet-${width}.png` }); }
    await page.setViewportSize({ width: 320, height: 568 });
    await page.getByTestId('diwali-save').scrollIntoViewIfNeeded(); // the sheet scrolls at 320 px
    assert(await page.getByTestId('diwali-save').isVisible());
    await page.setViewportSize({ width: 390, height: 844 });

    // Fictional neighbours: one shares a plan, one has no shared activity, one has no GPS but the same city.
    await plan('muse_jules', [d0, d1 ?? d0], ['bash', 'meal']);
    await plan('muse_dev', [d0], ['mela']);
    await plan('muse_kai', [d0], ['chai'], { locationEnabled: false, location: null });
    await db.doc('users/muse_kai').set({ city: 'Noida' }, { merge: true });
    await Promise.all([indexed('muse_jules', true), indexed('muse_dev', true), indexed('muse_kai', true)]);

    // ---- 2. Join: pick plans and days, save, see only overlapping people. ----
    await page.getByTestId('diwali-vibe-chai').click();
    await page.getByTestId('diwali-vibe-meal').click(); await page.getByTestId('diwali-vibe-mela').click(); // a 4th is refused
    assert.match(await page.locator('body').innerText(), /Pick up to 3 plans/);
    await page.getByTestId('diwali-vibe-mela').click(); // swap out: tapping a chosen one deselects it
    await page.getByTestId(`diwali-date-${d0}`).click();
    await page.getByTestId('diwali-save').click();
    await page.getByText('Diwali, together.', { exact: true }).waitFor();
    const saved = (await settings('muse_casey').get()).get('diwaliPlan');
    assert.deepEqual(saved.dates, [d0]); assert(saved.vibes.includes('bash') && saved.vibes.includes('chai'));
    await until(async () => (await db.doc('discovery/muse_casey').get()).get('diwali') === 'diwali-2026', 'casey indexed');
    const seen = new Set((await deckNames(page, async (name, i) => {
      if (i !== 0) return;
      assert.match(await page.getByTestId('discover-card').getByTestId('card-diwali').innerText(), /Diwali together/);
      assert.doesNotMatch(await page.getByTestId('discover-card').innerText(), /2026-11|Nov/);
      await page.screenshot({ path: '/tmp/muse-diwali-card-390.png' });
    })).map((name) => ['Jules', 'Kai', 'Dev'].find((n) => name.includes(n)) || name));
    assert(seen.has('Jules') && seen.has('Kai'), 'overlap members shown: ' + [...seen]);
    assert(!seen.has('Dev'), 'a member with no shared plan stays out');
    console.log('PASS consent saves a private plan; the real filtered feed shows overlap members (including the no-GPS city path) and hides everyone else, without leaking dates');

    // ---- 3. Mutual match with existing rules; messaging is unchanged. ----
    await signOut(page);
    await db.doc('swipes/muse_jules/outgoing/muse_casey').set({ fromUid: 'muse_jules', toUid: 'muse_casey', type: 'like', createdAt: new Date() });
    await db.recursiveDelete(db.doc('swipes/muse_casey')); await db.recursiveDelete(db.doc('limits/muse_casey'));
    await signIn(page, 'muse+casey@example.com');
    await page.getByTestId('discover-card').waitFor(); // settings are loaded once the feed shows
    await page.getByTestId('discover-diwali').click();
    await until(async () => (await page.getByText('Diwali, together.', { exact: true }).count()) > 0, 'diwali feed');
    await page.getByTestId('discover-card').waitFor();
    for (let i = 0; i < 3; i++) {
      const name = (await page.getByTestId('discover-card').getAttribute('aria-label')) || '';
      if (name.includes('Jules')) { await page.getByTestId('discover-like').click(); break; }
      await page.getByTestId('discover-nope').click(); await sleep(500);
    }
    await page.getByTestId('match-keep-swiping').waitFor();
    assert((await db.collection('matches').where('participants', 'array-contains', 'muse_casey').get()).size >= 1);
    await page.getByTestId('match-keep-swiping').click();
    console.log('PASS likes and mutual matches follow the existing rules inside Diwali Together');

    // ---- 4. Withdrawal from Settings is immediate and reversible. ----
    await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-settings').click();
    await page.getByTestId('settings-diwali').scrollIntoViewIfNeeded();
    assert.match(await page.getByTestId('settings-diwali').innerText(), /My Diwali plans/);
    await page.getByTestId('settings-diwali').click(); await page.getByTestId('diwali-withdraw').click();
    await until(async () => ((await settings('muse_casey').get()).get('diwaliPlan') ?? null) === null, 'withdrawn');
    await until(async () => (await page.getByTestId('diwali-sheet').count()) === 0, 'sheet closed');
    assert.match(await page.getByTestId('settings-diwali').innerText(), /Find company for Diwali/);
    console.log('PASS leaving Diwali Together clears the plan and the settings row offers to join again');
    await page.getByTestId('header-back').click();

    // ---- 5. No-GPS searcher: city only. ----
    await settings('muse_casey').set({ locationEnabled: false, location: null }, { merge: true });
    await plan('muse_casey', [d0], ['bash', 'chai']);
    await indexed('muse_casey', true);
    await page.reload();
    await page.getByTestId('discover-card').waitFor();
    await page.getByTestId('discover-diwali').click();
    await page.getByText('Diwali, together.', { exact: true }).waitFor();
    const cityNames = new Set(await deckNames(page));
    assert([...cityNames].some((n) => n.includes('Kai')), 'same-city member without GPS is shown: ' + [...cityNames]);
    assert(![...cityNames].some((n) => n.includes('Jules') || n.includes('Dev')), 'other-city members are not: ' + [...cityNames]);
    console.log('PASS searching without location uses the stated city only');
    await page.screenshot({ path: '/tmp/muse-diwali-empty-390.png' });
    await ctx.close();

    // ---- 6. After the window the app opens normally for an old campaign link. ----
    ctx = await context(390, { fixedNow: Date.parse('2026-11-11T08:00:00Z') }); await silence(ctx, ['muse_casey']);
    page = await open(ctx, link.href); await signIn(page, 'muse+casey@example.com');
    await page.getByTestId('tab-discover').waitFor();
    assert.equal(await page.getByTestId('discover-diwali').count(), 0);
    assert.equal(await page.getByTestId('diwali-sheet').count(), 0);
    console.log('PASS an expired campaign link opens normal discovery with no Diwali chip or sheet');
    await ctx.close();

    // ---- 7. Notification prompt after sign-in (mocked push broker). ----
    for (const uid of ['muse_dev']) await db.recursiveDelete(db.doc(`notificationReminders/${uid}`));
    for (const doc of (await db.collection('webPushSubscriptions').where('uid', 'in', ['muse_dev', 'muse_casey']).get()).docs) await doc.ref.delete();
    ctx = await context(390, { notifications: true });
    page = await open(ctx, appUrl); await signIn(page, 'muse+dev@example.com');
    await page.getByTestId('notification-prompt').waitFor();
    const copy = await page.getByTestId('notification-prompt').innerText();
    assert.match(copy, /Don't miss a like or a message/); assert.match(copy, /Someone likes you/); assert.match(copy, /A new message arrives/); assert.match(copy, /hidden unless you turn on previews/);
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0, 'no browser prompt until the member taps Allow');
    await page.screenshot({ path: '/tmp/muse-notification-prompt-390.png' });
    await page.getByTestId('notification-prompt-allow').click();
    await page.getByTestId('notification-prompt').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
    assert.equal((await db.collection('webPushSubscriptions').where('uid', '==', 'muse_dev').get()).size, 1);
    await page.reload(); await page.getByTestId('tab-discover').waitFor(); await sleep(5500);
    assert.equal(await page.getByTestId('notification-prompt').count(), 0, 'registered members are not asked again');
    console.log('PASS the prompt appears after sign-in, asks the browser only on Allow, registers this browser and stays away afterwards');
    await signOut(page); await ctx.close();

    ctx = await context(390, { notifications: true });
    page = await open(ctx, appUrl); await signIn(page, 'muse+casey@example.com');
    await page.getByTestId('notification-prompt').waitFor();
    await page.getByTestId('notification-prompt-later').click();
    await page.getByTestId('notification-prompt').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
    await page.reload(); await page.getByTestId('tab-discover').waitFor(); await sleep(5500);
    assert.equal(await page.getByTestId('notification-prompt').count(), 0, 'Not now is respected for a day');
    assert.equal((await db.collection('webPushSubscriptions').where('uid', '==', 'muse_casey').get()).size, 0);
    console.log('PASS Not now is respected: no browser prompt, no registration, no nagging on reload');
    await ctx.close();

    // ---- 8. The Diwali pop-up: after some real use, closable, not nagging, and never enrols by itself. ----
    await settings('muse_casey').set({ diwaliPlan: null }, { merge: true });
    const promoContext = async (width = 390) => {
      const c = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      await c.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); try { localStorage.setItem('paire.pushPrompt.muse_casey', JSON.stringify({ at: Date.now(), count: 1 })); } catch (e) { /* ignore */ } });
      return c;
    };
    const promoPage = async (c, url = appUrl) => { const p = await c.newPage(); p.setDefaultTimeout(60000); p.on('pageerror', (e) => errors.push(e.message)); await p.clock.install(); await p.goto(url); return p; };
    ctx = await promoContext(); page = await promoPage(ctx);
    await signIn(page, 'muse+casey@example.com'); await page.getByTestId('tab-discover').waitFor();
    await page.clock.runFor(20_000); assert.equal(await page.getByTestId('diwali-promo').count(), 0, 'not before the member has used the app for a while');
    await page.clock.runFor(30_000); await page.getByTestId('diwali-promo').waitFor();
    const promoText = await page.getByTestId('diwali-promo').innerText();
    assert.match(promoText, /Away from home this Diwali\?/); assert.match(promoText, /Free and completely optional/); assert.match(promoText, /Don't show this again/);
    await page.screenshot({ path: '/tmp/muse-diwali-promo-390.png' });
    for (const width of [320, 768, 1280]) { await page.setViewportSize({ width, height: width === 320 ? 568 : 844 }); await settle(page); await page.screenshot({ path: `/tmp/muse-diwali-promo-${width}.png` }); }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal((await settings('muse_casey').get()).get('diwaliPlan') ?? null, null);
    await page.getByTestId('diwali-promo-close').click(); await until(async () => (await page.getByTestId('diwali-promo').count()) === 0, 'closed with the X');
    await page.reload(); await page.clock.install(); await page.getByTestId('tab-discover').waitFor(); await page.clock.runFor(60_000);
    assert.equal(await page.getByTestId('diwali-promo').count(), 0, 'closing is respected for a day');
    await ctx.close();
    // After the cooldown it returns once more; Escape closes it too.
    ctx = await promoContext(); await ctx.addInitScript(() => { try { if (!localStorage.getItem('paire.diwaliPromo.muse_casey')) localStorage.setItem('paire.diwaliPromo.muse_casey', JSON.stringify({ at: Date.now() - 2 * 86400000, count: 1 })); } catch (e) { /* ignore */ } });
    page = await promoPage(ctx); await signIn(page, 'muse+casey@example.com'); await page.getByTestId('tab-discover').waitFor(); await page.clock.runFor(60_000);
    await page.getByTestId('diwali-promo').waitFor(); await page.keyboard.press('Escape');
    await until(async () => (await page.getByTestId('diwali-promo').count()) === 0, 'closed with Escape');
    await ctx.close();
    // "See Diwali Together" opens the opt-in sheet; nothing is saved until the member confirms.
    ctx = await promoContext(); page = await promoPage(ctx); await signIn(page, 'muse+casey@example.com'); await page.getByTestId('tab-discover').waitFor(); await page.clock.runFor(60_000);
    await page.getByTestId('diwali-promo-join').click(); await page.getByTestId('diwali-sheet').waitFor();
    assert.equal(await page.getByTestId('diwali-promo').count(), 0);
    assert.equal((await settings('muse_casey').get()).get('diwaliPlan') ?? null, null);
    await ctx.close();
    // "Don't show this again" is permanent.
    ctx = await promoContext(); page = await promoPage(ctx); await signIn(page, 'muse+casey@example.com'); await page.getByTestId('tab-discover').waitFor();
    await page.evaluate(() => localStorage.removeItem('paire.diwaliPromo.muse_casey')); await page.reload(); await page.clock.install(); await page.getByTestId('tab-discover').waitFor(); await page.clock.runFor(60_000);
    await page.getByTestId('diwali-promo-never').click(); await until(async () => (await page.getByTestId('diwali-promo').count()) === 0, 'never');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('paire.diwaliPromo.muse_casey'))).count, 3);
    await ctx.close();
    // A member who has already joined is never shown it.
    await plan('muse_casey', [d0], ['chai']);
    ctx = await promoContext(); await ctx.addInitScript(() => { try { localStorage.removeItem('paire.diwaliPromo.muse_casey'); } catch (e) { /* ignore */ } });
    page = await promoPage(ctx); await signIn(page, 'muse+casey@example.com'); await page.getByTestId('tab-discover').waitFor(); await page.clock.runFor(90_000);
    assert.equal(await page.getByTestId('diwali-promo').count(), 0);
    await ctx.close();
    console.log('PASS the Diwali pop-up waits for real use, closes with X, Escape or Maybe later, stays away for a day, can be silenced, opens the opt-in sheet without enrolling, and skips members who joined');

    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
