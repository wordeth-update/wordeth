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
const crypto = require('crypto');
let puppeteer = null;

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught exception:', err.message, err.stack);
    setTimeout(() => process.exit(1), 1000);
});
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled rejection:', reason);
});
process.on('exit', (code) => {
    console.error('[EXIT] Process exiting with code:', code);
});
['SIGHUP', 'SIGUSR1', 'SIGUSR2', 'SIGPIPE'].forEach(sig => {
    process.on(sig, () => console.error('[SIGNAL]', sig, 'received'));
});
const { setupSignaling, getActiveRooms, setShuttingDown, joinRoomHTTP, waitForRoomsReady } = require('./routes/signaling');

const BUILD_ID = Date.now().toString(36);
console.log(`Build ID: ${BUILD_ID}`);

let ogLogoBase64 = '';
let ogBrowser = null;
let ogBrowserLaunching = null;
let ogBrowserCloseTimer = null;

(async () => {
    try {
        const logoPath = path.join(__dirname, 'public', 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            const buf = fs.readFileSync(logoPath);
            ogLogoBase64 = buf.toString('base64');
            console.log('OG logo cached for link previews');
        }
    } catch(e) {
        console.warn('Failed to cache OG logo:', e.message);
    }
    console.log('Puppeteer browser available on-demand for OG image generation');
})();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const lyricsRoutes = require('./routes/lyrics'); // Re-enabled with Genius API key
const merchRoutes = require('./routes/merch');
const adsRoutes = require('./routes/ads'); // Advertising system
const analyticsRoutes = require('./routes/analytics'); // Usage metrics
const partnerRoutes = require('./routes/partner'); // Label partner dashboards
const subscriptionRoutes = require('./routes/subscriptions'); // Subscription & plans
const creatorRoutes = require('./routes/creator'); // Independent artist/designer
const tournamentRoutes = require('./routes/tournaments'); // Verses Tournaments
const agoraRoutes = require('./routes/agora'); // Agora RTC token generation
const tokenRoutes = require('./routes/tokens'); // Token economy
const boostRoutes = require('./routes/boost'); // Token boost for replays
const ratingsRoutes = require('./routes/ratings'); // Room ratings
const replayRoutes = require('./routes/replays'); // Replay system
const stripeRoutes = require('./routes/stripe'); // Stripe payments
const messagesRoutes = require('./routes/messages'); // Direct messaging
const wagersRoutes = require('./routes/wagers'); // Token wagering
const audiobankRoutes = require('./routes/audiobank'); // Audio Bank API & admin
const { createWebhookHandler } = require('./routes/stripe');
const trackingMiddleware = require('./middleware/tracking'); // Event tracking

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['websocket'],
    allowUpgrades: false,
    pingTimeout: 60000,
    pingInterval: 25000,
    maxHttpBufferSize: 15e6,
    httpCompression: false,
    perMessageDeflate: false
});

setupSignaling(io);
app.set('io', io);

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://www.youtube.com", "https://s.ytimg.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://storage.googleapis.com", "https://download.agora.io", "https://js.stripe.com"],
            scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://www.youtube.com", "https://s.ytimg.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://storage.googleapis.com", "https://download.agora.io", "https://js.stripe.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:", "https:", "https://api.stripe.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://cdn.inksoft.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            frameSrc: ["https://stores.inksoft.com", "https://cdn.inksoft.com", "https://www.youtube.com", "https://youtube.com", "https://www.youtube-nocookie.com", "https://youtube-nocookie.com", "https://checkout.stripe.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

