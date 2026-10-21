/** Read-only purchase reporting acceptance against isolated demo-muse emulators. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module'), fs = require('node:fs'), { resolve } = require('node:path'), assert = require('node:assert/strict');
const root = resolve(__dirname, '..'), appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8082/app/';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw Error('Requires demo-muse and loopback app.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json')); backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const password = 'Password123!', owner = 'qa_purchases_owner', member = 'qa_purchases_member', buyer = 'qa_purchases_buyer';
async function seed() {
  for (const uid of [owner, member, buyer]) {
    const email = `${uid}@example.com`; try { await auth.getUser(uid); await auth.updateUser(uid, { email, password, emailVerified: true, disabled: false }); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, email, password, emailVerified: true }); }
    await auth.setCustomUserClaims(uid, uid === owner ? { moderator: true, supportAccess: true } : {});
    await db.doc(`users/${uid}`).set({ uid, displayName: 'Fictional purchase QA', gender: 'woman', age: 28, photoUrls: [], onboardingComplete: true, safetyConfirmed: true, isDiscoverable: true, city: 'Mumbai', bio: 'Fictional emulator QA', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], createdAt: Date.now() });
    await db.doc(`users/${uid}/private/settings`).set({ showMe: ['man'], ageMin: 18, ageMax: 60, locationEnabled: false, notifications: { matches: false, messages: false } });
    await db.doc(`users/${uid}/private/info`).set({ email, birthDate: '1998-01-15' });
    await db.doc(`moderation/${uid}`).set({ status: 'ok', emailVerified: true, cohort: uid === buyer ? 'public' : 'test' });
  }
  await db.doc(`supportOperators/${owner}`).set({ enabled: true });
  const order = { uid: buyer, currency: 'INR', kind: 'plus', mode: 'live', amountPaise: 9900, status: 'paid', paidAt: Date.now() - 3600000 };
  await db.doc('ccavenueOrders/qa_purchases_week').set(order);
  await db.doc('upiUnlockOrders/qa_purchases_day').set({ ...order, amountPaise: 2000, status: 'approved', reviewedAt: Date.now() - 7200000 });
}
async function login(page, uid, destination) { await page.getByTestId('welcome-sign-in').click(); await page.getByTestId('signin-email').fill(`${uid}@example.com`); await page.getByTestId('signin-password').fill(password); await page.getByTestId('signin-submit').click(); await destination.waitFor(); }
(async () => {
  await seed(); const browser = await chromium.launch({ channel: 'chrome', headless: true }); const errors = [];
  async function context() {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await c.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.hostname === 'us-central1-muse-352ba.cloudfunctions.net' && u.pathname === '/getMetrics') {
        const result = await fetch('http://127.0.0.1:5001/demo-muse/us-central1/getMetrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { key: 'admin' } }) });
        return route.fulfill({ status: result.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await result.text() });
      }
      if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.abort();
      if (u.pathname === '/metrics/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(resolve(root, 'apps/web/site/_d6ad65113cb02b1461f/index.html'), 'utf8') });
      if (u.pathname === '/site.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(resolve(root, 'apps/web/site/site.css'), 'utf8') });
      return route.continue();
    }); return c;
  }
  try {
    const c = await context(), page = await c.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('/metrics/?key=admin', appUrl).href);
    await page.locator('#premium-24h .m-card').first().waitFor();
    assert.equal(await page.locator('#premium-24h .m-card').count(), 4);
    assert(!(await page.locator('#premium-24h').textContent()).includes('@'));
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.locator('#premium-buyers').click(); await login(page, owner, page.getByTestId('recent-premium-summary'));
    assert(!new URL(page.url()).searchParams.has('admin'));
    const card = page.getByTestId(`premium-buyer-${buyer}`); await card.waitFor(); assert((await card.textContent()).includes('2 purchases · ₹119'));
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `/tmp/muse-recent-premium-${width}.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await card.getByText('Open member & payments', { exact: true }).click(); await page.getByText('No photos', { exact: true }).waitFor();
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('recent-premium-summary').waitFor(); assert(new URL(page.url()).pathname.startsWith('/app/'));
    console.log('PASS Metrics aggregate, owner login, repeat purchases, timestamps, member details, Back and 320/390px layouts');
    await c.close();
    const ordinary = await context(), p = await ordinary.newPage(); p.setDefaultTimeout(60000); p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${appUrl}?admin=premium-buyers`); await login(p, member, p.getByText('Owner access required', { exact: true })); assert.equal(await p.getByTestId('recent-premium-summary').count(), 0); await ordinary.close();
    assert.deepEqual(errors, []); console.log('PASS ordinary member cannot see buyer identities; no browser errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
