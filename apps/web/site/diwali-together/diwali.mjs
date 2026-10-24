import { DIYA, VIBES, campaignState, cardLines, cleanCity, describeCard, normalizeState, parseFragment, seeded, shareText, toFragment, upcomingDays, dayLabel, MAX_CITY } from './core.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const root = document.documentElement;

/* ---- Campaign window (India time): the page tells the truth on every visit. ---- */
const state = campaignState();
root.dataset.campaign = state;
const status = $('#campaign-status');
if (status) {
  status.dataset.state = state;
  status.textContent = state === 'open' ? 'Open now through 10 November, IST.' : state === 'soon' ? 'Opens on 24 October, IST.' : 'Diwali Together has ended for 2026.';
}
if (state === 'closed') {
  document.title = 'Diwali Together has ended | Paire';
  $('#invite-form')?.closest('section')?.setAttribute('hidden', '');
}

/* ---- The invitation card. One canvas draws it; the preview, share and download all use it. ---- */
const form = $('#invite-form');
if (form && state !== 'closed') {
  const canvas = $('#invite-canvas');
  const ctx = canvas.getContext('2d');
  const liveStatus = $('#invite-status');
  const linkField = $('#invite-link');
  const cityField = $('#invite-city');
  const dayGroup = $('#invite-days');
  const art = $('.diyas');
  const W = 1080, H = 1350;
  let current = normalizeState({ vibe: 'chai' });
  let fontsReady = false;

  /* Build the day chips from days still to come. */
  const days = upcomingDays();
  dayGroup.replaceChildren(...days.map((day) => {
    const label = document.createElement('label');
    label.className = 'chip';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = 'day'; input.value = day;
    const span = document.createElement('span');
    span.textContent = dayLabel(day) + (day === '2026-11-08' ? ' · Diwali' : '');
    label.append(input, span);
    return label;
  }));

  const say = (message) => { liveStatus.textContent = ''; setTimeout(() => { liveStatus.textContent = message; }, 30); };
  const read = () => normalizeState({ vibe: form.elements.vibe.value, day: form.elements.day.value, city: cityField.value });
  const write = (next) => {
    form.elements.vibe.value = next.vibe;
    form.elements.day.value = next.day;
    if (cityField.value !== next.city) cityField.value = next.city;
  };
  const shareUrl = () => `${location.origin}${location.pathname}${toFragment(current)}`;

  /* Warm sky, two diyas and the line between them. Drawn, never injected as HTML. */
  function paint() {
    const lines = cardLines(current);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1B1020'); sky.addColorStop(1, '#3A1B3F');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 700, 20, W / 2, 700, 560);
    glow.addColorStop(0, 'rgba(240,176,74,.22)'); glow.addColorStop(1, 'rgba(240,176,74,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const random = seeded(current.vibe);
    const stars = Array.from({ length: 64 }, () => ({ x: 40 + random() * (W - 80), y: 40 + random() * 760, r: 1 + random() * 2.6, a: 0.35 + random() * 0.6 }));
    ctx.strokeStyle = 'rgba(203,185,207,.13)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < stars.length; i += 4) {
      const next = stars[(i + 5) % stars.length];
      ctx.beginPath(); ctx.moveTo(stars[i].x, stars[i].y); ctx.lineTo(next.x, next.y); ctx.stroke();
    }
    for (const star of stars) { ctx.fillStyle = `rgba(251,243,230,${star.a})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill(); }

    const flames = [[330, 600], [750, 600]];
    ctx.strokeStyle = 'rgba(240,176,74,.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(240,176,74,.7)'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.moveTo(flames[0][0], flames[0][1] - 40); ctx.quadraticCurveTo(W / 2, 400, flames[1][0], flames[1][1] - 40); ctx.stroke();
    ctx.shadowBlur = 0;
    for (const [x, y] of flames) drawDiya(x, y, 1.45);

    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const serif = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
    const sans = 'Grotesk,system-ui,sans-serif';
    ctx.fillStyle = '#F0B04A'; ctx.font = `700 30px ${sans}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '8px';
    ctx.fillText(lines.eyebrow, W / 2, 132);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    fit(lines.title, W - 140, 124, `italic 500`, serif, '#FBF3E6', W / 2, 262);
    fit(lines.ask, W - 140, 66, '500', serif, '#FBF3E6', W / 2, 950);
    fit(lines.where, W - 140, 46, '700', sans, '#F0B04A', W / 2, 1040);
    fit(lines.care, W - 140, 36, '400', sans, '#CBB9CF', W / 2, 1130);
    fit(lines.brand, W - 140, 34, '700', sans, '#FBF3E6', W / 2, 1272);
    canvas.setAttribute('aria-label', `Invitation card preview: ${lines.ask} ${lines.where}.`);
  }
  function fit(text, maxWidth, size, weight, family, color, x, y) {
    let px = size;
    ctx.fillStyle = color;
    do { ctx.font = `${weight} ${px}px ${family}`; px -= 2; } while (ctx.measureText(text).width > maxWidth && px > 22);
    ctx.fillText(text, x, y);
  }
  function drawDiya(cx, cy, scale) {
    ctx.save();
    ctx.translate(cx - 100 * scale, cy - 100 * scale + 60);
    ctx.scale(scale, scale);
    const halo = ctx.createRadialGradient(100, 60, 4, 100, 60, 90);
    halo.addColorStop(0, 'rgba(240,176,74,.5)'); halo.addColorStop(1, 'rgba(240,176,74,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(100, 60, 90, 0, Math.PI * 2); ctx.fill();
    const bowl = ctx.createLinearGradient(0, 76, 0, 126);
    bowl.addColorStop(0, '#5a2d5f'); bowl.addColorStop(1, '#1B1020');
    ctx.fillStyle = bowl; ctx.fill(new Path2D(DIYA.bowl));
    ctx.fillStyle = '#3A1B3F'; ctx.beginPath(); ctx.ellipse(DIYA.lip.cx, DIYA.lip.cy, DIYA.lip.rx, DIYA.lip.ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,176,74,.3)'; ctx.beginPath(); ctx.ellipse(100, 76, 70, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#C98B9B'; ctx.lineWidth = 2.5; ctx.stroke(new Path2D(DIYA.rim));
    const flame = ctx.createRadialGradient(100, 58, 2, 100, 50, 34);
    flame.addColorStop(0, '#FFE7B0'); flame.addColorStop(0.45, '#F0B04A'); flame.addColorStop(0.8, '#D9622B'); flame.addColorStop(1, 'rgba(217,98,43,0)');
    ctx.fillStyle = flame; ctx.fill(new Path2D(DIYA.flame));
    ctx.fillStyle = '#FBF3E6'; ctx.fill(new Path2D(DIYA.core));
    ctx.restore();
  }

  async function render() {
    if (!fontsReady) {
      try { await Promise.all([document.fonts.load('700 30px Grotesk'), document.fonts.load('400 30px Grotesk')]); } catch { /* system fonts are fine */ }
      fontsReady = true;
    }
    paint();
  }

  /* ---- Sync controls, preview, link and address bar. ---- */
  function update({ announce = false } = {}) {
    current = read();
    write(current);
    linkField.value = shareUrl();
    $('#invite-preview-vibe').textContent = `${VIBES[current.vibe].ask} ${dayLabel(current.day)}`;
    $('#invite-preview-city').textContent = current.city ? `Around ${current.city}` : 'No city added';
    $('#invite-join').href = `/app/?edition=diwali&vibe=${current.vibe}`;
    history.replaceState(history.state, '', `${location.pathname}${location.search}${toFragment(current)}`);
    art?.classList.add('is-lit');
    void render().catch(() => say("Couldn't make the card. Try again, or copy the link."));
    if (announce) say(`Card updated: ${describeCard(current)}.`);
  }
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('change', () => update({ announce: true }));
  cityField.addEventListener('input', () => {
    const cleaned = cleanCity(cityField.value);
    // Keep typing natural: only strip characters that are never valid.
    if (cityField.value !== cleaned && !/\s$/.test(cityField.value)) cityField.value = cleaned;
    update();
  });
  cityField.maxLength = MAX_CITY;

  /* A shared link opens with its card; the plan cards above choose a plan and scroll here. */
  function fromAddress() {
    const parsed = parseFragment(location.hash);
    write(parsed ?? normalizeState({ vibe: 'chai' }));
    update();
    return Boolean(parsed);
  }
  if (fromAddress()) requestAnimationFrame(() => $('#card')?.scrollIntoView({ block: 'start' }));
  addEventListener('hashchange', () => { if (parseFragment(location.hash)) fromAddress(); });
  addEventListener('popstate', fromAddress);
  document.querySelectorAll('[data-pick-vibe]').forEach((button) => button.addEventListener('click', () => {
    const next = normalizeState({ ...current, vibe: button.dataset.pickVibe });
    write(next); update({ announce: true });
    $('#card').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    form.querySelector('input[name="vibe"]:checked')?.focus({ preventScroll: true });
  }));

  /* ---- Share, download, copy. ---- */
  const blob = () => new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('empty')), 'image/png'));
  const fileName = () => `paire-diwali-${current.vibe}.png`;
  async function download() {
    await render();
    const url = URL.createObjectURL(await blob());
    const link = Object.assign(document.createElement('a'), { href: url, download: fileName() });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl()); say('Link copied.'); }
    catch { linkField.focus(); linkField.select(); say('Press Ctrl or ⌘ + C to copy the link.'); }
  }
  const shareButton = $('#invite-share');
  if (!navigator.share) shareButton.hidden = true;
  shareButton.addEventListener('click', async () => {
    try {
      await render();
      const file = new File([await blob()], fileName(), { type: 'image/png' });
      const data = { title: 'Diwali, together.', text: shareText(current), url: shareUrl() };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
      else await navigator.share(data);
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error?.name === 'AbortError') return;
      say("Couldn't share the card. You can download it or copy the link instead.");
    }
  });
  $('#invite-download').addEventListener('click', () => download().then(() => say('Card downloaded.')).catch(() => say("Couldn't make the card. Try again, or copy the link.")));
  $('#invite-copy').addEventListener('click', () => void copyLink());
  $('#builder').hidden = false;
}

/* ---- Small touches ---- */
// Plan cards and the date rail are plain content without JS; with it they link into the builder.
document.querySelectorAll('[data-pick-vibe]').forEach((button) => { button.disabled = !form || state === 'closed'; });
