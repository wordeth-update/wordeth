# 🔑 Wordeth API Keys Reference

## 📋 API Keys Summary Table

| **Service** | **Website** | **Key Name** | **Status** | **Cost** | **Notes** |
|-------------|-------------|--------------|------------|----------|-----------|
| **Genius API** | https://genius.com/api-clients | `GENIUS_ACCESS_TOKEN` | ⏳ Pending | **FREE** | Lyrics API |
| **Twitter/X OAuth** | https://developer.twitter.com/ | `TWITTER_CONSUMER_KEY` | ⏳ Pending | **FREE** | Social Login |
| **Twitter/X OAuth** | https://developer.twitter.com/ | `TWITTER_CONSUMER_SECRET` | ⏳ Pending | **FREE** | Social Login |
| **Instagram OAuth** | https://developers.facebook.com/ | `INSTAGRAM_CLIENT_ID` | ⏳ Pending | **FREE** | Social Login |
| **Instagram OAuth** | https://developers.facebook.com/ | `INSTAGRAM_CLIENT_SECRET` | ⏳ Pending | **FREE** | Social Login |
| **Facebook OAuth** | https://developers.facebook.com/ | `FACEBOOK_APP_ID` | ⏳ Pending | **FREE** | Social Login |
| **Facebook OAuth** | https://developers.facebook.com/ | `FACEBOOK_APP_SECRET` | ⏳ Pending | **FREE** | Social Login |
| **MongoDB Atlas** | https://www.mongodb.com/atlas | `MONGODB_URI_PROD` | ⏳ Pending | **FREE** | Database |

---

## 🎯 Step-by-Step API Key Acquisition

### 1. **Genius API (Lyrics) - EASIEST** ⭐
**Website:** https://genius.com/api-clients

**Steps:**
1. Go to https://genius.com/api-clients
2. Click "New API Client"
3. Fill in:
   - **App Name:** Wordeth
   - **App Website URL:** https://your-app.herokuapp.com (or localhost:3000 for testing)
   - **Redirect URI:** https://your-app.herokuapp.com (or localhost:3000 for testing)
4. Click "Save"
5. Copy the **Access Token**

**Key to Save:** `GENIUS_ACCESS_TOKEN`

---

### 2. **MongoDB Atlas (Database) - FREE** ⭐
**Website:** https://www.mongodb.com/atlas

**Steps:**
1. Go to https://www.mongodb.com/atlas
2. Click "Try Free"
3. Create account or sign in
4. Choose "FREE" tier (M0)
5. Select cloud provider (AWS/Google Cloud/Azure)
6. Choose region (closest to you)
7. Click "Create Cluster"
8. Create database user:
   - Username: `wordeth_user`
   - Password: Generate strong password
   - Save credentials!
9. Add IP address: Click "Network Access" → "Add IP Address" → "Allow Access from Anywhere" (0.0.0.0/0)
10. Get connection string:
    - Click "Connect" → "Connect your application"
    - Copy the connection string
    - Replace `<password>` with your database password

**Key to Save:** `MONGODB_URI_PROD`

---

### 3. **Twitter/X OAuth - FREE** ⭐
**Website:** https://developer.twitter.com/

**Steps:**
1. Go to https://developer.twitter.com/
2. Sign in with your Twitter account
3. Click "Apply for a developer account"
4. Fill out the application:
   - **Primary reason for using Twitter data:** "Building a social music platform"
   - **Will you analyze Twitter data:** "No"
   - **Will you share Twitter data:** "No"
5. Wait for approval (usually 24-48 hours)
6. Once approved:
   - Go to "Projects & Apps" → "Create App"
   - App name: "Wordeth"
   - Use case: "Social music platform"
7. In your app settings:
   - Go to "Keys and tokens"
   - Copy **API Key** and **API Key Secret**
   - Go to "Authentication settings"
   - Enable OAuth 1.0a
   - Add callback URL: `https://your-app.herokuapp.com/api/auth/twitter/callback`

