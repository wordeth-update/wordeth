# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform focused on building an interactive community around music. It integrates features like lyric exploration (including karaoke), live audio discussion rooms ("Verses"), custom music merchandise ordering, and social networking. The platform aims to create a vibrant ecosystem for music interaction, fostering connections and engagement, while providing artists and labels with new promotional and revenue opportunities. Key capabilities include a self-serve advertising system, usage analytics, and robust privacy tools.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript, prioritizing mobile responsiveness.
- **Styling**: Uses CSS custom properties (Design System v2) for theming with a dark color scheme (black/purple/mint palette). Core tokens in `styles.css`, enhanced UI overrides in `enhanced.css` (loaded on all public-facing pages). Feature-specific CSS files (verses, pricing, lyrics, tournaments, etc.) inherit from the design system. Google Fonts (Syne + Outfit) and Font Awesome icons are utilized.
- **Footer**: Compact single-line footer across all 14 public pages — logo + flat inline link groups (headings hidden, separated by `·`) + social icons on desktop; links wrap naturally on mobile. No accordion JS. Single `.site-footer` class.
- **JS Architecture**: Page-specific JavaScript files loaded directly without a bundler, using classes for complex page managers.
- **Persistent Mini-Player**: A floating bar appears when a user is in a Verses audio room, maintaining audio connection across page navigations.
- **SPA Router**: Lightweight router intercepts internal link clicks, fetching and swapping page content without full reloads, excluding partner/admin pages. Auto-closes mobile menu on navigation.

### Backend
- **Technology**: Node.js with Express.js for HTTP and Socket.io for real-time WebSockets.
- **Server Architecture**: Modularized API routes cover authentication, user management, lyrics, merchandise, advertising, analytics, and audio room information.
- **WebSocket Signaling**: Manages room state, Agora UID mapping, room events (chat, karaoke, screen share), and real-time invites.
- **Agora Token Server**: Generates RTC tokens server-side for secure audio/video communication.
- **Middleware**: Includes JWT authentication, partner authentication, and automatic usage event tracking.
- **Puppeteer (OG Images)**: Lazy-loaded on-demand for `/og-image/:roomId` endpoint. Browser auto-closes after 60s idle to conserve memory. Idle timer resets on each request.
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
- **Verses (Audio Rooms)**: Uses Agora RTC SDK in `rtc` mode (equal-peer) for scalable audio/video, with Socket.io for room management. Supports server-side token generation, Web Audio API for filters, and publish/unpublish for role transitions. Includes listener-first stage access with promotion paths and multi-person video grid. Full room UI CSS in `verses.css` covering: modals (create room, music share, add users, replay), room controls toolbar, chat section, host controls panel, shared audio player overlay, and responsive mobile layout.
  - **Agora Mode**: `rtc` mode — all users are equal peers with PUBLISHER tokens. No host/audience role distinction. Listeners join with `skipPublish: true` so they hear but don't transmit. Promotion calls `publishAgoraAudio()` in-place; demotion calls `unpublishAgoraAudio()`. No `setClientRole` calls needed.
  - **Mobile Toolbar**: Secondary buttons (Effects, Karaoke, Photo) hidden on mobile via CSS to keep toolbar clean; accessible through host controls panel instead. `.room-actions` hidden with `!important` to override enhanced.css cascade. `_setBtnWithSpan` used for stage buttons so labels respect `.ctrl-label { display: none }` on mobile.
  - **Portrait Lock**: CSS landscape overlay (`body.in-room::after`) blocks landscape on phones (`max-height: 500px`); JS `screen.orientation.lock('portrait')` as supplementary.
  - **Event Deduplication**: `room-joined` handler gates on `_agoraJoinHandled && _joinConfirmed` to skip duplicate processing. Both `createRoom()` and `joinRoom()` set these flags BEFORE `_socketJoinRoom()` to prevent the handler from racing the pipeline (which caused walkthrough tooltips firing over the create modal). Walkthrough is triggered AFTER `_enterRoomUI()`. `host-changed` only fires toast when transitioning from non-host. SFX debounced (800ms per sound name, 1s for join sound). Walkthrough guarded by `_walkthroughActive` flag.
