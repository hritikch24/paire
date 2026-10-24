/** Public growth experience: loopback static build, no production traffic/accounts. */
const { chromium } = require(process.env.MUSE_PLAYWRIGHT_MODULE || 'playwright');
const { createServer } = require('node:http');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'apps/web/dist');
const mime = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const actions = [], server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/v/') { let raw = ''; req.on('data', b => raw += b); req.on('end', () => { actions.push(JSON.parse(raw)); res.writeHead(204).end(); }); return; }
  let file = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'text/plain'); fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, { unpack, pack } = await import('../apps/web/site/date-duet/core.mjs');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__qaShare = data; } }));
    const page = await context.newPage(), errors = [], paths = []; page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => paths.push(r.url()));
    async function responsive(label) {
      for (const width of [320, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} overflow at ${width}`);
        if (width !== 768) await page.screenshot({ path: `/tmp/muse-pm-${label}-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.goto(origin + '/'); await responsive('home');
    assert.deepEqual(await page.locator('.primary-price-grid article h3').evaluateAll(nodes => nodes.map(node => node.firstChild.textContent)), ['₹399', '₹35', '₹1,499']);
    assert.equal(await page.locator('.other-passes').getAttribute('open'), null);
    await page.locator('.other-passes summary').click();
    assert.match(await page.locator('.other-pass-grid').innerText(), /₹799/);
    assert.match(await page.locator('.other-pass-grid').innerText(), /messaging only/);
    await responsive('pricing-expanded');
    await page.locator('.other-passes summary').click();
    console.log('PASS featured price order, total-price labels and secondary options at 320/390/768/1280px');
    assert.equal(await page.locator('#garba').count(), 0); assert.equal(await page.locator('a[href="#garba"]').count(), 0);
    // Diwali Together: homepage teaser, public page, honest copy and the invitation card maker.
    assert.equal(await page.locator('#diwali a[href="/diwali-together/"]').count() > 0, true);
    assert.equal((await (await context.request.get(origin + '/garba-nights/')).text()).includes('diwali-together'), true);
    await page.goto(origin + '/diwali-together/'); await responsive('diwali');
    assert.match(await page.locator('h1:visible').innerText(), /Diwali is better with someone to share the chai/);
    assert.match(await page.locator('#campaign-status').innerText(), /Open now through 10 November, IST/);
    assert.equal(await page.locator('[data-diwali-join]').first().getAttribute('href'), '/app/?edition=diwali');
    assert.equal(await page.locator('h1:visible').count(), 1);
    await page.locator('#invite-form').waitFor();
    assert.match(await page.locator('#invite-preview-vibe').innerText(), /Chai & mithai, anyone\?/);
    // Choosing a plan card selects it in the builder and keeps the state in the fragment only.
    await page.locator('[data-pick-vibe="bash"]').click();
    assert.equal(await page.locator('input[name="vibe"]:checked').inputValue(), 'bash');
    assert.match(await page.locator('#invite-preview-vibe').innerText(), /Going to a Diwali bash\?/);
    await page.locator('input[name="day"][value="2026-11-09"]').check({ force: true });
    // Hostile and oversized city text becomes a plain place name; nothing is injected.
    await page.locator('#invite-city').fill('<img src=x onerror=window.__xss=1>Pune' + 'x'.repeat(80));
    const city = await page.locator('#invite-city').inputValue();
    assert(city.length <= 40 && !/[<>=]/.test(city));
    assert.equal(await page.evaluate(() => window.__xss), undefined); assert.equal(await page.locator('#invite-preview img').count(), 0);
    await page.locator('#invite-city').fill('Pune');
    assert.match(await page.locator('#invite-preview-city').innerText(), /Around Pune/);
    const fragment = new URL(page.url()).hash; assert.match(fragment, /^#v=bash&d=2026-11-09&c=Pune$/); assert.equal(new URL(page.url()).search, '');
    assert.match(await page.locator('#invite-join').getAttribute('href'), /^\/app\/\?edition=diwali&vibe=bash$/);
    assert.equal(await page.locator('#invite-link').inputValue(), origin + '/diwali-together/' + fragment);
    // Refresh and a shared link restore the same card; a hostile fragment falls back to safe defaults.
    await page.reload(); await page.locator('#invite-form').waitFor();
    assert.equal(await page.locator('input[name="vibe"]:checked').inputValue(), 'bash'); assert.equal(await page.locator('#invite-city').inputValue(), 'Pune');
    await page.goto(origin + '/diwali-together/#v=<script>&d=1999-01-01&c=' + encodeURIComponent('<b>Evil</b>' + 'y'.repeat(300)));
    await page.locator('#invite-form').waitFor();
    assert.equal(await page.locator('input[name="vibe"]:checked').inputValue(), 'chai');
    // Share with files (system sheet stubbed): the PNG carries nothing but the plan, day and city.
    await page.evaluate(() => { window.__shares = []; Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => Boolean(data.files?.length) }); Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.__shares.push({ title: data.title, text: data.text, url: data.url, type: data.files?.[0]?.type, size: data.files?.[0]?.size }); } }); });
    assert.equal(await page.locator('#invite-share').isVisible(), true);
    await page.locator('#invite-share').click(); await page.waitForFunction(() => window.__shares.length === 1);
    const shared1 = await page.evaluate(() => window.__shares[0]); assert.equal(shared1.type, 'image/png'); assert(shared1.size > 20000); assert.match(shared1.url, /#v=chai/);
    // Closing the system share sheet is silent.
    await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
    await page.locator('#invite-share').click(); await page.waitForTimeout(300); assert.equal((await page.locator('#invite-status').innerText()).trim(), '');
    // Download is a real 1080 x 1350 PNG; copy link falls back to selecting the field.
    const cardDownload = page.waitForEvent('download'); await page.locator('#invite-download').click();
    await (await cardDownload).saveAs('/tmp/muse-pm-diwali-card.png'); const cardPng = fs.readFileSync('/tmp/muse-pm-diwali-card.png');
    assert.equal(cardPng.readUInt32BE(16), 1080); assert.equal(cardPng.readUInt32BE(20), 1350);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copied = text; } } }));
    await page.locator('#invite-copy').click(); assert.equal(await page.evaluate(() => window.__copied), await page.locator('#invite-link').inputValue());
    // Keyboard: arrow keys move through the plan group.
    await page.locator('input[name="vibe"]:checked').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('input[name="vibe"]:checked').inputValue(), 'mela');
    await page.locator('#invite-status', { hasText: /Card updated: Mela stroll/ }).waitFor();
    // After 10 November IST the page says so, hides the maker and the app link opens normally.
    const late = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await late.addInitScript(() => { const fixed = Date.parse('2026-11-10T19:00:00Z'), Real = Date; class Fake extends Real { constructor(...a) { a.length ? super(...a) : super(fixed); } static now() { return fixed; } } window.Date = Fake; });
    await late.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const lp = await late.newPage(); await lp.goto(origin + '/diwali-together/');
    assert.match(await lp.locator('h1:visible').innerText(), /Diwali 2026 has passed\. Paire is still here\./);
    assert.equal(await lp.locator('#card').isVisible(), false);
    assert.equal(await lp.locator('a:visible[href="/app/"]').count() > 0, true);
    await late.close();
    // Old Garba link target and homepage expiry.
    const homeLate = await browser.newContext({ serviceWorkers: 'block' });
    await homeLate.addInitScript(() => { const fixed = Date.parse('2026-11-12T08:00:00Z'), Real = Date; class Fake extends Real { constructor(...a) { a.length ? super(...a) : super(fixed); } static now() { return fixed; } } window.Date = Fake; });
    await homeLate.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const hp = await homeLate.newPage(); await hp.goto(origin + '/'); assert.equal(await hp.locator('#diwali').isVisible(), false); await homeLate.close();
    console.log('PASS Diwali Together page: honest copy, plan cards, hostile input, fragment state, refresh, share/cancel/copy/download PNG, keyboard, expiry and layouts');
    await page.goto(origin + '/');
    await page.getByRole('link', { name: 'Try Date Duet', exact: true }).click(); await responsive('duet-intro'); console.log('PASS public landing layouts');
    await page.locator('#start').click(); assert(await page.locator('#next').isDisabled());
    await page.getByRole('button', { name: /Chai & a conversation/ }).click();
    await page.getByRole('button', { name: /A daylight park walk/ }).click();
    await page.getByRole('button', { name: /A bookshop browse/ }).click();
    await page.getByRole('button', { name: /A friendly game/ }).click();
    assert.match(await page.locator('#status').innerText(), /up to 3/);
    await page.getByRole('button', { name: /A bookshop browse/ }).click();
    await responsive('duet-choices'); await page.locator('#next').click();
    await page.getByRole('button', { name: /^.*Daylight/ }).click(); await page.locator('#next').click();
    await page.getByRole('button', { name: /Up to ₹800/ }).click(); await page.locator('#next').click();
    await page.getByRole('button', { name: /Up to 90 minutes/ }).click(); await page.locator('#next').click();
    await page.getByRole('button', { name: /Either feels good/ }).click();
    await page.locator('#back').click(); assert.equal(await page.getByRole('button', { name: /Up to 90 minutes/ }).getAttribute('aria-pressed'), 'true');
    await page.locator('#next').click(); await page.locator('#next').click();
    const invitation = new URL(page.url()); assert.equal(invitation.search, ''); assert(invitation.hash.startsWith('#d=')); console.log('PASS creator choices and history');
    const a = unpack(invitation.hash.slice(3)).a; assert.deepEqual(a.activities, ['chai', 'walk']); assert.equal(a.budget, 800);
    await page.locator('#duet-share').click(); assert.equal((await page.evaluate(() => window.__qaShare)).url, invitation.href);
    await page.reload(); await page.locator('#start').click();
    for (const name of [/A daylight park walk/, /^.*Daylight/, /A free plan/, /Up to 30 minutes/, /Somewhere quiet/]) { await page.getByRole('button', { name }).click(); await page.locator('#next').click(); }
    await page.getByRole('heading', { name: 'Your common ground.' }).waitFor();
    assert.match(await page.locator('#duet-card').innerText(), /A free plan/); assert.match(await page.locator('#duet-card').innerText(), /Up to 30 minutes/);
    assert.match(await page.locator('#duet-card').innerText(), /Daylight/); await responsive('duet-blueprint');
    const resultUrl = page.url(); assert(unpack(new URL(resultUrl).hash.slice(3)).b); await page.locator('#duet-share').click(); assert.equal((await page.evaluate(() => window.__qaShare)).url, resultUrl); console.log('PASS recipient comparison and sharing');
    const downloadPromise = page.waitForEvent('download'); await page.locator('#duet-download').click(); const download = await downloadPromise;
    await download.saveAs('/tmp/muse-pm-date-duet-card.png'); const png = fs.readFileSync('/tmp/muse-pm-date-duet-card.png'); assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    await page.reload(); await page.getByRole('heading', { name: 'Your common ground.' }).waitFor();
    await page.locator('#duet-reset').click(); assert.equal(new URL(page.url()).hash, ''); assert.match(await page.locator('#intro h1').innerText(), /beautiful/);
    const b = { ...a, windows: ['evening'], noise: 'quiet', budget: 0 };
    await page.goto(`${origin}/date-duet/#d=${pack({ ...a, noise: 'lively' }, b)}`); await page.getByRole('heading', { name: 'A conversation to have.' }).waitFor();
    assert.match(await page.locator('#duet-card').innerText(), /preferred time windows differ/);
    await page.goto(origin + '/date-duet/#d=bad!!!'); assert.match(await page.locator('#status').innerText(), /invalid or incomplete/);
    await page.locator('#start').focus(); await page.keyboard.press('Enter'); await page.locator('#flow').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'flow-title'); await page.locator('#back').click(); assert.equal(await page.evaluate(() => document.activeElement.id), 'start');
    // A cancelled system share does not count as a completed share action.
    await page.goto(invitation.href); await page.locator('#start').click(); await page.locator('#back').click();
    await page.goto(resultUrl); await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
    const shared = actions.filter(e => e.e === 'duet_shared').length; await page.locator('#duet-share').click(); assert.equal(actions.filter(e => e.e === 'duet_shared').length, shared);
    await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
    await page.locator('#duet-share').click(); assert.equal(await page.getByRole('textbox', { name: 'Date Duet share link' }).inputValue(), resultUrl);
    assert(!paths.some(u => u.includes('#') || u.includes('activities') || u.includes('minutes=')));
    assert(actions.length >= 5); assert(actions.every(a => Object.keys(a).sort().join(',') === 'e,p' && a.p === '/date-duet/'));
    assert.deepEqual(errors, []);
    // Static SEO audit: crawl every sitemap URL without executing advertising or visit scripts.
    const urls = [...fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
    const pages = urls.map(url => { const pathname = new URL(url).pathname; return { url, pathname, html: fs.readFileSync(path.join(dist, pathname, 'index.html'), 'utf8') }; });
    const concerns = await page.evaluate(pages => {
      const failures = [];
      for (const p of pages) { const d = new DOMParser().parseFromString(p.html, 'text/html');
        if (!d.title || !d.querySelector('meta[name="description"]')?.content) failures.push(`${p.pathname}: missing title/description`);
        if (d.querySelector('link[rel="canonical"]')?.getAttribute('href') !== p.url) failures.push(`${p.pathname}: canonical mismatch`);
        for (const s of d.querySelectorAll('script[type="application/ld+json"]')) try { JSON.parse(s.textContent); } catch { failures.push(`${p.pathname}: invalid JSON-LD`); }
        if (/every member is selfie-verified|mandatory selfie verification|passed a live selfie check/i.test(d.body.textContent)) failures.push(`${p.pathname}: inaccurate verification claim`);
      } return failures;
    }, pages);
    assert.deepEqual(concerns, []);
    const internalLinks = await page.evaluate(pages => pages.flatMap(p => [...new DOMParser().parseFromString(p.html, 'text/html').querySelectorAll('a[href]')].map(a => ({ from: p.pathname, href: a.getAttribute('href') })).filter(a => a.href.startsWith('/') || a.href.startsWith('#'))), pages);
    const broken = [];
    for (const link of internalLinks) {
      const u = new URL(link.href, 'https://www.paire.in' + link.from);
      if (u.pathname.startsWith('/app/') || u.pathname.startsWith('/auth/')) continue;
      let file = path.join(dist, u.pathname); if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { broken.push(`${link.from}: ${link.href}`); continue; }
      if (u.hash && file.endsWith('.html') && !fs.readFileSync(file, 'utf8').includes(`id="${u.hash.slice(1)}"`)) broken.push(`${link.from}: missing anchor ${link.href}`);
    }
    assert.deepEqual(broken, []);
    assert(fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8').includes('/date-duet/'));
    assert(fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8').includes('/circles/corporate/'));
    assert(!fs.readFileSync(path.join(dist, 'date-duet/index.html'), 'utf8').includes('fbevents.js'));
    console.log(`PASS Date Duet creation, constraints, share/back/reset, hostile links, keyboard, PNG export, action-only analytics and 320/390/768/1280 layouts; ${pages.length} sitemap pages passed metadata/schema/trust-copy checks.`);
    await context.close();
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
