import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync}from'node:fs';
import{campaignState,cardLines,cleanCity,dayLabel,describeCard,normalizeState,parseFragment,pickDay,seeded,shareText,toFragment,upcomingDays,VIBES}from'../site/diwali-together/core.mjs';
import{closeDiwali,diwaliOpen,expireCampaigns}from'../scripts/seasonal.mjs';
const at=(date)=>Date.parse(`${date}T06:30:00Z`);
const page=readFileSync(new URL('../site/diwali-together/index.html',import.meta.url),'utf8');

test('the campaign window is India time: opens 24 Oct, closes after 10 Nov',()=>{
  assert.equal(campaignState(Date.parse('2026-10-23T18:29:00Z')),'soon');
  assert.equal(campaignState(Date.parse('2026-10-23T18:30:00Z')),'open');
  assert.equal(campaignState(Date.parse('2026-11-10T18:29:00Z')),'open');
  assert.equal(campaignState(Date.parse('2026-11-10T18:30:00Z')),'closed');
  assert.deepEqual(upcomingDays(at('2026-11-08')),['2026-11-08','2026-11-09','2026-11-10']);
  assert.deepEqual(upcomingDays(at('2026-11-11')),[]);
});
test('days read naturally for India',()=>{assert.equal(dayLabel('2026-11-08'),'Sun 8 Nov');assert.equal(dayLabel('2026-11-05'),'Thu 5 Nov');});
test('city input keeps only a plain place name',()=>{
  assert.equal(cleanCity('  Pune  '),'Pune');
  assert.equal(cleanCity('Navi   Mumbai'),'Navi Mumbai');
  assert.equal(cleanCity("St. John's-Wood"),"St. John's-Wood");
  assert.equal(cleanCity('गुरुग्राम'),'गुरुग्राम');
  assert.equal(cleanCity('<img src=x onerror=alert(1)>'),'img srcx onerroralert');
  assert.equal(cleanCity('Flat 12, Rose Apartments'),'Flat Rose Apartments');
  assert.equal(cleanCity('https://evil.example/x'),'httpsevil.examplex');
  assert.equal(cleanCity('a'.repeat(300)).length,40);
  for(const bad of[null,undefined,42,{},[]])assert.equal(typeof cleanCity(bad),'string');
});
test('share links restore only valid choices, falling back to safe defaults',()=>{
  const now=at('2026-10-30');
  assert.deepEqual(parseFragment('#v=mela&d=2026-11-07&c=Pune',now),{vibe:'mela',day:'2026-11-07',city:'Pune'});
  assert.deepEqual(parseFragment('#v=nope&d=2099-01-01&c=%3Cb%3EX',now),{vibe:'chai',day:'2026-11-08',city:'bX'});
  assert.equal(parseFragment('#card',now),null);
  assert.equal(parseFragment('',now),null);
  assert.equal(parseFragment('#'+'a=b&'.repeat(80),now),null);
  assert.equal(parseFragment('#unrelated=1',now),null);
  assert.equal(parseFragment('#v=bash&x=1',now).vibe,'bash');
});
test('past days are never offered: the link moves to the next day left',()=>{
  assert.equal(pickDay('2026-11-05',at('2026-11-09')),'2026-11-09');
  assert.equal(pickDay(undefined,at('2026-11-09')),'2026-11-09');
  assert.equal(pickDay(undefined,at('2026-11-06')),'2026-11-08');
});
test('state round-trips through the URL fragment without extra fields',()=>{
  const now=at('2026-11-01');
  for(const vibe of Object.keys(VIBES)){const state={vibe,day:'2026-11-09',city:'Bengaluru'};assert.deepEqual(parseFragment(toFragment(state),now),state);}
  assert.equal(toFragment({vibe:'chai',day:'2026-11-08',city:''}),'#v=chai&d=2026-11-08');
  assert.doesNotMatch(toFragment({vibe:'chai',day:'2026-11-08',city:'Pune',name:'Asha',phone:'999'}),/Asha|999|name|phone/);
});
test('the card carries only the plan, day and an optional city',()=>{
  const lines=cardLines({vibe:'chai',day:'2026-11-08',city:'Pune'});
  assert.equal(lines.ask,'Chai & mithai, anyone?');assert.equal(lines.where,'Around Pune · Sun 8 Nov');assert.equal(lines.care,'Public places. Mutual yes only.');
  assert.equal(cardLines({vibe:'chai',day:'2026-11-08',city:''}).where,'Sun 8 Nov');
  assert.equal(cardLines({vibe:'bash',day:'2026-11-08'}).ask,'Going to a Diwali bash?');
  assert.match(describeCard({vibe:'meal',day:'2026-11-09',city:'Delhi'}),/Café meal, Monday 9 November, around Delhi/);
  assert.doesNotMatch(JSON.stringify(lines),/Asha|phone|address/i);
  assert.match(shareText({vibe:'chai',day:'2026-11-08'}),/Public places, mutual yes only/);
});
test('the card sky is stable for a plan',()=>{const a=seeded('chai'),b=seeded('chai'),c=seeded('mela');const x=[a(),a(),a()],y=[b(),b(),b()];assert.deepEqual(x,y);assert.notDeepEqual(x,[c(),c(),c()]);});

