'use strict';

/**
 * Lyric IQ share cards. One HTML template, two formats:
 *   og    1200×630  link previews (iMessage, X, Facebook, Slack)
 *   story 1080×1920 Instagram / TikTok / Snapchat stories
 *
 * The card is drawn on the player's world scene (the same SVG the game uses),
 * rendered by headless Chromium and cached in memory. A completed session never
 * changes, so cards are immutable and safe to cache hard downstream.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../../utilities/logger');

const FORMATS = {
    og: { width: 1200, height: 630, scene: (w) => `streets-${w}.svg` },
    story: { width: 1080, height: 1920, scene: (w) => (w === 'court' ? 'streets-court.svg' : `streets-${w}-phone.svg`) }
};
const PUBLIC_DIR = path.join(__dirname, '..', '..', '..', '..', 'public');
const FONTS = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@800;900&family=Outfit:wght@600;700;800&display=swap';

const fileCache = new Map();
function readPublic(rel) {
    if (!fileCache.has(rel)) {
        try { fileCache.set(rel, fs.readFileSync(path.join(PUBLIC_DIR, rel))); } catch (e) { fileCache.set(rel, null); }
    }
    return fileCache.get(rel);
}
function logoDataUri() {
    const buf = readPublic('images/logo.png');
    return buf ? `data:image/png;base64,${buf.toString('base64')}` : '';
}
function sceneSvg(world, format) {
    const buf = readPublic(path.join('images', 'lyric-iq', FORMATS[format].scene(world)));
    return buf ? buf.toString('utf8') : '';
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const WORLD_LINE = { block: 'Plays on the block', court: 'Plays on the court', rooftop: 'Plays on the rooftop' };

/** Build the card markup. `card` is the stored share snapshot (see shareService.buildShareCard). */
function renderCardHtml(card, { format = 'og' } = {}) {
    const f = FORMATS[format] || FORMATS.og;
    const story = format === 'story';
    const world = card.world || 'block';
    const iq = card.lyricIq === null || card.lyricIq === undefined ? '—' : String(card.lyricIq);
    const chips = [];
    if (card.headline) chips.push({ text: card.headline, tone: 'amber' });
    if (card.artist) chips.push({ text: card.artist.value !== null && card.artist.value !== undefined ? `${card.artist.name} IQ ${card.artist.value}` : `${card.artist.name} round`, tone: 'ink' });
    else if (card.topGenre && card.topGenre.value !== null) chips.push({ text: `${card.topGenre.label} ${card.topGenre.value}`, tone: 'ink' });
    if (card.dailyStreak > 1) chips.push({ text: `${card.dailyStreak}-day streak`, tone: 'cream' });
    const host = config.publicUrl.replace(/^https?:\/\//, '');

    return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
  :root { --ink:#0B0A14; --cream:#F4EBDD; --mint:#00E5A8; --amber:#F2B632; --orange:#E0812E; --pink:#FF2D78; --rust:#8E3B2F; }
  * { box-sizing:border-box; margin:0; }
  html,body { width:${f.width}px; height:${f.height}px; overflow:hidden; background:var(--ink); font-family:'Outfit',system-ui,sans-serif; color:var(--cream); }
  .stage { position:relative; width:${f.width}px; height:${f.height}px; overflow:hidden; }
  .scene { position:absolute; inset:0; }
  .scene svg { position:absolute; inset:0; width:100%; height:100%; display:block; }
  .shade { position:absolute; inset:0; background:${story
        ? 'linear-gradient(180deg, rgba(11,10,20,0.78) 0%, rgba(11,10,20,0.55) 45%, rgba(11,10,20,0.25) 70%, rgba(11,10,20,0.75) 100%)'
        : 'linear-gradient(90deg, rgba(11,10,20,0.88) 0%, rgba(11,10,20,0.72) 52%, rgba(11,10,20,0.28) 100%)'}; }
  .grain { position:absolute; inset:0; opacity:.06; background-image:radial-gradient(rgba(255,255,255,.9) .6px, transparent .8px); background-size:6px 6px; }
  .content { position:absolute; inset:0; padding:${story ? '96px 84px 120px' : '48px 64px'}; display:flex; flex-direction:column; justify-content:space-between; }
  .top { display:flex; align-items:center; justify-content:space-between; }
  .logo { height:${story ? 108 : 64}px; filter:drop-shadow(0 0 10px rgba(244,235,221,.35)) drop-shadow(0 4px 0 var(--ink)); }
  .kicker { display:inline-flex; align-items:center; gap:14px; padding:${story ? '14px 26px' : '10px 18px'}; border-radius:999px; background:var(--cream); color:var(--ink); border:3px solid var(--ink); box-shadow:0 5px 0 var(--ink); font-family:'Unbounded',sans-serif; font-weight:900; font-size:${story ? 26 : 18}px; letter-spacing:.14em; text-transform:uppercase; }
  .kicker i { display:inline-block; width:${story ? 16 : 12}px; height:${story ? 16 : 12}px; border-radius:50%; background:var(--mint); box-shadow:0 0 14px var(--mint); }
  .hero { display:flex; flex-direction:${story ? 'column' : 'row'}; align-items:${story ? 'flex-start' : 'flex-end'}; gap:${story ? 28 : 40}px; }
  .num { font-family:'Unbounded','Arial Black',sans-serif; font-weight:900; font-size:${story ? 460 : 300}px; line-height:.86; letter-spacing:-.04em;
         background:linear-gradient(180deg, var(--mint) 0%, var(--amber) 58%, var(--orange) 100%); -webkit-background-clip:text; background-clip:text; color:transparent; -webkit-text-fill-color:transparent;
         filter:drop-shadow(4px 4px 0 var(--ink)) drop-shadow(-2px -2px 0 var(--ink)) drop-shadow(0 12px 0 var(--ink)) drop-shadow(0 30px 40px rgba(0,0,0,.45)); }
  .meta { display:flex; flex-direction:column; gap:${story ? 20 : 14}px; padding-bottom:${story ? 0 : 22}px; max-width:${story ? '100%' : '520px'}; }
  .name { font-family:'Unbounded',sans-serif; font-weight:800; font-size:${story ? 44 : 30}px; line-height:1.1; color:var(--cream); text-shadow:2px 2px 0 var(--ink), -1px -1px 0 var(--ink), 0 4px 0 var(--ink); }
  .name small { display:block; font-family:'Outfit',sans-serif; font-weight:700; font-size:${story ? 30 : 20}px; color:var(--amber); margin-top:6px; text-shadow:1px 1px 0 var(--ink), -1px -1px 0 var(--ink); }
  .line { display:inline-block; padding:${story ? '18px 24px' : '12px 18px'}; border-radius:18px; background:rgba(244,235,221,.96); border:3px solid var(--ink); box-shadow:0 5px 0 var(--ink); color:var(--ink); font-weight:700; font-size:${story ? 34 : 24}px; line-height:1.25; width:max-content; max-width:100%; }
  .chips { display:flex; flex-wrap:wrap; gap:${story ? 16 : 12}px; }
  .chip { display:inline-flex; align-items:center; padding:${story ? '16px 26px' : '10px 18px'}; border-radius:999px; border:3px solid var(--ink); box-shadow:0 4px 0 var(--ink); font-family:'Unbounded',sans-serif; font-weight:800; font-size:${story ? 26 : 17}px; letter-spacing:.02em; }
  .chip--amber { background:var(--amber); color:var(--ink); }
  .chip--ink { background:var(--ink); color:var(--mint); border-color:var(--mint); box-shadow:0 4px 0 var(--ink), 0 0 18px rgba(0,229,168,.45); }
  .chip--cream { background:var(--cream); color:var(--ink); }
  .bottom { display:flex; align-items:flex-end; justify-content:space-between; gap:24px; ${story ? 'flex-direction:column; align-items:stretch;' : ''} }
  .cta { display:flex; flex-direction:${story ? 'row' : 'column'}; align-items:${story ? 'center' : 'flex-end'}; justify-content:space-between; gap:${story ? 20 : 8}px; }
  .cta .ask { font-weight:700; font-size:${story ? 32 : 20}px; color:var(--cream); text-shadow:1px 1px 0 var(--ink), -1px -1px 0 var(--ink); }
  .cta .url { display:inline-flex; align-items:center; padding:${story ? '18px 32px' : '12px 22px'}; border-radius:999px; background:var(--mint); color:var(--ink); border:3px solid var(--ink); box-shadow:0 6px 0 var(--ink), 0 14px 30px rgba(0,229,168,.35); font-family:'Unbounded',sans-serif; font-weight:900; font-size:${story ? 30 : 20}px; letter-spacing:.04em; }
</style></head><body>
<div class="stage">
  <div class="scene">${sceneSvg(world, format)}</div>
  <div class="shade"></div><div class="grain"></div>
  <div class="content">
    <div class="top">
      <img class="logo" src="${logoDataUri()}" alt="Wordeth">
      <div class="kicker"><i></i>Lyric IQ${card.provisional ? ' · provisional' : ''}</div>
    </div>
    <div class="hero">
      <div class="num">${esc(iq)}</div>
      <div class="meta">
        <div class="name">${esc(card.displayName)}<small>${esc(WORLD_LINE[world] || '')}</small></div>
        <div class="line">${esc(card.line || '')}</div>
        <div class="chips">${chips.map((c) => `<span class="chip chip--${c.tone}">${esc(c.text)}</span>`).join('')}</div>
      </div>
    </div>
    <div class="bottom">
      <div class="cta"><span class="ask">Think you know more?</span><span class="url">${esc(host)}</span></div>
    </div>
  </div>
</div>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
let browser = null;
let launching = null;
let closeTimer = null;
const pngCache = new Map();          // key → Buffer, insertion-ordered for LRU trimming
const PNG_CACHE_MAX = 200;

function chromiumPath() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    try {
        const { execSync } = require('child_process');
        const p = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null').toString().trim();
        return p || undefined;
    } catch (e) { return undefined; }
}

async function getBrowser() {
    if (browser && browser.connected) return browser;
    if (launching) return launching;
    launching = (async () => {
        const puppeteer = require('puppeteer');
        const opts = { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--font-render-hinting=none'] };
        const exe = chromiumPath();
        if (exe) opts.executablePath = exe;
        browser = await puppeteer.launch(opts);
        logger.info('share_card_browser_launched', { executablePath: exe || 'bundled' });
        return browser;
    })().finally(() => { launching = null; });
    return launching;
}

function scheduleClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(async () => {
        if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } browser = null; }
    }, 60 * 1000);
    if (closeTimer.unref) closeTimer.unref();
}

