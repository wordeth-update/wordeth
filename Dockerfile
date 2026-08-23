# Production image for Railway.
# Explicit Dockerfile so Railway's auto-detection (Railpack/Nixpacks) can't
# guess wrong: production deps only, no Chrome download during npm install
# (system chromium is installed for the OG-image generator instead).
FROM node:20-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
# Generous retries/timeouts: Railway builders occasionally drop DNS mid-install
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 5000
CMD ["node", "server.js"]