- **Auth UX**: `auth.css` handles autofill styling (-webkit-autofill overrides for dark theme), rounded inputs (12px), and focus glow states. `auth.js` includes `apiUrl` fallback safety.
- **Lyrics**: Server-side search integrating with Musixmatch API and fallback sources. Lyrics page has its own search container with dark-themed inline styles.
- **Advertising**: Contextual keyword-based ads with a self-serve portal, admin approval, and tracking.
- **Trending Topics**: Displays conversation starters on the Verses page to encourage discussion.
- **Articles**: Removed. All references cleaned from nav, server routes, and HTML files.
- **Usage Analytics**: Event tracking middleware logs API usage for admin dashboards.
- **Label Partner Dashboard**: Provides partners with revenue overviews, artist breakdowns, sales heatmaps (Leaflet.js), and shareable dashboards with granular permissions.

### Production Readiness (6-Phase Audit — All Complete)
- **Static File Security**: `express.static` serves only from `public/` — server source, routes, models, and `.env` are inaccessible.
- **CORS**: Whitelisted origins only; development mode is permissive, production rejects unknown origins.
- **JWT Auth**: Tokens include `role` field; `middleware/auth.js` validates `userId` is present.
- **Rate Limiting**: Auth endpoints (`/api/auth/signin`, `/signup`) limited to 10 attempts per 15 min with `skipSuccessfulRequests`.
- **Agora Auth**: `POST /api/agora/token` requires user JWT; `GET /api/agora/test` requires ADMIN role.
- **XSS Hardening**: Shared `escapeHtml()` in `public/js/utils.js` (loaded before all scripts). Applied across all innerHTML injections with user data: tournament-admin, partner-dashboard, partner-upload, creator-dashboard, verses, ad-admin, admin-usage, main search.
- **ReDoS Prevention**: Regex special chars escaped in all username lookups via inline `.replace()`.
- **Public Profile**: `getPublicProfile()` uses a whitelist approach — returns only `_id, name, email, bio, avatar, accountType, role, createdAt, creatorProfile` (filtered). `getSensitiveProfile()` available for dashboard endpoints.
- **RBAC**: `requireRole()` unconditionally passes `ADMIN` through. No duplicate `authenticateAdmin` functions.
- **Cookie Consent**: Unified key `wordeth_cookie_consent` across all files; ad tracking gated by consent. "Cookie Preferences" link in all footers.
- **SPA Router**: Intercepts navigation for all SPA pages; confirms before leaving audio rooms.
- **Avatars**: New uploads go to Replit Object Storage; served via `/api/user/avatar/:userId`.
- **Performance**: MongoDB pool size 20 (up from 3); HTML served from in-memory cache (async read on first hit); static assets cached 5min with `stale-while-revalidate`; API rate limit 300/15min; search history capped at 100; ad matching uses MongoDB `$in` with compound index; trending songs cached 15min; Agora join lock has 10s timeout to prevent deadlocks.
- **Seed Scripts**: Production guard on both; all 13 plans have `active: true` and correct yearly pricing.
- **Search Autocomplete**: Results container properly appended to DOM with CSS styling.
- **Deploy Script**: Uses `npm audit --production` (report-only); test failures block deployment.
- **Mobile Build**: Sources from `public/`; API URL replacement failure exits with error.

## External Dependencies

- **NPM Packages**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @replit/object-storage, puppeteer, agora-access-token.
- **External APIs & Services**: Musixmatch API, LRCLIB/Lyrics.ovh (lyrics sources), YouTube, MongoDB, Replit Object Storage (avatars), InkSoft (merchandise store integration), Google Fonts, Font Awesome, Agora RTC.