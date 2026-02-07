# Wordeth - Social Music Experience Platform

## Overview
Wordeth is a social music experience platform that creates an interactive community around music. Users can search and explore song lyrics (with karaoke mode), participate in live audio discussion rooms called "Verses", customize and order music-related merchandise, read curated music articles, and connect with other music enthusiasts. The platform includes a self-serve advertising system, usage analytics, and privacy/compliance tools.

## System Architecture

### Frontend (Mobile + Web)
- **Technology**: Static HTML pages with vanilla CSS and JavaScript, wrapped with Capacitor for iOS and Android
- **App ID**: `com.wordeth.app`
- **API Config**: All API calls use `js/config.js` which provides `apiUrl()` function. Set `window.WORDETH_API_BASE` or use the build script to configure the backend URL.
- **Pages**: index.html (home), verses.html (audio rooms), lyrics.html (lyric search), merch.html (merchandise), articles.html, signin.html, signup.html, profile.html, plus admin pages for ads and analytics
- **Styling**: CSS custom properties with dark color scheme (black/purple/mint palette). Mobile-responsive with hamburger menu.
- **Design**: Fonts from Google Fonts (Inter, Poppins). Icons from Font Awesome.

### Backend
- **Technology**: Node.js with Express.js (`server.js` is the entry point)
- **Run**: `node server.js` (binds to PORT env var, defaults to 5000)
- **API Routes** (all under `/api/`):
  - `/api/auth` — signup, signin (JWT-based)
  - `/api/user` — profile management, avatar upload (base64 in MongoDB, 5MB limit), unique username enforcement
  - `/api/lyrics` — lyric search (Genius + Musixmatch + LRCLIB + Lyrics.ovh)
  - `/api/merch` — merchandise system
  - `/api/articles` — article content
  - `/api/ads` — advertising system (advertiser registration, ad CRUD, admin approval)
  - `/api/analytics` — usage metrics and S3 archival
- **Security**: Helmet CSP headers, express-rate-limit (100 req/15min), CORS

### Database
- **Technology**: MongoDB with Mongoose ODM
- **Connection**: Built from `MONGODB_USERNAME` and `MONGODB_PASSWORD` env vars (Atlas), or `MONGODB_URI` directly
- **Models**: User, Ad, Advertiser, AdApplication, UsageEvent

### Authentication
- JWT tokens with 7-day expiry, stored in localStorage
- bcrypt for password hashing
- Unique usernames enforced case-insensitively
- Separate auth flows for users and advertisers

### Key Features
- **Verses (Audio Rooms)**: WebRTC-based with Web Audio API for audio filters, YouTube integration for karaoke, MediaRecorder for performance recording
- **Lyrics**: Multi-source lyric search (Genius API primary, Musixmatch, LRCLIB, Lyrics.ovh fallbacks)
- **Karaoke**: Synchronized scrolling lyrics, YouTube audio, mic tempo sync, performance recording with video filters and Wordeth branding
- **Advertising**: Contextual keyword-based ads on lyrics pages, self-serve portal with admin approval
- **Analytics**: Event tracking with admin dashboard, AWS S3 archival for historical data
- **Privacy**: Cookie consent, GDPR/CCPA compliance tools, user account deletion

## Environment Variables Required

### Required
- `MONGODB_USERNAME` — MongoDB Atlas username
- `MONGODB_PASSWORD` — MongoDB Atlas password
- `JWT_SECRET` — Secret for JWT signing
- `GENIUS_ACCESS_TOKEN` — For lyrics search (primary source)

### Optional
- `PORT` — Server port (defaults to 5000)
- `MUSIXMATCH_API_KEY` — For supplementary lyrics
- `YOUTUBE_API_KEY` — For YouTube search in karaoke
- `AWS_ACCESS_KEY_ID` — For S3 analytics archival
- `AWS_SECRET_ACCESS_KEY` — For S3 analytics archival
- `AWS_S3_BUCKET` — S3 bucket name for archival
- `AWS_REGION` — AWS region (defaults to us-east-1)

## NPM Dependencies

### Runtime
- express, mongoose, bcryptjs, jsonwebtoken, cors, helmet, express-rate-limit, express-validator, dotenv, axios, multer, @aws-sdk/client-s3

### Mobile (Capacitor)
- @capacitor/core, @capacitor/cli, @capacitor/ios, @capacitor/android, @capacitor/camera, @capacitor/status-bar, @capacitor/splash-screen, @capacitor/network, @capacitor/app