/** Render a card to PNG. Cached by `cacheKey` (the session id + format) when given. */
async function renderCardPng(card, { format = 'og', cacheKey = null } = {}) {
    const f = FORMATS[format] || FORMATS.og;
    const key = cacheKey ? `${cacheKey}:${format}` : null;
    if (key && pngCache.has(key)) { const hit = pngCache.get(key); pngCache.delete(key); pngCache.set(key, hit); return hit; }
    if (closeTimer) clearTimeout(closeTimer);
    const started = Date.now();
    const b = await getBrowser();
    const page = await b.newPage();
    try {
        await page.setViewport({ width: f.width, height: f.height, deviceScaleFactor: 1 });
        // Fonts come from Google; if they are slow or blocked the card still renders in the fallback face.
        await page.setContent(renderCardHtml(card, { format }), { waitUntil: 'networkidle0', timeout: 8000 }).catch(() => {});
        await Promise.race([page.evaluate(() => document.fonts && document.fonts.ready), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
        const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: f.width, height: f.height } });
        if (key) {
            pngCache.set(key, png);
            while (pngCache.size > PNG_CACHE_MAX) pngCache.delete(pngCache.keys().next().value);
        }
        logger.info('share_card_rendered', { format, ms: Date.now() - started, bytes: png.length });
        return png;
    } finally {
        await page.close().catch(() => {});
        scheduleClose();
    }
}

async function stop() {
    if (closeTimer) clearTimeout(closeTimer);
    if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } browser = null; }
}

module.exports = { renderCardHtml, renderCardPng, stop, FORMATS, _pngCache: pngCache };
