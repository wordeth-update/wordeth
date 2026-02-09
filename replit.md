# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform that creates an interactive community around music. It lets users search and explore song lyrics (with karaoke mode), participate in live audio discussion rooms called "Verses" (Twitter Spaces/Clubhouse style), customize and order music-related merchandise, read curated music articles, and connect with other music enthusiasts. The platform also includes a self-serve advertising system, usage analytics, and privacy/compliance tools.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript (no frontend framework)
- **Pages**: `index.html` (home), `verses.html` (audio rooms), `lyrics.html` (lyric search), `merch.html` (merchandise), `articles.html`, `signin.html`, `signup.html`, `profile.html`, plus admin pages for ads and analytics
- **Styling**: Multiple CSS files split by feature (`styles.css`, `enhanced.css`, `verses.css`, `lyrics.css`, `auth.css`, `profile.css`, `ads.css`, `advertising.css`, `animations.css`, `cookie-consent.css`, `legal.css`, `usage-metrics.css`). Uses CSS custom properties for theming with a dark color scheme (black/purple/mint palette).
- **JS Architecture**: Each page has its own JS file (e.g., `js/verses.js`, `js/lyrics.js`, `js/auth.js`, `js/profile.js`). No bundler — scripts are loaded directly. Classes are used for complex page managers (e.g., `AudioRoomsManager`, `ArticlesPageManager`, `AdPortal`).
- **Design**: Mobile-responsive with hamburger menu. Fonts from Google Fonts (Inter, Poppins). Icons from Font Awesome.

### Backend
- **Technology**: Node.js with Express.js (`server.js` is the entry point), Socket.io for WebSockets
- **Entry command**: `node server.js` (or `nodemon server.js` for dev)
- **Server architecture**: HTTP server wraps Express app, Socket.io attached for real-time WebSocket connections
- **API Routes**: Modular route files in `/routes/` directory:
  - `/api/auth` — signup, signin (JWT-based)
  - `/api/user` — profile management, avatar upload
  - `/api/lyrics` — lyric search (Genius API integration)
  - `/api/merch` — merchandise system
  - `/api/articles` — article content
  - `/api/ads` — advertising system (advertiser registration, ad CRUD, admin approval)
  - `/api/analytics` — usage metrics
  - `/api/partner` — label partner dashboards (auth, summary, artist drill-down, SKU views, geo heatmaps, shareable links)
  - `/api/rooms/active` — lists active audio rooms with participants
  - `/api/user/profile/:id` — public profile view (returns name, bio, avatar, stats)
- **WebSocket Signaling** (`routes/signaling.js`):
  - Room management: join/leave with participant tracking, host transfer on disconnect
  - WebRTC signaling: offer/answer/ICE candidate relay between peers
  - Room events: chat messages, karaoke state, screen share, permissions, mute status
  - Audio mix status: notifies room when a user is sharing YouTube audio
  - **Real-time invite system**: Global `connectedUsers` Map tracks userId→socketIds across all pages. `room-invite` event routes invites to target users with rate limiting (10/min). `register-user` event links authenticated users to their socket connections.
  - **Global notifications** (`js/notifications.js`): Loaded on all main pages, connects to Socket.io and registers the logged-in user. Receives `room-invite` events and shows slide-in notification with Join/Dismiss buttons. Auto-dismisses after 15 seconds.
- **Middleware**: 
  - `middleware/auth.js` — JWT authentication middleware
  - `middleware/partnerAuth.js` — JWT auth for label partners + share token validation
  - `middleware/tracking.js` — automatic usage event tracking based on route patterns
- **Security**: Helmet for CSP headers, express-rate-limit (100 req/15min), CORS, trust proxy enabled for Replit

