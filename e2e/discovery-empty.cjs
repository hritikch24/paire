/** Empty search and one-tap expansion. Fictional users on isolated UI emulators only. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8081';
if (process.env.MUSE_WEB_QA !== 'demo-muse' || !['localhost', '127.0.0.1'].includes(new URL(appUrl).hostname)) throw new Error('Requires isolated demo-muse UI emulators and a loopback app URL.');
Object.assign(process.env, { GCLOUD_PROJECT: 'demo-muse', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' });
const root = resolve(__dirname, '..');
const backendRequire = createRequire(resolve(root, 'firebase/functions/package.json'));
backendRequire('firebase-admin/app').initializeApp({ projectId: 'demo-muse' });
const db = backendRequire('firebase-admin/firestore').getFirestore();
(async () => {
  execFileSync(process.execPath, [resolve(root, 'firebase/functions/scripts/seed.js')], { env: process.env, stdio: 'pipe' });
  const settingsRef = db.doc('users/muse_dev/private/settings');
  await db.doc('users/muse_dev').update({ photoUrls: [] });
  await settingsRef.update({ ageMin: 23, ageMax: 23, maxDistanceKm: 50 });
  // A previously passed member must remain excluded after expansion.
  await db.doc('swipes/muse_dev/outgoing/muse_alexa').set({ type: 'nope', createdAt: Date.now() });
  const original = (await settingsRef.get()).data();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
    page.setDefaultTimeout(45_000);
    await page.goto(appUrl);
    await page.getByTestId('welcome-sign-in').click();
    await page.getByTestId('signin-email').fill('muse+dev@example.com');
    await page.getByTestId('signin-password').fill('Password123!');
    await page.getByTestId('signin-submit').click();
    await page.getByTestId('discover-expand').waitFor();
    for(const [width,height] of [[320,568],[360,660],[390,700],[430,932],[1440,900]]) {
      await page.setViewportSize({width,height});
      // Free members see the Paire Plus offer, with Expand search as the second action.
      const empty = page.getByTestId('discover-empty-plus');
      assert.equal(await empty.getByRole('button').count(),2);
      await page.getByTestId('discover-get-plus').waitFor();
      const box = await page.getByTestId('discover-expand').boundingBox();
      const filters = await page.getByTestId('discover-filters').boundingBox();
      const tabs = await page.getByTestId('tab-discover').boundingBox();
      assert(box.height>=44 && box.y>=filters.y+filters.height && box.y+box.height<=tabs.y, 'Empty action overlaps filters or tabs');
      assert.equal(await page.getByTestId('discover-footer').count(),0);
      assert.equal(await page.locator('[data-testid^="nudge-"]').count(),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`/tmp/muse-empty-${width}x${height}.png`});
      console.log(`PASS compact empty state ${width}×${height}, Plus offer and Expand search reachable, no footer/nudge or overflow`);
    }
    await page.setViewportSize({width:360,height:660});
    await page.getByTestId('discover-mode-vibe').click();
    await page.getByTestId('discover-expand').waitFor();
    assert.equal(await page.getByTestId('discover-nope').count(),0);
    await page.getByTestId('discover-mode-solo').click();
    assert.match(await page.getByTestId('discover-expand-description').innerText(),/18–28.*100 km/);
    await page.getByTestId('discover-expand').click();
    await page.getByTestId('discover-card').waitFor();
    assert.match(await page.getByTestId('discover-card').getAttribute('aria-label'),/Casey/);
    const expanded=(await settingsRef.get()).data();
    assert.equal(expanded.ageMin,18);
    assert.equal(expanded.ageMax,28);
    assert.equal(expanded.maxDistanceKm,100);
    for(const key of Object.keys(original).filter(k=>!['ageMin','ageMax','maxDistanceKm','updatedAt'].includes(k))) assert.deepEqual(expanded[key],original[key],`Changed ${key}`);
    console.log('PASS one click saves stated age/distance limits and loads an eligible profile without leaving Discover; passed profiles stay excluded; other preferences preserved');
    await db.doc('swipes/muse_dev/outgoing/muse_casey').set({type:'nope',createdAt:Date.now()});
    await settingsRef.update({ageMin:18,ageMax:100,maxDistanceKm:null});
    await page.getByTestId('discover-expand').waitFor();
    assert.equal(await page.getByTestId('discover-expand').innerText(),'Check again');
    const beforeRefresh=(await settingsRef.get()).data();
    await page.getByTestId('discover-expand').click();
    await page.getByTestId('discover-empty-plus').waitFor();
    assert.deepEqual((await settingsRef.get()).data(),beforeRefresh);
    console.log('PASS fully expanded search refreshes without rewriting preferences or recycling passed profiles');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
