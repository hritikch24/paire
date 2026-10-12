/** Run only against the isolated demo-muse UI emulators and Metro (see docs/web-preview.md). */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const root = resolve(__dirname, '..');
const appUrl = process.env.MUSE_WEB_APP_URL || 'http://localhost:8081';
const siteUrl = process.env.MUSE_SITE_URL || 'http://127.0.0.1:4173';
if (process.env.MUSE_WEB_QA !== 'demo-muse') throw new Error('Set MUSE_WEB_QA=demo-muse for isolated browser QA.');
for (const value of [appUrl, siteUrl]) if (!['localhost','127.0.0.1'].includes(new URL(value).hostname)) throw new Error('Browser QA requires loopback URLs.');
const qaEnv = { ...process.env, GCLOUD_PROJECT:'demo-muse', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099', FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080' };
function seed() { execFileSync(process.execPath,[resolve(root,'firebase/functions/scripts/seed.js')],{cwd:root,env:qaEnv,stdio:'pipe'}); }
function policy(required) { execFileSync(process.execPath,[resolve(root,'firebase/functions/scripts/qa-trust-policy.js'),String(required)],{cwd:root,env:qaEnv,stdio:'pipe'}); }
async function login(page,email) {
 await page.goto(appUrl); await page.getByTestId('welcome-sign-in').click();
 await page.getByTestId('signin-email').fill(email); await page.getByTestId('signin-password').fill('Password123!');
 await page.getByTestId('signin-submit').click();
}
async function run() {
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const failures=[];
 async function page(width=1440) { const p=await browser.newPage({viewport:{width,height:1000}});p.setDefaultTimeout(30000);p.on('pageerror',e=>failures.push(e.message));return p; }
 try {
  for (const width of [1440,390,320]) {
   const p=await page(width); await p.goto(siteUrl); await p.getByRole('button',{name:'A gig & street food'}).click();
   assert.match(await p.locator('#vibe-detail').innerText(),/momos/); assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const path of ['app','privacy','terms','safety','community-guidelines','delete-account']) assert.equal((await p.request.get(`${siteUrl}/${path}/`)).status(),200);
   await p.close();
  }
  console.log('PASS marketing responsiveness, demo and legal/browser routes');
  seed();
  let p=await page(); await login(p,'muse+alexa@example.com'); await p.getByTestId('tab-profile').waitFor({timeout:60000});
  await p.reload(); await p.getByTestId('tab-profile').waitFor({timeout:60000}); await p.getByTestId('tab-matches').click();
  await p.getByTestId('match-row-muse_alexa_muse_jules').click(); const message=`Browser QA ${Date.now()}`;
  await p.getByTestId('chat-input').fill(message); await p.getByTestId('chat-send').click(); await p.getByText(message,{exact:true}).waitFor();
  await p.getByTestId('chat-menu').click(); await p.getByText('Report Jules',{exact:true}).click();
  await p.getByTestId('report-reason-harassment').click(); await p.getByTestId('report-details').fill('QA report using fictional emulator members');
  await p.getByTestId('report-submit').click(); await p.getByText('Received',{exact:true}).first().waitFor(); await p.getByText('Blocked on Paire',{exact:true}).waitFor();
  await p.getByTestId('header-back').click(); assert.equal(await p.getByTestId('match-row-muse_alexa_muse_jules').count(),0);
  await p.getByTestId('tab-profile').click(); await p.getByTestId('profile-settings').click(); await p.getByTestId('settings-signout').click();
  await p.getByRole('dialog').getByRole('button',{name:'Sign out',exact:true}).click(); await p.getByTestId('welcome-sign-in').waitFor(); await p.close();
  console.log('PASS sign-in persistence, real chat, report/block/progress, sign-out');
  p=await page(390); await login(p,'muse+dev@example.com'); await p.getByTestId('discover-mode-vibe').click({timeout:60000});
  await p.getByTestId('vibe-reveal').click(); await p.getByTestId('vibe-revealed-photo').waitFor();
  await p.getByTestId('tab-profile').click(); await p.getByRole('button',{name:'Edit photos',exact:true}).click();
  const picker=p.waitForEvent('filechooser'); await p.getByTestId('photo-add').click(); await (await picker).setFiles(resolve(root,'apps/muse-mobile/assets/icon.png'));
  await p.getByTestId('photo-slot-2').waitFor(); await p.getByTestId('edit-photos-save').click(); await p.getByTestId('profile-edit').waitFor();
  await p.reload(); await p.getByTestId('tab-profile').click({timeout:60000}); await p.getByRole('button',{name:'Edit photos',exact:true}).click(); await p.getByTestId('photo-slot-2').waitFor(); await p.close();
  console.log('PASS Vibe First, real byte upload, saved photo after refresh');
  policy(true); p=await page(390); await login(p,'muse+dev@example.com'); await p.getByTestId('gate-verify').waitFor({timeout:60000});
  assert.equal(await p.getByTestId('discover-mode-vibe').count(),0); await p.getByTestId('gate-verify').click(); await p.getByText('Let’s build a little trust.',{exact:true}).waitFor();
  assert(await p.getByTestId('verification-start').isDisabled()); await p.getByTestId('header-back').click(); await p.getByTestId('gate-safety').click();
  await p.getByTestId('safety-my-reports').click(); await p.getByText('No reports yet',{exact:true}).waitFor(); await p.close();
  console.log('PASS strict verification and free safety access'); assert.deepEqual(failures,[]);
 } finally { policy(false); await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1});
