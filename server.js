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
const { setupSignaling, getActiveRooms } = require('./routes/signaling');

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

// Rich link preview for room invites (Open Graph / SMS / iMessage / social cards)
app.get('/room/:roomId', (req, res) => {
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
    <meta http-equiv="refresh" content="1;url=${joinUrl}">
</head>
<body style="background:#1a1033;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;">
    <p>Joining room...</p>
    <script>window.location.href = "${joinUrl}";</script>
</body>
</html>`);
});

// Dynamic OG image as PNG (matches the invite card design)
app.get('/og-image/:roomId', async (req, res) => {
    try {
        const roomId = req.params.roomId;
        const activeRooms = getActiveRooms();
        const room = activeRooms.find(r => r.id === roomId);

        const roomName = room?.name || 'Live Verse';
        const participantCount = room?.participantCount || 0;
        const hostName = room?.participants?.find(p => p.isHost)?.userName || '';
        const displayName = escapeXml(roomName.length > 24 ? roomName.substring(0, 24) + '...' : roomName);
        const hostInitial = hostName ? escapeXml(hostName.charAt(0).toUpperCase()) : 'W';
        const inviteLine = hostName
            ? escapeXml(hostName) + ' invited you'
            : 'You&#39;re invited';
        const listenerText = participantCount > 0
            ? participantCount + ' listening now'
            : 'Be the first to join';

        const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1033"/>
      <stop offset="40%" style="stop-color:#2d1b69"/>
      <stop offset="100%" style="stop-color:#1a1033"/>
    </linearGradient>
    <linearGradient id="roomGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#96c5b0"/>
      <stop offset="40%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#c4b5fd"/>
    </linearGradient>
    <linearGradient id="joinBtnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#96c5b0"/>
      <stop offset="100%" style="stop-color:#7ab89e"/>
    </linearGradient>
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#553555"/>
      <stop offset="100%" style="stop-color:#5F0E82"/>
    </linearGradient>
    <linearGradient id="avatarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6"/>
      <stop offset="100%" style="stop-color:#6D28D9"/>
    </linearGradient>
    <filter id="logoGlow">
      <feGaussianBlur stdDeviation="8" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="cardShadow">
      <feDropShadow dx="0" dy="8" stdDeviation="20" flood-color="#000000" flood-opacity="0.5"/>
      <feDropShadow dx="0" dy="0" stdDeviation="30" flood-color="#8B5CF6" flood-opacity="0.2"/>
    </filter>
    <clipPath id="cardClip">
      <rect x="60" y="40" width="1080" height="550" rx="40"/>
    </clipPath>
  </defs>

  <!-- Full background -->
  <rect width="1200" height="630" fill="#0d0817"/>

  <!-- Card with rounded corners and shadow -->
  <rect x="60" y="40" width="1080" height="550" rx="40" fill="url(#cardBg)" filter="url(#cardShadow)"/>

  <!-- Glow effects inside card -->
  <g clip-path="url(#cardClip)">
    <circle cx="950" cy="120" r="280" fill="rgba(150,197,176,0.08)"/>
    <circle cx="200" cy="480" r="250" fill="rgba(139,92,246,0.1)"/>
    <circle cx="600" cy="300" r="350" fill="rgba(139,92,246,0.03)"/>
  </g>

  <!-- LIVE NOW badge (top-left) -->
  <rect x="110" y="85" width="190" height="50" rx="25" fill="rgba(150,197,176,0.15)" stroke="rgba(150,197,176,0.4)" stroke-width="1.5"/>
  <circle cx="145" cy="110" r="7" fill="#96c5b0"/>
  <text x="165" y="118" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700" fill="#96c5b0" letter-spacing="2">LIVE NOW</text>

  <!-- Wordeth W logo (top-right) with glow -->
  <g transform="translate(940, 65)" filter="url(#logoGlow)">
    <circle cx="55" cy="55" r="45" stroke="#96c5b0" stroke-width="3" fill="rgba(150,197,176,0.08)"/>
    <path d="M22,55 L33,30 L44,55 L55,30 L66,55 L77,30 L88,55" stroke="url(#logoGrad)" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- Room name in large gradient text -->
  <text x="110" y="235" font-family="Arial,Helvetica,sans-serif" font-size="62" font-weight="800" fill="url(#roomGrad)" letter-spacing="-0.5">${displayName}</text>

  <!-- Host avatar + invited text -->
  <circle cx="135" cy="305" r="24" fill="url(#avatarGrad)"/>
  <text x="125" y="313" font-family="Arial,Helvetica,sans-serif" font-size="18" font-weight="700" fill="white" text-anchor="middle">${hostInitial}</text>
  <text x="170" y="312" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="rgba(255,255,255,0.65)"><tspan fill="rgba(255,255,255,0.9)" font-weight="600">${inviteLine}</tspan></text>

  <!-- Listener count with dots -->
  <circle cx="118" cy="365" r="5" fill="rgba(139,92,246,0.5)"/>
  <circle cx="134" cy="365" r="5" fill="rgba(139,92,246,0.4)"/>
  <circle cx="150" cy="365" r="5" fill="rgba(139,92,246,0.3)"/>
  <text x="168" y="372" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="rgba(255,255,255,0.45)">${listenerText}</text>

  <!-- Action buttons -->
  <!-- Not now button -->
  <rect x="110" y="420" width="240" height="64" rx="20" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="1.5"/>
  <text x="230" y="460" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="rgba(255,255,255,0.55)" text-anchor="middle">Not now</text>

  <!-- Join button -->
  <rect x="380" y="420" width="280" height="64" rx="20" fill="url(#joinBtnGrad)"/>
  <!-- Headphone icon -->
  <g transform="translate(425, 438)">
    <path d="M4,16 C4,16 4,10 4,8 C4,3.6 7.6,0 12,0 C16.4,0 20,3.6 20,8 L20,16" stroke="#0a0a0a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <rect x="0" y="14" width="6" height="10" rx="2" fill="#0a0a0a"/>
    <rect x="18" y="14" width="6" height="10" rx="2" fill="#0a0a0a"/>
  </g>
  <text x="460" y="460" font-family="Arial,Helvetica,sans-serif" font-size="24" font-weight="700" fill="#0a0a0a">Join</text>

  <!-- Bottom gradient bar (timer bar style) -->
  <rect x="60" y="580" width="1080" height="10" rx="0 0 40 40" fill="rgba(0,0,0,0.3)"/>
  <rect x="60" y="580" width="1080" height="10" rx="0" fill="url(#roomGrad)" opacity="0.4"/>
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