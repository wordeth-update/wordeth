# Wordeth - Social Music Experience Platform

## Overview
Wordeth is a social music experience platform that allows users to:
- Search and view song lyrics (powered by Musixmatch API)
- Join live audio discussions called "Verses" (Twitter Spaces / Clubhouse style)
- Customize and order merchandise
- Read and discuss music articles
- Connect with other music enthusiasts

## Current State
The application is fully functional and ready for use. It runs on Node.js with Express.js backend.

## Recent Changes (February 2026)
- **Usage Metrics System**: Admin dashboard for data-driven audience insights
  - Auto-tracking middleware captures events on all API routes (lyrics, merch, auth, articles)
  - Client-side tracking for Verses (join/leave with session duration)
  - Three core audience segments: Lyric Finders, Community Users, Apparel Creators/Buyers
  - Usage tiers (Low/Moderate/High/Hyper) based on 7-day rolling event counts
  - Genre propensity analysis from lyrics search patterns
  - Merch metrics: AOV, total revenue, conversion funnel, top products
  - Community metrics: room activity, top rooms, daily activity trends
  - Cross-segment engagement analysis
  - Admin dashboard (`admin-usage.html`) with SVG charts, donut charts, bar charts
  - MongoDB-backed with 90-day TTL auto-expiry on events
- **REBRANDING**: "Audio Rooms" renamed to "Verses" - con-verse, uni-verse, verse (lyrics)
- Renamed audio-rooms.html to verses.html with verse-themed UI
- Updated all navigation across the site to reference Verses
- Added speaker stage with animated speaking indicators
- Added listeners section with hand-raise functionality
- Configured server to bind to port 5000 for Replit compatibility
- Added trust proxy setting for rate limiting behind Replit proxy
- Updated Content Security Policy to allow Google Fonts
- Created SVG product images for merchandise customization
- Added navigation links to signin page
- Fixed CORS configuration for Replit proxy compatibility
- **UI Polish**: Improved layout flow across all pages - CSS grid layouts, aligned cards uniformly
- **Navigation Consistency**: Updated all desktop and mobile menus to use unified structure (Audio Rooms, Lyrics, Merch) with Sign In button
- **Enhanced CSS**: Added css/enhanced.css with modern typography (Inter/Poppins), smooth transitions, refined border-radius

### NEW FEATURES (February 2026)
- **Door Lock Feature**: Room hosts can lock/unlock rooms to prevent new participants from joining
  - Lock button in room header with visual state indicator
  - Enforcement check when joining rooms - locked rooms reject new joins
  - System chat messages notify participants of lock state changes
- **Karaoke Mode**: Members can perform mini karaoke sessions with scrolling lyrics
  - Search for songs using Musixmatch API integration
  - Multi-source lyrics: Musixmatch (primary) + LRCLIB (synced) + Lyrics.ovh (fallback)
  - YouTube audio integration for music playback during karaoke
  - Scrolling lyrics display with active line highlighting
  - Play/pause/restart controls synced with YouTube player
  - XSS-safe DOM-based rendering (no innerHTML for user data)
  - Artist name variations support (T.I., Jay-Z, 2Pac, A$AP, etc.)
  - **Host permission control**: Only room host/moderator can enable karaoke for participants
- **Audio Filters (Voice Effects)**: Fun voice transformation effects
  - Normal, Helium (high-pitched), Alien (robotic), Deep, Echo, Radio
  - Uses Web Audio API for real-time audio processing
  - Filters are routed to WebRTC stream for other participants to hear
  - Visual indicator on control button when filter is active
- **Screen Share**: Participants can share their screen with the room
  - Host permission control - only host can enable screen sharing
  - Full-width display area with stop button
  - Automatic cleanup when sharing is stopped
  - WebRTC integration for sharing with participants
- **Karaoke Video**: Video camera with filters for karaoke performances
  - Toggle camera on/off during karaoke sessions
  - 8 video filters: None, B&W, Vintage, Vivid, Psychedelic, Soft focus, Beautify (smooth skin), Background Blur
  - Canvas-based processing for Beautify and Background Blur with captureStream() broadcast at 15fps
  - Preview mode toggle: test filters locally before broadcasting to room participants
  - Mirror effect for natural selfie view
  - Animated hue-rotate effect for psychedelic filter
  - Visual indicator on control button when filter is active
  - Lyrics scroll speed controls (0.25x-3.0x) with +/- buttons
- **Lyrics-to-Merch Feature**: Highlight lyrics in modal → "Make Merch" button appears → redirects to merch store with lyrics pre-filled
- **Artist Merch Store**: InkSoft-powered merchandise store with:
  - Artist Garden: Featured artist cards for Music Artists, Designers, and Labels
  - Search/filter functionality for 100K+ artist partnerships
  - Direct InkSoft designer embed for immediate designing
  - Artist-specific designer loads when selecting an artist card
