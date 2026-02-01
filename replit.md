# Wordeth - Social Music Experience Platform

## Overview
Wordeth is a social music experience platform that allows users to:
- Search and view song lyrics (powered by Genius API)
- Join live video discussions about music
- Customize and order merchandise
- Read and discuss music articles
- Connect with other music enthusiasts

## Current State
The application is fully functional and ready for use. It runs on Node.js with Express.js backend.

## Recent Changes (February 2026)
- Configured server to bind to port 5000 for Replit compatibility
- Added trust proxy setting for rate limiting behind Replit proxy
- Updated Content Security Policy to allow Google Fonts
- Created SVG product images for merchandise customization
- Added navigation links to signin page
- Fixed CORS configuration for Replit proxy compatibility
- **UI Polish**: Improved layout flow across all pages - fixed floating cards in video-rooms hero to use proper CSS grid, aligned cards uniformly, consistent two-column hero layouts
- **Navigation Consistency**: Updated all desktop and mobile menus to use unified structure (Video Rooms, Lyrics, Merch) with Sign In button
- **Enhanced CSS**: Added css/enhanced.css with modern typography (Inter/Poppins), smooth transitions, refined border-radius, and better visual hierarchy

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
- `video-rooms.html` - Live video discussion rooms
- `merch.html` - Merchandise customizer
- `articles.html` - Music articles
- `signin.html` - Authentication page

### Assets
- `css/` - Stylesheets
- `js/` - Frontend JavaScript
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
- `GENIUS_ACCESS_TOKEN` - For lyrics search
- `MONGODB_URI_PROD` - MongoDB Atlas connection
- Social OAuth credentials (Twitter, Instagram, Facebook)

## Running the Application
The server runs automatically via the "Wordeth Server" workflow on port 5000.

## User Preferences
- None documented yet

## Notes
- Currently runs in demo mode without MongoDB (uses in-memory storage)
- To enable full database features, configure MongoDB Atlas
- Lyrics search requires Genius API token for full functionality