// Rate limiting — use real client IP behind Cloudflare/proxies
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: (req) => {
        return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        return req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
    }
});
app.use('/api/auth/signin', authLimiter);
app.use('/api/auth/signup', authLimiter);

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
        serverSelectionTimeoutMS: process.env.NODE_ENV === 'test' ? 2000 : 5000,
        maxPoolSize: 20,
        minPoolSize: 2,
    })
    .then(() => {
        if (process.env.NODE_ENV !== 'test') {
            console.log('✅ Connected to MongoDB Atlas');
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

const allowedOrigins = [
    'https://wordeth.com',
    'https://www.wordeth.com',
    process.env.CLIENT_URL,
    process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

// Stripe webhook route MUST be registered before express.json() — needs raw body
app.post('/api/stripe/webhook',
    express.raw({ type: 'application/json' }),
    createWebhookHandler(process.env.STRIPE_WEBHOOK_SECRET)
);

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

const _htmlCache = new Map();
app.use((req, res, next) => {
    const ext = path.extname(req.path);
    if (req.path.startsWith('/api/')) return next();
    if (ext === '.html' || req.path === '/') {
        const reqPath = req.path === '/' ? '/index.html' : req.path;
        if (_htmlCache.has(reqPath)) {
            res.setHeader('Content-Type', 'text/html');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('CDN-Cache-Control', 'no-store');
            res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
            res.setHeader('Pragma', 'no-cache');
            return res.send(_htmlCache.get(reqPath));
        }
        const filePath = path.join(__dirname, 'public', reqPath);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            fs.readFile(filePath, 'utf8', (err, raw) => {
                if (err) return next();
                const html = raw.replace(/(\.(js|css))\?v=\d+/g, `$1?v=${BUILD_ID}`);
                _htmlCache.set(reqPath, html);
                res.setHeader('Content-Type', 'text/html');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('CDN-Cache-Control', 'no-store');
                res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
                res.setHeader('Pragma', 'no-cache');
                return res.send(html);
            });
            return;
        }
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
        }
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
app.use('/api/ads', adsRoutes); // Advertising system
app.use('/api/analytics', analyticsRoutes); // Usage metrics & admin dashboard
app.use('/api/partner', partnerRoutes); // Label partner dashboards
app.use('/api/subscriptions', subscriptionRoutes); // Subscription & plans
app.use('/api/creator', creatorRoutes); // Independent artist/designer
app.use('/api/tournaments', tournamentRoutes); // Verses Tournaments
app.use('/api/agora', agoraRoutes); // Agora RTC tokens
app.use('/api/tokens', tokenRoutes); // Token economy
app.use('/api/boost', boostRoutes); // Token boost for replays
app.use('/api/ratings', ratingsRoutes); // Room ratings
app.use('/api/replays', replayRoutes); // Replay system
app.use('/api/stripe', stripeRoutes); // Stripe payments & checkout
app.use('/api/messages', messagesRoutes); // Direct messaging
app.use('/api/wagers', wagersRoutes); // Token wagering
app.use('/api/audiobank', audiobankRoutes); // Audio Bank API & admin
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(18);
    let id = '';
    for (let i = 0; i < 18; i++) {
        id += chars[bytes[i] % chars.length];
    }
    return id.slice(0, 8) + '_' + id.slice(8);
}

app.post('/api/rooms/create', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    await waitForRoomsReady();
    const roomId = generateRoomId();
    const { getRoomsMap } = require('./routes/signaling');
    const { saveRoom } = require('./services/redisClient');
    const now = Date.now();
    const roomsMap = getRoomsMap();
    const tokenPrice = parseInt(req.body?.tokenPrice, 10) || 0;
    const room = {
        id: roomId,
        name: req.body?.name || null,
        hostId: null,
        creatorUserId: null,
        participants: new Map(),
        karaokeEnabled: false,
        videoMode: 'off',
        activeVideos: new Set(),
        isLocked: false,
        stageAccess: 'invite-only',
        tokenPrice: Math.max(0, tokenPrice),
        createdAt: now,
        lastActivity: now,
        participantHistory: new Set(),
        peakParticipants: 0
    };
    roomsMap.set(roomId, room);
    saveRoom(roomId, room);
    console.log(`[Rooms API] Room pre-registered: ${roomId}`);
    res.json({ id: roomId });
});

app.post('/api/rooms/create-and-join', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    await waitForRoomsReady();
    const roomId = generateRoomId();
    const { getRoomsMap } = require('./routes/signaling');
    const { saveRoom } = require('./services/redisClient');
    const now = Date.now();
    const roomsMap = getRoomsMap();
    const { name, userId, userName, avatar, tokenPrice: reqTokenPrice } = req.body;
    const tokenPrice = parseInt(reqTokenPrice, 10) || 0;
    const room = {
        id: roomId,
        name: name || null,
        hostId: userId || null,
        creatorUserId: userId || null,
        participants: new Map(),
        karaokeEnabled: false,
        videoMode: 'off',
        activeVideos: new Set(),
        isLocked: false,
        stageAccess: 'invite-only',
        tokenPrice: Math.max(0, tokenPrice),
        createdAt: now,
        lastActivity: now,
        participantHistory: new Set(),
        peakParticipants: 0
    };
    roomsMap.set(roomId, room);
    try {
        const joinResult = await joinRoomHTTP({ roomId, userId, userName, isHost: true, roomName: name, avatar });
        saveRoom(roomId, room).catch(e => console.warn('[Rooms API] saveRoom error:', e.message));
        console.log(`[Rooms API] Room created+joined in one step: ${roomId}`);
        res.json({ id: roomId, joined: true, ...joinResult });
    } catch (err) {
        roomsMap.delete(roomId);
        console.error(`[Rooms API] Create+join error for ${roomId}, room cleaned up:`, err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/rooms/join', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const { roomId, userId, userName, isHost, roomName, avatar } = req.body;
    console.log(`[Rooms API] HTTP join request: roomId=${roomId}, userName=${userName}, isHost=${isHost}`);
    try {
        const result = await joinRoomHTTP({ roomId, userId, userName, isHost, roomName, avatar });
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (err) {
        console.error('[Rooms API] HTTP join error:', err);
        res.status(500).json({ success: false, message: 'Server error joining room' });
    }
});

app.get('/api/rooms/active', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    await waitForRoomsReady();
    const rooms = getActiveRooms();
    console.log(`[Rooms API] Active rooms: ${rooms.length} rooms`);
    res.json(rooms);
});

app.get('/api/rooms/debug/:roomId', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const activeRooms = getActiveRooms();
    const room = activeRooms.find(r => r.id === req.params.roomId);
    let redisExists = false;
    try {
        const { loadRoom } = require('./services/redisClient');
        const redisRoom = await loadRoom(req.params.roomId);
        redisExists = !!redisRoom;
    } catch (e) { }
    const io = req.app.get('io');
    const socketCount = io ? io.engine.clientsCount : 'unknown';
    res.json({
        roomId: req.params.roomId,
        inMemory: !!room,
        inRedis: redisExists,
        participantCount: room ? room.participantCount : 0,
        totalActiveRooms: activeRooms.length,
        connectedSockets: socketCount,
        serverUptime: Math.floor(process.uptime())
    });
});

app.get('/api/rooms/:roomId', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    const activeRooms = getActiveRooms();
    let room = activeRooms.find(r => r.id === req.params.roomId);
    if (!room) {
        const query = req.params.roomId.toLowerCase().trim();
        room = activeRooms.find(r => r.name && r.name.toLowerCase().trim() === query);
    }
    if (!room) {
        console.log(`[Rooms API] Room ${req.params.roomId} not found. Active rooms: ${activeRooms.map(r => r.id).join(', ') || 'none'}`);
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

    const queryName = req.query.name || '';
    const queryHost = req.query.host || '';
    const roomName = escapeHtml(room?.name || queryName || 'a Live Verse');
    const participantCount = room?.participantCount || 0;
    const hostName = room?.participants?.find(p => p.isHost)?.userName || queryHost || '';
    const description = escapeHtml(hostName
        ? `${hostName} is live on Wordeth${participantCount > 1 ? ` with ${participantCount - 1} other${participantCount > 2 ? 's' : ''}` : ''}. Tap to join the conversation.`
        : `A live audio room on Wordeth${participantCount > 0 ? ` with ${participantCount} listener${participantCount > 1 ? 's' : ''}` : ''}. Tap to join.`);

    const baseUrl = req.get('x-forwarded-proto') 
        ? `${req.get('x-forwarded-proto')}://${req.get('host')}`
        : `${req.protocol}://${req.get('host')}`;
    const ogImageUrl = `${baseUrl}/og-image/${encodeURIComponent(roomId)}?name=${encodeURIComponent(queryName)}&host=${encodeURIComponent(queryHost)}`;
    const joinUrl = `${baseUrl}/verses.html?room=${encodeURIComponent(roomId)}`;

    const ua = (req.get('user-agent') || '').toLowerCase();
    const isCrawler = /bot|crawl|spider|preview|fetch|facebookexternalhit|twitterbot|whatsapp|telegram|slack|discord|imessagebot|applebot|linkedinbot|skype|viber|line\/|cfnetwork|dataprovider|urlpreview|embedly|quora|outbrain|pinterest|tumblr|vkshare|w3c_validator/i.test(ua);

    if (!isCrawler) {
        res.setHeader('Cache-Control', 'no-store, no-cache');
        res.setHeader('CDN-Cache-Control', 'no-store');
        res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
        const qs = new URLSearchParams();
        qs.set('room', roomId);
        if (req.query.name) qs.set('name', req.query.name);
        if (req.query.host) qs.set('host', req.query.host);
        return res.redirect(302, `/verses.html?${qs.toString()}`);
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

app.get('/join/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    const name = req.query.name || '';
    const host = req.query.host || '';
    const qs = new URLSearchParams();
    qs.set('room', roomId);
    if (name) qs.set('name', name);
    if (host) qs.set('host', host);
    res.redirect(302, `/verses.html?${qs.toString()}`);
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
        if (!puppeteer) puppeteer = require('puppeteer');
        ogBrowser = await puppeteer.launch(launchOpts);
        console.log('Puppeteer browser (re)launched');
        scheduleOgBrowserClose();
        return ogBrowser;
    })().finally(() => { ogBrowserLaunching = null; });
    return ogBrowserLaunching;
}

function scheduleOgBrowserClose() {
    if (ogBrowserCloseTimer) clearTimeout(ogBrowserCloseTimer);
    ogBrowserCloseTimer = setTimeout(async () => {
        if (ogBrowser) {
            try { await ogBrowser.close(); } catch(e) {}
            ogBrowser = null;
            console.log('Puppeteer browser closed (idle timeout)');
        }
    }, 60000);
}

app.get('/og-image/:roomId', ogCrawlerHeaders, async (req, res) => {
    try {
        if (ogBrowserCloseTimer) clearTimeout(ogBrowserCloseTimer);
        const browser = await ensureOgBrowser();

        const roomId = req.params.roomId;
        const activeRooms = getActiveRooms();
        const room = activeRooms.find(r => r.id === roomId);

        const queryName = req.query.name || '';
        const queryHost = req.query.host || '';
        const roomName = room?.name || queryName || 'Live Verse';
        const participantCount = room?.participantCount || 0;
        const participants = room?.participants || [];
        const hostName = participants.find(p => p.isHost)?.userName || queryHost || '';
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
    background: #060409;
    overflow: hidden;
}
.card {
    position: absolute;
    top: 20px; left: 40px;
    width: 1120px; height: 590px;
    border-radius: 40px;
    background: linear-gradient(160deg, #080612 0%, #100b20 40%, #080612 100%);
    box-shadow: 0 8px 40px rgba(0,0,0,0.8), 0 0 40px rgba(139,92,246,0.08);
    overflow: hidden;
}
.glow {
    position: absolute; top: -50%; right: -50%;
    width: 200%; height: 200%;
    background: radial-gradient(circle at 70% 30%, rgba(150,197,176,0.04) 0%, transparent 50%),
                radial-gradient(circle at 30% 70%, rgba(139,92,246,0.06) 0%, transparent 50%);
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
    filter: drop-shadow(0 0 12px rgba(150,197,176,0.3)) drop-shadow(0 0 24px rgba(139,92,246,0.15));
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
    border: 3px solid #100b20;
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
    } finally {
        scheduleOgBrowserClose();
    }
});

function escapeXml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

app.get('*', (req, res) => {
    if (req.path.includes('.')) {
        return res.status(404).send('Not found');
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
    console.log(`[404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found' });
});

// Start server (only if not in test mode and not being imported)
if (process.env.NODE_ENV !== 'test' && require.main === module) {
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    console.log('🔌 WebSocket signaling server active');
}); 
}

['SIGTERM', 'SIGINT'].forEach(signal => {
    process.on(signal, () => {
        console.log(`\n${signal} received — shutting down gracefully`);
        setShuttingDown();
        setTimeout(() => {
            server.close(() => {
                console.log('Server closed');
                process.exit(0);
            });
        }, 500);
        setTimeout(() => process.exit(0), 5000);
    });
});

module.exports = { app, server, io };