/**
 * Wedding Nods browser acceptance: isolated demo-muse emulators and fictional members only.
 *   MUSE_WEB_QA=demo-muse NODE_PATH=/opt/homebrew/lib/node_modules node e2e/wedding-nods.cjs
 * Needs the emulators (auth, firestore, functions, storage), Metro on :8081 and
 * `node scripts/web-qa-proxy.cjs` on :8082 (docs/web-preview.md), and `node apps/web/scripts/build.mjs`
 * for the landing page.
 */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module'), { resolve } = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = resolve(__dirname, '..'), appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8082/app/';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw Error('Requires isolated demo-muse and loopback app.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json')); backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const { buildDiscoveryEntry } = backend(resolve(root, 'firebase/functions/lib/lib/discovery.js'));
const { weddingBucket, weddingKeyHash, closesAtOf } = backend(resolve(root, 'firebase/functions/lib/lib/wedding.js'));
const password = 'Password123!', viewer = 'qa_wedding_viewer', asha = 'qa_wedding_asha', man = 'qa_wedding_man';
const others = Array.from({ length: 10 }, (_, i) => `qa_wedding_w${i}`), women = [asha, ...others];
const weddingId = 'qaweddingseed0000001';
const cardIds = Object.fromEntries([...women, man].map((uid, i) => [uid, `QAcard${String(i).padStart(2, '0')}xxxxxxxx`]));
const istToday = new Date(Date.now() + 330 * 60_000);
const dateIn = (days) => new Date(istToday.getTime() + days * 86_400_000).toISOString().slice(0, 10);
const date = dateIn(14), pin = '560034', secondPin = '560035', thirdPin = '560036';
const clueOf = (uid) => uid === asha ? 'emerald lehenga near the mandap' : `QA guest clue ${uid.slice(-1)}${uid === man ? 'm' : ''}`;