- **Advertising System**: Keyword-based contextual advertising for lyrics search page
  - Non-intrusive header/footer ad placements on search results
  - MongoDB-backed ad and advertiser storage
  - **Admin Panel** (`ad-admin.html`): Internal Wordeth sales team can:
    - Upload ads for clients with specific size requirements (728x90, 320x50)
    - Set up to 25 keywords per ad for targeting
    - Approve/reject pending ads from self-serve advertisers
    - View analytics (impressions, clicks, CTR)
    - Create admin accounts for team members
  - **Self-Serve Portal** (`ad-portal.html`): Business partners can:
    - Create advertiser accounts
    - Build and submit ads with keyword targeting
    - Monitor ad performance and pause/resume campaigns
  - **Documentation** (`ad-docs.html`): Comprehensive guide for advertisers
    - Ad sizes and specifications
    - Keyword targeting best practices
    - Content guidelines and policies
    - Approval process documentation

## Project Architecture

### Backend (Node.js/Express)
- `server.js` - Main Express server with security middleware
- `routes/` - API route handlers:
  - `auth.js` - User authentication (JWT + OAuth)
  - `user.js` - User profile management
  - `lyrics.js` - Genius API integration for lyrics
  - `articles.js` - Music articles API
  - `ads.js` - Advertising system
  - `merch.js` - Merchandise/InkSoft integration
  - `analytics.js` - Usage metrics & admin dashboard APIs
- `middleware/` - Express middleware:
  - `tracking.js` - Auto-captures usage events on API routes
- `models/` - Mongoose models:
  - `User.js` - User accounts
  - `Ad.js` - Advertisements
  - `Advertiser.js` - Advertiser accounts
  - `UsageEvent.js` - Usage tracking events (auto-expires after 90 days)

### Frontend (Static HTML/CSS/JS)
- `index.html` - Main landing page
- `lyrics.html` - Lyrics search interface
- `verses.html` - Live audio discussion rooms called "Verses" (Twitter Spaces style)
- `merch.html` - Merchandise customizer
- `articles.html` - Music articles
- `signin.html` - Authentication page
- `signup.html` - User registration page
- `admin-usage.html` - Usage metrics admin dashboard

### Assets
- `css/` - Stylesheets (verses.css, enhanced.css, styles.css, usage-metrics.css)
- `js/` - Frontend JavaScript (verses.js, admin-usage.js)
- `images/` - Logo and static images
- `assets/products/` - Product SVG images

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `GET /api/auth/verify` - Token verification
- OAuth routes for Twitter, Instagram, Facebook

### Lyrics
- `GET /api/lyrics/search?q={query}` - Search songs
- `GET /api/lyrics/song/:id` - Get song details
- `GET /api/lyrics/lyrics/:id` - Get lyrics content
- `GET /api/lyrics/trending` - Get trending songs

### Articles
- `GET /api/articles` - List articles
- `GET /api/articles/featured` - Featured articles
- `GET /api/articles/:id` - Single article

### User Profile
- `GET /api/user/profile` - Get user profile
- `POST /api/user/avatar` - Upload avatar
- User history, annotations, friends management

### Usage Metrics (Admin)
- `POST /api/analytics/track` - Client-side event tracking (public)
- `GET /api/analytics/admin/summary` - Platform overview (admin auth)
- `GET /api/analytics/admin/usage-tiers` - User engagement tiers (admin auth)
- `GET /api/analytics/admin/genre-propensity` - Genre preferences (admin auth)
- `GET /api/analytics/admin/merch-metrics` - Apparel/order metrics (admin auth)
- `GET /api/analytics/admin/community-metrics` - Verses/community metrics (admin auth)
- `GET /api/analytics/admin/segment-comparison` - Cross-segment analysis (admin auth)

## Environment Variables

### Required
- `JWT_SECRET` - Secret for JWT tokens (set)
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (development)

### Optional (for full features)
- `MUSIXMATCH_API_KEY` - For lyrics search (configured)
- `GENIUS_ACCESS_TOKEN` - For additional metadata (optional fallback)
- `MONGODB_URI_PROD` - MongoDB Atlas connection
- Social OAuth credentials (Twitter, Instagram, Facebook)

## Running the Application
The server runs automatically via the "Wordeth Server" workflow on port 5000.

## User Preferences
- Audio rooms preferred over video rooms (Twitter Spaces / Clubhouse style)

## Notes
- MongoDB Atlas connected and fully operational
- Lyrics search powered by Musixmatch API with LRCLIB/Lyrics.ovh fallbacks for synced lyrics
