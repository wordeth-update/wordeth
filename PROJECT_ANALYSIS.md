# Wordeth Project Analysis & Current Status

## 📋 Project Overview

**Wordeth** is a social music experience platform that combines:
- 🎵 Lyrics search and discovery (Genius API)
- 👥 User authentication and profiles
- 📰 Music articles and content
- 🛍️ Custom merchandise creation (InkSoft integration)
- 📺 Video calling rooms (WebRTC)
- 📢 Advertising system (contextual ads)

## 🏗️ Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: MongoDB (with MongoDB Atlas support)
- **Authentication**: JWT + Passport.js (Twitter, Instagram, Facebook OAuth)
- **File Upload**: Multer
- **Session Management**: express-session + MongoDB Store
- **Security**: Helmet, CORS, Rate Limiting

### Project Structure
```
wordeth_cursor_project/
├── server.js              # Main Express server
├── routes/                 # API route handlers
│   ├── auth.js            # Authentication endpoints
│   ├── user.js            # User profile & data
│   ├── lyrics.js          # Genius API integration
│   ├── articles.js        # Article content
│   ├── merch.js           # Merchandise (InkSoft)
│   └── ads.js             # Advertising system
├── models/
│   └── User.js            # User data model
├── middleware/
│   └── auth.js            # JWT authentication middleware
├── services/
│   └── inksoft/          # InkSoft API integration
├── config/
│   └── passport.js       # OAuth configuration
└── [frontend files]       # HTML/CSS/JS frontend
```

---

## 🔌 Current API Endpoints

### 1. Health Check
- `GET /api/health` - Server health status

### 2. Authentication (`/api/auth`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| POST | `/signup` | Traditional user registration | No |
| POST | `/signin` | Traditional user login | No |
| GET | `/twitter` | Twitter OAuth initiation | No |
| GET | `/twitter/callback` | Twitter OAuth callback | No |
| GET | `/instagram` | Instagram OAuth initiation | No |
| GET | `/instagram/callback` | Instagram OAuth callback | No |
| GET | `/facebook` | Facebook OAuth initiation | No |
| GET | `/facebook/callback` | Facebook OAuth callback | No |
| GET | `/verify` | Verify JWT token | No (token in header) |

### 3. User Profile (`/api/user`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/profile` | Get user profile | ✅ Yes |
| POST | `/avatar` | Upload avatar image | ✅ Yes |
| GET | `/history` | Get search history | ✅ Yes |
| POST | `/history` | Add to search history | ✅ Yes |
| GET | `/annotations` | Get user annotations | ✅ Yes |
| POST | `/annotations` | Add annotation | ✅ Yes |
| GET | `/friends` | Get friends/following | ✅ Yes |
| POST | `/friends/:id` | Follow a user | ✅ Yes |
| GET | `/merch` | Get custom merch | ✅ Yes |
| POST | `/merch` | Create custom merch | ✅ Yes |

### 4. Lyrics (`/api/lyrics`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/search?q={query}` | Search for songs | No |
| GET | `/song/:id` | Get song details | No |
| GET | `/lyrics/:id` | Get song lyrics content | No |
| GET | `/trending` | Get trending songs | No |

### 5. Articles (`/api/articles`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/featured` | Get featured articles | No |
| GET | `/` | Get all articles (paginated) | No |
| GET | `/:id` | Get single article | No |
| GET | `/category/:category` | Get articles by category | No |
| GET | `/search/:query` | Search articles | No |

### 6. Merchandise (`/api/merch`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/products` | Get products | No |
| GET | `/products/:productId` | Get product details | No |
| GET | `/fonts` | Get available fonts | No |
| POST | `/designs` | Create custom design | ✅ Yes |
| GET | `/designs/:designId/preview` | Get design preview | No |
| POST | `/shipping/calculate` | Calculate shipping | No |
| POST | `/orders` | Create order | ✅ Yes |
| GET | `/orders/:orderId` | Get order status | ✅ Yes |
| GET | `/orders` | Get user order history | ✅ Yes |
| GET | `/health` | InkSoft health check | No |

### 7. Advertising (`/api/ads`)
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|--------------|
| GET | `/inventory` | Get ad inventory | No |
| POST | `/impression` | Track ad impression | No |
| POST | `/click` | Track ad click | No |
| POST | `/pageview` | Track page view | No |
| POST | `/contextual` | Get contextual ads | No |
| GET | `/analytics` | Get analytics (admin) | No |
| POST | `/admin/ad` | Add new ad (admin) | No |
| PUT | `/admin/ad/:id` | Update ad (admin) | No |
| DELETE | `/admin/ad/:id` | Delete ad (admin) | No |

---

## 🗄️ Data Models

