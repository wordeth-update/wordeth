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
  - 6 video filters: None, B&W, Vintage, Vivid, Psychedelic, Soft focus
  - Mirror effect for natural selfie view
  - Animated hue-rotate effect for psychedelic filter
  - Visual indicator on control button when filter is active
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

### Frontend (Static HTML/CSS/JS)
- `index.html` - Main landing page
- `lyrics.html` - Lyrics search interface
- `verses.html` - Live audio discussion rooms called "Verses" (Twitter Spaces style)
- `merch.html` - Merchandise customizer
- `articles.html` - Music articles
- `signin.html` - Authentication page
- `signup.html` - User registration page

### Assets
- `css/` - Stylesheets (verses.css, enhanced.css, styles.css)
- `js/` - Frontend JavaScript (verses.js)
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
