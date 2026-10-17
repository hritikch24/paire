/** Regression for collapsed discovery cards on phones. Isolated UI emulators only. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { mkdirSync } = require('node:fs');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8081';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw new Error('Requires isolated demo-muse UI emulators and a loopback app URL.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const backendRequire = createRequire(resolve(root, 'firebase/functions/package.json'));
backendRequire('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const db = backendRequire('firebase-admin/firestore').getFirestore();
const artifactDir = process.env.MUSE_WEB_QA_ARTIFACT_DIR || '/tmp/muse-discovery-qa';
mkdirSync(artifactDir, { recursive: true });

async function run() {
  execFileSync(process.execPath, [resolve(root, 'firebase/functions/scripts/seed.js')], { env: process.env, stdio: 'pipe' });
  // Match the reported failure: the viewer has no photos, so the setup prompt is present.
  await db.doc('users/muse_dev').update({ photoUrls: [] });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(appUrl);
    await page.getByTestId('welcome-sign-in').click();
    await page.getByTestId('signin-email').fill('muse+dev@example.com');
    await page.getByTestId('signin-password').fill('Password123!');
    await page.getByTestId('signin-submit').click();
    await page.getByTestId('discover-card').waitFor();
    const scrollArea = page.locator('[data-testid="discover-screen"] > div');
    for (const [width, height] of [[390, 844], [360, 660], [320, 568], [430, 932], [740, 360], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await scrollArea.evaluate(el => { el.scrollTop = 0; });
      await page.waitForFunction(() => {
        const card = document.querySelector('[data-testid="discover-card"]').getBoundingClientRect();
        const deck = document.querySelector('[data-testid="discover-deck"]').getBoundingClientRect();
        return card.height >= 319 && Math.abs(card.width - deck.width) < 1 && Math.abs(card.height - deck.height) < 1;
      });
      const card = await page.getByTestId('discover-card').boundingBox();
      assert(card.height >= 319, `Collapsed card at ${width}×${height}`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Horizontal page overflow at ${width}×${height}`);
      await page.screenshot({ path: resolve(artifactDir, `${width}x${height}.png`) });
      await page.getByTestId('discover-like').scrollIntoViewIfNeeded();
      const nav = await page.getByTestId('tab-discover').boundingBox();
      for (const action of ['undo', 'nope', 'super', 'spark', 'like']) {
        const box = await page.getByTestId(`discover-${action}`).boundingBox();
        assert(box.width >= 44 && box.height >= 44, `${action} touch target is too small`);
        assert(box.y >= 0 && box.y + box.height <= nav.y + 1, `${action} cannot be reached above the tab bar at ${width}×${height}`);
      }
      console.log(`PASS ${width}×${height}: ${Math.round(card.height)}px card, reachable actions, no page overflow`);
    }

    await page.setViewportSize({ width: 320, height: 568 });
    await scrollArea.evaluate(el => { el.scrollTop = 0; });
    const label = await page.getByTestId('discover-card').getAttribute('aria-label');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 160, y: 370 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 160, y: 370 - i * 25 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert(await scrollArea.evaluate(el => el.scrollTop > 40), 'Vertical touch gesture did not scroll the short screen');
    assert.equal(await page.getByTestId('discover-card').getAttribute('aria-label'), label, 'Scrolling accidentally swiped a profile');

    await page.getByTestId('discover-nope').click();
    await page.waitForFunction(previous => document.querySelector('[data-testid="discover-card"]')?.getAttribute('aria-label') !== previous, label);
    await page.getByTestId('discover-undo').click();
    await page.waitForFunction(previous => document.querySelector('[data-testid="discover-card"]')?.getAttribute('aria-label') === previous, label);
    await page.getByTestId('discover-spark').click();
    await page.getByTestId('spark-note').fill('A fictional emulator note, kept as a draft.');
    await page.mouse.click(8, 8);
    await page.getByTestId('spark-composer').waitFor({ state: 'hidden' });
    await page.getByTestId('discover-mode-vibe').click();
    await page.getByTestId('vibe-card').waitFor();
    await page.getByTestId('vibe-reveal').click();
    await page.getByTestId('vibe-full-profile').waitFor();
    await page.getByTestId('discover-mode-duo').click();
    await page.getByTestId('duo-invite').waitFor();
    await page.getByTestId('tab-profile').click();
    await page.getByTestId('profile-settings').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS touch scrolling without accidental swipes, Pass/Undo, note composer, Vibe first, Duos and profile navigation');
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
