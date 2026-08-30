---
name: Wordeth server quirks
description: Environment/runtime quirks of the Wordeth app that repeatedly bite during edits
---
- **HTML caching:** server.js caches and rewrites `public/verses.html` (and possibly other pages) at startup. Any HTML edit requires restarting the "Wordeth Server" workflow before it is visible in preview.
  **How to apply:** after editing public/*.html, restart the workflow, then verify with a screenshot.
- **Cache busters:** static JS/CSS links use `?v=<timestamp>` in the HTML pages; bump them after editing verses.js/verses.css/notifications.js/profile.js or clients keep the stale copy (Cloudflare in prod).
- **Pre-existing failing tests:** `tests/health|auth|articles|ads` fail even on an unmodified checkout — they pass `require('../server')`'s export object straight to supertest (`app.address is not a function`). Don't mistake these for regressions; run only the relevant suites.
- **Live rooms are in-memory Map + Redis** (routes/signaling.js), not Mongo. Other modules reach them via `require('./signaling').getRoomsMap()`; connected users via `global._connectedUsers`.
- **Host authority:** rooms with a `creatorUserId` derive host status server-side (only the creator may claim host); client `isHost` is honored only for legacy creator-less rooms. Socket/HTTP joins still trust client-supplied userId (no socket JWT) — a known pre-existing gap.
- **Deploys:** git push origin main → GitHub → Railway auto-deploy. Work is NOT live until pushed.

## Railway build: npm only — never let a root pnpm-lock.yaml exist
Railway/nixpacks auto-detects pnpm if `pnpm-lock.yaml` is present at repo root and runs `pnpm install --frozen-lockfile`, which fails once package.json drifts. This repo is npm-managed (package-lock.json). A stale root pnpm-lock (accidentally introduced during mockup-sandbox artifact init) broke production deploys in Aug 2026. **How to apply:** keep pnpm lockfiles out of the repo root; artifact subdirs are fine.

## Railway deploys via root Dockerfile (added Aug 2026)
Railway's Railpack auto-detect ignored nixpacks.toml, re-downloaded puppeteer Chrome, installed dev deps, and OOM-crashed builds (npm "Exit handler never called", exit 137). Root Dockerfile now controls prod builds: node:20-slim, system chromium + PUPPETEER_EXECUTABLE_PATH for OG images, `npm ci --omit=dev`. **How to apply:** production build changes go in Dockerfile/.dockerignore, not nixpacks.toml (dead config).

## package-lock.json must point at registry.npmjs.org, not Replit's proxy
Running npm install inside Replit can stamp `http://package-firewall.replit.local/npm/...` into the lockfile's `resolved` URLs. Railway (and any external CI) can't resolve that host → `npm ci` fails with ENOTFOUND. **How to apply:** after any npm install that touches package-lock.json, grep it for `package-firewall` and sed-replace with `https://registry.npmjs.org` before pushing.

## File storage is MongoDB GridFS (since Aug 2026)
All uploads (artwork, audio messages, avatars, profile photos, music snippets, audiobank, template previews) go through services/fileStorage.js into GridFS and are served at GET /api/files/<key> with Range support and nosniff + CSP sandbox headers. Private keys embed random tokens (capability URLs — same access model as the old signed URLs). Analytics archives live in the AnalyticsArchive collection, not S3.
**Why:** production runs on Railway where Replit object storage is unreachable; user directive was "all storage routed to MongoDB".
**How to apply:** never reintroduce @replit/object-storage or signed URLs for new features; store the stable /api/files URL (or the key) in Mongo docs. The legacy Replit-storage fallback in routes/files.js and the avatar route only works inside Replit and exists purely for pre-migration stragglers. Note: `new Client()` from @replit/object-storage needs `{ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID }` passed explicitly or it throws "A bucket name is needed".

## Legacy partner labels require targeted updates
Some long-lived partner labels contain artists created before artist IDs became mandatory. Saving the whole label can fail validation even when an unrelated artwork change is valid.
**Why:** the partner demo account exposed this during an end-to-end artwork upload check.
**How to apply:** use targeted nested updates for partner artwork changes rather than validating and saving the entire legacy label document.

## SPA page scripts need document-lifetime singleton guards
The client-side router can execute page-specific scripts again whenever a user returns to that page. Removing the old script element does not disconnect observers or listeners created by its earlier execution.
**Why:** homepage animation controllers accumulated route observers and drag listeners across repeated SPA navigation until they were converted to guarded singletons.
**How to apply:** any page script that installs long-lived observers or global listeners must reuse one document-lifetime controller and explicitly tear down per-route resources.