### Dev
- nodemon, jest, supertest

## Mobile App Build

### Prerequisites
- Node.js 18+
- For iOS: Mac with Xcode 15+, CocoaPods
- For Android: Android Studio with SDK 33+

### Build Steps

1. Set your backend URL:
   ```bash
   export WORDETH_API_URL=https://your-deployed-backend.com
   ```

2. Build the frontend and sync to native projects:
   ```bash
   npm run mobile:build
   ```

3. Open in IDE:
   ```bash
   npx cap open ios      # Opens Xcode
   npx cap open android  # Opens Android Studio
   ```

4. Build and run from the IDE, or archive for store submission.

### App Store Submission
- **Bundle ID**: com.wordeth.app
- **Permissions required**: Camera (profile photos), Microphone (Verses audio rooms), Photo Library (profile images)
- **iOS**: Archive in Xcode → Upload to App Store Connect
- **Android**: Generate signed APK/AAB in Android Studio → Upload to Google Play Console

### Updating the App
For backend/API changes: Deploy the backend — changes take effect immediately.
For frontend/UI changes:
```bash
npm run mobile:build
npx cap open ios      # or android
```
Then rebuild and submit an update through the app store.

## Standalone Backend Deployment

The backend is a standard Node.js/Express app and can run anywhere:

### Option 1: Railway (recommended for simplicity)
1. Push code to GitHub
2. Connect Railway to the repo
3. Set environment variables in Railway dashboard
4. Railway auto-deploys on push

### Option 2: DigitalOcean App Platform
1. Connect GitHub repo
2. Set run command: `node server.js`
3. Add environment variables
4. Deploy

### Option 3: AWS EC2 / Any VPS
1. Clone repo on server
2. `npm install --production`
3. Set environment variables
4. Run with PM2: `pm2 start server.js --name wordeth`
5. Set up Nginx reverse proxy for HTTPS

### Option 4: Render
1. Connect GitHub repo
2. Set build command: `npm install`
3. Set start command: `node server.js`
4. Add environment variables

All options require a MongoDB Atlas database (already configured) and the environment variables listed above.

## Project Structure
```
wordeth/
├── server.js              # Express server entry point
├── capacitor.config.json  # Capacitor mobile config
├── package.json
├── wordeth.md             # This file
│
├── js/                    # Frontend JavaScript
│   ├── config.js          # API base URL config (used by all files)
│   ├── auth.js            # Sign in/sign up logic
│   ├── nav-auth.js        # Navigation auth state
│   ├── profile.js         # User profile management
│   ├── lyrics.js          # Lyrics search page
│   ├── verses.js          # Audio rooms (Verses)
│   ├── articles.js        # Articles homepage
│   ├── articles-page.js   # Articles listing
│   ├── ad-portal.js       # Advertiser portal
│   ├── ad-admin.js        # Ad admin dashboard
│   ├── admin-ads.js       # Ad management
│   ├── admin-usage.js     # Usage analytics admin
│   ├── advertising.js     # Ad display/tracking
│   ├── cookie-consent.js  # Cookie consent banner
│   └── wordeth-ads-sdk.js # Ads SDK
│
├── css/                   # Stylesheets
├── assets/                # SVG logos and product images
├── images/                # Additional images
│
├── routes/                # Express API routes
│   ├── auth.js, user.js, lyrics.js, merch.js
│   ├── articles.js, ads.js, analytics.js
│
├── models/                # Mongoose models
│   ├── User.js, Ad.js, Advertiser.js
│   ├── AdApplication.js, UsageEvent.js
│
├── middleware/            # Express middleware
│   ├── auth.js            # JWT verification
│   └── tracking.js        # Usage event tracking
│
├── services/              # Business logic services
│   ├── archiver.js        # S3 analytics archival
│   └── inksoft/           # InkSoft merch integration
│
├── scripts/               # Build and utility scripts
│   ├── build-mobile.js    # Builds www/ for Capacitor
│   ├── deploy.sh          # Deployment script
│   ├── setup-local-env.js # Local env setup
│   └── validate-env.js    # Env var validation
│
├── ios/                   # Capacitor iOS project
├── android/               # Capacitor Android project
├── www/                   # Built frontend (generated, gitignored)
└── tests/                 # Jest test files
```
