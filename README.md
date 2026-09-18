# Wordeth

Social music platform: lyrics, live audio rooms (Verses), merch, and **Lyric IQ** — a competitive lyrics-knowledge game and music identity system. Platform-wide notes live in [`wordeth.md`](wordeth.md); this file covers running the app and the Lyric IQ subsystem.

## Run it

```bash
npm install
cp .env.example .env        # fill in JWT_SECRET at minimum
npm run dev:db              # optional: in-memory MongoDB, prints MONGODB_URI
MONGODB_URI=mongodb://127.0.0.1:27017/wordeth npm run dev
```

Open <http://localhost:5000/lyric-iq.html>. With no `MUSIXMATCH_API_KEY` the game runs on the synthetic catalog (fabricated test lyrics, clearly labelled in the UI). Set the key and `LYRICIQ_LYRIC_PROVIDER=musixmatch` for licensed content, then seed:

```bash
npm run lyriciq:seed -- --pages 3 --country us
```

Required environment: `JWT_SECRET`, and either `MONGODB_URI` or `MONGODB_USERNAME` + `MONGODB_PASSWORD`. Everything else is documented in `.env.example`. Startup validates Lyric IQ configuration and refuses to boot on a broken provider setup.

## Test

```bash
npm test                      # full jest suite with coverage
npm run test:lyriciq          # Lyric IQ unit + integration suites (92 tests)
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/ npm run test:lyriciq   # use a local mongod instead of mongodb-memory-server
```

Integration tests spin up an isolated database per file (memory-server by default, or `MONGODB_TEST_URI`). Four legacy suites (`health`, `auth`, `articles`, `ads`) fail on the base branch for a pre-existing supertest issue unrelated to Lyric IQ.

## Lyric IQ

* **Play**: `/lyric-iq.html` — guest play with no account, then "Save your Lyric IQ".
* **Worlds as levels** ("Lyric IQ Streets"): the block at golden hour (starting out), the court at sundown (Lyric IQ 50+), the rooftop at night (75+). Streak runs climb through all three live; Rapid Fire plays on the court. Add `?world=block|court|rooftop` to preview any world. Scenes are hand-drawn SVG in `public/images/lyric-iq/`, inlined at runtime so their signs and graffiti use the display font; phones get portrait cuts of the block and rooftop.
* **Setup flow**: Play → pick a mode → pick a genre → Begin. Three short steps instead of one crowded screen.
* **Modes**: Play (10 mixed), Daily 10 (one canonical set per UTC day), Rapid Fire (60 s), Streak (until a miss), optional genre category.
* **Question types**: finish the lyric, missing word, missing phrase, next line, guess the song, guess the artist; multiple choice and typed.
* **Lyric IQ**: 0–100 identity metric with genre / era / recall / recognition sub-scores, explained in [`docs/lyric-iq/LYRIC_IQ_MODEL.md`](docs/lyric-iq/LYRIC_IQ_MODEL.md).
* **API**: [`docs/lyric-iq/API.md`](docs/lyric-iq/API.md). **Architecture**: [`docs/lyric-iq/ARCHITECTURE.md`](docs/lyric-iq/ARCHITECTURE.md). **Engine**: [`docs/lyric-iq/GAME_ENGINE.md`](docs/lyric-iq/GAME_ENGINE.md).
* **Content controls**: `/api/internal/*` (internal key or admin JWT) disables tracks, artists, albums, providers, territories, modes or explicit content without a deploy.
* **History**: [`BUILD_LOG.md`](BUILD_LOG.md) and [`DECISIONS.md`](DECISIONS.md).

### Real lyrics (Musixmatch)

The site's lyrics page and Lyric IQ share one key, `MUSIXMATCH_API_KEY`. When it is set, Lyric IQ uses Musixmatch automatically and, in production, drops the synthetic test catalog. Keep the key in `.env` locally and in Railway variables in production; never commit it.

**First run on your machine**

```
# in ~/wordeth-web/.env
MUSIXMATCH_API_KEY=your_key_here
LYRICIQ_INCLUDE_SYNTHETIC=false

# pull the US chart + the top of each genre, then warm lyrics for the 150 most popular tracks
node scripts/lyriciq-seed-catalog.js --refresh

npm run dev
```

