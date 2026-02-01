# 🧪 Quick Testing Guide

## Get Started Testing in 3 Steps

### Step 1: Install Test Dependencies
```bash
npm install
```

This will install Jest, Supertest, and other testing tools.

### Step 2: Run Automated Tests
```bash
# Run all tests
npm test

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Run specific test file
npm test -- auth.test.js
```

### Step 3: Manual API Testing
```bash
# Start your server first
npm start

# In another terminal, run quick tests
node test-manual.js

# Test a specific endpoint
node test-manual.js /api/health GET
node test-manual.js /api/articles/featured GET

# Test with authentication
# First, sign up to get a token:
node test-manual.js /api/auth/signup POST '{"name":"Test","email":"test@example.com","password":"password123"}'

# Then use the token in subsequent requests (update test-manual.js with token)
```

---

## 📋 Available Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with coverage |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:unit` | Run only unit tests |
| `npm run test:integration` | Run only integration tests |
| `npm run test-config` | Test environment configuration |
| `node test-manual.js` | Run manual API tests |

---

## 🎯 Test Coverage

The test suite covers:
- ✅ Health check endpoint
- ✅ User authentication (signup, signin, verify)
- ✅ Articles API (featured, search, categories)
- ✅ Advertising API (inventory, contextual ads, analytics)

**Coming Soon:**
- User profile endpoints
- Lyrics API endpoints
- Merchandise API endpoints
- File upload testing

---

## 🔍 Example Test Output

```bash
$ npm test

 PASS  tests/health.test.js
 PASS  tests/auth.test.js
 PASS  tests/articles.test.js
 PASS  tests/ads.test.js

Test Suites: 4 passed, 4 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        2.345 s
```

---

## 🐛 Troubleshooting

**Tests failing with database connection errors?**
- Make sure MongoDB is running or MongoDB Atlas connection is configured
- Check your `.env` file has `MONGODB_URI` set for test environment

**Tests failing with authentication errors?**
- Tests use a test JWT secret - make sure `JWT_SECRET` is set in `.env`

**Manual tests not connecting?**
- Make sure the server is running: `npm start`
- Check the server is running on the correct port (default: 3000)
- Set `TEST_URL` environment variable if using different URL

---

## 📖 More Information

- See `TESTING_GUIDE.md` for detailed testing instructions
- See `PROJECT_ANALYSIS.md` for API documentation
- See `tests/README.md` for test structure

---

**Ready to test?** Run `npm test` now! 🚀


