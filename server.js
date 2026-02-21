require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const puppeteer = require('puppeteer');
const { setupSignaling, getActiveRooms } = require('./routes/signaling');

let ogLogoBase64 = '';
let ogBrowser = null;
let ogBrowserLaunching = null;

(async () => {
    try {
        const logoPath = path.join(__dirname, 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            const buf = fs.readFileSync(logoPath);
            ogLogoBase64 = buf.toString('base64');
            console.log('OG logo cached for link previews');
        }
    } catch(e) {
        console.warn('Failed to cache OG logo:', e.message);
    }
    try {
        await ensureOgBrowser();
        console.log('Puppeteer browser pre-launched for OG image generation');
    } catch(e) {
        console.warn('Puppeteer pre-launch failed (will retry on first request):', e.message);
    }
})();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const lyricsRoutes = require('./routes/lyrics'); // Re-enabled with Genius API key
const merchRoutes = require('./routes/merch');
const articleRoutes = require('./routes/articles');
const adsRoutes = require('./routes/ads'); // Advertising system
const analyticsRoutes = require('./routes/analytics'); // Usage metrics
const partnerRoutes = require('./routes/partner'); // Label partner dashboards
const subscriptionRoutes = require('./routes/subscriptions'); // Subscription & plans
const creatorRoutes = require('./routes/creator'); // Independent artist/designer
const tournamentRoutes = require('./routes/tournaments'); // Verses Tournaments
const trackingMiddleware = require('./middleware/tracking'); // Event tracking

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['polling', 'websocket'],
    allowUpgrades: true,
    upgradeTimeout: 30000,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 15e6,
    httpCompression: false,
    perMessageDeflate: false
});

setupSignaling(io);

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://www.youtube.com", "https://s.ytimg.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://storage.googleapis.com"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://www.youtube.com", "https://s.ytimg.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://storage.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://cdn.inksoft.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            frameSrc: ["https://stores.inksoft.com", "https://cdn.inksoft.com", "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com", "https://youtube-nocookie.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// Rate limiting — use real client IP behind Cloudflare/proxies
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: (req) => {
        return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    }
});
app.use('/api/', limiter);

