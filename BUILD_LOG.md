# Build log — Wordeth Lyric IQ

Concise stage-by-stage record so another engineer or agent can continue without reconstructing history.

## Stage 1 — Repository audit
**Built.** Assessment: Express 4 / Mongoose 7 monolith, static vanilla frontend in `public/`, JWT auth middleware, Musixmatch calls inline in `routes/lyrics.js`, Jest + supertest + mongodb-memory-server. No `.env.example`, no central error handling, no provider abstraction.
**Issues found.** Sandbox network blocks the memory-server binary; four legacy suites fail on HEAD (supertest misuse, documented in repo memory).
**Fixed.** Ran tests against FerretDB (Mongo wire protocol over SQLite) via `MONGODB_TEST_URI`.

## Stage 2 — Foundations
**Built.** `src/lyriciq/config` (all weights/thresholds, env overrides), `config/env.js` startup validation, JSON-lines redacting logger, seeded PRNG, `AppError`/`ProviderError`, text utilities (Unicode/apostrophe normalisation, stopwords, rhyme key, edit distance). `.env.example`.
**Tests.** `unit/text.test.js`.

## Stage 3 — Models
**Built.** Track, LyricAsset, QuestionTemplate, QuestionInstance (answer key `select:false`), GameSession, AnswerAttempt, DailyChallenge (specs `select:false`), LeaderboardRecord, PlayerMetrics (Map buckets), ContentRestriction, FeatureFlag. Unique/compound indexes, partial unique index for one daily session per player per day.

## Stage 4 — Provider abstraction
**Built.** `LyricProvider` contract, `MusixmatchProvider` (injectable HTTP, every failure mapped to TIMEOUT/RATE_LIMITED/NOT_FOUND/BAD_PAYLOAD/RESTRICTED/UNAVAILABLE/UNAUTHORIZED, disclaimer/tracking-id stripping), `SyntheticProvider`, normalisers, namespaced TTL/LRU `providerCache`, `catalogService` (lazy lyric fetch with licence TTL, stale-if-error), eligibility + restriction snapshot, feature flags.
**Tests.** `unit/provider.test.js` (11 failure modes), `unit/eligibility.test.js`, `unit/cache.test.js`.

## Stage 5 — Synthetic content
**Built.** 26 fabricated tracks (5 genres, 1978–2023), 12 lines each, marked `TEST CONTENT — NOT REAL LYRICS`, seeded into Mongo on bootstrap outside production.

## Stages 6–10 — Engines
**Built.** QuestionEngine pipeline; TrackSelector (popularity/difficulty weighting); LineSelector; BlankSelector (configurable weighted score, stopword and leak penalties); DistractorEngine (word/phrase/line/title/artist, bounded VocabularyBank); DifficultyEngine (0–100, bands); validateQuestion (17 rejection reasons); answer evaluation (normalisation + length-scaled typo tolerance, distractor text never accepted); scoring model v1.
**Issues found / fixed.** Difficulty saturated at 100 for line-length answers (length terms now blank-only and capped). Two-word endings could start with a stopword; phrase distractors could start with "and" (both excluded). Accent stripping needed NFKD before NFKC. A 0 ms response time was treated as slow (falsy check). Capitalisation of line-start words leaked hints (choices re-cased). Determiners like "every" chosen as blanks (added to stopwords).
**Tests.** `unit/blankSelector`, `unit/distractor`, `unit/validator`, `unit/difficulty`, `unit/answer`, `unit/scoring`, `unit/questionEngine` (all templates × answer types, determinism, provider failure skip, narrow-pool fallback).

## Stage 11 — Game session API
**Built.** Player identity middleware (user JWT or signed guest token), request validation, database guard, internal auth, central error handler; sessionService (create / current question / atomic answer claim / completion / results / abandon / idle sweep / guest claim); routes for game, daily, profile, leaderboards, internal; per-player rate limits; mounted in `server.js` with the coarse IP limiter skipped for gameplay paths.
**Issues found / fixed.** Replacement for an expired question collided with the unique (session, index) key — indexes are now monotonic and progress is derived from answers. Guest leaderboard migration collided with existing user rows — now merges per board.
**Tests.** `integration/game.test.js` (9), `integration/modes.test.js`, `integration/internal.test.js`, `integration/profile.test.js`.

## Stage 12 — Gameplay frontend (playable vertical slice)
**Built.** `public/lyric-iq.html`, `css/lyric-iq.css`, `js/lyric-iq/{api,copy,app}.js`. Entry → game → feedback → results → play again, hash routing, keyboard 1–4/Enter without hijacking inputs, ARIA live announcements, reduced-motion support, network resync after failed submissions.
**Verified.** Puppeteer run in Chromium: first question 105–130 ms after tapping Play; full session; results reload from URL; replay; zero console errors.

## Stages 13–15 — Daily 10, Rapid Fire, Streak
**Built.** Seeded, stored, audited daily set with one session per player per UTC day and resume; Rapid Fire 60 s server deadline with client timer resync on tab return; Streak with difficulty progression and end-on-miss.
**Tests.** `integration/daily.test.js`, `integration/modes.test.js`.

