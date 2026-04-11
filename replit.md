# Wordeth - Social Music Experience Platform

## Overview

Wordeth is a social music experience platform designed to build an interactive community around music. It integrates features such as lyric exploration (including karaoke), live audio discussion rooms ("Verses"), custom music merchandise ordering, and social networking. The platform aims to foster connections and engagement, while providing artists and labels with new promotional and revenue opportunities through a self-serve advertising system, usage analytics, and robust privacy tools.

## User Preferences

Preferred communication style: Simple, everyday language.
Partner dashboard pages are web-only — do NOT sync to iOS/Android builds.

## System Architecture

### Frontend
- **Technology**: Static HTML pages with vanilla CSS and JavaScript, prioritizing mobile responsiveness.
- **Styling**: Uses CSS custom properties (Design System v2) with a dark theme (black/purple/mint), Google Fonts (Syne + Outfit), and Font Awesome icons.
- **Persistent Mini-Player**: Maintains audio connection across page navigations within Verses audio rooms.
- **SPA Router**: Lightweight router for partial page reloads on public-facing pages.

### Backend
- **Technology**: Node.js with Express.js for HTTP and Socket.io for real-time WebSockets.
- **Server Architecture**: Modularized API routes for core functionalities and real-time WebSocket signaling for managing room states, chat, karaoke, and invites.
- **Agora Token Server**: Generates RTC tokens for secure audio/video communication.
- **Middleware**: Includes JWT and partner authentication, and automatic usage event tracking.
- **OG Image Generation**: Lazy-loaded Puppeteer for on-demand Open Graph image generation.
- **Security**: Implements Helmet for CSP, rate limiting, CORS, and trust proxies.

### Database
- **Technology**: MongoDB with Mongoose ODM.
- **Models**: Includes Users, Advertisements, Labels, Merch Sales, Subscription Plans, and an immutable Events Ledger for financial tracking.

### Redis
- **Purpose**: Persists live Verses audio room states for continuity.

### Authentication
- Uses JWT tokens (7-day expiry) stored client-side.
- Employs bcrypt for password hashing.

### Subscription & Entitlement System
- **Configuration-driven plans**: Stored in MongoDB, allowing flexible pricing tiers with dynamic feature entitlements.
- **RBAC middleware**: Enforces access control based on roles and account types.
- **Payment Processing**: Stripe Checkout for subscriptions and token pack purchases, with webhook-driven activation.

### Token Economy System
- **User Tokens**: Monthly grants based on subscription tier, used for gated rooms, creator payouts, and promoting replays.
- **Creator Payout**: Monthly conversion of `tokenEarnings` to USD based on platform activity.

### Paid Replays System
- **Auto-Save**: Token-priced or long-duration rooms are automatically saved as Replays.
- **Token-Gated Playback**: Replays can have a token price for playback, crediting creators.
- **Browse UI**: "Replays" tab with genre filters, sorting, and pagination; boosted replays are prioritized.

### Room Ratings System
- **Post-Room Rating**: Users can rate rooms (1-5 stars) and add tags, updating average room and creator ratings.

### Recent Rooms History
- **User Model**: `roomHistory` array (capped at 50) storing joined room details, with a privacy toggle (`showRoomHistory`).

### Platform Invite QR Code
- **Functionality**: Generates QR codes for the platform homepage with a `?ref=username` parameter.

### Account Types
- **Valid types**: `fan`, `artist`, `designer`, `label`, `creator`. Creator accounts are for hosting and earning.

### Payout & Revenue Share System
- **Centralized PayoutService**: Computes payouts and platform fees, logging transactions to an Events Ledger.

### Verses Tournaments System
- **Overview**: Competitive bracket-style tournaments with fan voting, sponsorship, and leaderboards.

### Notification System
- **Model**: Stores persistent notifications (e.g., new follower, room activity).
- **API**: For fetching, reading, and marking notifications.
- **Real-time**: Socket.io emits `notification` events for real-time updates.
- **UI**: Notification bell with unread badge and dropdown in the navigation bar.

### Room Discovery
- **Search**: Room search with debounced input.
- **Trending Badge**: "Trending" badge for rooms with 5+ participants.
- **Filter Persistence**: Genre filters and search query persist across updates.

### Enhanced Profile Modal
- **Functionality**: Displays a Follow button and recent room history (if enabled) in the user profile modal.

### Direct Messaging System
- **Model**: Supports text and audio messages with 24-hour audio expiry.
- **API**: For managing conversations and messages.
- **Real-time**: Socket.io for `new-message` events.
- **Audio**: MediaRecorder capture, upload to Object Storage, auto-expire.

### Token Wagering System
- **Model**: Tracks wagers for tournaments and games, including participants, amounts, and status.
- **API**: For creating, accepting, resolving, and canceling wagers.
- **Token Flow**: Deduction on create/accept, credit on win, refund on cancel via TokenLedger.

### Enhanced Profile Customization
- **User Model Extensions**: `extendedBio`, `profilePhotos[]`, `musicSnippet`.
- **AudioBank Model**: Curated tracks with metadata, token rental pricing, and rights holder attribution.
- **API**: For profile customization, photo/music snippet management, and Audio Bank interaction.
- **Audio Bank Browser**: Full-screen modal with search, filters, sorting, inline preview playback, and one-click token rental.

### Audio Bank Rights Holder API
- **Model**: Manages hashed API keys with permissions, rate limits, and usage tracking.
- **Routes**: For rights holder track management and admin functions (track management, API key CRUD).
- **Tenant Isolation**: Rights holder queries are scoped to their submitted tracks.
- **Admin UI**: Web-only interface for track management, upload, API key management, and API documentation.

### Custom Merch Design Studio
- **Frontend**: Utilizes Fabric.js for text placement, image upload, and front/back views.
- **Product Catalog**: Offers 6 product types with multiple colors and sizes, rendered with SVG outlines.
- **Model**: `MerchOrder` schema for tracking user, product, design, and order status.
- **API**: For creating, retrieving, and managing merch orders.

### Key Features Architecture
- **Verses (Audio Rooms)**: Uses Agora RTC SDK for scalable audio/video, with Socket.io for room management. Supports server-side token generation and Web Audio API for filters.
- **Lyrics**: Server-side search integrating with licensed third-party APIs.
- **Advertising**: Contextual keyword-based ads with self-serve portal and admin approval.
- **Trending Topics**: Displays conversation starters on the Verses page.
- **Usage Analytics**: Event tracking middleware for admin dashboards.
- **Label Partner Dashboard**: Provides revenue overviews, artist breakdowns, and sales heatmaps.

## External Dependencies

- **NPM Packages**: express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @replit/object-storage, puppeteer, agora-access-token, stripe.
- **External APIs & Services**: Licensed lyrics APIs, YouTube, MongoDB, Replit Object Storage, Google Fonts, Font Awesome, Agora RTC, Stripe.