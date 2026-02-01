# Wordeth Testing Guide

## 🧪 Testing Setup

This guide provides comprehensive testing instructions for the Wordeth platform.

---

## Quick Test Commands

### 1. Configuration Test
```bash
npm run test-config
```
Tests that all required environment variables are set.

### 2. Server Health Check
```bash
# After starting server
curl http://localhost:3000/api/health
```

### 3. Run Automated Tests
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- auth.test.js
```

---

## 🚀 Manual Testing Workflows

### Authentication Flow

#### 1. User Registration
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Expected Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "_id": "...",
    "name": "Test User",
    "email": "test@example.com"
  }
}
```

#### 2. User Login
```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

#### 3. Verify Token
```bash
curl -X GET http://localhost:3000/api/auth/verify \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

### User Profile Flow

#### 1. Get Profile (requires auth)
```bash
curl -X GET http://localhost:3000/api/user/profile \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### 2. Update Avatar
```bash
curl -X POST http://localhost:3000/api/user/avatar \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -F "avatar=@/path/to/image.jpg"
```

#### 3. Add to Search History
```bash
curl -X POST http://localhost:3000/api/user/history \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "songTitle": "Bohemian Rhapsody",
    "artist": "Queen"
  }'
```

---

### Lyrics Flow

#### 1. Search for Songs
```bash
curl "http://localhost:3000/api/lyrics/search?q=bohemian+rhapsody"
```

**Expected Response:**
```json
{
  "hits": [
    {
      "id": 12345,
      "title": "Bohemian Rhapsody",
      "artist": "Queen",
      "image": "https://...",
      "url": "https://genius.com/..."
    }
  ]
}
```

#### 2. Get Song Details
```bash
curl http://localhost:3000/api/lyrics/song/12345
```

#### 3. Get Lyrics
```bash
curl http://localhost:3000/api/lyrics/lyrics/12345
```

#### 4. Get Trending Songs
```bash
curl http://localhost:3000/api/lyrics/trending
```

---

### Articles Flow

#### 1. Get Featured Articles
```bash
curl http://localhost:3000/api/articles/featured
```

#### 2. Get All Articles (with pagination)
```bash
curl "http://localhost:3000/api/articles?page=1&limit=5"
```

#### 3. Get Single Article
```bash
curl http://localhost:3000/api/articles/1
```

#### 4. Get Articles by Category
```bash
curl http://localhost:3000/api/articles/category/music
```

#### 5. Search Articles
```bash
curl http://localhost:3000/api/articles/search/hip-hop
```

---

### Merchandise Flow

#### 1. Get Products
```bash
curl "http://localhost:3000/api/merch/products?limit=10"
```

#### 2. Get Product Details
```bash
curl http://localhost:3000/api/merch/products/PRODUCT_ID
```

#### 3. Get Available Fonts
```bash
curl http://localhost:3000/api/merch/fonts
```

#### 4. Create Custom Design (requires auth)
```bash
curl -X POST http://localhost:3000/api/merch/designs \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "PRODUCT_ID",
    "lyrics": "Song lyrics here...",
    "options": {
      "font": "Arial",
      "color": "#000000"
    }
  }'
```

---

### Advertising Flow

#### 1. Get Ad Inventory
```bash
curl http://localhost:3000/api/ads/inventory
```

#### 2. Get Contextual Ads
```bash
curl -X POST http://localhost:3000/api/ads/contextual \
  -H "Content-Type: application/json" \
  -d '{
    "searchTerm": "ice cream song",
    "songData": {
      "title": "Ice Cream Song",
      "artist": "Artist Name"
    }
  }'
```

#### 3. Track Ad Impression
```bash
curl -X POST http://localhost:3000/api/ads/impression \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "ice_cream_1",
    "adType": "in_video",
    "target": "song_search",
    "timestamp": "2024-01-01T00:00:00Z"
  }'
```

#### 4. Track Ad Click
```bash
curl -X POST http://localhost:3000/api/ads/click \
  -H "Content-Type: application/json" \
  -d '{
    "adId": "ice_cream_1",
    "adType": "in_video",
    "target": "song_search",
    "timestamp": "2024-01-01T00:00:00Z"
  }'
```

#### 5. Get Analytics
```bash
curl http://localhost:3000/api/ads/analytics
```

---

## 🧪 Automated Test Examples

### Test Environment Variables
Create a `.env.test` file for testing:
```env
JWT_SECRET=test-secret-key
MONGODB_URI=mongodb://localhost:27017/wordeth_test
GENIUS_ACCESS_TOKEN=test-token
NODE_ENV=test
PORT=3001
```

### Example Test Structure

#### Auth Tests (`tests/auth.test.js`)
```javascript
describe('Authentication', () => {
  test('should register a new user', async () => {
    // Test user registration
  });

  test('should login with correct credentials', async () => {
    // Test login
  });

  test('should reject invalid credentials', async () => {
    // Test error handling
  });
});
```

#### Lyrics Tests (`tests/lyrics.test.js`)
```javascript
describe('Lyrics API', () => {
  test('should search for songs', async () => {
    // Test search functionality
  });

  test('should get song details', async () => {
    // Test song details
  });
});
```

---

## 🔍 Testing Checklist

### Authentication
- [ ] User can register
- [ ] User can login
- [ ] Invalid credentials are rejected
- [ ] Token verification works
- [ ] Protected routes require authentication
- [ ] Social OAuth redirects work (if configured)

### User Profile
- [ ] Profile can be retrieved
- [ ] Avatar can be uploaded
- [ ] Search history is tracked
- [ ] Annotations can be added
- [ ] Friends can be followed
- [ ] Custom merch can be created

### Lyrics
- [ ] Songs can be searched
- [ ] Song details are returned
- [ ] Lyrics are extracted
- [ ] Trending songs are returned
- [ ] Invalid queries are handled

### Articles
- [ ] Featured articles are returned
- [ ] Pagination works
- [ ] Articles can be filtered by category
- [ ] Articles can be searched
- [ ] Single article can be retrieved

### Merchandise
- [ ] Products can be listed
- [ ] Product details are returned
- [ ] Fonts are available
- [ ] Designs can be created (with auth)
- [ ] Shipping can be calculated

### Advertising
- [ ] Ad inventory is returned
- [ ] Contextual ads match search terms
- [ ] Impressions are tracked
- [ ] Clicks are tracked
- [ ] Analytics are calculated

---

## 🐛 Debugging Tips

### Common Issues

1. **MongoDB Connection Error**
   - Check `MONGODB_URI` in `.env`
   - Verify MongoDB is running
   - Check network connectivity for Atlas

2. **JWT Token Errors**
   - Verify `JWT_SECRET` is set
   - Check token format in Authorization header
   - Ensure token hasn't expired

3. **Genius API Errors**
   - Verify `GENIUS_ACCESS_TOKEN` is valid
   - Check API rate limits
   - Verify network connectivity

4. **File Upload Errors**
   - Check uploads directory exists
   - Verify file size limits
   - Check file type restrictions

---

## 📊 Performance Testing

### Load Testing Example
```bash
# Using Apache Bench
ab -n 1000 -c 10 http://localhost:3000/api/health

# Using curl for sequential testing
for i in {1..100}; do
  curl http://localhost:3000/api/health
done
```

---

## 🔒 Security Testing

### Test Cases
- [ ] SQL/NoSQL injection attempts fail
- [ ] XSS attempts are sanitized
- [ ] CSRF protection is active
- [ ] Rate limiting works
- [ ] Authentication tokens are validated
- [ ] File uploads are restricted

---

*For API reference, see PROJECT_ANALYSIS.md*


