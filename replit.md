# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform that creates an interactive community around music. It lets users search and explore song lyrics (with karaoke mode), participate in live audio discussion rooms called "Verses" (Twitter Spaces/Clubhouse style), customize and order music-related merchandise, read curated music articles, and connect with other music enthusiasts. The platform also includes a self-serve advertising system, usage analytics, and privacy/compliance tools.

## User Preferences

Preferred communication style: Simple, everyday language.

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
  - `/api/rooms/active` — lists active audio rooms with participants
- **WebSocket Signaling** (`routes/signaling.js`):
  - Room management: join/leave with participant tracking, host transfer on disconnect
  - WebRTC signaling: offer/answer/ICE candidate relay between peers
  - Room events: chat messages, karaoke state, screen share, permissions, mute status
  - Audio mix status: notifies room when a user is sharing YouTube audio
- **Middleware**: 
  - `middleware/auth.js` — JWT authentication middleware
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
- **Connection**: MongoDB connection string expected in `MONGODB_URI` environment variable

### Authentication
- JWT tokens with 7-day expiry, stored in localStorage on client side
- bcrypt for password hashing (both User and Advertiser models)
- Separate auth flows for regular users (`/api/auth`) and advertisers (`/api/ads/advertisers`)
- Token verification middleware checks JWT and loads user from database

### Key Features Architecture
- **Verses (Audio Rooms)**: Real-time WebRTC peer-to-peer audio via Socket.io signaling server. Web Audio API for voice filters and audio mixing (mic + YouTube). YouTube embed integration for karaoke with "Share Audio" button that captures tab audio and mixes it into the outgoing WebRTC stream. MediaRecorder for performance recording.
- **Lyrics**: Server-side search via Genius API, with fallback sources (LRCLIB, Lyrics.ovh, Musixmatch)
- **Advertising**: Contextual keyword-based ads on lyrics pages, with self-serve portal, admin approval workflow, and impression/click tracking
- **Usage Analytics**: Event tracking middleware automatically logs API usage to MongoDB, with admin dashboard for visualization
- **Cookie Consent**: Client-side consent banner with localStorage persistence

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