/** Browser acceptance for anonymous likes, the quota offer and owner grants. Isolated emulators only. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const http = require('node:http');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8081';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw new Error('Requires isolated demo-muse UI emulators and a loopback browser app.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json'));
backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth();
const { getFirestore, Timestamp } = backend('firebase-admin/firestore');
const db = getFirestore();
const artifacts = process.env.MUSE_WEB_QA_ARTIFACT_DIR || '/tmp/muse-likes-plus-grants-qa';
fs.mkdirSync(artifacts, { recursive: true });
const password = 'Password123!';
const specs = [
  { uid: 'qa_likes_owner', email: 'owner-plus-qa@example.com', name: 'Owner QA', gender: 'woman', age: 28, owner: true },
  { uid: 'qa_likes_viewer', email: 'free-likes-qa@example.com', name: 'Free Viewer QA', gender: 'woman', age: 26 },
  { uid: 'qa_likes_far', email: 'far-likes-qa@example.com', name: 'Far Admirer QA', gender: 'man', age: 45, far: true },
  { uid: 'qa_likes_near', email: 'near-likes-qa@example.com', name: 'Nearby QA', gender: 'man', age: 27 }
];
async function seed() {
  await db.doc('runtime/trust').set({ requireVerification: false });
  for (const s of specs) {
    try { await auth.getUser(s.uid); await auth.updateUser(s.uid, { email: s.email, password, emailVerified: true }); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; await auth.createUser({ uid: s.uid, email: s.email, password, emailVerified: true }); }
    await auth.setCustomUserClaims(s.uid, s.owner ? { moderator: true, supportAccess: true } : {});
    const now = Date.now(); const batch = db.batch();
    batch.set(db.doc(`moderation/${s.uid}`), { emailVerified: true, status: 'ok', cohort: 'test' });
    batch.set(db.doc(`users/${s.uid}`), { uid: s.uid, displayName: s.name, gender: s.gender, age: s.age, photoUrls: [], city: s.far ? 'Pune' : 'Mumbai', bio: 'Fictional browser QA profile.', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now });
    batch.set(db.doc(`users/${s.uid}/private/settings`), { showMe: [s.gender === 'woman' ? 'man' : 'woman'], ageMin: 18, ageMax: s.uid === 'qa_likes_viewer' ? 30 : 60, maxDistanceKm: s.far ? 300 : 5, locationEnabled: true, location: { ...(s.far ? { lat: 18.52, lng: 73.85 } : { lat: 19.08, lng: 72.88 }), updatedAt: now }, notifications: { matches: false, messages: false, reminders: false }, updatedAt: now });
    batch.set(db.doc(`users/${s.uid}/private/info`), { email: s.email, birthDate: `${new Date().getFullYear() - s.age}-01-15` });
    batch.set(db.doc(`billing/${s.uid}`), { expiresAt: 0, checkedAt: now });
    batch.delete(db.doc(`complimentaryPlusGrants/${s.uid}`));
    batch.delete(db.doc(`webPassLedger/${s.uid}`));
    if (s.owner) batch.set(db.doc(`supportOperators/${s.uid}`), { enabled: true });
    for (const t of specs) { batch.delete(db.doc(`swipes/${s.uid}/outgoing/${t.uid}`)); batch.delete(db.doc(`matches/${[s.uid, t.uid].sort().join('_')}`)); }
    await batch.commit();
  }
  await db.doc('swipes/qa_likes_far/outgoing/qa_likes_viewer').set({ fromUid: 'qa_likes_far', toUid: 'qa_likes_viewer', type: 'like', note: 'A hidden thoughtful note', createdAt: Timestamp.now() });
}
const metrics = { generatedAt: Date.now(), testAccounts: 4, visits: { today: {}, last7: {}, daily: [{ day: '2026-10-21', views: 0, visitors: 0, signups: 0 }], sources: [], pages: [], devices: [] }, accounts: {}, profiles: {}, activity: {}, plus: { orders: 0, rupees: 0 }, unlimitedChat: { orders: 0, rupees: 0 } };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:18883');
  if (url.pathname.startsWith('/app/')) { res.writeHead(302, { Location: `${appUrl}/${url.search}` }); res.end(); return; }
  if (url.pathname.startsWith('/metrics')) { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(resolve(root, 'apps/web/site/_d6ad65113cb02b1461f/index.html'))); return; }
  if (url.pathname === '/site.css') { res.setHeader('Content-Type', 'text/css'); res.end(fs.readFileSync(resolve(root, 'apps/web/site/site.css'))); return; }
  res.writeHead(404); res.end();
});
async function login(page, email, destination = 'tab-discover') {
  await page.getByTestId('welcome-sign-in').click();
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill(password);
  await page.getByTestId('signin-submit').click();
  await page.getByTestId(destination).waitFor({ timeout: 60000 });
}
async function run() {
  await seed();
  await new Promise(resolve => server.listen(18883, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  const context = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route('**/*', route => {
      const u = new URL(route.request().url());
      if (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.continue();
      if (u.pathname.endsWith('/getMetrics')) return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ result: metrics }) });
      return route.abort();
    });
    ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    return ctx;
  };
  try {
    const freeContext = await context(); const free = await freeContext.newPage(); free.setDefaultTimeout(45000);
    const responses = [];
    free.on('response', async response => { if (response.url().endsWith('/getLikesYou') && response.ok()) responses.push((await response.json()).result); });
    await free.goto(appUrl); await login(free, specs[1].email);
    await free.getByTestId('tab-matches').click(); await free.getByTestId('likes-locked').waitFor();
    assert.match(await free.getByTestId('likes-locked').innerText(), /Someone liked you/);
    assert.equal((await free.locator('body').innerText()).includes(specs[2].name), false);
    assert((await free.locator('[style*="blur(7px)"]').count()) > 0);
    for (const width of [320, 390]) { await free.setViewportSize({ width, height: 844 }); await free.screenshot({ path: `${artifacts}/locked-${width}.png`, fullPage: true }); assert(await free.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    assert(responses.some(r => r.count === 1 && r.locked === true && r.profiles.length === 0));
    assert(!JSON.stringify(responses).includes('qa_likes_far'));
    await free.getByTestId('likes-upgrade').click(); await free.getByText('What Plus adds', { exact: true }).waitFor();
    console.log('PASS anonymous, blurred out-of-range like; Plus navigation; no identities in free responses');
    // Back to the free Discover deck with an exhausted allowance.
    const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    await db.doc(`limits/qa_likes_viewer/daily/${day}`).set({ likes: 10 });
    await free.goto(appUrl); await free.getByTestId('tab-discover').waitFor(); await free.getByTestId('discover-card').waitFor();
    await free.getByTestId('discover-like').click();
    await free.getByRole('dialog').waitFor();
    assert.match(await free.getByRole('dialog').innerText(), /Get Paire Plus/);
    await free.screenshot({ path: `${artifacts}/limit-offer.png`, fullPage: true });
    await free.getByRole('button', { name: 'Get Paire Plus', exact: true }).click(); await free.getByText('What Plus adds', { exact: true }).waitFor();
    assert.equal((await db.doc('swipes/qa_likes_viewer/outgoing/qa_likes_near').get()).exists, false);
    console.log('PASS exhausted free likes offer Plus and preserve the unsent like');
    console.log('CHECK non-owner grant route'); await free.goto(`${appUrl}/?admin=grant-plus`); await free.getByText('Owner access required', { exact: true }).waitFor();
    assert.equal(await free.getByTestId('grant-confirm').count(), 0);
    const ownerContext = await context(); const page = await ownerContext.newPage(); page.setDefaultTimeout(45000);
    console.log('CHECK owner metrics link'); await page.goto('http://127.0.0.1:18883/metrics/?key=admin');
    assert.equal(await page.locator('#grant-plus').getAttribute('href'), '/app/?admin=grant-plus');
    await page.locator('#grant-plus').click(); await login(page, specs[0].email, 'grant-email');
    console.log('CHECK owner grant form'); await page.getByTestId('grant-email').waitFor(); await page.getByTestId('grant-email').fill(specs[1].email);
    await page.getByTestId('grant-lookup').click(); await page.getByTestId('grant-confirm').waitFor();
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `${artifacts}/grant-${width}.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    const before = Date.now(); await page.getByTestId('grant-confirm').click(); await page.getByTestId('grant-success').waitFor();
    const gift = (await db.doc('complimentaryPlusGrants/qa_likes_viewer').get()).data();
    assert(gift.expiresAt >= before + 30 * 86400000 && gift.expiresAt < Date.now() + 30 * 86400000 + 1000);
    const audit = (await db.doc(`billingSupportAudit/${gift.lastAuditId}`).get()).data(); assert.equal(audit.amountReportedPaise, 0);
    console.log('PASS metrics button → owner login → preview → exactly 30 days free, no revenue');
    await free.goto(appUrl); await free.getByTestId('tab-matches').waitFor(); await free.getByTestId('tab-matches').click();
    await free.getByTestId('liked-you-qa_likes_far').waitFor(); assert.equal(await free.getByTestId('likes-locked').count(), 0);
    // Simulate a real pass reaching its end while the member stays on the page.
    const expiresSoon = Date.now() + 2500;
    await db.doc('complimentaryPlusGrants/qa_likes_viewer').update({ expiresAt: expiresSoon });
    await db.doc('billing/qa_likes_viewer').update({ expiresAt: expiresSoon, checkedAt: Date.now() });
    await db.doc('webPassLedger/qa_likes_viewer').update({ until: expiresSoon });
    await free.goto(appUrl); await free.getByTestId('tab-matches').waitFor(); await free.getByTestId('tab-matches').click();
    await free.getByTestId('likes-locked').waitFor();
    assert.equal((await free.locator('body').innerText()).includes(specs[2].name), false);
    console.log('PASS expiry clears revealed identities and restores the locked preview');
    await page.getByRole('button', { name: 'Grant to another member', exact: true }).click();
    await page.getByTestId('grant-email').fill(specs[1].email); await page.getByTestId('grant-lookup').click();
    await page.getByTestId('grant-confirm').click(); await page.getByTestId('grant-success').waitFor();
    await free.goto(appUrl); await free.getByTestId('tab-matches').waitFor(); await free.getByTestId('tab-matches').click();
    await free.getByTestId('liked-you-qa_likes_far').waitFor();
    await free.getByTestId('likes-see-all').click(); await free.getByTestId('likes-gallery-like-qa_likes_far').waitFor();
    await free.screenshot({ path: `${artifacts}/revealed.png`, fullPage: true });
    await free.getByTestId('likes-gallery-like-qa_likes_far').click();
    await free.waitForFunction(() => !document.querySelector('[data-testid="likes-gallery-like-qa_likes_far"]'));
    assert.equal((await db.doc('matches/qa_likes_far_qa_likes_viewer').get()).get('active'), true);
    console.log('PASS granted Plus reveals an out-of-filter admirer and deliberate like back creates a match');
    assert.deepEqual(errors, []);
  } catch (error) { for (const [i, ctx] of browser.contexts().entries()) for (const [j, p] of ctx.pages().entries()) { console.error('Failed page:', p.url(), (await p.locator('body').innerText()).slice(0, 1800)); await p.screenshot({ path: `${artifacts}/failure-${i}-${j}.png`, fullPage: true }).catch(() => undefined); } throw error; } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
run().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