### Database
- **Technology**: MongoDB with Mongoose ODM
- **Models** (in `/models/`):
  - `User.js` — user accounts with name, email, bcrypt-hashed password, bio, avatar, search history, following/followers, custom merch
  - `Ad.js` — advertisements with placement, size, keywords, status, impression/click tracking
  - `Advertiser.js` — advertiser accounts with bcrypt password, company info, account type, approval status
  - `AdApplication.js` — advertising registration applications
  - `UsageEvent.js` — analytics events with segment, event type, metadata, session tracking
  - `Label.js` — music label profiles with embedded artists array, revenue share percentage, status
  - `PartnerUser.js` — label partner login accounts with bcrypt password, role (owner/manager/viewer), linked to Label
  - `MerchSale.js` — merchandise sales records with SKU, product type, artist, song/album/lyrics references, geographic data (country/region/city/lat/lng), revenue share calculations
  - `DashboardShare.js` — shareable dashboard link tokens with scope (label/artist), expiry, permissions, access tracking
- **Connection**: MongoDB connection string expected in `MONGODB_URI` environment variable

### Authentication
- JWT tokens with 7-day expiry, stored in localStorage on client side
- bcrypt for password hashing (both User and Advertiser models)
- Separate auth flows for regular users (`/api/auth`) and advertisers (`/api/ads/advertisers`)
- Token verification middleware checks JWT and loads user from database

### Key Features Architecture
- **Verses (Audio Rooms)**: Real-time WebRTC peer-to-peer audio via Socket.io signaling server. Web Audio API for voice filters and audio mixing (mic + YouTube). YouTube embed integration for karaoke with "Share Audio" button that captures tab audio and mixes it into the outgoing WebRTC stream. MediaRecorder for performance recording. Mobile share modal with camera stream, photo share (up to 10MB), music file sharing, and native screen capture options.
  - **Karaoke Video Broadcasting**: All video filters (grayscale, sepia, saturate, hue-rotate, blur, beautify, bg-blur) are rendered through a canvas pipeline using `ctx.filter` / custom drawing, then broadcast via WebRTC using `canvas.captureStream(15)`. Camera starts and goes live immediately (no preview mode). `addVideoTrackToPeers()` handles WebRTC renegotiation. Concurrent renegotiations are serialized via `_videoRenegotiating` flag. Filter changes while live use `replaceTrack()` (no renegotiation needed). Voice filters and YouTube audio mix both flow through the same `localStream` audio pipeline.
  - **AR Genre Face Filters** (`js/ar-filters.js`): MediaPipe Face Landmarker (tasks-vision v0.10.14, pinned) loaded from CDN via ESM dynamic import with UMD script tag fallback, GPU→CPU fallback for real-time 478-point face landmark detection. Six genre-themed AR overlays using PNG overlay images (in `images/ar/`) rendered with `screen` blend mode (black backgrounds become transparent): Hip Hop (gold aviator sunglasses), Rock (KISS-style face paint), Pop (sparkly butterfly mask), EDM (neon LED rave visor), Jazz (gold Venetian masquerade mask), Ski Mask. Two generic overlay methods: `_drawOverlayOnEyes` (glasses/visors anchored to eye midpoint) and `_drawOverlayOnFace` (masks/face paint anchored to face center). PNG images loaded in parallel during init. Filters integrate into the same canvas pipeline as video filters — AR overlays are drawn on top of the video frame after `drawImage()`. The render loop reads `_activeCanvasFilter` on each frame so switching between AR filters is seamless without restarting the loop. Init uses shared promise pattern to handle concurrent activation requests.
  - **Music Streaming**: Users can play MP3, WAV, M4A, AAC, OGG, FLAC files from their device in audio rooms. Audio plays locally via `URL.createObjectURL()` and is fed into the WebRTC audio mix pipeline (same as YouTube audio sharing) so all room participants hear it live. No file uploads — zero server storage. `music-stream-status` socket event notifies room when someone starts/stops playing. Full player overlay with play/pause/seek/volume controls. Auto-parses filename for artist/title.
  - **Profile Pictures in Rooms**: Avatar URLs propagated through signaling server in join-room/participant-joined events. Rendered with onerror fallback to letter initials.