**Keys to Save:** 
- `TWITTER_CONSUMER_KEY` (API Key)
- `TWITTER_CONSUMER_SECRET` (API Key Secret)

---

### 4. **Facebook/Instagram OAuth - FREE** ⭐
**Website:** https://developers.facebook.com/

**Steps:**
1. Go to https://developers.facebook.com/
2. Click "Get Started" or "My Apps"
3. Click "Create App"
4. Choose "Consumer" app type
5. Fill in:
   - **App Name:** Wordeth
   - **App Contact Email:** Your email
6. Click "Create App"
7. Add products:
   - **Facebook Login**
   - **Instagram Basic Display**
8. For Facebook Login:
   - Go to "Facebook Login" → "Settings"
   - Add OAuth redirect URI: `https://your-app.herokuapp.com/api/auth/facebook/callback`
   - Save
9. For Instagram Basic Display:
   - Go to "Instagram Basic Display" → "Basic Display"
   - Add OAuth redirect URI: `https://your-app.herokuapp.com/api/auth/instagram/callback`
   - Save
10. Get credentials:
    - Go to "Settings" → "Basic"
    - Copy **App ID** and **App Secret**

**Keys to Save:**
- `FACEBOOK_APP_ID` (App ID)
- `FACEBOOK_APP_SECRET` (App Secret)
- `INSTAGRAM_CLIENT_ID` (Same App ID)
- `INSTAGRAM_CLIENT_SECRET` (Same App Secret)

---

## 🔐 Environment Variables Setup

Once you have all keys, create your `.env` file:

```bash
# Copy the template
cp env.example .env
```

Then fill in your `.env` file with the actual keys:

```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/wordeth
MONGODB_URI_PROD=mongodb+srv://wordeth_user:your_password@cluster.mongodb.net/wordeth?retryWrites=true&w=majority

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development

# Social Authentication
TWITTER_CONSUMER_KEY=your_twitter_api_key
TWITTER_CONSUMER_SECRET=your_twitter_api_secret
TWITTER_CALLBACK_URL=http://localhost:3000/api/auth/twitter/callback

INSTAGRAM_CLIENT_ID=your_facebook_app_id
INSTAGRAM_CLIENT_SECRET=your_facebook_app_secret
INSTAGRAM_CALLBACK_URL=http://localhost:3000/api/auth/instagram/callback

FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
FACEBOOK_CALLBACK_URL=http://localhost:3000/api/auth/facebook/callback

# Lyrics API
GENIUS_ACCESS_TOKEN=your_genius_access_token

# Production URLs
PRODUCTION_URL=https://your-domain.com
CLIENT_URL=http://localhost:3000

# Security
CORS_ORIGIN=http://localhost:3000
SESSION_SECRET=your-session-secret-key
```

---

## 🚀 Quick Start Priority Order

1. **Start with Genius API** (5 minutes, no approval needed)
2. **Set up MongoDB Atlas** (10 minutes, free tier)
3. **Get Facebook/Instagram keys** (15 minutes, same app)
4. **Apply for Twitter API** (24-48 hour wait, then 10 minutes)

---

## 📞 Need Help?

If you encounter any issues:
- **Genius API:** Usually instant, no approval needed
- **MongoDB Atlas:** Free tier available immediately
- **Facebook/Instagram:** Same app, instant approval
- **Twitter/X:** Requires application approval (24-48 hours)

---

## 🔒 Security Notes

- Keep your `.env` file secure and never commit it to git
- Use strong, unique passwords for database
- Rotate API keys periodically
- Monitor API usage limits

---

## ✅ Checklist

- [ ] Genius API access token
- [ ] MongoDB Atlas connection string
- [ ] Twitter API key and secret
- [ ] Facebook/Instagram app ID and secret
- [ ] Environment file created and filled
- [ ] Server starts without errors
- [ ] All features tested locally