// Connect to MongoDB
let mongoUri;
if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
    mongoUri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@wrdthcluster.3kkpz37.mongodb.net/wordeth?retryWrites=true&w=majority&appName=WrdthCluster`;
} else if (process.env.NODE_ENV === 'production') {
    mongoUri = process.env.MONGODB_URI_PROD;
} else if (process.env.NODE_ENV === 'test') {
    mongoUri = process.env.MONGODB_URI_TEST || process.env.MONGODB_URI;
} else {
    mongoUri = process.env.MONGODB_URI;
}

if (mongoUri && mongoUri !== 'mongodb://localhost:27017/wordeth') {
    mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: process.env.NODE_ENV === 'test' ? 2000 : 5000, // Faster timeout for tests
    })
    .then(() => {
        if (process.env.NODE_ENV !== 'test') {
            console.log('✅ Connected to MongoDB Atlas');
            const { startGlobalPoller } = require('./services/inkSoftService');
            startGlobalPoller();
        }
    })
    .catch(err => {
        if (process.env.NODE_ENV !== 'test') {
            console.error('❌ MongoDB connection error:', err);
        }
        // In test mode, silently handle connection errors
    });
} else {
    if (process.env.NODE_ENV !== 'test') {
    console.log('⚠️  MongoDB not configured - using in-memory storage for demo');
    console.log('📖 To enable full features, set up MongoDB Atlas (see QUICK_START.md)');
    }
}

// CORS configuration
app.use(cors({
    origin: true,
    credentials: true
}));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Prevent Cloudflare from caching any API responses
app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

// Serve static files with cache control (Cloudflare-compatible)
app.use(express.static(path.join(__dirname), {
    setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Usage tracking middleware (auto-captures events on API routes)
app.use('/api/', trackingMiddleware);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/lyrics', lyricsRoutes); // Re-enabled with Genius API key
app.use('/api/merch', merchRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/ads', adsRoutes); // Advertising system
app.use('/api/analytics', analyticsRoutes); // Usage metrics & admin dashboard
app.use('/api/partner', partnerRoutes); // Label partner dashboards
app.use('/api/subscriptions', subscriptionRoutes); // Subscription & plans
app.use('/api/creator', creatorRoutes); // Independent artist/designer
app.use('/api/tournaments', tournamentRoutes); // Verses Tournaments
app.get('/api/rooms/active', (req, res) => {
    res.json(getActiveRooms());
});

app.get('/api/rooms/:roomId', (req, res) => {
    const activeRooms = getActiveRooms();
    const room = activeRooms.find(r => r.id === req.params.roomId);
    if (!room) {
        return res.status(404).json({ error: 'Room not found or no longer active' });
    }
    res.json(room);
});

// Middleware to strip restrictive headers for OG crawler routes
function ogCrawlerHeaders(req, res, next) {
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.removeHeader('Origin-Agent-Cluster');
    res.removeHeader('X-Frame-Options');
    res.removeHeader('X-Content-Type-Options');
    res.removeHeader('Strict-Transport-Security');
    res.removeHeader('Referrer-Policy');
    res.removeHeader('X-DNS-Prefetch-Control');
    res.removeHeader('X-Download-Options');
    res.removeHeader('X-Permitted-Cross-Domain-Policies');
    res.removeHeader('X-XSS-Protection');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
}

// Rich link preview for room invites (Open Graph / SMS / iMessage / social cards)
app.get('/room/:roomId', ogCrawlerHeaders, (req, res) => {
    const roomId = req.params.roomId;
    const activeRooms = getActiveRooms();
    const room = activeRooms.find(r => r.id === roomId);

    const roomName = escapeHtml(room?.name || 'a Live Verse');
    const participantCount = room?.participantCount || 0;
    const hostName = room?.participants?.find(p => p.isHost)?.userName || '';
    const description = escapeHtml(hostName
        ? `${hostName} is live on Wordeth${participantCount > 1 ? ` with ${participantCount - 1} other${participantCount > 2 ? 's' : ''}` : ''}. Tap to join the conversation.`
        : `A live audio room on Wordeth${participantCount > 0 ? ` with ${participantCount} listener${participantCount > 1 ? 's' : ''}` : ''}. Tap to join.`);

    const baseUrl = req.get('x-forwarded-proto') 
        ? `${req.get('x-forwarded-proto')}://${req.get('host')}`
        : `${req.protocol}://${req.get('host')}`;
    const ogImageUrl = `${baseUrl}/og-image/${encodeURIComponent(roomId)}`;
    const joinUrl = `${baseUrl}/verses.html?room=${encodeURIComponent(roomId)}`;

    const ua = (req.get('user-agent') || '').toLowerCase();
    const isCrawler = /bot|crawl|spider|preview|fetch|facebookexternalhit|twitterbot|whatsapp|telegram|slack|discord|imessagebot|applebot|linkedinbot|skype|viber|line\/|cfnetwork|dataprovider|urlpreview|embedly|quora|outbrain|pinterest|tumblr|vkshare|w3c_validator/i.test(ua);

    if (!isCrawler) {
        res.setHeader('Cache-Control', 'no-store, no-cache');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        return res.redirect(302, joinUrl);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.send(`<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roomName} - Live on Wordeth</title>
    <meta property="og:type" content="website">
    <meta property="og:title" content="${roomName}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImageUrl}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${baseUrl}/room/${encodeURIComponent(roomId)}">
    <meta property="og:site_name" content="Wordeth">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${roomName}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImageUrl}">
    <meta http-equiv="refresh" content="2;url=${joinUrl}">
</head>
<body style="background:#1a1033;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <p>Joining room...</p>
</body>
</html>`);
});

