# 🧪 Local Testing Setup - COMPLETE

## ✅ Environment Configuration Complete

Your `.env` file has been configured for local testing with:

### ✅ Required Variables
- ✅ `JWT_SECRET` - Secure secret (64+ characters)
- ✅ `SESSION_SECRET` - Generated secure secret (64+ characters)
- ✅ `GENIUS_ACCESS_TOKEN` - Your Genius API token
- ✅ `MONGODB_URI` - Local MongoDB (falls back to demo mode if not available)
- ✅ `MONGODB_URI_PROD` - Your MongoDB Atlas connection

### ✅ Configuration Variables
- ✅ `NODE_ENV=development` - Development mode
- ✅ `PORT=3000` - Server port
- ✅ `CLIENT_URL=http://localhost:3000` - Local client URL
- ✅ `CORS_ORIGIN=http://localhost:3000` - CORS allowed origin
- ✅ `JWT_EXPIRES_IN=7d` - Token expiration

---

## 🚀 Start Local Testing

### Method 1: Development Mode (Recommended)
```bash
npm run dev
```
- Uses nodemon for auto-reload
- Shows detailed error messages
- Best for development

### Method 2: Production Mode
```bash
npm start
```
- Standard Node.js start
- Production-like environment
- Good for testing production behavior

---

## 🧪 Test the Application

### 1. Start the Server
```bash
npm run dev
```

### 2. Verify Health Endpoint
```bash
# In another terminal
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"OK","timestamp":"2024-..."}
```

### 3. Test API Endpoints

#### Test Articles
```bash
curl http://localhost:3000/api/articles/featured
```

#### Test Ads
```bash
curl http://localhost:3000/api/ads/inventory
```

#### Test Authentication
```bash
# Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Sign in
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### 4. Use Manual Testing Tool
```bash
# Quick test suite
node test-manual.js

# Test specific endpoint
node test-manual.js /api/health GET
node test-manual.js /api/articles/featured GET
```

---

## ✅ Automated Testing

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Specific Test Suite
```bash
npm test -- health.test.js
npm test -- articles.test.js
npm test -- ads.test.js
```

---

## 🔍 Verify Configuration

### Validate Environment
```bash
npm run validate-env
```

Expected output:
```
✅ All required environment variables are valid!
```

### Test Server Configuration
```bash
npm run test-config
```

---

## 📋 Local Testing Checklist

Before starting:
- [x] Environment variables configured
- [x] Secrets generated securely
- [ ] MongoDB available (or using demo mode)
- [ ] Genius API token set (for lyrics features)
- [ ] Server starts without errors

During testing:
- [ ] Health endpoint responds
- [ ] API endpoints work
- [ ] Authentication flow works
- [ ] Tests pass
- [ ] Manual testing tool works

---

## 🎯 What Works Locally

### ✅ Fully Functional
- ✅ Health check endpoint
- ✅ Articles API (demo data)
- ✅ Advertising API (mock data)
- ✅ User authentication (if MongoDB available)
- ✅ JWT token generation

### ⚠️ Requires External Services
- ⚠️ Lyrics API (requires Genius API token)
- ⚠️ User data (requires MongoDB)
- ⚠️ Social auth (requires OAuth credentials)

### 💡 Demo Mode
- ✅ Works without MongoDB (uses demo mode)
- ✅ Basic features available
- ✅ Full testing possible

---

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check environment
npm run validate-env

# Check port availability
lsof -i :3000

# Check logs
npm run dev  # Shows detailed errors
```

### MongoDB Connection Issues
- **Demo Mode**: Application works without MongoDB
- **MongoDB Atlas**: Ensure connection string is correct
- **Local MongoDB**: Ensure MongoDB is running on port 27017

### API Errors
```bash
# Check health endpoint
curl http://localhost:3000/api/health

# Check specific endpoint
curl http://localhost:3000/api/articles/featured

# Check server logs
npm run dev  # Shows detailed errors
```

---

## 📚 Quick Commands Reference

```bash
# Start server
npm run dev          # Development mode
npm start            # Production mode

# Testing
npm test             # Run all tests
npm run test:watch   # Watch mode
node test-manual.js  # Manual API testing

# Validation
npm run validate-env      # Validate environment
npm run test-config       # Test configuration
npm run validate-env:prod # Validate production env

# Health check
curl http://localhost:3000/api/health
```

---

## ✅ Ready for Local Testing!

Your environment is configured and ready for testing. 

**Start testing:**
```bash
npm run dev
```

Then in another terminal:
```bash
curl http://localhost:3000/api/health
```

**Happy testing!** 🚀


