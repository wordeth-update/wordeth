# Wordeth - Social Music Experience Platform

## Overview
Wordeth is a social music experience platform that allows users to:
- Search and view song lyrics (powered by Genius API)
- Join live audio discussions about music (Twitter Spaces / Clubhouse style)
- Customize and order merchandise
- Read and discuss music articles
- Connect with other music enthusiasts

## Current State
The application is fully functional and ready for use. It runs on Node.js with Express.js backend.

## Recent Changes (February 2026)
- **MAJOR PIVOT**: Converted from video rooms to audio rooms (Twitter Spaces / Clubhouse style)
- Renamed video-rooms.html to audio-rooms.html with new audio-focused UI
- Updated all navigation across the site to reference Audio Rooms
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
  - Search for songs using Genius API integration
  - Dual lyrics API: LRCLIB (synced) + Lyrics.ovh (fallback)
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
- `audio-rooms.html` - Live audio discussion rooms (Twitter Spaces style)
- `merch.html` - Merchandise customizer
- `articles.html` - Music articles
- `signin.html` - Authentication page

### Assets
- `css/` - Stylesheets (audio-rooms.css, enhanced.css, styles.css)
- `js/` - Frontend JavaScript (audio-rooms.js)
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
- `GENIUS_ACCESS_TOKEN` - For lyrics search (configured)
- `MONGODB_URI_PROD` - MongoDB Atlas connection
- Social OAuth credentials (Twitter, Instagram, Facebook)

## Running the Application
The server runs automatically via the "Wordeth Server" workflow on port 5000.

## User Preferences
- Audio rooms preferred over video rooms (Twitter Spaces / Clubhouse style)

## Notes
- Currently runs in demo mode without MongoDB (uses in-memory storage)
- To enable full database features, configure MongoDB Atlas
- Lyrics search requires Genius API token for full functionality (now configured)
