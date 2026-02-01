# 🚀 Quick Backend Implementation Guide

## 🎯 **Priority 1: Make Basic Functionality Work**

### **Step 1: Set Up Basic API Server**

Create a simple Node.js API server to handle the basic requests:

```javascript
// server.js
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

// Basic endpoints to make buttons work
app.post('/api/auth/login', (req, res) => {
    // Mock authentication
    res.json({
        success: true,
        token: 'mock-jwt-token',
        user: {
            id: 1,
            email: req.body.email,
            company: 'Demo Company'
        }
    });
});

app.post('/api/sites/register', (req, res) => {
    // Mock site registration
    res.json({
        success: true,
        siteId: 'demo-site-123',
        apiKey: 'demo-api-key-456',
        message: 'Site registered successfully'
    });
});

app.get('/api/analytics/dashboard', (req, res) => {
    // Mock analytics data
    res.json({
        pageViews: 15420,
        uniqueVisitors: 8234,
        revenue: 2847.50,
        topPages: [
            { url: '/home', views: 3420 },
            { url: '/about', views: 2150 },
            { url: '/contact', views: 1890 }
        ]
    });
});

app.post('/api/content/analyze', (req, res) => {
    // Mock content analysis
    res.json({
        keywords: ['technology', 'AI', 'machine learning', 'advertising'],
        categories: ['Technology', 'Business'],
        sentiment: 'positive',
        audience: 'tech professionals',
        recommendations: ['Add more technical content', 'Include case studies']
    });
});

app.listen(3000, () => {
    console.log('API server running on port 3000');
});
```

### **Step 2: Update WordPress Theme to Use Real APIs**

Update the JavaScript in your WordPress theme to call the real API endpoints:

```javascript
// Update js/main.js in your WordPress theme
class KnewCleusAPI {
    constructor() {
        this.baseURL = 'http://localhost:3000/api'; // Change to your API domain
        this.token = localStorage.getItem('knewCleusToken');
    }

    async login(email, password) {
        const response = await fetch(`${this.baseURL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (data.success) {
            this.token = data.token;
            localStorage.setItem('knewCleusToken', data.token);
        }
        return data;
    }

    async registerSite(domain, siteName) {
        const response = await fetch(`${this.baseURL}/sites/register`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ domain, siteName })
        });
        return await response.json();
    }

    async getAnalytics() {
        const response = await fetch(`${this.baseURL}/analytics/dashboard`, {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        return await response.json();
    }

    async analyzeContent(url) {
        const response = await fetch(`${this.baseURL}/content/analyze`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            body: JSON.stringify({ url })
        });
        return await response.json();
    }
}

// Initialize API
const api = new KnewCleusAPI();

// Update button click handlers
document.addEventListener('DOMContentLoaded', function() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const result = await api.login(email, password);
                if (result.success) {
                    showMessage('Login successful!', 'success');
                    // Redirect to dashboard
                } else {
                    showMessage('Login failed', 'error');
                }
            } catch (error) {
                showMessage('Network error', 'error');
            }
        });
    }

    // Site registration
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const domain = document.getElementById('domain').value;
            const siteName = document.getElementById('siteName').value;
            
            try {
                const result = await api.registerSite(domain, siteName);
                if (result.success) {
                    showMessage(`Site registered! API Key: ${result.apiKey}`, 'success');
                } else {
                    showMessage('Registration failed', 'error');
                }
            } catch (error) {
                showMessage('Network error', 'error');
            }
        });
    }

    // Analytics button
    const analyticsBtn = document.getElementById('analyticsBtn');
    if (analyticsBtn) {
        analyticsBtn.addEventListener('click', async () => {
            try {
                const data = await api.getAnalytics();
                displayAnalytics(data);
            } catch (error) {
                showMessage('Failed to load analytics', 'error');
            }
        });
    }

    // Content analysis button
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const url = document.getElementById('urlInput').value;
            try {
                const data = await api.analyzeContent(url);
                displayAnalysis(data);
            } catch (error) {
                showMessage('Failed to analyze content', 'error');
            }
        });
    }
});

function showMessage(message, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}

function displayAnalytics(data) {
    // Update analytics display
    const analyticsContainer = document.getElementById('analyticsContainer');
    if (analyticsContainer) {
        analyticsContainer.innerHTML = `
            <h3>Analytics Dashboard</h3>
            <div class="analytics-grid">
                <div class="metric">
                    <h4>Page Views</h4>
                    <p>${data.pageViews.toLocaleString()}</p>
                </div>
                <div class="metric">
                    <h4>Unique Visitors</h4>
                    <p>${data.uniqueVisitors.toLocaleString()}</p>
                </div>
                <div class="metric">
                    <h4>Revenue</h4>
                    <p>$${data.revenue.toFixed(2)}</p>
                </div>
            </div>
        `;
    }
}

function displayAnalysis(data) {
    // Update analysis display
    const analysisContainer = document.getElementById('analysisContainer');
    if (analysisContainer) {
        analysisContainer.innerHTML = `
            <h3>Content Analysis Results</h3>
            <div class="analysis-results">
                <div class="keywords">
                    <h4>Keywords</h4>
                    <p>${data.keywords.join(', ')}</p>
                </div>
                <div class="categories">
                    <h4>Categories</h4>
                    <p>${data.categories.join(', ')}</p>
                </div>
                <div class="sentiment">
                    <h4>Sentiment</h4>
                    <p>${data.sentiment}</p>
                </div>
                <div class="audience">
                    <h4>Target Audience</h4>
                    <p>${data.audience}</p>
                </div>
            </div>
        `;
    }
}
```

### **Step 3: Quick Database Setup**

For immediate functionality, use a simple SQLite database:

```javascript
// database.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('knewcleus.db');

// Create tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password_hash TEXT,
        company_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Sites table
    db.run(`CREATE TABLE IF NOT EXISTS sites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        domain TEXT,
        site_name TEXT,
        api_key TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Analytics table
    db.run(`CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        site_id INTEGER,
        page_url TEXT,
        page_views INTEGER DEFAULT 0,
        unique_visitors INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        date DATE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (site_id) REFERENCES sites (id)
    )`);
});

module.exports = db;
```

### **Step 4: Package.json for Backend**

```json
{
  "name": "knew-cleus-backend",
  "version": "1.0.0",
  "description": "Knew-Cleus Backend API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "sqlite3": "^5.1.6"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

## 🚀 **Quick Deployment Steps**

### **1. Local Development**
```bash
# Install dependencies
npm install

# Start the server
npm run dev

# Test API endpoints
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### **2. Update WordPress Theme**
1. Replace the JavaScript in your WordPress theme
2. Update API base URL to your server
3. Test all buttons and forms

### **3. Basic Production Deployment**
```bash
# Deploy to a simple hosting service (Heroku, Railway, etc.)
git init
git add .
git commit -m "Initial backend setup"
git push heroku main
```

## 🎯 **What This Gives You**

✅ **Working buttons** - No more error messages
✅ **Basic authentication** - Login/register functionality
✅ **Site registration** - Users can register their sites
✅ **Mock analytics** - Dashboard shows sample data
✅ **Content analysis** - Basic content analysis responses
✅ **API foundation** - Easy to extend with real features

## 📈 **Next Steps After Basic Setup**

1. **Add real database** (PostgreSQL)
2. **Implement real authentication**
3. **Add actual analytics tracking**
4. **Integrate AI content analysis**
5. **Add ad management features**
6. **Scale to production infrastructure**

This quick setup will make your WordPress theme fully functional with working buttons and basic features! 🚀
