# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform focused on building an interactive community around music. It integrates features like lyric exploration (including karaoke), live audio discussion rooms ("Verses"), custom music merchandise ordering, and social networking. The platform aims to create a vibrant ecosystem for music interaction, fostering connections and engagement, while providing artists and labels with new promotional and revenue opportunities. Key capabilities include a self-serve advertising system, usage analytics, and robust privacy tools.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript, prioritizing mobile responsiveness.
- **Styling**: Uses CSS custom properties for theming with a dark color scheme (black/purple/mint palette) and multiple CSS files split by feature. Google Fonts and Font Awesome icons are utilized.
- **JS Architecture**: Page-specific JavaScript files loaded directly without a bundler, using classes for complex page managers.
- **Persistent Mini-Player**: A floating bar appears when a user is in a Verses audio room, maintaining audio connection across page navigations.
- **SPA Router**: Lightweight router intercepts internal link clicks only when an audio room is active, fetching and swapping page content without full reloads, excluding partner/admin pages.

### Backend
- **Technology**: Node.js with Express.js for HTTP and Socket.io for real-time WebSockets.
- **Server Architecture**: Modularized API routes cover authentication, user management, lyrics, merchandise, advertising, analytics, and audio room information.
- **WebSocket Signaling**: Manages room state, Agora UID mapping, room events (chat, karaoke, screen share), and real-time invites.
- **Agora Token Server**: Generates RTC tokens server-side for secure audio/video communication.
- **Middleware**: Includes JWT authentication, partner authentication, and automatic usage event tracking.
- **Security**: Implements Helmet for CSP, express-rate-limit, CORS, and trust proxies.

### Database
- **Technology**: MongoDB with Mongoose ODM.
- **Models**: Includes Users, Advertisements, Labels, Merch Sales, Subscription Plans, and an immutable Events Ledger for financial tracking.

### Redis
- **Purpose**: Persists live Verses audio room states to ensure rooms survive server restarts.
- **Mechanism**: Stores room data with a TTL and an index of active rooms. On boot, rooms are restored from Redis, maintaining state consistency.

### Authentication
- Uses JWT tokens (7-day expiry) stored client-side.
- Employs bcrypt for password hashing for users, advertisers, and partner accounts.
- Features separate authentication flows and a token verification middleware.

### Subscription & Entitlement System
- **Configuration-driven plans**: Stored in MongoDB, allowing flexible pricing tiers (Fans, Designers, Artists, Labels) with dynamic feature entitlements.
- **RBAC middleware**: Enforces access control based on roles and account types.
- **Payment Processing**: Natively built billing engine for subscriptions, invoices, and payment tracking with an integrated payment gateway.

### Payout & Revenue Share System
- **Centralized PayoutService**: Computes payout amounts and platform fees for all seller types, logging transactions to an Events Ledger.
- **Seller Types**: Supports Labels, Designers, and Independent Artists with configurable revenue shares.
- **Audit Trail**: Every sale generates detailed entries in the Events Ledger for transparency.

### Verses Tournaments System
- **Overview**: Competitive bracket-style tournaments for artists with fan voting, sponsorship placements, and leaderboards.
- **Models**: Comprehensive models for seasons, rounds, submissions, matches, votes (with anti-abuse), reactions, leaderboards, sponsors, and metric events.
- **API Routes**: Public endpoints for tournament data, artist submission, fan voting, and admin CRUD operations.
- **Frontend Pages**: Dedicated pages for tournament hub, round details, match voting, leaderboard, and admin management.
- **Nav Visibility**: Tournament navigation link visibility can be toggled by admins via a feature flag stored in site settings.

### Key Features Architecture
- **Verses (Audio Rooms)**: Uses Agora RTC SFU for scalable audio/video via Agora Web SDK, with Socket.io for room management. Supports server-side token generation, Web Audio API for filters, and dynamic role switching (listener/host). Includes listener-first stage access with promotion paths and multi-person video grid.
- **Lyrics**: Server-side search integrating with Musixmatch API and fallback sources.
- **Advertising**: Contextual keyword-based ads with a self-serve portal, admin approval, and tracking.
- **Trending Topics**: Displays conversation starters on the Verses page to encourage discussion.
- **Usage Analytics**: Event tracking middleware logs API usage for admin dashboards.
- **Label Partner Dashboard**: Provides partners with revenue overviews, artist breakdowns, sales heatmaps (Leaflet.js), and shareable dashboards with granular permissions.

### Production Readiness
- **XSS Hardening**: All user-generated content is sanitized using `escapeHtml()` before DOM insertion.
- **Public Profile**: `getPublicProfile()` strips sensitive user information.

## External Dependencies

- **NPM Packages**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @aws-sdk/client-s3, puppeteer, agora-access-token.
- **External APIs & Services**: Musixmatch API, LRCLIB/Lyrics.ovh (lyrics sources), YouTube, MongoDB, AWS S3, InkSoft (merchandise store integration), Google Fonts, Font Awesome, Agora RTC.