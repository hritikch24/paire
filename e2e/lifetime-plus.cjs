/** Monthly/lifetime browser acceptance. Isolated demo-muse; checkout is a loopback fixture. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module'), { resolve } = require('node:path'), assert = require('node:assert/strict');
const root = resolve(__dirname, '..'), appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8082/app/';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw Error('Loopback demo-muse only.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json')); backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const { buildDiscoveryEntry } = backend(resolve(root, 'firebase/functions/lib/lib/discovery.js'));
const password = 'Password123!', monthly = 'qa_month_unlimited', halfyear = 'qa_halfyear_unlimited', lifetime = 'qa_lifetime_owner', free = 'qa_lifetime_buyer', target = 'qa_lifetime_candidate';
async function seed() {
  await db.doc('runtime/trust').set({ requireVerification: false, enforcePaidChat: true, enforceFrom: 0, unlockSales: false, upiSales: false, ccavenueSales: false });
  for (const uid of [monthly, halfyear, lifetime, free, target]) {
    const email = `${uid}@example.com`; try { await auth.getUser(uid); await auth.updateUser(uid, { email, password, emailVerified: true }); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, email, password, emailVerified: true }); }
    const now = Date.now(), profile = { uid, displayName: 'Lifetime fixture', gender: uid === target ? 'man' : 'woman', age: uid === target ? 91 : 90, photoUrls: [], city: 'Mumbai', bio: 'Fictional lifetime browser QA.', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now };
    const settings = { showMe: [uid === target ? 'woman' : 'man'], ageMin: 90, ageMax: 92, locationEnabled: false, notifications: { matches: false, messages: false, reminders: false }, updatedAt: now }, mod = { emailVerified: true, status: 'ok', cohort: 'test' };
    await db.doc(`users/${uid}`).set(profile); await db.doc(`users/${uid}/private/settings`).set(settings); await db.doc(`users/${uid}/private/info`).set({ email, birthDate: `${new Date().getFullYear() - profile.age}-01-15` }); await db.doc(`moderation/${uid}`).set(mod); await db.doc(`discovery/${uid}`).set(buildDiscoveryEntry(uid, profile, settings, mod));
    await db.doc(`billing/${uid}`).delete(); await db.doc(`swipes/${uid}/outgoing/${target}`).delete();
    await db.doc(`limits/${uid}/daily/${new Date().toISOString().slice(0,10).replaceAll('-','')}`).set({ likes: uid === free ? 0 : 10000 });
  }
  await db.doc(`razorpayOrders/qa_month_${monthly}`).set({ uid: monthly, plan: 'month', status: 'paid', currency: 'INR', mode: 'live', amountPaise: 29900, startsAt: Date.now() - 86400000, expiresAt: Date.now() + 59 * 86400000 });
  await db.doc(`razorpayOrders/qa_halfyear_${halfyear}`).set({ uid: halfyear, plan: "halfyear", status: "paid", currency: "INR", mode: "live", amountPaise: 79900, startsAt: Date.now() - 86400000, expiresAt: Date.now() + 179 * 86400000 });
  await db.doc(`lifetimePlusGrants/${lifetime}`).set({ status: 'active', startsAt: Date.now(), source: 'owner-gift', amountReportedPaise: 0 });
}
(async () => {
  await seed(); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const uid of [monthly, halfyear, lifetime, free]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), errors = []; let orderRequest;
      await context.route('**/*', async route => {
        const u = new URL(route.request().url()); if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.abort();
        if (u.pathname === '/qa-checkout/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Local fixture checkout · ₹1,499</h1>' });
        if (uid === free && route.request().method() === 'POST' && u.pathname.endsWith('/getPremiumStatus')) { const response = await route.fetch(), body = await response.json(); const status = body.result ?? body.data; status.webPurchaseAvailable = true; status.upiPurchaseAvailable = false; status.ccavenuePurchaseAvailable = false; return route.fulfill({ response, json: body }); }
        if (uid === free && route.request().method() === 'POST' && u.pathname.endsWith('/createPlusOrder')) { orderRequest = route.request().postDataJSON(); return route.fulfill({ headers: { 'access-control-allow-origin': new URL(appUrl).origin }, json: { result: { orderId: 'order_QALIFETIME001', amount: 149900, currency: 'INR', keyId: 'rzp_test_LocalFixture', name: 'Local test', description: 'Lifetime Plus', email: null, hostedUrl: new URL('/qa-checkout/', appUrl).href } } }); }
        return route.continue();
      });
      const page = await context.newPage(); page.setDefaultTimeout(45000); page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(appUrl); await page.getByTestId('welcome-sign-in').click(); await page.getByTestId('signin-email').fill(`${uid}@example.com`); await page.getByTestId('signin-password').fill(password); await page.getByTestId('signin-submit').click(); await page.getByTestId('tab-profile').waitFor();
        if (uid !== free) { await page.getByText('Unlimited likes', { exact: true }).waitFor(); assert.equal((await db.doc(`billing/${uid}`).get()).get(uid === lifetime ? 'lifetime' : 'unlimitedLikesUntil') > (uid === lifetime ? 0 : Date.now()), true); }
        if (uid === monthly || uid === halfyear) {
          await page.getByTestId('discover-like').click();
          for (let i = 0; i < 30; i++) { const used = (await db.doc(`limits/${uid}/daily/${new Date().toISOString().slice(0,10).replaceAll('-','')}`).get()).get('likes'); if (used === 10001) break; if (i === 29) throw Error('Paid unlimited like did not pass the old cap'); await page.waitForTimeout(100); }
        }
        await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-premium').click(); await page.getByTestId('premium-purchase').waitFor();
        if (uid === lifetime) { await page.getByTestId('premium-lifetime-active').waitFor(); assert(await page.getByTestId('premium-purchase').isDisabled()); assert.equal(await page.getByTestId('premium-plan-lifetime').count(), 0); assert(!/1970|Invalid Date/.test(await page.locator('body').innerText())); }
        else {
          assert.deepEqual(await page.getByRole('radio').evaluateAll(nodes => nodes.map(node => node.dataset.testid)), ['premium-plan-month', 'premium-plan-day', 'premium-plan-lifetime']);
          assert((await page.getByTestId('premium-plan-month').innerText()).includes('₹399'));
          assert((await page.getByTestId('premium-plan-day').innerText()).includes('₹20'));
          await page.getByTestId('premium-more-options').click();
          await page.getByTestId('premium-plan-halfyear').click();
          assert((await page.getByTestId('premium-plan-halfyear').innerText()).includes('₹799'));
          assert((await page.locator('body').innerText()).includes('₹799 for 180 days'));
          assert((await page.getByTestId('premium-plan-halfyear').innerText()).includes('Unlimited regular likes'));
          await page.getByTestId('premium-plan-halfyear').scrollIntoViewIfNeeded();
          for (const width of [320,390,1280]) { await page.setViewportSize({ width, height: 700 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: `/tmp/muse-pricing-${uid}-${width}.png` }); }
          await page.getByTestId('premium-plan-lifetime').click(); await page.getByTestId('premium-lifetime-terms').waitFor(); assert.equal(await page.getByTestId('premium-extension').count(), 0); assert((await page.getByTestId('premium-plan-lifetime').innerText()).includes('₹1,499')); }
        for (const width of [320,390,1280]) { await page.setViewportSize({ width, height: 700 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); const button = await page.getByTestId('premium-purchase').boundingBox(); assert(button.y >= 0 && button.y + button.height <= 700); await page.screenshot({ path: `/tmp/muse-lifetime-${uid}-${width}.png` }); }
        if (uid === free) { await page.getByTestId('premium-purchase').click(); await page.getByRole('heading', { name: 'Local fixture checkout · ₹1,499' }).waitFor(); assert.deepEqual(orderRequest, { data: { plan: 'lifetime' } }); assert.equal((await db.doc(`billing/${uid}`).get()).get('lifetime'), false); }
        assert.deepEqual(errors, []); console.log(`PASS ${uid}: real emulator entitlement, 320/390/1280px, reachable footer and ${uid === free ? 'lifetime plan sent to loopback checkout without a grant' : uid === monthly || uid === halfyear ? 'like accepted beyond 10,000 used' : 'permanent benefits without another purchase'}`);
      } catch (e) { console.error((await page.locator('body').innerText()).slice(0,4000)); await page.screenshot({ path: '/tmp/muse-lifetime-qa-failure.png' }); throw e; } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
