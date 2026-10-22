/** Work Circles acceptance: isolated demo-muse and fictional members only. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module'), { resolve } = require('node:path'), fs = require('node:fs'), assert = require('node:assert/strict');
const root = resolve(__dirname, '..'), appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8082/app/';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw Error('Requires isolated demo-muse and loopback app.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json')); backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const { buildDiscoveryEntry } = backend(resolve(root, 'firebase/functions/lib/lib/discovery.js'));
const viewer = 'qa_work_circle_viewer', target = 'qa_work_circle_corporate', banker = 'qa_work_circle_banker', hidden = 'qa_work_circle_hidden', password = 'Password123!';
async function seed() {
  await db.doc('runtime/trust').set({ requireVerification: false }, { merge: true });
  for (const uid of [viewer, target, banker, hidden]) {
    const email = `${uid}@example.com`; try { await auth.getUser(uid); await auth.updateUser(uid, { email, password, emailVerified: true, disabled: false }); } catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, email, password, emailVerified: true }); }
    const now = Date.now(), profile = { uid, displayName: uid === viewer ? 'Circle viewer QA' : uid === target ? 'Corporate circle QA' : 'Other circle QA', gender: uid === viewer ? 'woman' : 'man', age: uid === viewer ? 90 : 91, workSector: uid === banker ? 'banking' : uid === viewer ? null : 'corporate', photoUrls: uid === target ? ['https://example.com/private.jpg'] : [], city: 'Mumbai', bio: 'Fictional Work Circles browser QA.', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now, lastActiveAt: now };
    const settings = { showMe: [uid === viewer ? 'man' : 'woman'], ageMin: 90, ageMax: 92, locationEnabled: false, incognito: uid === hidden, privatePhotos: uid === target, requireNote: uid === target, notifications: { matches: false, messages: false, reminders: false }, updatedAt: now }, moderation = { emailVerified: true, status: 'ok', cohort: 'test' };
    await db.doc(`users/${uid}`).set(profile); await db.doc(`users/${uid}/private/settings`).set(settings); await db.doc(`users/${uid}/private/info`).set({ email, birthDate: `${new Date().getFullYear() - profile.age}-01-15` }); await db.doc(`moderation/${uid}`).set(moderation); await db.doc(`discovery/${uid}`).set(buildDiscoveryEntry(uid, profile, settings, moderation));
    await db.doc(`swipes/${viewer}/outgoing/${uid}`).delete(); await db.doc(`swipes/${uid}/outgoing/${viewer}`).delete(); await db.doc(`blocks/${viewer}/blocked/${uid}`).delete(); await db.doc(`blocks/${uid}/blocked/${viewer}`).delete();
  }
}
(async () => {
  console.log("Preparing fictional circle fixtures"); await seed(); console.log("Fixtures ready; starting browser"); const browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: 60000 });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__qaShare = data; } }));
    await context.route('**/*', route => {
      const u = new URL(route.request().url()); if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.abort();
      if (u.pathname.startsWith('/circles/')) return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(resolve(root, 'apps/web/dist', `.${u.pathname}`, 'index.html'), 'utf8') });
      if (u.pathname === '/site.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(resolve(root, 'apps/web/site/site.css'), 'utf8') });
      return route.continue();
    });
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
    console.log("Opening circle landing"); await page.goto(new URL('/circles/corporate/', appUrl).href); assert.equal(await page.locator('header a.button').getAttribute('href'), '/app/?circle=corporate');
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    console.log("Landing checks passed; opening app"); await page.locator('header a.button').click(); await page.getByTestId('welcome-sign-in').click(); await page.getByTestId('signin-email').fill(`${viewer}@example.com`); await page.getByTestId('signin-password').fill(password); console.log("Submitting fictional login"); await page.getByTestId('signin-submit').click();
    await page.getByTestId(`circle-member-${target}`).waitFor(); assert.equal(await page.getByTestId(`circle-member-${banker}`).count(), 0); assert.equal(await page.getByTestId(`circle-member-${hidden}`).count(), 0); assert.equal((await db.doc(`users/${viewer}`).get()).get('workSector'), null); assert(!new URL(page.url()).searchParams.has('circle'));
    await page.getByText('Photos stay private until a match.', { exact: true }).waitFor();
    await page.getByTestId('circle-share').click(); assert.equal((await page.evaluate(() => window.__qaShare)).url, new URL('/circles/corporate/', appUrl).href);
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `/tmp/muse-work-circle-${width}.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByTestId(`circle-member-${target}`).click(); await page.getByRole('button', { name: 'Like', exact: true }).click(); await page.getByTestId('spark-composer').waitFor(); assert.equal(await page.getByTestId('spark-skip').count(), 0); await page.getByTestId('spark-note').fill('Your profile made me smile. Coffee sometime?'); await page.getByTestId('spark-send').click(); await page.getByTestId('work-circle-empty').waitFor();
    assert.equal((await db.doc(`swipes/${viewer}/outgoing/${target}`).get()).get('type'), 'like'); console.log('PASS landing → sign-in → circle; no automatic joining; sector filtering, private photos, incognito, sharing and real note-based like');
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-work-circles').click(); await page.getByTestId('work-circle-corporate').waitFor();
    for (const width of [320, 390, 1280]) { await page.setViewportSize({ width, height: 844 }); await page.screenshot({ path: `/tmp/muse-work-circles-hub-${width}.png`, fullPage: true }); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.setViewportSize({ width: 320, height: 844 }); await page.getByTestId('work-badge-edit').click(); await page.getByTestId('work-badge-banking').click(); await page.getByTestId('work-badge-save').click(); await page.getByTestId('my-work-badge').filter({ hasText: 'Banking & finance · Self-declared' }).waitFor(); assert.equal((await db.doc(`users/${viewer}`).get()).get('workSector'), 'banking');
    await page.getByTestId('work-badge-edit').click(); await page.getByTestId('work-badge-none').click(); await page.getByTestId('work-badge-save').click(); await page.getByTestId('my-work-badge').filter({ hasText: 'Optional' }).waitFor(); assert.equal((await db.doc(`users/${viewer}`).get()).get('workSector'), null);
    await page.getByTestId('work-circle-healthcare').click(); await page.getByTestId('work-circle-empty').waitFor(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.goBack(); await page.getByTestId('work-circle-corporate').waitFor(); assert.equal(new URL(page.url()).pathname, '/app/');
    assert.deepEqual(errors, []); console.log('PASS separate Profile corner, 320/390/1280px layouts, optional badge save/remove, empty circle, browser Back and no browser errors'); await context.close();
  } catch (error) { for (const c of browser.contexts()) for (const p of c.pages()) { console.error("QA URL", p.url()); console.error((await p.locator("body").innerText()).slice(0,7000)); await p.screenshot({path:"/tmp/muse-work-circle-failure.png",timeout:5000}).catch(()=>undefined); } throw error; } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
