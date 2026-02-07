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
- **Historical Trends Archival System**: Long-term analytics storage via AWS S3
  - Aggregates raw events into compact daily JSON summaries before they expire
  - Stores summaries in AWS S3 (`wordeth-analytics/YYYY/MM/DD.json`)
  - Historical Trends tab in admin dashboard with month-over-month comparison charts
  - Stacked bar charts for monthly totals by segment
  - Archive controls: auto-archive (7+ days old) or archive today
  - Graceful handling when AWS not yet configured (shows setup instructions)
  - Services: `services/archiver.js` with aggregation and S3 read/write
  - Requires: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` secrets
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
- **Mic Tempo Sync**: Auto-adjusts lyrics scroll speed based on vocal activity
  - Uses Web Audio API AnalyserNode for real-time RMS energy detection
  - Smoothed exponential moving average for stable readings
  - Silence detection slows/pauses scrolling when singer pauses
  - Active singing speeds up scrolling proportionally to vocal energy
  - Visual energy meter shows mic input level
  - Manual speed +/- still works as 5-second override
  - Toggle on/off via mic button in karaoke controls
- **Performance Recording**: Record karaoke performances for social sharing (Voicey-style)
  - Canvas compositor combines camera video + lyrics overlay + Wordeth watermark
  - 720x1280 portrait format optimized for TikTok/Instagram Reels/YouTube Shorts
  - Real-time lyrics rendering with active line highlighting on recording
  - Mirror effect for camera, video filter support in recording
  - Wordeth branded footer bar on all recordings
  - Recording timer with red blinking indicator
  - MediaRecorder API with VP9/VP8+Opus codec fallback
  - Download as .webm with song-named filename
  - Preview playback before downloading
  - Promotes Wordeth branding on every shared performance
- **Lyrics-to-Merch Feature**: Highlight lyrics in modal → "Make Merch" button appears → redirects to merch store with lyrics pre-filled
- **Artist Merch Store**: InkSoft-powered merchandise store with:
  - Artist Garden: Featured artist cards for Music Artists, Designers, and Labels
  - Search/filter functionality for 100K+ artist partnerships
  - Direct InkSoft designer embed for immediate designing
  - Artist-specific designer loads when selecting an artist card
- **Advertising System**: Keyword-based contextual advertising for lyrics search page
  - Non-intrusive header/footer ad placements on search results
  - MongoDB-backed ad and advertiser storage
  - **Registration & Application System** (`ad-register.html`):
    - Two account types: Partner (White Glove) and Self-Serve (admin accounts are created internally by the team)
    - Comprehensive application questionnaire: business type, budget, campaign goals, target audience, genres, ad experience, timeline
    - All registrations require admin approval (routed to advertising@wordeth.com, 48-72 hour turnaround)
    - Success screen with next-steps timeline
  - **Admin Dashboard** (`ad-admin.html`): Higher-level internal Wordeth team dashboard, separate from advertiser portal:
    - Platform Overview with pending applications, active partners, ad stats, impressions/clicks
    - Partner Applications: Review, approve, or reject advertiser applications with full detail view
    - Partners tab: View and filter all advertising partners by status and type
    - Ad Oversight: Review, approve/reject all ads with status filters
    - Create Ad for managed (White Glove) clients
    - Settings: Create internal admin accounts for team members
    - Quick links to Usage Metrics and Privacy Admin dashboards
  - **Advertising Portal** (`ad-portal.html`): Partner-facing dashboard focused on ad operations:
    - Sign in (pending accounts see "under review" message)
    - My Ads: View, pause/resume active campaigns
    - Create Ad: Build and submit ads with keyword targeting
    - Account: View account information
  - **Documentation** (`ad-docs.html`): Comprehensive guide for advertisers
    - Ad sizes and specifications
    - Keyword targeting best practices
    - Content guidelines and policies
    - Approval process documentation
- **Privacy & Compliance System**:
  - Cookie consent banner on all pages (Accept All / Essential Only)
  - `js/cookie-consent.js` - Consent management with localStorage persistence, versioned consent
  - `css/cookie-consent.css` - Animated bottom banner styling
  - Terms of Service page (`terms.html`) - Version 1.0
  - Privacy Policy page (`privacy.html`) - Version 1.0, covers GDPR/CCPA rights
  - Signup requires explicit agreement to Terms & Privacy Policy (checkbox)
  - `agreedToTerms`, `termsAgreedAt`, `termsVersion` fields on User model
  - **Data Flush** (`POST /api/user/admin/flush`): Admin endpoint to permanently delete all user data (account, usage events, social connections, uploaded files)
  - **Self-Delete** (`DELETE /api/user/account`): Users can delete their own account and all associated data
  - **Privacy Admin Guide** (`privacy-admin.html`): Documentation page for admin team
    - Page/file location map for all privacy-related components
    - API endpoint reference table with auth requirements
    - Cookie consent explanation (how it works, version bumping)
    - Tracking & consent flow documentation
    - Terms enforcement details and stored data fields
    - Data flush scope (what gets deleted) with warnings
    - Step-by-step admin flush instructions (get token, call API, review response)
    - User self-delete documentation
    - Built-in Flush Tool: admin login + email input to flush user data directly from the page
    - Linked from Usage Metrics admin nav

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
