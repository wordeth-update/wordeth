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