## Stages 16–19 — Lyric IQ, profile, leaderboards, share
**Built.** Lyric IQ v1 (composite with shrinkage, provisional and category thresholds, plain-language explanation), PlayerMetrics knowledge graph (`$inc` buckets by genre/decade/mode/template/artist), daily streaks, daily/weekly/all-time boards (registered users only, guests see their own unranked row), share payload (identity, never lyrics).
**Tests.** `unit/lyricIq.test.js`, `integration/profile.test.js`, leaderboard assertions in `daily.test.js`.

## Stage 20 — Art direction and polish
**Built.** First pass used a dark "inside the mouth" concept; replaced after review with the brand-centred world ("the world between thought and speech"): Wordeth palette (mint, purple, hot pink, electric blue, gold) and type (Unbounded display, Outfit body) in a bright cartoon-platformer world with depth — purple far ridges, drifting thought forms, letter blocks that thoughts become as they descend, chunky outlined type and bouncy buttons, lyric in a speech bubble. Three pure-CSS worlds act as levels: meadow (rounded mint hills), city (lit towers, neon sign, mint-dashed street) and sunset desert (sun, mesas, dunes, cacti). World is chosen from the player's Lyric IQ tier, Rapid Fire is always the city, and a Streak run levels up meadow → city (5) → desert (10) with a crossfade. Beautification pass: gradient lighting and rim highlights on hills, dunes and mesas; hazed far skyline, mixed lit/dark windows, stars and a neon-reflecting street in the city; sun halo and horizon glow in the desert; cloud volume, meadow flowers, sand pebbles, a soft vignette; pointer parallax across far/mid/near layers on fine-pointer devices, disabled under reduced motion. All hand-written CSS, no UI framework. Sound and soundtrack are planned for a later stage.
**Issues found / fixed.** Header overflow at 320 px and "Sign in" wrapping; stat tiles truncating at phone width; two-button rows wrapping; blur filter in entrance animation; 429s from the analytics per-IP cap during Rapid Fire.
**Verified.** No horizontal scroll and all visible controls ≥ 40 px at 320/375/390/430/768/1024/1440.

## Stage 21 — Performance / security review
Answer keys never serialised (asserted in tests); Helmet + existing CSP; express-validator on every route; 100 kb body limit assumption inherited from `express.json` (site uses 50 mb; gameplay payloads are tiny); guest tokens signed; internal routes key-or-admin with constant-time compare; per-player rate limits; no lyric bodies or secrets in logs; provider calls only on cache miss.

## Stage 22 — Automated test pass
`npm run test:lyriciq`: 17 suites, 92 tests, all passing on three consecutive full runs. Legacy suites unchanged versus baseline (memory-server download blocked in sandbox; supertest misuse pre-existing).

## Stage 23 — Documentation
README, `.env.example`, `docs/lyric-iq/{API,ARCHITECTURE,LYRIC_IQ_MODEL,GAME_ENGINE}.md`, DECISIONS.md, this log, `wordeth.md` section.

## Stage 24 — play.wordeth.com
**Built.** Host-aware middleware (`src/lyriciq/middleware/playHost.js`): the play host serves the game at "/", "/play" on the main site redirects to it in production and serves it directly in development. Shared sign-in cookie on `.wordeth.com` (`services/authCookie.js`, set on sign-up/sign-in, cleared by new `POST /api/auth/signout`); the game client and the site nav read it as a fallback. Share text and challenge links use `LYRICIQ_PUBLIC_URL`. Canonical/OG tags point at the play host; homepage nav links to `/play`.
**Tests.** `unit/playHost.test.js` (routing on both hosts, query preservation, redirect, dev fallback, cookie set/clear).

## Stage 25 — Stepped setup flow and phone fixes
**Built.** The entry screen no longer shows every control at once. It is now three steps with a step bar (Play › Mode › Genre): the landing has one Play button (plus "Resume today's Daily 10" when a set is in progress); the Mode screen offers Play, Daily 10, Rapid Fire and Streak as cards (Daily 10 begins immediately since its set is fixed); the Genre screen offers Everything plus each catalog genre as pressable cards with a Begin button. Back buttons on each step; routes `#mode` and `#genre` are deep-linkable; `?mode=` and `#daily` still start directly. Setup steps are tracked as `setup_step`, `mode_select`, `genre_select`.
**Phone fixes** (from a real iPhone run at 192.168.x.x): the feedback card could land below the fold behind Safari's toolbar, so it now scrolls into view on answer and the main column reserves safe-area bottom padding; unchosen answers dim by colour instead of opacity so the scene never shows through them; the floating letter blocks hide while a round is on screen (`body[data-screen="game"]`).
**Verified.** Headless Chromium at 320, 390 and 1280 px: no horizontal overflow on any step, all tap targets ≥ 40 px, first question in < 100 ms after Begin, no page errors.

## Remaining risks
* Distractor quality on real catalog text is heuristic; watch `question_rejected` rates and `INSUFFICIENT_DISTRACTORS` after seeding Musixmatch content.
* Musixmatch partial lyric bodies (plan-dependent) reduce usable lines; charts seeding may include instrumentals/non-English tracks — eligibility filters handle the flags Musixmatch exposes.
* In-process cache: multi-instance deployments call the provider more often than needed until Redis backing is added.
* Leaderboard `me` rank uses a count query per request; fine at current scale, index-backed.
* One intermittent integration failure was root-caused (narrow category pools) and fixed; keep running the suite three times before release.
