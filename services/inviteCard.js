/**
 * The invite card, in the six looks a live room wears in the app.
 *
 * The app's Verses list and doorway hero draw every live room as a poster
 * in one of six looks, chosen by a hash of the room id so everyone sees
 * the same one. The invite card someone shares out of a room should be
 * the same poster at 1200×630, so the room looks the same on the phone,
 * in the group chat and on the timeline. This builds that card as HTML
 * for the server's headless browser to photograph. Fonts are the app's
 * own, embedded as data so the page needs nothing from the network.
 */
const fs = require('fs');
const path = require('path');

const LOOKS = ['mixtape', 'flyer', 'tag', 'onair', 'stickers', 'marquee'];
const INK = '#0A0712', CYAN = '#7ED6F7', VIOLET = '#5F0E82', HAZE = '#8E4BD6', RED = '#ff5a54', PAPER = '#F1ECF7', QUIET = '#B8ACCB';

/** Which look a room wears: the same hash as the app, so the card matches the poster. */
function lookFor(roomId) {
    let h = 0;
    const s = String(roomId || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return LOOKS[h % LOOKS.length];
}

const FONT_FILES = {
    Anton: 'Anton-Regular.ttf', Bebas: 'BebasNeue-Regular.ttf', Mono: 'SpaceMono-Bold.ttf', Bungee: 'Bungee-Regular.ttf',
    Monoton: 'Monoton-Regular.ttf', Unbounded: 'Unbounded-Black.ttf', Marker: 'PermanentMarker-Regular.ttf',
    Glitch: 'RubikGlitch-Regular.ttf', Shrikhand: 'Shrikhand-Regular.ttf',
};
let fontCss = null;
/** The app's fonts as @font-face rules with the files inlined. Read once. */
function fonts() {
    if (fontCss !== null) return fontCss;
    const dir = path.join(__dirname, '..', 'public', 'fonts');
    fontCss = Object.entries(FONT_FILES).map(([family, file]) => {
        try {
            const b64 = fs.readFileSync(path.join(dir, file)).toString('base64');
            return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
        } catch (e) {
            console.warn('[InviteCard] font missing:', file);
            return '';
        }
    }).join('\n');
    return fontCss;
}

function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/** Emoji in their own span so a text-shadow or colour never paints over them. */
function withEmoji(escaped) {
    return escaped.replace(/(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*)/gu, '<span class="emoji">$1</span>');
}
function clip(s, n) { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; }

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.6 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>")`;

function face(avatar, name, size, border, borderWidth) {
    const bw = borderWidth || Math.max(4, Math.round(size / 40));
    const inner = avatar
        ? `<img src="${esc(avatar)}" style="width:100%;height:100%;object-fit:cover;display:block">`
        : `<span style="font-family:Unbounded;font-size:${Math.round(size * 0.42)}px;color:#fff">${esc((name || 'W').charAt(0).toUpperCase())}</span>`;
    return `<div class="face" style="width:${size}px;height:${size}px;border:${bw}px solid ${border}">${inner}</div>`;
}
function sticker(text, { bg = PAPER, fg = INK, rotate = 0, style = '' } = {}) {
    return `<div class="sticker" style="background:${bg};color:${fg};transform:rotate(${rotate}deg);${style}">${text}</div>`;
}

/** The card. `participants` carry userName, isHost and avatar (a data URL or absolute URL, or null). */
function html({ roomId, roomName, hostName, hostAvatar, participantCount = 0, tokenPrice = 0, participants = [], logo = '' }) {
    const look = lookFor(roomId);
    const title = withEmoji(esc(clip(roomName || 'Live room', 48)));
    const TITLE = withEmoji(esc(clip(roomName || 'Live room', 48).toUpperCase()));
    const hostUp = esc(clip(hostName || '', 22).toUpperCase());
    const hostedBy = hostName ? `HOSTED BY ${hostUp}` : 'LIVE ROOM';
    const n = Number(participantCount) || 0;
    const stage = participants.filter((p) => p.isHost).concat(participants.filter((p) => !p.isHost)).slice(0, 3).map((p) => esc(clip(p.userName || '', 18).toUpperCase()));
    const mark = logo ? `<img class="mark" src="${logo}">` : '';

    const looks = {
        mixtape: `
<div class="card" style="background:#1a1226">
  <div class="band"></div><div class="grain"></div>
  <div class="pad">
    <div class="mono" style="color:${CYAN}">SIDE A · LIVE</div>
    <div class="anton">${TITLE}</div>
  </div>
  <div class="bl row">${face(hostAvatar, hostName, 56, CYAN)}<div class="mono" style="margin-left:16px">${hostedBy}</div></div>
  <div class="advisory"><div class="advBig">${n}</div><div class="advSmall">INSIDE</div></div>
  ${mark ? `<div class="markBox" style="right:64px;top:48px">${mark}</div>` : ''}
</div>`,
        flyer: `
<div class="card" style="background:${INK}">
  <div class="grain" style="opacity:.25"></div>
  <div class="pad">
    <div class="neon">LIVE</div>
    <div class="bebas">${TITLE}</div>
    <div class="mono" style="color:${QUIET};margin-top:18px">TONIGHT · DOORS OPEN · ${n} INSIDE</div>
  </div>
  <div class="flyerW">W</div>
  ${hostName ? sticker(hostedBy, { bg: CYAN, rotate: 8, style: 'right:-10px;bottom:70px' }) : ''}
</div>`,
        tag: `
<div class="card" style="background:#1a1226">
  <div class="grain" style="opacity:.3"></div>
  ${sticker('● LIVE NOW', { bg: RED, fg: '#fff', rotate: -3, style: 'left:56px;top:44px' })}
  <div class="pad" style="top:140px">
    <div class="marker">${title}</div>
  </div>
  <div class="drip" style="left:32%;top:400px;height:96px"></div>
  <div class="drip" style="left:62%;top:384px;height:60px"></div>
  ${sticker(`${hostName ? hostedBy + ' · ' : ''}${n} HERE`, { rotate: 2, style: 'left:56px;bottom:48px' })}
  ${mark ? `<div class="markBox" style="right:56px;top:44px">${mark}</div>` : ''}
</div>`,
        onair: `
<div class="card" style="background:#0b0a14">
  <div class="scan"></div>
  <div class="pad">
    <div class="row"><div class="chip" style="background:${RED}"><span class="mono" style="color:#fff">● ON AIR</span></div><div class="mono" style="color:${CYAN};margin-left:auto">CH ${n}</div></div>
    <div class="glitch">${TITLE}</div>
    ${stage.length ? `<div class="mono" style="color:${QUIET};margin-top:14px">${stage.join(' · ')}</div>` : ''}
  </div>
  <div class="bars">${[30, 60, 90, 45, 70, 35, 80, 55, 25, 65, 95, 40, 60, 30, 75, 50, 85, 35, 55, 20, 70, 45, 90, 30].map((h) => `<div class="bar" style="height:${h}%"></div>`).join('')}</div>
  ${mark ? `<div class="markBox" style="right:64px;bottom:120px">${mark}</div>` : ''}
</div>`,
        stickers: `
<div class="card" style="background:#140b1c">
  <div class="blob"></div><div class="grain" style="opacity:.3"></div>
  <div class="pad" style="right:460px">
    <div class="shrikhand">${title}</div>
  </div>
  <div style="position:absolute;right:-70px;top:70px">${face(hostAvatar, hostName, 440, CYAN, 10)}</div>
  ${sticker('● LIVE', { bg: RED, fg: '#fff', rotate: 7, style: 'right:320px;top:40px' })}
  ${sticker(`${n} INSIDE`, { bg: CYAN, rotate: -9, style: 'right:40px;top:330px' })}
  ${tokenPrice > 0 ? sticker(`${Number(tokenPrice)} TOKENS`, { bg: HAZE, fg: '#fff', rotate: 4, style: 'right:150px;bottom:90px' }) : ''}
  ${hostName ? sticker(hostedBy, { rotate: -2, style: 'left:56px;bottom:48px' }) : ''}
</div>`,
        marquee: `
<div class="card" style="background:${CYAN}">
  <div class="grain" style="opacity:.18"></div>
  <div class="pad">
    <div class="chip" style="background:${INK}"><span class="mono" style="color:${CYAN}">● LIVE NOW</span></div>
    <div class="marquee">${title}</div>
  </div>
  <div style="position:absolute;right:-90px;bottom:-90px">${face(hostAvatar, hostName, 420, INK, 10)}</div>
  <div class="mono bl" style="color:${INK}">${hostName ? hostedBy + ' · ' : ''}${n} INSIDE</div>
  ${mark ? `<div class="markBox" style="right:64px;top:48px">${mark}</div>` : ''}
</div>`,
    };

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${fonts()}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:${INK};font-family:'Mono','Noto Color Emoji',sans-serif}
.card{position:absolute;inset:0;overflow:hidden}
.emoji{font-family:'Noto Color Emoji','Apple Color Emoji',sans-serif;text-shadow:none;-webkit-text-fill-color:initial}
.grain{position:absolute;inset:0;background-image:${GRAIN};opacity:.35;pointer-events:none}
.scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.05) 0 2px,transparent 2px 6px)}
.band{position:absolute;left:300px;top:-200px;width:1200px;height:1100px;background:#13203A;opacity:.5;transform:rotate(-20deg)}
.blob{position:absolute;left:-120px;bottom:-260px;width:760px;height:760px;border-radius:50%;background:#2a1434}
.pad{position:absolute;left:64px;top:56px;right:64px}
.row{display:flex;align-items:center}
.bl{position:absolute;left:64px;bottom:52px}
.mono{font-family:'Mono';font-size:24px;letter-spacing:3px;color:${PAPER};white-space:nowrap}
.chip{display:inline-block;padding:8px 18px;border-radius:999px}
.sticker{position:absolute;padding:12px 20px;border-radius:8px;font-family:'Bungee';font-size:24px;letter-spacing:2px;white-space:nowrap;box-shadow:0 8px 0 rgba(0,0,0,.35)}
.face{border-radius:50%;overflow:hidden;background:${VIOLET};display:flex;align-items:center;justify-content:center;flex:none}
.anton{font-family:'Anton';font-size:150px;line-height:.92;letter-spacing:-2px;color:${PAPER};margin-top:14px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.advisory{position:absolute;right:64px;bottom:52px;border:5px solid ${PAPER};padding:10px 22px;text-align:center}
.advBig{font-family:'Bebas';font-size:56px;line-height:52px;letter-spacing:3px;color:${PAPER}}
.advSmall{font-family:'Bebas';font-size:20px;letter-spacing:6px;color:${PAPER}}
.neon{font-family:'Monoton';font-size:104px;line-height:1.05;color:${CYAN};text-shadow:0 0 28px ${CYAN},0 0 60px rgba(126,214,247,.5)}
.bebas{font-family:'Bebas';font-size:150px;line-height:.9;letter-spacing:2px;color:${PAPER};margin-top:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.flyerW{position:absolute;right:56px;top:36px;font-family:'Unbounded';font-size:92px;color:${CYAN}}
.marker{font-family:'Marker';font-size:112px;line-height:1.02;color:${CYAN};transform:rotate(-4deg);transform-origin:left top;text-shadow:7px 7px 0 ${VIOLET};display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding-right:120px}
.drip{position:absolute;width:26px;border-radius:0 0 13px 13px;background:${CYAN};box-shadow:7px 7px 0 ${VIOLET}}
.glitch{font-family:'Glitch';font-size:104px;line-height:1;color:${PAPER};margin-top:56px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bars{position:absolute;left:64px;right:64px;bottom:40px;height:96px;display:flex;align-items:flex-end;gap:10px}
.bar{flex:1;background:${CYAN};border-radius:4px 4px 0 0;opacity:.9}
.shrikhand{font-family:'Shrikhand';font-size:96px;line-height:1.04;color:${PAPER};text-shadow:9px 9px 0 ${VIOLET};margin-top:10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.marquee{font-family:'Unbounded';font-size:88px;line-height:1.02;letter-spacing:-2px;color:${INK};margin-top:26px;max-width:720px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.markBox{position:absolute}
.mark{width:52px;height:52px;object-fit:contain;opacity:.95}
</style></head><body>${looks[look]}</body></html>`;
}

module.exports = { LOOKS, lookFor, html };