- **Native Screen Capture Plugin** (Custom Capacitor Plugin):
  - **Android** (`android/app/src/main/java/com/wordeth/app/screencapture/`): Kotlin plugin using MediaProjection API with foreground service (`ScreenCaptureService`), VirtualDisplay, ImageReader. Captures frames at configurable FPS, encodes as JPEG, sends base64 to JS via plugin events.
  - **iOS** (`ios/App/App/ScreenCapturePlugin.swift`): Swift plugin using ReplayKit `RPScreenRecorder.startCapture`. Processes `CMSampleBuffer` video frames, scales down, encodes as JPEG, sends base64 to JS.
  - **JS Bridge** (`js/native-screen-capture.js`): Receives native frames, renders on canvas, creates `MediaStream` via `canvas.captureStream()` for WebRTC peer connections. Auto-detects Capacitor native environment.
  - **Integration**: "Share Screen" option appears in mobile share modal only when running in Capacitor native app. Uses same WebRTC video track infrastructure as camera share.
- **Lyrics**: Server-side search via Genius API, with fallback sources (LRCLIB, Lyrics.ovh, Musixmatch)
- **Advertising**: Contextual keyword-based ads on lyrics pages, with self-serve portal, admin approval workflow, and impression/click tracking
- **Usage Analytics**: Event tracking middleware automatically logs API usage to MongoDB, with admin dashboard for visualization
- **Cookie Consent**: Client-side consent banner with localStorage persistence
- **Label Partner Dashboard** (`partner-login.html`, `partner-dashboard.html`):
  - Separate JWT auth for label partners (owner/manager/viewer roles)
  - Label-level overview with total revenue, earnings, orders, units sold
  - Monthly revenue trend charts (Chart.js line/bar graphs)
  - Artist breakdown with clickable drill-down to artist-specific views
  - Artist view: SKU performance, song/lyrics revenue (which lyrics are on which merch), geographic breakdown
  - Interactive geographic sales heatmap (Leaflet.js with CartoDB dark tiles, circle markers sized by revenue)
  - Shareable dashboard links with token-based auth, configurable scope (label/artist), expiry, and granular permissions
  - Date range filtering across all views
  - Seed script (`scripts/seedPartnerData.js`) for demo data with 3 labels, 12 artists, 1250+ sales records across 18 global cities

### Environment Variables Required
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — Secret for JWT signing
- `PORT` — Server port (defaults likely to 3000)
- `GENIUS_API_KEY` — For lyrics search functionality
- AWS credentials for S3 (historical data archival)

## External Dependencies

### NPM Packages (Runtime)
- **express** — Web framework
- **mongoose** — MongoDB ODM
- **bcryptjs** — Password hashing
- **jsonwebtoken** — JWT auth tokens
- **cors** — Cross-origin resource sharing
- **helmet** — Security headers
- **express-rate-limit** — API rate limiting
- **express-validator** — Request validation
- **dotenv** — Environment variable loading
- **axios** — HTTP client (for external API calls)
- **multer** — File upload handling (avatar images, 5MB limit)
- **@aws-sdk/client-s3** — AWS S3 for data archival
- **puppeteer** — HTML-to-image rendering for OG link preview cards (uses headless Chromium)

### NPM Packages (Dev)
- **nodemon** — Auto-restart during development
- **jest** — Testing framework
- **supertest** — HTTP assertion testing

### External APIs & Services
- **Genius API** — Primary lyrics search and song data
- **Musixmatch API** — Lyrics source (fallback/supplementary)
- **LRCLIB / Lyrics.ovh** — Fallback synchronized lyrics sources
- **YouTube** — Audio/video playback for karaoke feature
- **MongoDB** — Primary database (needs `MONGODB_URI`)
- **AWS S3** — Historical analytics data archival
- **InkSoft** — Merchandise store integration (iframes for artist stores)
- **Google Fonts** — Typography (Inter, Poppins)
- **Font Awesome** — Icon library (loaded from CDN)
- **Google STUN servers** — WebRTC connectivity (`stun:stun.l.google.com:19302`)