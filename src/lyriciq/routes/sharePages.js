'use strict';

/**
 * Public share pages, mounted at the site root (not under /api):
 *
 *   GET /s/:id            share landing page with Open Graph / Twitter tags, the card
 *                         and a "take the test" call to action
 *   GET /s/:id/card.png   the card image; ?format=story for the 1080×1920 cut
 *
 * Only completed sessions have a page; nothing here exposes lyrics or answers.
 */
const express = require('express');
const mongoose = require('mongoose');
const GameSession = require('../models/GameSession');
const { cardForSession } = require('../services/share/shareService');
const cardRenderer = require('../services/share/cardRenderer');
const config = require('../config');
const logger = require('../utilities/logger');

const router = express.Router();

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Crawlers and image embeds need these gone; the page carries its own small inline styles. */
function relaxHeaders(res) {
    for (const h of ['Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'Origin-Agent-Cluster', 'X-Frame-Options']) res.removeHeader(h);
}

async function loadCompleted(id) {
    if (!mongoose.isValidObjectId(id)) return null;
    const session = await GameSession.findById(id).lean();
    if (!session || session.status !== 'COMPLETED') return null;
    return session;
}

/** Absolute base for links in meta tags: the configured public URL in production, the request origin elsewhere. */
function baseUrl(req) {
    if (process.env.NODE_ENV === 'production') return config.publicUrl;
    return `${req.protocol}://${req.get('host')}`;
}

router.get('/s/:id/card.png', async (req, res) => {
    try {
        const session = await loadCompleted(req.params.id);
        if (!session) return res.status(404).type('text/plain').send('Not found');
        const format = req.query.format === 'story' ? 'story' : 'og';
        const png = await cardRenderer.renderCardPng(cardForSession(session), { format, cacheKey: String(session._id) });
        relaxHeaders(res);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
        res.setHeader('Content-Length', png.length);
        res.send(png);
    } catch (err) {
        logger.error('share_card_failed', { sessionId: req.params.id, message: err.message });
        res.status(503).type('text/plain').send('Card unavailable');
    }
});

router.get('/s/:id', async (req, res) => {
    const session = await loadCompleted(req.params.id);
    relaxHeaders(res);
    if (!session) {
        return res.status(404).type('html').send(notFoundPage());
    }
    const card = cardForSession(session);
    const base = baseUrl(req);
    const pageUrl = `${base}/s/${session._id}`;
    const cardUrl = `${pageUrl}/card.png`;
    const playUrl = `${base}/play?challenge=${session._id}`;
    const title = card.lyricIq === null ? `${card.displayName} took the Lyric IQ test` : `${card.displayName} has a Lyric IQ of ${card.lyricIq}`;
    const description = [card.headline, card.line, 'How well do you actually know music? Take the test on Wordeth.'].filter(Boolean).join(' · ');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('html').send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Wordeth Lyric IQ</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wordeth Lyric IQ">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(cardUrl)}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(cardUrl)}">
<meta name="theme-color" content="#0B0A14">
<link rel="icon" type="image/png" href="/images/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@800;900&family=Outfit:wght@600;700;800&display=swap">
<style>
  :root{--ink:#0B0A14;--cream:#F4EBDD;--mint:#00E5A8;--amber:#F2B632;--muted:#6B5F57}
  *{box-sizing:border-box} body{margin:0;min-height:100vh;background:#0B0A14 radial-gradient(120% 80% at 50% 0%,#3B2E63 0%,#151A3A 55%,#0B0A14 100%);color:var(--cream);font-family:'Outfit',system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:20px 16px 48px}
  .top{width:100%;max-width:720px;display:flex;align-items:center;justify-content:space-between;min-height:56px}
  .top img{height:44px;filter:drop-shadow(0 0 8px rgba(244,235,221,.4)) drop-shadow(0 3px 0 var(--ink))}
  .top a.play{color:var(--ink);background:var(--cream);border:2px solid var(--ink);box-shadow:0 3px 0 var(--ink);border-radius:999px;padding:0 16px;min-height:44px;display:inline-flex;align-items:center;font-weight:700;text-decoration:none}
  main{width:100%;max-width:720px;display:grid;gap:22px;margin-top:22px}
  .card{display:block;width:100%;height:auto;border-radius:22px;border:3px solid var(--ink);box-shadow:0 8px 0 var(--ink),0 24px 60px rgba(0,0,0,.5);background:#151A3A;aspect-ratio:1200/630}
  h1{font-family:'Unbounded',sans-serif;font-weight:900;font-size:clamp(1.5rem,5vw,2.4rem);line-height:1.05;margin:0;text-transform:uppercase;text-shadow:-2px -2px 0 var(--ink),2px -2px 0 var(--ink),-2px 2px 0 var(--ink),2px 2px 0 var(--ink),0 6px 0 var(--ink)}
  p{margin:0;font-weight:600;font-size:1.05rem;color:var(--cream)}
  .cta{display:flex;align-items:center;justify-content:center;min-height:72px;border-radius:26px;background:var(--amber);color:var(--ink);border:3px solid var(--ink);box-shadow:0 7px 0 var(--ink),0 14px 30px rgba(242,182,50,.35);font-family:'Unbounded',sans-serif;font-weight:900;font-size:1.3rem;letter-spacing:.06em;text-transform:uppercase;text-decoration:none}
  .cta:active{transform:translateY(3px);box-shadow:0 2px 0 var(--ink)}
  .foot{font-size:.9rem;color:rgba(244,235,221,.75);text-align:center}
  .foot a{color:var(--cream)}
</style></head>
<body>
<header class="top"><a href="${esc(base)}/" aria-label="Wordeth Lyric IQ"><img src="/images/logo.png" alt="Wordeth"></a><a class="play" href="${esc(playUrl)}">Play</a></header>
<main>
  <img class="card" src="${esc(cardUrl)}" alt="${esc(title)}" width="1200" height="630">
  <h1>${esc(title)}</h1>
  <p>${esc(card.line || '')}${card.headline ? ` ${esc(card.headline)}.` : ''} Finish the lyric, name the song, call the artist. Get your own number in ten questions.</p>
  <a class="cta" href="${esc(playUrl)}">Take the test</a>
  <p class="foot">Lyric IQ is part of <a href="https://wordeth.com">Wordeth</a>. Lyrics licensed via Musixmatch.</p>
</main>
</body></html>`);
});

function notFoundPage() {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lyric IQ — not found</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B0A14;color:#F4EBDD;font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#00E5A8;font-weight:700}</style></head>
<body><div><h1>That result isn’t here.</h1><p>The link may be old, or the round was never finished.</p><p><a href="${esc(config.publicUrl)}/">Play Lyric IQ</a></p></div></body></html>`;
}

function createSharePagesRouter() { return router; }

module.exports = { createSharePagesRouter };
