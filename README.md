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
* **Modes**: Play (10 mixed), Daily 10 (one canonical set per UTC day), Rapid Fire (60 s), Streak (until a miss), optional genre category.
* **Question types**: finish the lyric, missing word, missing phrase, next line, guess the song, guess the artist; multiple choice and typed.
* **Lyric IQ**: 0–100 identity metric with genre / era / recall / recognition sub-scores, explained in [`docs/lyric-iq/LYRIC_IQ_MODEL.md`](docs/lyric-iq/LYRIC_IQ_MODEL.md).
* **API**: [`docs/lyric-iq/API.md`](docs/lyric-iq/API.md). **Architecture**: [`docs/lyric-iq/ARCHITECTURE.md`](docs/lyric-iq/ARCHITECTURE.md). **Engine**: [`docs/lyric-iq/GAME_ENGINE.md`](docs/lyric-iq/GAME_ENGINE.md).
* **Content controls**: `/api/internal/*` (internal key or admin JWT) disables tracks, artists, albums, providers, territories, modes or explicit content without a deploy.
* **History**: [`BUILD_LOG.md`](BUILD_LOG.md) and [`DECISIONS.md`](DECISIONS.md).

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
