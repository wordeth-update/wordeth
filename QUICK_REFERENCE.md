# 📖 Wordeth Project - Quick Reference

## 🎯 Current Project Status

**Status:** ✅ **READY FOR TESTING**  
**Version:** 1.0.0  
**Platform:** Node.js + Express + MongoDB

---

## 📊 All Current Functions

### 🔐 Authentication (`/api/auth`)
1. `POST /api/auth/signup` - Register new user
2. `POST /api/auth/signin` - User login
3. `GET /api/auth/verify` - Verify JWT token
4. `GET /api/auth/twitter` - Twitter OAuth
5. `GET /api/auth/twitter/callback` - Twitter callback
6. `GET /api/auth/instagram` - Instagram OAuth
7. `GET /api/auth/instagram/callback` - Instagram callback
8. `GET /api/auth/facebook` - Facebook OAuth
9. `GET /api/auth/facebook/callback` - Facebook callback

### 👤 User Profile (`/api/user`)
1. `GET /api/user/profile` - Get user profile ⚠️ Auth required
2. `POST /api/user/avatar` - Upload avatar ⚠️ Auth required
3. `GET /api/user/history` - Get search history ⚠️ Auth required
4. `POST /api/user/history` - Add to search history ⚠️ Auth required
5. `GET /api/user/annotations` - Get annotations ⚠️ Auth required
6. `POST /api/user/annotations` - Add annotation ⚠️ Auth required
7. `GET /api/user/friends` - Get friends/following ⚠️ Auth required
8. `POST /api/user/friends/:id` - Follow a user ⚠️ Auth required
9. `GET /api/user/merch` - Get custom merch ⚠️ Auth required
10. `POST /api/user/merch` - Create custom merch ⚠️ Auth required

### 🎵 Lyrics (`/api/lyrics`)
1. `GET /api/lyrics/search?q={query}` - Search for songs
2. `GET /api/lyrics/song/:id` - Get song details
3. `GET /api/lyrics/lyrics/:id` - Get song lyrics
4. `GET /api/lyrics/trending` - Get trending songs

### 📰 Articles (`/api/articles`)
1. `GET /api/articles/featured` - Get featured articles
2. `GET /api/articles` - Get all articles (paginated)
3. `GET /api/articles/:id` - Get single article
4. `GET /api/articles/category/:category` - Get by category
5. `GET /api/articles/search/:query` - Search articles

### 📢 Advertising (`/api/ads`)
1. `GET /api/ads/inventory` - Get ad inventory
2. `POST /api/ads/contextual` - Get contextual ads
3. `POST /api/ads/impression` - Track impression
4. `POST /api/ads/click` - Track click
5. `POST /api/ads/pageview` - Track page view
6. `GET /api/ads/analytics` - Get analytics
7. `POST /api/ads/admin/ad` - Add ad (admin)
8. `PUT /api/ads/admin/ad/:id` - Update ad (admin)
9. `DELETE /api/ads/admin/ad/:id` - Delete ad (admin)

### 🛍️ Merchandise (`/api/merch`)
1. `GET /api/merch/products` - Get products
2. `GET /api/merch/products/:productId` - Get product details
3. `GET /api/merch/fonts` - Get available fonts
4. `POST /api/merch/designs` - Create custom design ⚠️ Auth required
5. `GET /api/merch/designs/:designId/preview` - Get preview
6. `POST /api/merch/shipping/calculate` - Calculate shipping
7. `POST /api/merch/orders` - Create order ⚠️ Auth required
8. `GET /api/merch/orders/:orderId` - Get order status ⚠️ Auth required
9. `GET /api/merch/orders` - Get order history ⚠️ Auth required
10. `GET /api/merch/health` - InkSoft health check

### 🏥 Health Check
1. `GET /api/health` - Server health status

---

## 🧪 Testing Capabilities

### ✅ Automated Testing (Jest + Supertest)
```bash
npm test              # Run all tests with coverage
npm run test:watch    # Watch mode
npm run test:unit     # Unit tests only
npm run test:integration # Integration tests only
```

**Test Files Created:**
- ✅ `tests/health.test.js` - Health endpoint tests
- ✅ `tests/auth.test.js` - Authentication tests
- ✅ `tests/articles.test.js` - Articles API tests
- ✅ `tests/ads.test.js` - Advertising API tests

### ✅ Manual Testing Tool
```bash
# Start server first
npm start

# In another terminal
node test-manual.js                              # Quick test suite
node test-manual.js /api/health GET              # Test specific endpoint
node test-manual.js /api/auth/signup POST '{...}' # Test with data
```

### ✅ Configuration Testing
```bash
npm run test-config    # Test environment variables
```

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `CURRENT_STATUS.md` | Complete project status |
| `PROJECT_ANALYSIS.md` | Full API documentation |
| `TESTING_GUIDE.md` | Detailed testing guide |
| `TESTING_QUICKSTART.md` | Quick testing reference |
| `QUICK_REFERENCE.md` | This file - quick reference |
| `README_TESTING.md` | Testing overview |
| `QUICK_START.md` | Setup instructions |
| `README.md` | Main README |

---

## 🚀 Quick Start Testing

### Option 1: Automated Tests
```bash
# 1. Install dependencies (already done)
npm install

# 2. Run tests
npm test
```

### Option 2: Manual Testing
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Run manual tests
node test-manual.js
```

### Option 3: Test Configuration
```bash
# Test environment setup
npm run test-config
```

---

## 📋 Testing Checklist

### ✅ Completed
- [x] Jest framework installed
- [x] Test files created
- [x] Test scripts configured
- [x] Manual testing tool created
- [x] Documentation written
- [x] Server configured for testing

### ⏳ Ready to Run
- [ ] Run `npm test` to execute tests
- [ ] Run `node test-manual.js` for manual testing
- [ ] Review test coverage report
- [ ] Add more tests as needed

---

## 🔧 Environment Setup

### Required (for full functionality)
```env
JWT_SECRET=your-secret-key
MONGODB_URI_PROD=mongodb+srv://...
GENIUS_ACCESS_TOKEN=your-token
```

### Optional (for social auth)
```env
TWITTER_CONSUMER_KEY=
TWITTER_CONSUMER_SECRET=
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

---

## 📊 Summary

- **Total API Endpoints:** 45+
- **Test Files:** 4
- **Test Coverage:** Health, Auth, Articles, Ads
- **Manual Testing:** Available via `test-manual.js`
- **Documentation:** Complete

---

## 🎯 Next Steps

1. ✅ Run `npm test` to see current test results
2. ✅ Run `node test-manual.js` for interactive testing
3. ✅ Review `PROJECT_ANALYSIS.md` for complete API docs
4. ✅ Add more tests as you develop features

---

**Ready to test!** 🚀  
Run `npm test` or `node test-manual.js` to get started.