Then check the catalog at `GET /api/internal/catalog/stats` (internal key or admin JWT): track counts per genre, generation attempts and rejection reasons. The refresh runs again every `LYRICIQ_CATALOG_REFRESH_HOURS` (default 24) while the server is up, and can be triggered with `POST /api/internal/catalog/refresh`.

**What the pipeline does per question**

1. **Pick a track** from the eligible pool: weighted random, popular first, less popular as the target difficulty rises, never repeating a track within a session, narrowed to the chosen genre.
2. **Get the lyric body** from the stored copy (warmed ahead of play, cached under the licence TTL); only a never-seen track costs a Musixmatch call.
3. **Build the question**: choose a template and a line, pick the blank, generate distractors from the same song, the same genre and the catalog, validate, score difficulty. Rejected attempts retry with another line or track (`LYRICIQ_MAX_GENERATION_ATTEMPTS`).
4. **Serve it early**: the next question is generated during the previous answer's round trip and shown after the feedback beat; the client reports when it is on screen so response time is measured honestly.

Tracks whose lyrics turn out to be in a language outside `LYRICIQ_ALLOWED_LANGUAGES` (default `en`) are retired on first fetch.

## play.wordeth.com

Lyric IQ has its own front door on the same server. With `LYRICIQ_PLAY_HOST=play.wordeth.com` set:

- `https://play.wordeth.com/` serves the game with none of the main-site chrome; the API, sign-in pages and static assets work there too.
- `https://wordeth.com/play` redirects to it (in development, `/play` serves the page directly and `http://play.localhost:5000/` behaves like the play host).
- Share text and challenge links use `LYRICIQ_PUBLIC_URL` (defaults to the play host).
- With `AUTH_COOKIE_DOMAIN=.wordeth.com`, signing in on either origin also sets a `wordeth_token` cookie for the parent domain, so the game and the site share the account. Sign-out clears it through `POST /api/auth/signout`.

### Test it locally before DNS

Add `127.0.0.1 wordeth.test` and `127.0.0.1 play.wordeth.test` to your hosts file, then:

```bash
LYRICIQ_PLAY_HOST=play.wordeth.test AUTH_COOKIE_DOMAIN=.wordeth.test MONGODB_URI=<uri> npm run dev
```

Open `http://wordeth.test:5000` (site) and `http://play.wordeth.test:5000` (game). Sign in on one and reload the other. Outside production the security headers do not force HTTPS, so plain HTTP on custom hostnames works; in production they do.

To go live: add a CNAME `play` → your Railway service hostname, add `play.wordeth.com` as a custom domain on the service, and set the three variables above.

## Deploy

Production builds run from the root `Dockerfile` on Railway (`npm ci --omit=dev`, `node server.js`). Set the environment variables from `.env.example` in the Railway dashboard; for Lyric IQ add `MUSIXMATCH_API_KEY`, `LYRICIQ_LYRIC_PROVIDER=musixmatch`, `LYRICIQ_INCLUDE_SYNTHETIC=false`, `LYRICIQ_INTERNAL_API_KEY` and `LYRICIQ_DAILY_SEED_SALT`. The catalog seeds itself from the Musixmatch charts on first boot when fewer than 20 licensed tracks exist; run `npm run lyriciq:seed` for more.

Mobile builds (`npm run mobile:build`) include `lyric-iq.html` and its assets.

## Known limitations

* Distractors are heuristic (length, rhyme, crude part of speech). Good enough to play; a semantic model slot exists in `DistractorEngine`.
* The provider cache is in-process. Multi-instance deployments duplicate provider calls until the cache is moved to Redis (interface is ready).
* Share cards are text payloads; image rendering is a later phase.
* Territory restrictions are enforced only when a territory is supplied in the gameplay context; no geo-IP lookup yet.
* Musixmatch free/plus plans return partial lyric bodies; the engine uses whatever lines are permitted, so question variety scales with the licence.

## Roadmap (not started by design)

Sound design and soundtrack (the world gets its own audio), real-time multiplayer, King of the Hill, tournaments, artist/label-sponsored challenges, Verses integration, personalised difficulty, AI hosts, audio recognition, live events, teams, social feeds.
