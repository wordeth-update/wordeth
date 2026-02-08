require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sharp = require('sharp');
const fs = require('fs');
const { setupSignaling, getActiveRooms } = require('./routes/signaling');

let ogLogoBase64 = '';
(async () => {
    try {
        const logoPath = path.join(__dirname, 'images', 'logo.png');
        if (fs.existsSync(logoPath)) {
            const buf = await sharp(logoPath).resize(240, 240, { fit: 'inside' }).png().toBuffer();
            ogLogoBase64 = buf.toString('base64');
            console.log('OG logo cached for link previews');
        } else {
            console.warn('OG logo not found at images/logo.png - link previews will render without logo');
        }
    } catch(e) {
        console.warn('Failed to cache OG logo:', e.message);
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
const trackingMiddleware = require('./middleware/tracking'); // Event tracking

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true },
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: 15e6
});

setupSignaling(io);

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://cdn.inksoft.com", "https://stores.inksoft.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.inksoft.com", "https://stores.inksoft.com", "https://www.youtube.com", "https://s.ytimg.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "ws:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https://cdn.inksoft.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "blob:"],
            workerSrc: ["'self'", "blob:", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            frameSrc: ["https://stores.inksoft.com", "https://cdn.inksoft.com", "https://www.youtube.com", "https://youtube.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
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

// Serve static files with cache control
app.use(express.static(path.join(__dirname), {
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
app.get('/api/rooms/active', (req, res) => {
    res.json(getActiveRooms());
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
    const isCrawler = /bot|crawl|spider|preview|fetch|facebookexternalhit|twitterbot|whatsapp|telegram|slack|discord|imessagebot|applebot|linkedinbot|skype|viber|line\//i.test(ua);

    if (!isCrawler) {
        res.setHeader('Cache-Control', 'no-store, no-cache');
        return res.redirect(302, joinUrl);
    }

    res.setHeader('Cache-Control', 'no-cache');
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
    <meta property="og:image:type" content="image/png">
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

// Dynamic OG image as PNG (matches the invite card design)
app.get('/og-image/:roomId', ogCrawlerHeaders, async (req, res) => {
    try {
        const roomId = req.params.roomId;
        const activeRooms = getActiveRooms();
        const room = activeRooms.find(r => r.id === roomId);

        const roomName = room?.name || 'Live Verse';
        const participantCount = room?.participantCount || 0;
        const hostName = room?.participants?.find(p => p.isHost)?.userName || '';
        const displayName = escapeXml(roomName.length > 30 ? roomName.substring(0, 30) + '...' : roomName);
        const hostInitial = hostName ? escapeXml(hostName.charAt(0).toUpperCase()) : 'W';
        const inviteLine = hostName
            ? escapeXml(hostName) + ' invited you'
            : 'You&#39;re invited';
        const listenerText = participantCount > 0
            ? participantCount + ' listening now'
            : 'Be the first to join';

        const logoImg = ogLogoBase64
            ? `<image x="880" y="50" width="210" height="210" href="data:image/png;base64,${ogLogoBase64}" opacity="0.95"/>`
            : '';

        const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a1033"/>
      <stop offset="40%" stop-color="#2d1b69"/>
      <stop offset="100%" stop-color="#1a1033"/>
    </linearGradient>
    <linearGradient id="roomGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#96c5b0"/>
      <stop offset="40%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#c4b5fd"/>
    </linearGradient>
    <linearGradient id="joinGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#96c5b0"/>
      <stop offset="100%" stop-color="#7ab89e"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8B5CF6"/>
      <stop offset="100%" stop-color="#6D28D9"/>
    </linearGradient>
    <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#96c5b0"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="15" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="shadow">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000" flood-opacity="0.5"/>
      <feDropShadow dx="0" dy="0" stdDeviation="35" flood-color="#8B5CF6" flood-opacity="0.2"/>
    </filter>
    <clipPath id="clip"><rect x="40" y="20" width="1120" height="590" rx="40"/></clipPath>
  </defs>

  <rect width="1200" height="630" fill="#0a0a12"/>

  <rect x="40" y="20" width="1120" height="590" rx="40" fill="url(#bg)" filter="url(#shadow)"/>

  <g clip-path="url(#clip)">
    <circle cx="950" cy="80" r="320" fill="#96c5b0" opacity="0.07"/>
    <circle cx="200" cy="520" r="300" fill="#8B5CF6" opacity="0.09"/>
  </g>

  <rect x="100" y="70" width="230" height="58" rx="29" fill="#96c5b0" fill-opacity="0.18" stroke="#96c5b0" stroke-opacity="0.5" stroke-width="2"/>
  <circle cx="138" cy="99" r="9" fill="#96c5b0"/>
  <text x="162" y="110" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" fill="#96c5b0" letter-spacing="2.5">LIVE NOW</text>

  <g filter="url(#glow)">
    ${logoImg}
  </g>

  <text x="100" y="265" font-family="Arial,Helvetica,sans-serif" font-size="78" font-weight="900" fill="url(#roomGrad)">${displayName}</text>

  <circle cx="130" cy="340" r="30" fill="url(#avatarGrad)"/>
  <text x="130" y="350" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="white" text-anchor="middle">${hostInitial}</text>
  <text x="172" y="350" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="rgba(255,255,255,0.9)" font-weight="700">${inviteLine}</text>

  <rect x="100" y="430" width="290" height="76" rx="22" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
  <text x="245" y="478" font-family="Arial,Helvetica,sans-serif" font-size="30" font-weight="700" fill="rgba(255,255,255,0.6)" text-anchor="middle">Not now</text>

  <rect x="420" y="430" width="340" height="76" rx="22" fill="url(#joinGrad)"/>
  <g transform="translate(478, 450)">
    <path d="M5,20 C5,20 5,12 5,10 C5,4.5 9.5,0 15,0 C20.5,0 25,4.5 25,10 L25,20" stroke="#0a0a0a" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <rect x="0" y="17" width="8" height="13" rx="3" fill="#0a0a0a"/>
    <rect x="22" y="17" width="8" height="13" rx="3" fill="#0a0a0a"/>
  </g>
  <text x="525" y="478" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800" fill="#0a0a0a">Join</text>

  <rect x="40" y="600" width="1120" height="10" fill="rgba(0,0,0,0.4)"/>
  <rect x="40" y="600" width="730" height="10" fill="url(#timerGrad)" opacity="0.6"/>
</svg>`;

        const pngBuffer = await sharp(Buffer.from(svg))
            .png({ quality: 90 })
            .toBuffer();

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.setHeader('Content-Length', pngBuffer.length);
        res.send(pngBuffer);
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
    app.use(express.static(path.join(__dirname)));
    
    app.get('*', (req, res) => {
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