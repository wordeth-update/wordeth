# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform that aims to build an interactive community around music. It integrates features such as lyric exploration (including karaoke), live audio discussion rooms ("Verses"), custom music merchandise ordering, and social networking. The platform seeks to foster connections and engagement, while providing artists and labels with new promotional and revenue opportunities through a self-serve advertising system, usage analytics, and robust privacy tools.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript, prioritizing mobile responsiveness.
- **Styling**: Uses CSS custom properties (Design System v2) with a dark theme (black/purple/mint). Google Fonts (Syne + Outfit) and Font Awesome icons are utilized.
- **Persistent Mini-Player**: A floating bar maintains audio connection across page navigations when in a Verses audio room.
- **SPA Router**: Lightweight router intercepts internal link clicks for partial page reloads on public-facing pages, excluding partner/admin sections.

### Backend
- **Technology**: Node.js with Express.js for HTTP and Socket.io for real-time WebSockets.
- **Server Architecture**: Modularized API routes for authentication, user management, lyrics, merchandise, advertising, analytics, and audio room information.
- **WebSocket Signaling**: Manages real-time room states, Agora UID mapping, chat, karaoke, screen sharing, and invites.
- **Agora Token Server**: Generates RTC tokens for secure audio/video communication.
- **Middleware**: Includes JWT authentication, partner authentication, and automatic usage event tracking.
- **Puppeteer (OG Images)**: Lazy-loaded for on-demand OG image generation.
- **Security**: Implements Helmet for CSP, express-rate-limit, CORS, and trust proxies.

### Database
- **Technology**: MongoDB with Mongoose ODM.
- **Models**: Includes Users, Advertisements, Labels, Merch Sales, Subscription Plans, and an immutable Events Ledger for financial tracking.

### Redis
- **Purpose**: Persists live Verses audio room states to ensure continuity across server restarts.

### Authentication
- Uses JWT tokens (7-day expiry) stored client-side.
- Employs bcrypt for password hashing for users, advertisers, and partner accounts.

### Subscription & Entitlement System
- **Configuration-driven plans**: Stored in MongoDB, allowing flexible pricing tiers with dynamic feature entitlements.
- **RBAC middleware**: Enforces access control based on roles and account types.
- **Payment Processing**: Natively built billing engine with an integrated payment gateway.

### Token Economy System
- **User Tokens**: Monthly grants based on subscription tier, non-expiring.
- **Gated Rooms**: Creators set token prices for Verses rooms, with tokens deducted from users and credited to creators.
- **Creator Payout**: Monthly conversion of `tokenEarnings` to USD ($0.03/token).
- **Extra Token Packs**: Users can purchase additional token packs.
- **Token Boost**: Creators can spend tokens to promote replays.

### Paid Replays System
- **Auto-Save**: Token-priced or long-duration rooms are automatically saved as Replays.
- **Token-Gated Playback**: Replays can have a token price for playback, deducting tokens from users and crediting creators.
- **Browse UI**: "Replays" tab with genre filters, sorting, and pagination; boosted replays are prioritized.

### Room Ratings System
- **Post-Room Rating**: Users can rate rooms (1-5 stars) and add tags after attending for a minimum duration.
- **Aggregation**: Ratings update both the Replay's average rating and the creator's overall `creatorRating`.

### Account Types
- **Valid types**: `fan` (default), `artist`, `designer`, `label`, `creator`.
- **Creator account**: For non-music artist professionals to host, set token prices, and earn.

### Payout & Revenue Share System
- **Centralized PayoutService**: Computes payouts and platform fees for various seller types, logging transactions to an Events Ledger.

### Verses Tournaments System
- **Overview**: Competitive bracket-style tournaments for artists featuring fan voting, sponsorship, and leaderboards.
- **Models**: Comprehensive models for seasons, rounds, submissions, matches, votes, reactions, leaderboards, sponsors, and metrics.

### Key Features Architecture
- **Verses (Audio Rooms)**: Uses Agora RTC SDK in `rtc` mode for scalable audio/video, with Socket.io for room management. Supports server-side token generation, Web Audio API for filters, and listener-first stage access with promotion paths.
- **Auth UX**: Custom styling for autofill, rounded inputs, and focus states.
- **Lyrics**: Server-side search integrating with Musixmatch API and fallback sources.
- **Advertising**: Contextual keyword-based ads with a self-serve portal and admin approval.
- **Trending Topics**: Displays conversation starters on the Verses page.
- **Usage Analytics**: Event tracking middleware for admin dashboards.
- **Label Partner Dashboard**: Provides partners with revenue overviews, artist breakdowns, and sales heatmaps.

## External Dependencies

- **NPM Packages**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @replit/object-storage, puppeteer, agora-access-token.
- **External APIs & Services**: Musixmatch API, LRCLIB/Lyrics.ovh, YouTube, MongoDB, Replit Object Storage, InkSoft, Google Fonts, Font Awesome, Agora RTC.