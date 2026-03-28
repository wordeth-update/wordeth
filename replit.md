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
- **Payment Processing**: Stripe Checkout for subscriptions and one-time token pack purchases, with webhook-driven activation.

### Stripe Integration
- **Client**: `services/stripeClient.js` — uses `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` env vars (user's own Stripe account).
- **Routes**: `routes/stripe.js` — checkout session creation, billing portal, and webhook handler.
- **Webhook**: Registered BEFORE `express.json()` in `server.js` at `/api/stripe/webhook` using `express.raw()`.
- **Flow**: Frontend calls `POST /api/stripe/create-checkout-session` → redirects to Stripe Checkout → Stripe sends `checkout.session.completed` webhook → server activates subscription/credits tokens.
- **Models**: `User.stripeCustomerId`, `Subscription.stripeSubscriptionId` link Wordeth records to Stripe objects.
- **Events handled**: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`.

### Token Economy System
- **User Tokens**: Monthly grants based on subscription tier, non-expiring.
- **Gated Rooms**: Creators set token prices for Verses rooms, with tokens deducted from users and credited to creators.
- **Creator Payout**: Monthly conversion of `tokenEarnings` to USD at a dynamic rate based on platform activity.
- **Extra Token Packs**: Users can purchase additional token packs.
- **Token Boost**: Creators can spend tokens to promote replays.

### Paid Replays System
- **Auto-Save**: Token-priced or long-duration rooms are automatically saved as Replays.
- **Token-Gated Playback**: Replays can have a token price for playback, deducting tokens from users and crediting creators.
- **Browse UI**: "Replays" tab with genre filters, sorting, and pagination; boosted replays are prioritized.

### Room Ratings System
- **Post-Room Rating**: Users can rate rooms (1-5 stars) and add tags after attending for a minimum duration.
- **Aggregation**: Ratings update both the Replay's average rating and the creator's overall `creatorRating`.

### Recent Rooms History
- **User Model**: `roomHistory` array (capped at 50) with `roomId`, `roomName`, `hostName`, `hostId`, `tokenPrice`, `joinedAt`.
- **Privacy**: `showRoomHistory` boolean (default: false). Public profiles only expose room history when enabled.
- **Recording**: Room joins are persisted atomically via `$push/$slice` in `routes/signaling.js`, with dedup (skips if latest entry is same room).
- **API**: `GET /api/user/room-history` (auth), `PUT /api/user/room-history-visibility` (auth, `{visible: bool}`).
- **UI**: "Rooms" tab on profile page; privacy toggle in Settings tab.

### Platform Invite QR Code
- **Location**: Profile page — "Invite Friends" button in profile header.
- **Library**: `qrcode-generator` (CDN, loaded in profile.html).
- **URL**: Generates QR for platform homepage with `?ref=username` parameter.
- **Actions**: Copy invite link or save QR image as PNG.

### Account Types
- **Valid types**: `fan` (default), `artist`, `designer`, `label`, `creator`.
- **Creator account**: For non-music artist professionals to host, set token prices, and earn.

### Payout & Revenue Share System
- **Centralized PayoutService**: Computes payouts and platform fees for various seller types, logging transactions to an Events Ledger.

### Verses Tournaments System
- **Overview**: Competitive bracket-style tournaments for artists featuring fan voting, sponsorship, and leaderboards.
- **Models**: Comprehensive models for seasons, rounds, submissions, matches, votes, reactions, leaderboards, sponsors, and metrics.

### Features Showcase Page
- **Path**: `/features.html` with `/css/features.css`
- **Screenshots**: Auto-captured via Puppeteer to `public/features/` (12 PNG screenshots of platform pages)
- **Content**: Comprehensive visual showcase of all platform features, organized into 13 sections with embedded screenshots, CSS component recreations, and the Wordeth design system

### Notification System
- **Model**: `models/Notification.js` — stores persistent notifications with types: `new_follower`, `follower_created_room`, `follower_joined_room`.
- **API**: `GET /api/user/notifications` (auth, returns latest 50 + unread count), `PUT /api/user/notifications/:id/read`, `PUT /api/user/notifications/read-all`.
- **Real-time**: Socket.io emits `notification` events to online followers when a user creates/joins a room. Follow action creates `new_follower` notification.
- **UI**: Notification bell dynamically injected by `notifications.js` into nav bar. Shows unread badge count, dropdown list with notification items, mark-all-read. Polls every 30s + real-time socket updates.
- **CSS**: `public/css/notifications.css` — bell, badge, dropdown, item styles.

### Room Discovery
- **Search**: Room search input on Verses page filters rooms by name with debounced input.
- **Trending Badge**: Rooms with 5+ participants display a "Trending" badge with fire icon.
- **Filter Persistence**: Genre filters and search query persist across real-time room updates via `_applyRoomFilters()`.

### Enhanced Profile Modal
- **Follow Button**: `viewUserProfile()` modal shows a Follow button for logged-in users viewing others' profiles.
- **Room History**: Modal displays recent room history (up to 10) when the user has `showRoomHistory` enabled, with token badges and time-ago timestamps.
- **Implementations**: Both `public/js/profile.js` and `public/verses.html` inline script have synchronized implementations.

### Direct Messaging System
- **Model**: `models/Message.js` — text + audio messages with 24h audio expiry (TTL index on `audioExpiry`).
- **API**: `GET /api/messages/conversations`, `GET /api/messages/:userId`, `POST /api/messages/:userId`, `PUT /api/messages/:id/read`.
- **Real-time**: Socket.io `new-message` events via `global._io` / `global._connectedUsers` (shared with signaling.js).
- **Audio**: MediaRecorder capture, upload to Object Storage, auto-expire after 24h.
- **UI**: `public/messages.html` + `public/js/messages.js` + `public/css/messages.css`. Accessible from nav + profile. `?user=userId` auto-opens chat. `window.openChatWith(userId)` globally available.

### Token Wagering System
- **Model**: `models/Wager.js` — types: `tournament_match`, `verse_game`. Tracks participants, amounts, status (pending/active/resolved/cancelled), winnerId.
- **API**: `POST /api/wagers/create`, `POST /api/wagers/:id/accept`, `POST /api/wagers/:id/resolve`, `POST /api/wagers/:id/cancel`, `GET /api/wagers/list`.
- **Token Flow**: Deduction on create/accept via TokenLedger (`wager_create`, `wager_accept`), credit on win (`wager_win`), refund on cancel (`wager_refund`).
- **Socket Events**: `wager-created`, `wager-accepted`, `wager-resolved` emitted to rooms.

### Enhanced Profile Customization
- **User Model Extensions**: `extendedBio` (2000 char), `profilePhotos[]` (up to 6, url+caption), `musicSnippet` (url, title, artist, isRented, expiresAt).
- **AudioBank Model**: `models/AudioBank.js` — admin-seeded curated tracks with genre, mood, BPM, cover art, preview URL, featured flag, and token rental pricing. Text index on title/artist/tags.
- **API**: `PUT /api/user/profile-customize`, `POST /api/user/profile-photo`, `DELETE /api/user/profile-photo/:index`, `POST /api/user/music-snippet` (audioUpload multer), `DELETE /api/user/music-snippet`, `GET /api/user/audio-bank`, `POST /api/user/rent-snippet`.
- **Multer**: Separate `upload` (image-only) and `audioUpload` (audio files, 10MB limit) middleware in `routes/user.js`.
- **UI**: "Customize" tab on profile page with extended bio textarea, photo gallery with upload/delete, music snippet upload or Audio Bank rental.
- **Audio Bank Browser**: Full-screen modal with search bar, genre/mood filter dropdowns, sort options (popular/newest/price), track cards with cover art and metadata tags, inline preview playback with now-playing bar (progress + play/pause), and one-click token rental. In-memory track map for reliability. Mobile-responsive layout.
- **TokenLedger**: `snippet_rental` type for audio bank rentals.

### Key Features Architecture
- **Verses (Audio Rooms)**: Uses Agora RTC SDK in `rtc` mode for scalable audio/video, with Socket.io for room management. Supports server-side token generation, Web Audio API for filters, and listener-first stage access with promotion paths.
- **Auth UX**: Custom styling for autofill, rounded inputs, and focus states.
- **Lyrics**: Server-side search integrating with licensed third-party lyrics APIs and fallback sources.
- **Advertising**: Contextual keyword-based ads with a self-serve portal and admin approval.
- **Trending Topics**: Displays conversation starters on the Verses page.
- **Usage Analytics**: Event tracking middleware for admin dashboards.
- **Label Partner Dashboard**: Provides partners with revenue overviews, artist breakdowns, and sales heatmaps.

## External Dependencies

- **NPM Packages**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @replit/object-storage, puppeteer, agora-access-token, stripe.
- **External APIs & Services**: Licensed lyrics APIs (internal), YouTube, MongoDB, Replit Object Storage, InkSoft, Google Fonts, Font Awesome, Agora RTC, Stripe.