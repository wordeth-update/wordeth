# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform designed to build an interactive community around music. It offers features such as lyric exploration (with karaoke mode), live audio discussion rooms ("Verses"), custom music-related merchandise ordering, and social networking for music enthusiasts. The platform also incorporates a self-serve advertising system, usage analytics, and tools for privacy and compliance. The business vision is to create a vibrant ecosystem for music interaction, fostering connections and engagement among users while providing artists and labels with new avenues for promotion and revenue.

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
- **API Routes**: Modularized routes for authentication, user management, lyrics, merchandise, advertising, analytics, label partner dashboards, and audio room information.
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

### Plans & Pricing / Subscription Management
- **Pricing page** (`pricing.html`): Public-facing page with category tabs (Fans, Designers, Artists, Labels), monthly/yearly billing toggle, plan cards with feature lists, and subscribe buttons.
- **Subscription management page** (`subscription.html`): Authenticated page showing current plan details, billing status, entitlements display, graduation progress for free-tier designers, available plan comparison, upgrade/downgrade/cancel flows with confirmation modal.
- **Navigation**: "Pricing" link added to all user-facing page navs (desktop + mobile). Logged-in users see "My Plan" link in auth area.
- **Creator dashboard integration**: Upgrade buttons on creator dashboard redirect to pricing page.

### Persistent Mini-Player & SPA Router
- **Mini-Player** (`js/verse-mini-player.js`, `css/mini-player.css`): Floating bar at the bottom of every page that appears when a user is in a Verses audio room. Shows room name, live indicator, mute toggle, return-to-room button, and leave button. Keeps audio connection alive across page navigations.
- **SPA Router** (`js/spa-router.js`): Lightweight router that intercepts internal link clicks ONLY when a user is in an active audio room. Fetches page content via `fetch()`, swaps the `<main>` element content without full page reload, manages page-specific stylesheets/scripts, and updates browser history. Partner/admin pages are excluded from SPA routing.
- **Verses Detach/Reattach**: `AudioRoomsManager` in `js/verses.js` has `detachFromDOM()` and `reattachToDOM()` methods that separate WebRTC/Socket.io connection state from DOM elements, allowing the audio connection to survive page swaps.
- **Normal Navigation**: When NOT in a room, all links work as standard page loads (no SPA behavior).

### Key Features Architecture
- **Verses (Audio Rooms)**: Utilizes WebRTC peer-to-peer audio via a Socket.io signaling server. Features Web Audio API for voice filters and audio mixing (microphone + YouTube), and YouTube embed integration for karaoke. Supports WebRTC broadcasting of video with filters and AR genre face filters using MediaPipe Face Landmarker. Allows streaming of local audio files into the room mix. Hosts can kick participants (move to crowd or remove entirely) via a three-dot menu on participant avatars.
- **Native Screen Capture Plugin**: Custom Capacitor plugin for Android (MediaProjection API) and iOS (ReplayKit) to capture and stream screen content to WebRTC peers via a JavaScript bridge.
- **Lyrics**: Server-side search integrating with the Genius API and several fallback sources.
- **Advertising**: Contextual keyword-based ads with a self-serve portal (`ad-portal.html`), ad documentation (`ad-docs.html`), advertiser registration (`ad-register.html`), admin approval, and tracking.
- **Trending Topics**: "Trending This Week" horizontal bar on the Verses page showing conversation starters (Hot/New/Viral topics) to spark discussion in rooms.
- **Usage Analytics**: Event tracking middleware logs API usage, visualized in an admin dashboard.
- **Cookie Consent**: Client-side banner with localStorage persistence.
- **Label Partner Dashboard**: Features separate JWT authentication for partners, providing overviews of revenue, earnings, artist breakdowns, SKU performance, geographic sales heatmaps (Leaflet.js), and shareable dashboard links with granular permissions.

## External Dependencies

- **NPM Packages (Runtime)**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @aws-sdk/client-s3, puppeteer.
- **External APIs & Services**: Genius API, Musixmatch API, LRCLIB/Lyrics.ovh (lyrics sources), YouTube (audio/video playback), MongoDB (primary database), AWS S3 (historical data archival), InkSoft (merchandise store integration via iframes), Google Fonts, Font Awesome, Google STUN servers (WebRTC connectivity).