async function ensureOgBrowser() {
    if (ogBrowser && ogBrowser.isConnected()) return ogBrowser;
    if (ogBrowserLaunching) return ogBrowserLaunching;
    ogBrowserLaunching = (async () => {
        try {
            if (ogBrowser) await ogBrowser.close().catch(() => {});
        } catch(e) {}
        const launchOpts = {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--font-render-hinting=none']
        };
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } else {
            const { execSync } = require('child_process');
            try {
                const sysChromium = execSync('which chromium 2>/dev/null || which google-chrome 2>/dev/null').toString().trim();
                if (sysChromium) launchOpts.executablePath = sysChromium;
            } catch(e) {}
        }
        ogBrowser = await puppeteer.launch(launchOpts);
        console.log('Puppeteer browser (re)launched');
        return ogBrowser;
    })().finally(() => { ogBrowserLaunching = null; });
    return ogBrowserLaunching;
}

app.get('/og-image/:roomId', ogCrawlerHeaders, async (req, res) => {
    try {
        const browser = await ensureOgBrowser();

        const roomId = req.params.roomId;
        const activeRooms = getActiveRooms();
        const room = activeRooms.find(r => r.id === roomId);

        const roomName = room?.name || 'Live Verse';
        const participantCount = room?.participantCount || 0;
        const participants = room?.participants || [];
        const hostName = participants.find(p => p.isHost)?.userName || '';
        const hostInitial = hostName ? escapeHtml(hostName.charAt(0).toUpperCase()) : 'W';
        const inviteLine = hostName
            ? `<strong>${escapeHtml(hostName)}</strong> invited you`
            : `You're invited`;
        const displayName = escapeHtml(roomName.length > 28 ? roomName.substring(0, 28) + '...' : roomName);
        const logoSrc = ogLogoBase64 ? `data:image/png;base64,${ogLogoBase64}` : '';
        const listenerText = participantCount > 0 ? `${participantCount} listening now` : 'Be the first to join';
        const miniAvatars = participants.slice(0, 3).map(p => {
            const initial = (p.userName || 'U').charAt(0).toUpperCase();
            return `<div class="mini-avatar">${initial}</div>`;
        }).join('');

        const html = `<!DOCTYPE html>
<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    width: 1200px; height: 630px;
    font-family: 'Inter', sans-serif;
    background: #0a0a12;
    overflow: hidden;
}
.card {
    position: absolute;
    top: 20px; left: 40px;
    width: 1120px; height: 590px;
    border-radius: 40px;
    background: linear-gradient(160deg, #1a1033 0%, #2d1b69 40%, #1a1033 100%);
    box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 70px rgba(139,92,246,0.2);
    overflow: hidden;
}
.glow {
    position: absolute; top: -50%; right: -50%;
    width: 200%; height: 200%;
    background: radial-gradient(circle at 70% 30%, rgba(150,197,176,0.12) 0%, transparent 50%),
                radial-gradient(circle at 30% 70%, rgba(139,92,246,0.15) 0%, transparent 50%);
    pointer-events: none;
}
.top-row {
    position: relative;
    padding: 40px 50px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.live-badge {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    background: linear-gradient(135deg, rgba(150,197,176,0.2), rgba(150,197,176,0.1));
    border: 2px solid rgba(150,197,176,0.5);
    color: #96c5b0;
    padding: 10px 24px;
    border-radius: 30px;
    font-size: 22px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2.5px;
}
.live-dot {
    width: 12px; height: 12px;
    border-radius: 50%;
    background: #96c5b0;
}
.logo {
    height: 180px;
    filter: drop-shadow(0 0 20px rgba(150,197,176,0.5)) drop-shadow(0 0 40px rgba(139,92,246,0.3));
}
.body {
    position: relative;
    padding: 30px 50px 0;
}
.room-name {
    font-size: 72px;
    font-weight: 900;
    line-height: 1.15;
    margin-bottom: 20px;
    background: linear-gradient(135deg, #96c5b0 0%, #fff 40%, #c4b5fd 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
.invite-from {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
}
.avatar {
    width: 52px; height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #8B5CF6, #6D28D9);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    font-weight: 700;
    color: white;
    flex-shrink: 0;
}
.invite-text {
    color: rgba(255,255,255,0.85);
    font-size: 28px;
    font-weight: 400;
}
.invite-text strong {
    color: white;
    font-weight: 700;
}
.participants-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
}
.mini-avatars {
    display: flex;
}
.mini-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: rgba(139,92,246,0.4);
    border: 3px solid #1a1033;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: white;
    margin-left: -8px;
}
.mini-avatar:first-child { margin-left: 0; }
.listener-count {
    color: rgba(255,255,255,0.5);
    font-size: 20px;
}
.actions {
    position: absolute;
    bottom: 50px; left: 50px; right: 50px;
    display: flex;
    gap: 20px;
}
.btn {
    flex: 1;
    padding: 22px;
    border-radius: 22px;
    font-size: 28px;
    font-weight: 700;
    font-family: 'Inter', sans-serif;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
}
.btn-dismiss {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.6);
    border: 2px solid rgba(255,255,255,0.1);
}
.btn-join {
    background: linear-gradient(135deg, #96c5b0 0%, #7ab89e 100%);
    color: #0a0a0a;
    font-weight: 800;
    box-shadow: 0 4px 20px rgba(150,197,176,0.35);
}
.headphones {
    width: 28px; height: 28px;
}
.timer-bar {
    position: absolute;
    bottom: 0; left: 0;
    width: 65%;
    height: 6px;
    background: linear-gradient(90deg, #96c5b0, #8B5CF6);
    border-radius: 0 0 40px 40px;
}
</style>
</head>
<body>
<div class="card">
    <div class="glow"></div>
    <div class="top-row">
        <div class="live-badge">
            <span class="live-dot"></span>
            LIVE NOW
        </div>
        ${logoSrc ? `<img src="${logoSrc}" class="logo" />` : ''}
    </div>
    <div class="body">
        <div class="room-name">${displayName}</div>
        <div class="invite-from">
            <div class="avatar">${hostInitial}</div>
            <div class="invite-text">${inviteLine}</div>
        </div>
        <div class="participants-row">
            <div class="mini-avatars">${miniAvatars}</div>
            <span class="listener-count">${listenerText}</span>
        </div>
    </div>
    <div class="actions">
        <div class="btn btn-dismiss">Not now</div>
        <div class="btn btn-join">
            <svg class="headphones" viewBox="0 0 30 30" fill="none">
                <path d="M5,22 C5,22 5,14 5,12 C5,5.5 10.5,0 17,0 C23.5,0 29,5.5 29,12 L29,22" stroke="#0a0a0a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
                <rect x="0" y="19" width="9" height="14" rx="4" fill="#0a0a0a"/>
                <rect x="25" y="19" width="9" height="14" rx="4" fill="#0a0a0a"/>
            </svg>
            Join
        </div>
    </div>
    <div class="timer-bar"></div>
</div>
</body></html>`;

        const page = await browser.newPage();
        try {
            await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
            await page.setContent(html, { waitUntil: 'networkidle0', timeout: 8000 });
            await page.evaluate(() => document.fonts.ready);
            const imgBuffer = await page.screenshot({ type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: 1200, height: 630 } });
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.setHeader('CDN-Cache-Control', 'no-store');
            res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
            res.setHeader('Content-Length', imgBuffer.length);
            res.send(imgBuffer);
        } finally {
            await page.close();
        }
    } catch (err) {
        console.error('OG image generation error:', err);
        res.status(500).send('Image generation failed');
    }
});

function escapeXml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Serve frontend files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
                res.setHeader('Cache-Control', 'no-cache, must-revalidate');
                res.setHeader('CDN-Cache-Control', 'no-store');
                res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
            } else if (filePath.endsWith('.html')) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('CDN-Cache-Control', 'no-store');
                res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
            }
        }
    }));
    
    app.get('*', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        res.sendFile(path.join(__dirname, 'index.html'));
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        message: process.env.NODE_ENV === 'production' 
            ? 'Something went wrong!' 
            : err.message 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Start server (only if not in test mode and not being imported)
if (process.env.NODE_ENV !== 'test' && !module.parent) {
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log('🔌 WebSocket signaling server active');
}); 
}

module.exports = { app, server, io };