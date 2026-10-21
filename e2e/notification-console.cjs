/** Owner notification console acceptance. Isolated demo-muse only; never real push delivery. */
const {chromium}=require(process.env.MUSE_PLAYWRIGHT_MODULE||'playwright');
const {createRequire}=require('node:module');const fs=require('node:fs');const {resolve}=require('node:path');const assert=require('node:assert/strict');
const root=resolve(__dirname,'..'),appUrl=process.env.MUSE_WEB_APP_URL||'http://localhost:8082/app/';
if(process.env.MUSE_WEB_QA!=='demo-muse'||!['localhost','127.0.0.1'].includes(new URL(appUrl).hostname))throw Error('Requires isolated demo-muse and loopback app.');
Object.assign(process.env,{GCLOUD_PROJECT:'demo-muse',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080'});
const backend=createRequire(resolve(root,'firebase/functions/package.json'));backend('firebase-admin/app').initializeApp({projectId:'demo-muse'});
const auth=backend('firebase-admin/auth').getAuth(),db=backend('firebase-admin/firestore').getFirestore();
const {buildDiscoveryEntry}=backend(resolve(root,'firebase/functions/lib/lib/discovery.js'));
const password='Password123!',day=86400000,owner='qa_notify_console_owner',member='qa_notify_console_member',recipient='qa_notify_console_recipient',candidate='qa_notify_console_candidate';
async function seed(){
 await db.doc('runtime/trust').set({requireVerification:false},{merge:true});await db.doc('runtime/notifications').set({remindersEnabled:true});
 for(const uid of [owner,member,recipient,candidate]){
  const email=`${uid}@example.com`;try{await auth.getUser(uid);await auth.updateUser(uid,{email,password,emailVerified:true,disabled:false});}catch(e){if(e.code!=='auth/user-not-found')throw e;await auth.createUser({uid,email,password,emailVerified:true});}
  await auth.setCustomUserClaims(uid,uid===owner?{moderator:true,supportAccess:true}:{});
  const now=Date.now(),profile={uid,displayName:'Fictional notification QA',gender:uid===candidate?'man':'woman',age:[recipient,candidate].includes(uid)?97:28,photoUrls:[],onboardingComplete:true,safetyConfirmed:true,isDiscoverable:true,city:'Mumbai',bio:'Fictional emulator QA',interests:['canvas'],intentions:['long-term'],languages:['hindi'],vibes:['cozy'],quickAnswers:[],createdAt:now-10*day,lastActiveAt:now-2*day,updatedAt:now};
  const settings={showMe:[uid===candidate?'woman':'man'],ageMin:97,ageMax:97,locationEnabled:false,notifications:{reminders:uid===recipient,matches:true,messages:true}};
  const mod={status:'ok',emailVerified:true,cohort:[recipient,candidate].includes(uid)?'public':'test'};
  await db.doc(`users/${uid}`).set(profile);await db.doc(`users/${uid}/private/settings`).set(settings);await db.doc(`users/${uid}/private/info`).set({email,birthDate:`${new Date().getFullYear()-profile.age}-01-15`});await db.doc(`moderation/${uid}`).set(mod);await db.doc(`discovery/${uid}`).set(buildDiscoveryEntry(uid,profile,settings,mod));
 }
 await db.doc(`supportOperators/${owner}`).set({enabled:true});
 await db.doc(`notificationReminders/${recipient}`).set({enabled:true});await db.doc(`webPushSubscriptions/${recipient}`).set({uid:recipient});
 for(const doc of (await db.collection('notificationCampaigns').where('actorUid','==',owner).get()).docs)await doc.ref.delete();
 for(const uid of [recipient,candidate]){for(const other of [recipient,candidate])await db.doc(`swipes/${uid}/outgoing/${other}`).delete();}
}
async function login(page,uid,destination){await page.getByTestId('welcome-sign-in').click();await page.getByTestId('signin-email').fill(`${uid}@example.com`);await page.getByTestId('signin-password').fill(password);await page.getByTestId('signin-submit').click();await destination.waitFor();}
(async()=>{
 await seed();const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
 async function context(){const c=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});await c.route('**/*',route=>{const u=new URL(route.request().url());if(!['localhost','127.0.0.1','[::1]'].includes(u.hostname))return route.abort();if(u.pathname==='/metrics/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(resolve(root,'apps/web/site/_d6ad65113cb02b1461f/index.html'),'utf8')});if(u.pathname==='/site.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync(resolve(root,'apps/web/site/site.css'),'utf8')});return route.continue();});return c;}
 try{
  const ordinary=await context(),p=await ordinary.newPage();p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));await p.goto(`${appUrl}?admin=notifications`);await login(p,member,p.getByText('Owner access required',{exact:true}));assert.equal(await p.getByTestId('notification-self-test').count(),0);await ordinary.close();
  console.log('PASS ordinary member cannot use notification administration');
  const c=await context(),page=await c.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(new URL('/metrics/?key=admin',appUrl).href);assert.equal(await page.locator('#notifications-admin').getAttribute('href'),'/app/?admin=notifications');await page.locator('#notifications-admin').click();await login(page,owner,page.getByTestId('notification-audience'));
   assert(!new URL(page.url()).searchParams.has('admin'));assert.equal((await db.doc(`notificationReminders/${recipient}`).get()).get('recentAttempts'),undefined);
   for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.screenshot({path:`/tmp/muse-notification-console-${width}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   console.log('PASS metrics link survives owner sign-in; audience and preview cause no sends; mobile widths fit');
   await page.getByTestId('notification-send-run').click();await page.getByRole('dialog').getByRole('button',{name:'Send now',exact:true}).click();await page.getByTestId('notification-result').filter({hasText:'Run complete:'}).waitFor();
   const history=await db.collection('notificationCampaigns').where('actorUid','==',owner).get();assert.equal(history.size,1);assert.equal(history.docs[0].get('status'),'complete');assert(history.docs[0].get('summary.attempted')>=1);assert.equal(history.docs[0].get('summary.acceptedPushes'),0);assert.equal((await db.doc(`notificationReminders/${recipient}`).get()).get('recentAttempts').length,1);
   await page.waitForFunction(()=>document.querySelector('[data-testid="notification-send-run"]')?.getAttribute('aria-disabled')==='true');
   console.log('PASS explicit run is audited and respects the cooldown; emulator reports zero actual push acceptance');
   await page.getByTestId('notification-self-test').click();await page.getByTestId('notification-result').filter({hasText:'No browser accepted the test'}).waitFor();
   await page.locator('[data-testid="header-back"]:visible').click();await page.getByTestId('tab-discover').waitFor();assert.equal(new URL(page.url()).pathname,'/app/');
   assert.deepEqual(errors,[]);console.log('PASS owner self-test reports transport outcome truthfully; Back stays in /app/');
  }catch(e){await page.screenshot({path:'/tmp/muse-notification-console-failure.png',fullPage:true});console.error((await page.locator('body').innerText()).slice(0,2600));throw e;}
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
