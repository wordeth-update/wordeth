# Production image for Railway.
# Explicit Dockerfile so Railway's auto-detection (Railpack/Nixpacks) can't
# guess wrong: production deps only, no Chrome download during npm install
# (system chromium is installed for the OG-image generator instead).
FROM node:20-slim

# tini is the init process: without one, every Chromium the card renderer
# spawns and closes stays behind as a zombie holding a process id, and after
# a few days the container cannot fork at all ("Resource temporarily
# unavailable") and no card can be drawn.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        chromium fonts-liberation fonts-noto-color-emoji ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
# Safety net: strip any Replit-internal package-proxy addresses that may have
# been stamped into the lockfile, so builds never depend on Replit's network.
RUN sed -i 's|http://package-firewall.replit.local/npm|https://registry.npmjs.org|g' package-lock.json
# Generous retries/timeouts: Railway builders occasionally drop DNS mid-install
RUN npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 300000 \
    && npm ci --omit=dev --no-audit --no-fund

COPY . .

EXPOSE 5000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