test('the page states the facts and the honest limits',()=>{
  assert.match(page,/<h1[^>]*>Diwali is better with <em>someone<\/em> to share the chai\.<\/h1>/);
  assert.equal((page.match(/<h1\b/g)||[]).length,1);
  assert.match(page,/<h2 id="closed-title">/); // fallback survives until runtime expiry
  assert.match(page,/Sunday 8 November 2026/);
  assert.match(page,/Open now through 10 November, IST\./);
  assert.match(page,/We don’t show who has joined, and we can’t promise matches/);
  assert.match(page,/href="\/app\/\?edition=diwali"[^>]*data-diwali-join/);
  for(const id of['campaign-status','invite-form','invite-preview','invite-preview-vibe','invite-preview-city','invite-share','invite-download','invite-status','invite-link','invite-join','invite-city'])assert.match(page,new RegExp(`id="${id}"`));
  for(const vibe of Object.keys(VIBES))assert.match(page,new RegExp(`name="vibe" value="${vibe}"`));
  assert.match(page,/<canvas id="invite-canvas" width="1080" height="1350"/);
  assert.doesNotMatch(page,/"@type":"Event"/);
  assert.doesNotMatch(page,/lives? alone|living alone|home address (?:is|are) (?:required|needed)/i);
  assert.match(page,/<meta property="og:image" content="%SITE_URL%\/diwali-together\/og\.png">/);
  assert.match(page,/<title>Diwali Together on Paire: meet kindly, in public<\/title>/);
  assert(page.match(/<meta name="description" content="([^"]+)"/)[1].length<=155);
  assert.match(page,/₹49 Unlimited Chat/);
});
test('JSON-LD is valid WebPage, FAQPage and breadcrumb data',()=>{
  const data=JSON.parse(page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1].replaceAll('%SITE_URL%','https://www.paire.in'));
  assert.deepEqual(data.map(x=>x['@type']),['WebPage','FAQPage','BreadcrumbList']);
  const faq=data[1].mainEntity;
  assert(faq.length>=8);
  for(const item of faq)assert.match(page,new RegExp(item.name.replace(/[?]/g,'\\?')));
});
test('no user text is ever written with innerHTML',()=>{
  const script=readFileSync(new URL('../site/diwali-together/diwali.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(script,/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(script,/fetch\(|sendBeacon|XMLHttpRequest/); // nothing about a card leaves the browser
});

test('after 10 November IST the campaign copy is removed from the static page',()=>{
  const open=Date.parse('2026-11-10T18:29:00Z'),closed=Date.parse('2026-11-10T18:30:00Z');
  assert.equal(diwaliOpen(open),true);assert.equal(diwaliOpen(closed),false);
  const active = closeDiwali(page,open);
  assert.equal((active.match(/<h1\b/g)||[]).length,1);
  assert.match(active,/<h2 id="closed-title">Diwali 2026 has passed/);
  assert.match(active,/id="invite-form"/);
  const out=closeDiwali(page,closed);
  assert.equal((out.match(/<h1\b/g)||[]).length,1);
  assert.match(out,/<html data-campaign="closed"/);
  assert.match(out,/Diwali 2026 has passed\. <em>Paire is still here\.<\/em>/);
  for(const text of['Diwali is better with','Open now through 10 November','id="invite-form"','id="card"','Spend Diwali with'])assert(!out.includes(text),text);
});
test('dated sections expire on their own date attribute',()=>{
  const html='<a href="#diwali">Diwali</a><section id="diwali" data-campaign-until="2026-11-10"><p>Join</p></section><section id="keep">Keep</section>';
  assert.equal(expireCampaigns(html,Date.parse('2026-11-10T18:29:59Z')),html);
  const out=expireCampaigns(html,Date.parse('2026-11-10T18:30:00Z'));
  assert(!out.includes('Join'));assert(!out.includes('href="#diwali"'));assert(out.includes('Keep'));
});
