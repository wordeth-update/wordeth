# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform designed to build an interactive community around music. It offers features such as lyric exploration (with karaoke mode), live audio discussion rooms ("Verses"), custom music-related merchandise ordering, curated music articles, and social networking for music enthusiasts. The platform also incorporates a self-serve advertising system, usage analytics, and tools for privacy and compliance. The business vision is to create a vibrant ecosystem for music interaction, fostering connections and engagement among users while providing artists and labels with new avenues for promotion and revenue.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript (no frontend framework).
- **Styling**: Uses CSS custom properties for theming with a dark color scheme (black/purple/mint palette) and multiple CSS files split by feature.
- **JS Architecture**: Page-specific JavaScript files, loading scripts directly without a bundler. Uses classes for complex page managers.
- **Design**: Mobile-responsive with a hamburger menu. Utilizes Google Fonts (Inter, Poppins) and Font Awesome icons.

### Backend
- **Technology**: Node.js with Express.js for the HTTP server and Socket.io for real-time WebSockets.
- **Server Architecture**: HTTP server integrates with Express, and Socket.io manages real-time connections.
- **API Routes**: Modularized routes for authentication, user management, lyrics, merchandise, articles, advertising, analytics, label partner dashboards, and audio room information.
- **WebSocket Signaling**: Handles room management (join/leave, host transfer), WebRTC signaling (offer/answer/ICE candidate relay), room events (chat, karaoke, screen share), and a real-time invite system with global notifications.
- **Middleware**: Includes JWT authentication, partner authentication, and automatic usage event tracking.
- **Security**: Implements Helmet for CSP, express-rate-limit, CORS, and trusts proxies for deployment environments.

### Database
- **Technology**: MongoDB with Mongoose ODM.
- **Models**: Includes models for Users, Advertisements, Advertisers, Usage Events, Labels, Partner Users, Merch Sales, Dashboard Shares, Subscription Plans, Subscriptions, and an immutable Events Ledger for financial tracking.

### Authentication
- Uses JWT tokens (7-day expiry) stored client-side in localStorage.
- Employs bcrypt for password hashing for users, advertisers, and partner accounts.
- Features separate authentication flows for regular users, advertisers, and label partners.
- Includes a token verification middleware for loading user data.

### Subscription & Entitlement System
- **Configuration-driven plans**: Stored in MongoDB, allowing flexible pricing tiers (Fans, Designers, Artists, Labels) with various features.
- **Entitlements engine**: Dynamically derives user capabilities based on their plan and any overrides.
- **RBAC middleware**: Enforces access control using `requireRole()`, `requireAccountType()`, and `loadEntitlements()`.
- **User Model Extensions**: Incorporates roles, account types, subscription details, and creator profiles.
- **Payment Processing**: Natively built billing engine for subscriptions, invoices, and payment tracking, with an integrated payment gateway. Applies a platform fee (8-12%) on Gross Merchandise Volume (GMV).

### Key Features Architecture
- **Verses (Audio Rooms)**: Utilizes WebRTC peer-to-peer audio via a Socket.io signaling server. Features Web Audio API for voice filters and audio mixing (microphone + YouTube), and YouTube embed integration for karaoke. Supports WebRTC broadcasting of video with filters and AR genre face filters using MediaPipe Face Landmarker. Allows streaming of local audio files into the room mix.
- **Native Screen Capture Plugin**: Custom Capacitor plugin for Android (MediaProjection API) and iOS (ReplayKit) to capture and stream screen content to WebRTC peers via a JavaScript bridge.
- **Lyrics**: Server-side search integrating with the Genius API and several fallback sources.
- **Advertising**: Contextual keyword-based ads with a self-serve portal, admin approval, and tracking.
- **Usage Analytics**: Event tracking middleware logs API usage, visualized in an admin dashboard.
- **Cookie Consent**: Client-side banner with localStorage persistence.
- **Label Partner Dashboard**: Features separate JWT authentication for partners, providing overviews of revenue, earnings, artist breakdowns, SKU performance, geographic sales heatmaps (Leaflet.js), and shareable dashboard links with granular permissions.

## External Dependencies

- **NPM Packages (Runtime)**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @aws-sdk/client-s3, puppeteer.
- **External APIs & Services**: Genius API, Musixmatch API, LRCLIB/Lyrics.ovh (lyrics sources), YouTube (audio/video playback), MongoDB (primary database), AWS S3 (historical data archival), InkSoft (merchandise store integration via iframes), Google Fonts, Font Awesome, Google STUN servers (WebRTC connectivity).