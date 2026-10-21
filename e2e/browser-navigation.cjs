/** Mobile browser history acceptance. Fictional accounts and isolated demo-muse only. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module');
const fs = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const origin = process.env.MUSE_WEB_APP_URL || 'http://localhost:8081';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Requires isolated demo-muse UI emulators and a loopback browser app.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backend = createRequire(resolve(root, 'firebase/functions/package.json'));
backend('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const auth = backend('firebase-admin/auth').getAuth(), db = backend('firebase-admin/firestore').getFirestore();
const uid = 'qa_browser_navigation', email = 'browser-navigation-qa@example.com', password = 'Password123!';
async function run() {
  try { await auth.getUser(uid); await auth.updateUser(uid, { email, password, emailVerified: true }); }
  catch (e) { if (e.code !== 'auth/user-not-found') throw e; await auth.createUser({ uid, email, password, emailVerified: true }); }
  const now = Date.now();
  await db.doc(`users/${uid}`).set({ uid, displayName: 'Navigation QA', gender: 'woman', age: 27, photoUrls: [], city: 'Mumbai', bio: 'Fictional browser navigation QA.', interests: ['canvas'], intentions: ['long-term'], languages: ['hindi'], vibes: ['cozy'], quickAnswers: [], isDiscoverable: true, onboardingComplete: true, safetyConfirmed: true, createdAt: now, updatedAt: now });
  await db.doc(`moderation/${uid}`).set({ emailVerified: true, status: 'ok', cohort: 'test' });
  await db.doc(`users/${uid}/private/settings`).set({ showMe: ['man'], ageMin: 18, ageMax: 60, locationEnabled: false, notifications: { matches: false, messages: false, reminders: false }, updatedAt: now });
  await db.doc(`users/${uid}/private/info`).set({ email, birthDate: `${new Date().getFullYear() - 27}-01-15` });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return route.abort();
    if (u.origin === origin && u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(resolve(root, 'apps/web/site/index.html'), 'utf8') });
    if (u.origin === origin && u.pathname === '/safety/') return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(resolve(root, 'apps/web/legal/safety.html'), 'utf8') });
    if (u.origin === origin && u.pathname === '/site.css') return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(resolve(root, 'apps/web/site/site.css'), 'utf8') });
    return route.continue();
  });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(45000); page.on('pageerror', error => errors.push(error.message));
  const home = () => assert.equal(new URL(page.url()).pathname, '/app/');
  const back = async () => { await page.waitForTimeout(300); await page.goBack(); home(); };
  const forward = async () => { await page.goForward(); home(); };
  try {
    await page.goto(origin); await page.locator('header.nav a.button').click();
    await page.getByTestId('welcome-sign-in').click(); await page.getByTestId('signin-forgot').click();
    await page.getByRole('heading', { name: 'Reset your password', exact: true }).waitFor(); home();
    await back(); await page.getByTestId('signin-submit').waitFor();
    await forward(); await page.getByRole('heading', { name: 'Reset your password', exact: true }).waitFor();
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('signin-submit').waitFor(); home();
    console.log('PASS signed-out Back/Forward and header back remain in /app/');
    await page.getByTestId('signin-email').fill(email); await page.getByTestId('signin-password').fill(password); await page.getByTestId('signin-submit').click();
    await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-settings').click(); await page.getByTestId('settings-appearance').click();
    await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor(); home();
    await back(); await page.getByTestId('settings-appearance').waitFor();
    await back(); await page.getByTestId('profile-settings').waitFor();
    await forward(); await page.getByTestId('settings-appearance').waitFor();
    await forward(); await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('settings-appearance').waitFor();
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('profile-settings').waitFor(); home();
    console.log('PASS Settings → Appearance → browser/header Back/Forward restores the correct screens');
    await page.getByTestId('profile-settings').click(); await page.reload(); await page.getByTestId('tab-discover').waitFor(); home();
    assert.equal(await page.getByTestId('settings-appearance').count(), 0);
    await page.setViewportSize({ width: 1200, height: 900 }); await page.getByRole('link', { name: 'Paire home', exact: true }).click(); await page.getByTestId('tab-discover').waitFor(); home();
    await page.goto(`${origin}/safety/`); await page.locator('header.site a').click(); await page.getByTestId('tab-discover').waitFor(); home();
    console.log('PASS refresh, desktop wordmark and legal-page home return to /app/');
    // Query handlers must keep working and preserve the history entry's id.
    await page.goto(`${origin}/app/?admin=grant-plus`); await page.getByText('Owner access required', { exact: true }).waitFor();
    assert(!new URL(page.url()).searchParams.has('admin')); assert(await page.evaluate(() => Boolean(history.state?.id)));
    await page.locator('[data-testid="header-back"]:visible').click(); await page.getByTestId('tab-discover').waitFor(); home();
    await page.goto(`${origin}/app/?profile=${uid}`); await page.getByTestId('profile-close').waitFor();
    assert(!new URL(page.url()).searchParams.has('profile')); await back(); await page.getByTestId('tab-discover').waitFor();
    console.log('PASS admin/profile query links survive startup, clean up safely and return to app home');
    await page.setViewportSize({ width: 320, height: 700 }); await page.getByTestId('tab-profile').click(); await page.getByTestId('profile-settings').click();
    await page.getByTestId('settings-signout').click(); await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByTestId('welcome-sign-in').waitFor(); await back(); await page.getByTestId('welcome-sign-in').waitFor();
    assert.equal(await page.getByTestId('settings-appearance').count(), 0); home();
    console.log('PASS sign-out prevents browser Back from restoring signed-in screens');
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: '/tmp/muse-browser-navigation-failure.png', fullPage: true });
    console.error((await page.locator('body').innerText()).slice(0, 2500)); throw error;
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