### User Model
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (hashed, required if not social login),
  bio: String,
  avatar: String,
  socialId: String,
  socialProvider: 'x' | 'instagram' | 'facebook' | null,
  searchHistory: [{ songTitle, artist, timestamp }],
  annotations: [{ songTitle, text, likes, timestamp }],
  following: [ObjectId (User)],
  followers: [ObjectId (User)],
  customMerch: [{ name, type, image, createdAt }],
  timestamps: true
}
```

---

## 🎯 Current Feature Status

### ✅ Fully Implemented
- [x] User registration and authentication (JWT)
- [x] Social OAuth setup (Twitter, Instagram, Facebook)
- [x] User profiles and avatars
- [x] Lyrics search and display (Genius API)
- [x] Song details and trending songs
- [x] Articles system (demo data)
- [x] Search history tracking
- [x] User annotations
- [x] Friend following system
- [x] Custom merchandise creation
- [x] Advertising inventory system
- [x] Ad impression/click tracking
- [x] Contextual ad matching
- [x] Admin ad management
- [x] File uploads (images)
- [x] MongoDB integration
- [x] Security middleware (Helmet, CORS, Rate Limiting)

### ⚠️ Partially Implemented
- [ ] Video calling (WebRTC) - Frontend exists, backend integration needed
- [ ] InkSoft integration - Service exists, needs API credentials
- [ ] Social OAuth - Configured but needs API keys

### 📋 Not Yet Implemented
- [ ] Email verification
- [ ] Password reset functionality
- [ ] Real-time notifications
- [ ] WebSocket support for live features
- [ ] Admin dashboard UI
- [ ] Payment processing
- [ ] Order fulfillment

---

## 🔑 Environment Configuration

### Required Variables
```env
JWT_SECRET=                    # Secret for JWT tokens
MONGODB_URI_PROD=              # MongoDB Atlas connection string
GENIUS_ACCESS_TOKEN=           # Genius API access token
```

### Optional Variables
```env
TWITTER_CONSUMER_KEY=          # Twitter OAuth
TWITTER_CONSUMER_SECRET=       # Twitter OAuth
INSTAGRAM_CLIENT_ID=           # Instagram OAuth
INSTAGRAM_CLIENT_SECRET=       # Instagram OAuth
FACEBOOK_APP_ID=               # Facebook OAuth
FACEBOOK_APP_SECRET=           # Facebook OAuth
PORT=3000                      # Server port (default: 3000)
NODE_ENV=development           # Environment mode
CORS_ORIGIN=                   # CORS allowed origin
SESSION_SECRET=                # Session secret
```

---

## 📊 Current Capabilities

### Functional Features
1. **Authentication System**: Complete JWT-based auth with social OAuth support
2. **User Management**: Profile, avatar, search history, annotations
3. **Lyrics System**: Search, display, trending songs via Genius API
4. **Content System**: Articles with categories, search, pagination
5. **Merchandise**: Product browsing, custom design creation
6. **Advertising**: Contextual ad matching, analytics, admin management
7. **Social Features**: Following users, custom merch collections

### API Capabilities
- RESTful API design
- JWT token authentication
- File upload handling
- Error handling middleware
- Rate limiting (100 req/15min per IP)
- Security headers (Helmet)
- CORS configuration
- Session management

---

## 🧪 Testing Setup

### Current Testing Status
- ❌ No automated tests yet
- ✅ Manual configuration test (`npm run test-config`)
- ✅ Health check endpoint available

### Recommended Testing Approach
1. Unit tests for models and utilities
2. Integration tests for API endpoints
3. End-to-end tests for critical flows
4. Manual testing scripts for quick validation

---

## 🚀 Deployment Status

### Ready for Deployment
- ✅ Procfile (Heroku)
- ✅ Environment variable configuration
- ✅ MongoDB Atlas integration
- ✅ Production/development mode handling
- ✅ Static file serving

### Deployment Platforms Supported
- Heroku (Procfile present)
- Any Node.js hosting (requires MongoDB Atlas)

---

## 📝 Next Steps Recommendations

1. **Testing**: Set up Jest/Mocha test suite
2. **Video Calling**: Complete WebRTC backend integration
3. **InkSoft**: Complete API integration with credentials
4. **Social OAuth**: Add API keys for full functionality
5. **Admin Dashboard**: Create UI for ad management
6. **Email System**: Add email verification and password reset
7. **Payment Processing**: Integrate payment gateway for merch
8. **WebSocket**: Add real-time features for video calls
9. **Monitoring**: Add logging and error tracking
10. **Documentation**: API documentation with Swagger/OpenAPI

---

## 🔍 Quick Start

1. **Install dependencies**: `npm install`
2. **Configure environment**: Copy `env.example` to `.env` and fill in values
3. **Test configuration**: `npm run test-config`
4. **Start server**: `npm start` or `npm run dev` (with nodemon)
5. **Access**: `http://localhost:3000`

---

*Last Updated: Generated automatically*
*For testing instructions, see TESTING_GUIDE.md*


