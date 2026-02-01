# 🚀 Start Testing - Quick Guide

## ✅ Server Started!

The server should be starting now. Here's how to test:

---

## 🔍 Quick Test Commands

### 1. Health Check
```bash
curl http://localhost:3000/api/health
```

Expected response:
```json
{"status":"OK","timestamp":"2024-..."}
```

### 2. Test Articles API
```bash
curl http://localhost:3000/api/articles/featured
```

### 3. Test Ads API
```bash
curl http://localhost:3000/api/ads/inventory
```

### 4. Use Manual Testing Tool
```bash
node test-manual.js
```

### 5. Run Automated Tests
```bash
npm test
```

---

## 🌐 Access Points

### API Endpoints
- **Health**: http://localhost:3000/api/health
- **Articles**: http://localhost:3000/api/articles/featured
- **Ads**: http://localhost:3000/api/ads/inventory
- **Lyrics**: http://localhost:3000/api/lyrics/trending

### Frontend
- **Main**: http://localhost:3000
- **Lyrics**: http://localhost:3000/lyrics.html
- **Articles**: http://localhost:3000/articles.html
- **Profile**: http://localhost:3000/profile.html

---

## 📋 What to Test

### ✅ Immediate Tests
1. **Health Endpoint** - Server status
2. **Articles API** - Content retrieval
3. **Ads API** - Ad inventory
4. **Authentication** - Sign up/sign in

### 🧪 Testing Workflow
1. Run `npm test` for automated tests
2. Use `node test-manual.js` for manual API testing
3. Access frontend at http://localhost:3000
4. Test each feature individually

---

## 🐛 Troubleshooting

### Server Not Responding?
```bash
# Check if server is running
ps aux | grep node

# Check port 3000
lsof -i:3000

# Start manually
npm start
# or
npm run dev
```

### Check Logs
Look at the terminal where you started the server for:
- Startup messages
- Connection status
- Error messages

---

## ✅ Ready to Test!

**Server is configured and ready!**

Start testing:
1. Open http://localhost:3000 in your browser
2. Test API endpoints with curl or test-manual.js
3. Run `npm test` for automated tests
4. Begin development!

**Happy testing!** 🚀


