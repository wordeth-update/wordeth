# Wordeth - Social Music Experience Platform

## Overview
Wordeth is a social music experience platform designed to create a vibrant, interactive community around music. It enables users to deeply engage with music through lyric exploration, live audio discussions, personalized merchandise, curated articles, and social connections. The platform aims to be a central hub for music enthusiasts, fostering engagement and offering unique ways to interact with their favorite artists and songs.

### Key Capabilities:
- **Lyric Discovery & Interaction**: Search and view song lyrics, with advanced features like karaoke mode and performance recording.
- **Live Audio Discussions ("Verses")**: Participate in real-time audio rooms inspired by Twitter Spaces/Clubhouse, fostering community and discussion.
- **Personalized Merchandise**: Customize and order unique music-related merchandise, including a "Lyrics-to-Merch" feature.
- **Curated Content**: Read and discuss music articles.
- **Social Connection**: Connect with other music enthusiasts and artists.
- **Usage Metrics & Analytics**: Comprehensive system for audience insights, historical trends, and ad campaign performance.
- **Privacy & Compliance**: Robust privacy features including cookie consent, terms/privacy policies, and data management tools.

## User Preferences
- Audio rooms preferred over video rooms (Twitter Spaces / Clubhouse style)

## System Architecture

### Core Design Principles
- **Community-Centric**: Features are built to encourage interaction and shared experiences around music.
- **Scalable Backend**: Node.js with Express.js for efficient API handling and real-time features.
- **Rich Frontend Experience**: Static HTML/CSS/JS with modern UI/UX design (CSS Grid, modern typography, smooth transitions).
- **Data-Driven Insights**: Integrated analytics for understanding user behavior and platform performance.
- **Privacy by Design**: Comprehensive features for user data control and compliance.

### Technical Implementations & Features
- **Authentication**: Email/password signup+signin with JWT tokens (7-day expiry), bcrypt password hashing, token verification middleware. OAuth stubs for Twitter/Instagram/Facebook (not yet active). JWT_SECRET stored as a proper secret. Auto-redirect to signin on 401. Nav updates dynamically for logged-in/logged-out state.
- **User Profiles**: Full profile page with avatar upload (multer, 5MB limit), name/bio editing, tabbed views (history, annotations, friends, merch, settings), account deletion with double confirmation.
- **Verses (Live Audio Rooms)**: Twitter Spaces/Clubhouse style audio discussions with features like host controls (door lock, karaoke enablement), participant interaction (hand-raise), audio filters (voice effects), and screen sharing.
- **Karaoke Mode**: Synchronized scrolling lyrics from multiple sources (Musixmatch, LRCLIB, Lyrics.ovh), YouTube audio integration, and advanced features like Mic Tempo Sync for dynamic lyric scrolling based on vocal activity.
- **Performance Recording**: Capture karaoke performances with video camera, video filters, lyrics overlay, and Wordeth branding for social sharing (optimized for TikTok/Reels/Shorts). Includes ffmpeg.wasm (single-threaded core) for MP4 conversion.
- **Merchandise System**: Integration with InkSoft for artist-specific stores, merchandise customization, and a "Lyrics-to-Merch" feature.
- **Advertising System**: Contextual keyword-based advertising on lyric search pages, with a robust registration, admin approval, and advertiser portal system.
- **Usage Metrics & Archival**: Real-time event tracking, audience segmentation, genre propensity analysis, and aggregation for long-term storage in AWS S3, visualized in an admin dashboard with historical trends.
- **Privacy & Compliance**: Cookie consent management, explicit agreement to Terms of Service and Privacy Policy during signup, user self-deletion, and admin tools for data flushing.
- **Security**: JWT + OAuth for authentication, Content Security Policy, and trust proxy configuration.
- **UI/UX**: Consistent navigation across desktop and mobile, enhanced CSS for modern aesthetics, and SVG product images for merch.

### Technology Stack
- **Backend**: Node.js, Express.js
- **Database**: MongoDB (Mongoose ORM)
- **Frontend**: HTML, CSS (CSS Grid, enhanced.css), JavaScript (Web Audio API, WebRTC, MediaRecorder API, ffmpeg.wasm)
- **Cloud**: AWS S3 for historical data archival

## External Dependencies

- **Musixmatch API**: Primary source for song lyrics and search.
- **LRCLIB / Lyrics.ovh**: Fallback sources for synchronized lyrics.
- **YouTube**: Audio/video playback integration for karaoke.
- **InkSoft**: Platform for merchandise customization and artist stores.
- **AWS S3**: Cloud storage for historical analytics data.
- **MongoDB Atlas**: Cloud-hosted database for application data.
- **Twitter, Instagram, Facebook**: OAuth integrations for authentication.
- **Google Fonts**: For enhanced typography.