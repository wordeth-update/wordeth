# 🚀 START HERE - Local Testing

## ✅ Environment Configured!

Your `.env` file is configured and ready. Now start the server!

---

## 🚀 Start the Server

### Option 1: Development Mode (Recommended)
```bash
npm run dev
```
- Auto-reloads on file changes
- Better error messages
- Best for development

### Option 2: Production Mode
```bash
npm start
```
- Standard Node.js start
- Production-like environment

---

## ✅ Verify Server is Running

Once started, open a **new terminal** and test:

```bash
# Health check
curl http://localhost:3000/api/health

# Should return:
# {"status":"OK","timestamp":"2024-..."}
```

---

## 🧪 Test the Application

### Quick Tests
```bash
# Health check
curl http://localhost:3000/api/health

# Articles
curl http://localhost:3000/api/articles/featured

# Ads
curl http://localhost:3000/api/ads/inventory

# Manual testing tool
node test-manual.js
```

### Automated Tests
```bash
npm test
```

---

## 🌐 Access Points

### Frontend
- **Main**: http://localhost:3000
- **Lyrics**: http://localhost:3000/lyrics.html
- **Articles**: http://localhost:3000/articles.html
- **Profile**: http://localhost:3000/profile.html

### API Endpoints
- **Health**: http://localhost:3000/api/health
- **Articles**: http://localhost:3000/api/articles/featured
- **Ads**: http://localhost:3000/api/ads/inventory
- **Lyrics**: http://localhost:3000/api/lyrics/trending

---

## 📋 Next Steps

1. **Start Server**: Run `npm run dev` in your terminal
2. **Test Health**: Open another terminal and run `curl http://localhost:3000/api/health`
3. **Run Tests**: `npm test`
4. **Begin Development**: Start building features!

---

## ✅ Ready!

**Everything is configured!**

Just run: `npm run dev`

Then test: `curl http://localhost:3000/api/health`

**Let's go!** 🚀