async function seed() {
  await db.doc('runtime/trust').set({ requireVerification: false }, { merge: true });
  await db.recursiveDelete(db.doc(`weddings/${weddingId}`));
  for (const p of [pin, secondPin, thirdPin]) for (const w of (await db.collection('weddings').where('pin', '==', p).get()).docs) await db.recursiveDelete(w.ref);
  await db.recursiveDelete(db.doc(`users/${viewer}/weddingSpots/x`)).catch(() => undefined);
  for (const s of (await db.collection(`users/${viewer}/weddingSpots`).get()).docs) await s.ref.delete();
  await db.recursiveDelete(db.doc(`limits/${viewer}`));
  for (const r of (await db.collection('reports').where('reporterId', '==', viewer).get()).docs) await r.ref.delete();
  for (const uid of [viewer, ...women, man]) {
    const isMan = uid === viewer || uid === man, email = `${uid}@example.com`;
    try { await auth.getUser(uid); await auth.updateUser(uid, { email, password, emailVerified: true, disabled: false }); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, email, password, emailVerified: true }); }
    const now = Date.now(), profile = { uid, displayName: uid === viewer ? 'Wedding viewer QA' : uid === asha ? 'Wedding Asha QA' : `Wedding guest ${uid.slice(-2)}`, gender: isMan ? 'man' : 'woman', age: isMan ? 29 : 27, photoUrls: [], city: 'Bengaluru', bio: 'Fictional Wedding Nods browser QA.', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now };
    const settings = { showMe: [isMan ? 'woman' : 'man'], ageMin: 20, ageMax: 40, locationEnabled: false, notifications: { matches: false, messages: false, reminders: false }, updatedAt: now }, moderation = { emailVerified: true, status: 'ok', cohort: 'test' };
    await db.doc(`users/${uid}`).set(profile); await db.doc(`users/${uid}/private/settings`).set(settings); await db.doc(`users/${uid}/private/info`).set({ email, birthDate: `${new Date().getFullYear() - profile.age}-01-15` }); await db.doc(`moderation/${uid}`).set(moderation); await db.doc(`discovery/${uid}`).set(buildDiscoveryEntry(uid, profile, settings, moderation));
    for (const other of [viewer, ...women, man]) { await db.doc(`swipes/${uid}/outgoing/${other}`).delete(); await db.doc(`blocks/${uid}/blocked/${other}`).delete(); }
    await db.doc(`matches/${[uid, viewer].sort().join('_')}`).delete();
  }
  const names = ['aarav', 'priyanka'];
  await db.doc(`weddings/${weddingId}`).set({ bucket: weddingBucket(date, pin), keyHash: weddingKeyHash(names, date, pin), names, date, pin, status: 'open', closesAt: closesAtOf(date), createdAt: new Date() });
  const guests = [...women, man];
  for (const [i, uid] of guests.entries()) await db.doc(`weddings/${weddingId}/guests/${uid}`).set({ uid, nickname: `QA Nick ${i}`, side: i % 2 ? 'groom' : 'bride', ageBand: '25-29', clue: clueOf(uid), cardId: cardIds[uid], active: true, hidden: false, reporters: [], nodsUsed: uid === asha ? 1 : 0, invitePath: null, joinedAt: Date.now(), updatedAt: Date.now() });
  // Asha already nodded the viewer, in secret.
  await db.doc(`weddings/${weddingId}/nods/${asha}_${viewer}`).set({ from: asha, to: viewer, createdAt: new Date() });
}
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
(async () => {
  console.log('Preparing fictional wedding fixtures'); await seed(); console.log('Fixtures ready; starting browser');
  const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 60000 });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const u = new URL(route.request().url()); if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.abort();
      if (u.pathname === '/wedding/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(resolve(root, 'apps/web/dist/wedding/index.html'), 'utf8') });
      if (u.pathname === '/site.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(resolve(root, 'apps/web/site/site.css'), 'utf8') });
      return route.continue();
    });
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));

    console.log('Landing page'); await page.goto(new URL('/wedding/', appUrl).href);
    assert.equal(await page.locator('header a.button').getAttribute('href'), '/app/?wedding=1');
    assert.match(await page.title(), /Wedding Nods/); assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), 'https://www.paire.in/wedding/');
    assert((await page.locator('details').count()) >= 5);
    const bodyText = await page.locator('main').innerText();
    for (const banned of [/verified guest/i, /100% safe/i, /guaranteed/i, /\d[\d,]*\+? (members|weddings|guests)/i]) assert(!banned.test(bodyText), `landing page must not say ${banned}`);
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); assert(!(await overflow(page)), `landing overflow at ${width}`); }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('header a.button').click(); await page.getByTestId('welcome-sign-in').click(); await page.getByTestId('signin-email').fill(`${viewer}@example.com`); await page.getByTestId('signin-password').fill(password); await page.getByTestId('signin-submit').click();
    await page.getByTestId('wedding-bride').waitFor(); assert(!new URL(page.url()).searchParams.has('wedding'));
    console.log('PASS landing → sign-in → Going to a wedding?');

    console.log('Add the seeded wedding with swapped names and a typo');
    await page.getByTestId('wedding-bride').fill('Aarav'); await page.getByTestId('wedding-groom').fill('Priyanca');
    await page.getByTestId('wedding-date').fill(date); await page.getByTestId('wedding-pin').fill(pin);
    await page.getByTestId('wedding-side-groom').click(); await page.getByTestId('wedding-clue').fill('grey blazer near the bar');
    await page.getByTestId('wedding-join').click();
    await page.getByTestId('wedding-my-nickname').waitFor();
    assert.equal((await db.collection('weddings').where('pin', '==', pin).get()).size, 1, 'typing the same details must not create a second wedding');
    assert.equal((await db.doc(`weddings/${weddingId}/guests/${viewer}`).get()).get('side'), 'groom');
    for (const uid of women) await page.getByTestId(`wedding-card-${cardIds[uid]}`).waitFor();
    assert.equal(await page.getByTestId(`wedding-card-${cardIds[man]}`).count(), 0, 'men are outside this member\'s preferences');
    assert.equal(await page.getByTestId('wedding-joining').count(), 0);
    const cardText = await page.getByTestId(`wedding-card-${cardIds[asha]}`).innerText();
    assert(cardText.includes('emerald lehenga near the mandap') && !cardText.includes('Wedding Asha QA') && !cardText.includes(asha));
    await page.getByTestId('wedding-nods-left').filter({ hasText: '3 of 3' }).waitFor();
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `/tmp/muse-wedding-${width}.png`, fullPage: true }); assert(!(await overflow(page)), `wedding overflow at ${width}`); }
    await page.setViewportSize({ width: 390, height: 844 });
    console.log('PASS same wedding by typing the same details, anonymous cards, preferences, no overflow at 320/390/1280');

    console.log('A secret nod');
    await page.getByTestId(`wedding-nod-${cardIds[others[3]]}`).click();
    await page.getByTestId('wedding-nods-left').filter({ hasText: '2 of 3' }).waitFor();
    await page.getByTestId(`wedding-nod-${cardIds[others[3]]}`).filter({ hasText: 'Nodded' }).waitFor();
    assert((await db.doc(`weddings/${weddingId}/nods/${viewer}_${others[3]}`).get()).exists);
    assert(!(await db.doc(`swipes/${viewer}/outgoing/${others[3]}`).get()).exists && !(await db.doc(`swipes/${others[3]}/outgoing/${viewer}`).get()).exists);
    assert(!(await db.doc(`matches/${[viewer, others[3]].sort().join('_')}`).get()).exists);
    assert.equal(await page.getByTestId('wedding-match-banner').count(), 0);
    console.log('PASS one-sided nod: nothing created, nobody told');

    console.log('A mutual nod');
    await page.getByTestId(`wedding-nod-${cardIds[asha]}`).click();
    await page.getByTestId('wedding-match-banner').waitFor();
    const match = await db.doc(`matches/${[viewer, asha].sort().join('_')}`).get();
    assert(match.exists && match.get('source') === 'wedding' && match.get('active') === true);
    await page.getByTestId('wedding-open-chat').click(); await page.getByText('Wedding Asha QA').first().waitFor();
    await page.goBack(); await page.getByTestId('wedding-nods-left').waitFor();
    console.log('PASS mutual nod: one wedding match, chat opens');

    console.log('Report from a card');
    await page.getByTestId(`wedding-more-${cardIds[others[5]]}`).click();
    await page.getByTestId(`wedding-report-harassment-${cardIds[others[5]]}`).click();
    await page.getByTestId(`wedding-card-${cardIds[others[5]]}`).waitFor({ state: 'detached' });
    const reports = await db.collection('reports').where('reporterId', '==', viewer).get();
    assert.equal(reports.size, 1); assert.equal(reports.docs[0].get('source'), 'wedding'); assert.equal(reports.docs[0].get('targetId'), others[5]);
    assert((await db.doc(`blocks/${viewer}/blocked/${others[5]}`).get()).exists);
    console.log('PASS report from a card also blocks and hides the card');

    console.log('Few guests, and the weekly limit');
    await page.locator('[data-testid="header-back"]:visible').click();
    await page.getByTestId('wedding-add-open').click();
    await page.getByTestId('wedding-bride').fill('Meera'); await page.getByTestId('wedding-groom').fill('Karan');
    await page.getByTestId('wedding-date').fill(dateIn(10)); await page.getByTestId('wedding-pin').fill(secondPin);
    await page.getByTestId('wedding-side-bride').click(); await page.getByTestId('wedding-clue').fill('yellow saree by the entrance');
    await page.getByTestId('wedding-join').click();
    await page.getByTestId('wedding-joining').waitFor();
    assert.equal(await page.locator('[data-testid^="wedding-card-"]').count(), 0);
    await page.locator('[data-testid="header-back"]:visible').click();
    await page.getByTestId('wedding-add-open').click();
    await page.getByTestId('wedding-bride').fill('Tara'); await page.getByTestId('wedding-groom').fill('Veer');
    await page.getByTestId('wedding-date').fill(dateIn(9)); await page.getByTestId('wedding-pin').fill(thirdPin);
    await page.getByTestId('wedding-side-bride').click(); await page.getByTestId('wedding-clue').fill('red dupatta near the buffet');
    await page.getByTestId('wedding-join').click();
    await page.getByTestId('wedding-error').filter({ hasText: '2 weddings a week' }).waitFor();
    assert.equal((await db.collection('weddings').where('pin', '==', thirdPin).get()).size, 0);
    console.log('PASS under 10 guests: "Guests are still joining"; third wedding in a week refused');

    console.log('Leaving');
    await page.getByTestId(`wedding-spot-${weddingId}`).click();
    await page.getByTestId('wedding-leave').click(); await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await page.getByTestId(`wedding-spot-${weddingId}`).waitFor();
    assert.equal((await db.doc(`weddings/${weddingId}/guests/${viewer}`).get()).get('clue'), '');
    assert.deepEqual(errors, []);
    console.log('PASS leave erases the clue; no browser errors');
    await context.close();
  } catch (error) { for (const c of browser.contexts()) for (const p of c.pages()) { console.error('QA URL', p.url()); console.error((await p.locator('body').innerText()).slice(0, 7000)); await p.screenshot({ path: '/tmp/muse-wedding-failure.png', timeout: 5000 }).catch(() => undefined); } throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
