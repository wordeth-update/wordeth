# 🚀 Wordeth Deployment Guide

## 📋 Pre-Deployment

### 1. Environment Setup

#### Copy Production Environment Template
```bash
cp production.env.example .env.production
```

#### Fill in Required Values
Edit `.env.production` with your production values:
- Strong JWT_SECRET (64+ characters)
- MongoDB Atlas connection string
- Genius API token
- Production URLs
- Social auth credentials (if using)

### 2. Security Audit
```bash
# Check for vulnerabilities
npm audit
npm audit fix

# Check for outdated packages
npm outdated
npm update
```

### 3. Run Tests
```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Verify test coverage >70%
```

### 4. Build Check
```bash
# If you have a build step
npm run build

# Check package size
npm run size-check  # If configured
```

---

## 🚀 Deployment Options

### Option 1: Heroku

#### Prerequisites
- Heroku CLI installed
- Heroku account created
- Git repository set up

#### Steps
```bash
# 1. Login to Heroku
heroku login

# 2. Create Heroku app
heroku create wordeth-prod

# 3. Add buildpack
heroku buildpacks:set heroku/nodejs

# 4. Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -base64 64)
heroku config:set MONGODB_URI_PROD=your_mongodb_uri
heroku config:set GENIUS_ACCESS_TOKEN=your_token
# ... add all required env vars

# 5. Deploy
git push heroku main

# 6. Open app
heroku open

# 7. Check logs
heroku logs --tail
```

#### Heroku Procfile
Your `Procfile` should contain:
```
web: node server.js
```

### Option 2: AWS EC2 / DigitalOcean / VPS

#### Prerequisites
- Server with Node.js installed
- PM2 installed (`npm install -g pm2`)
- MongoDB Atlas account
- Domain name configured (optional)

#### Steps
```bash
# 1. Clone repository
git clone https://github.com/yourusername/wordeth.git
cd wordeth

# 2. Install dependencies
npm ci --production

# 3. Set up environment file
cp production.env.example .env
# Edit .env with production values

# 4. Start with PM2
pm2 start server.js --name wordeth --env production
pm2 save
pm2 startup

# 5. Set up reverse proxy (Nginx)
# See Nginx configuration below

# 6. Set up SSL (Let's Encrypt)
certbot --nginx -d yourdomain.com
```

#### PM2 Configuration
Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'wordeth',
    script: './server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
```

Start with:
```bash
pm2 start ecosystem.config.js
```

### Option 3: Docker

#### Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  wordeth:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    restart: always
```

#### Deploy
```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Check logs
docker-compose logs -f
```

---

## 🔧 Production Configuration

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### SSL Configuration (with Let's Encrypt)

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 📊 Monitoring Setup

### PM2 Monitoring
```bash
# Monitor
pm2 monit

# Check status
pm2 status

# View logs
pm2 logs wordeth

# Restart
pm2 restart wordeth
```

### Health Checks
```bash
# Check health endpoint
curl https://yourdomain.com/api/health

# Expected response
{"status":"OK","timestamp":"2024-01-01T00:00:00.000Z"}
```

---

## 🔄 Continuous Deployment

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Deploy to production
      run: |
        # Your deployment commands here
        ssh user@server 'cd /path/to/app && git pull && npm ci --production && pm2 restart wordeth'
```

---

## 🚨 Post-Deployment Verification

### 1. Health Check
```bash
curl https://yourdomain.com/api/health
```

### 2. API Endpoints
```bash
# Test public endpoints
curl https://yourdomain.com/api/articles/featured
curl https://yourdomain.com/api/lyrics/trending
```

### 3. Authentication
```bash
# Test signup
curl -X POST https://yourdomain.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","password":"password123"}'
```

### 4. Monitor Logs
```bash
# PM2
pm2 logs wordeth

# Docker
docker-compose logs -f

# Heroku
heroku logs --tail
```

### 5. Check Metrics
- Response times
- Error rates
- Memory usage
- CPU usage
- Database connections

---

## 🛡️ Security Checklist

After deployment, verify:
- [ ] HTTPS enabled
- [ ] CORS configured correctly
- [ ] Rate limiting active
- [ ] Security headers set (Helmet)
- [ ] Environment variables secured
- [ ] Database connection uses SSL
- [ ] Logs don't expose sensitive data
- [ ] Error messages don't leak info
- [ ] File uploads restricted
- [ ] API keys rotated

---

## 🔧 Maintenance

### Regular Tasks
- [ ] Monitor logs daily
- [ ] Check for security updates weekly
- [ ] Review error rates weekly
- [ ] Backup database daily
- [ ] Update dependencies monthly
- [ ] Review performance metrics monthly

### Update Process
```bash
# 1. Pull latest changes
git pull

# 2. Install dependencies
npm ci --production

# 3. Run migrations (if any)
# npm run migrate

# 4. Restart application
pm2 restart wordeth

# 5. Verify deployment
curl https://yourdomain.com/api/health
```

---

## 🆘 Troubleshooting

### Application Won't Start
- Check environment variables
- Verify MongoDB connection
- Check port availability
- Review error logs

### High Memory Usage
- Check for memory leaks
- Restart application
- Increase server resources
- Optimize database queries

### Slow Response Times
- Check database queries
- Review API endpoints
- Enable caching
- Optimize assets

### Database Connection Issues
- Verify connection string
- Check network connectivity
- Verify database credentials
- Check IP whitelist

---

## 📞 Support

For issues:
1. Check logs: `pm2 logs wordeth`
2. Review health endpoint: `/api/health`
3. Check monitoring dashboard
4. Review error tracking (Sentry, etc.)

---

**Deployment Complete!** 🎉

