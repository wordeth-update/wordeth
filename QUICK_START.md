# 🚀 Wordeth Quick Start Guide

## ⚡ Get Running in 10 Minutes

### Step 1: Get the Easiest API Key (Genius)
1. Go to: https://genius.com/api-clients
2. Click "New API Client"
3. Fill in:
   - App Name: `Wordeth`
   - App Website URL: `http://localhost:3000`
   - Redirect URI: `http://localhost:3000`
4. Click "Save"
5. Copy the **Access Token**

### Step 2: Set Up Database (MongoDB Atlas)
1. Go to: https://www.mongodb.com/atlas
2. Click "Try Free"
3. Create account
4. Choose "FREE" tier
5. Create cluster (any region)
6. Create database user:
   - Username: `wordeth_user`
   - Password: `your_strong_password`
7. Add IP: "Allow Access from Anywhere" (0.0.0.0/0)
8. Get connection string and replace `<password>` with your password

### Step 3: Create Environment File
```bash
cp env.example .env
```

Edit `.env` and add your keys:
```env
# Required - Add these first
GENIUS_ACCESS_TOKEN=your_genius_token_here
MONGODB_URI_PROD=mongodb+srv://wordeth_user:your_password@cluster.mongodb.net/wordeth?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-64-characters-long

# Optional - Add these later for social login
TWITTER_CONSUMER_KEY=
TWITTER_CONSUMER_SECRET=
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
```

### Step 4: Test Configuration
```bash
npm run test-config
```

### Step 5: Start the Server
```bash
npm start
```

### Step 6: Open in Browser
Go to: http://localhost:3000

## 🎯 What Works Now

✅ **Lyrics Search** - Using Genius API  
✅ **User Registration/Login** - JWT authentication  
✅ **Database Storage** - MongoDB Atlas  
✅ **File Uploads** - Avatar and merch images  
✅ **Basic UI** - All pages functional  

## 🔄 What to Add Later

⏳ **Social Login** - Twitter, Instagram, Facebook  
⏳ **Video Calling** - WebRTC implementation  
⏳ **Custom Domain** - Production deployment  

## 🆘 Troubleshooting

**Server won't start?**
- Run `npm run test-config` to check your environment
- Make sure all required variables are set

**Database connection error?**
- Check your MongoDB Atlas connection string
- Verify IP whitelist includes 0.0.0.0/0

**Lyrics not loading?**
- Verify your Genius API token
- Check browser console for errors

## 📞 Need Help?

1. Check `API_KEYS_REFERENCE.md` for detailed setup
2. Run `npm run test-config` to diagnose issues
3. Check server logs for error messages

## 🎉 You're Ready!

Your Wordeth app is now running with:
- ✅ Lyrics search and display
- ✅ User authentication
- ✅ Database storage
- ✅ File uploads
- ✅ Modern UI

Add social login and deploy when ready!
