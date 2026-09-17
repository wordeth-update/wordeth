# Decisions

Consequential architectural choices for Wordeth Lyric IQ. Trivial choices are not recorded.

## 2026-09-17 — Self-contained `src/lyriciq/` subsystem mounted into the legacy app
**Decision.** Build Lyric IQ as one module tree (`config / models / providers / engines / services / routes / middleware`) mounted by `server.js`, rather than spreading files across the flat legacy `routes/`, `models/`, `services/` folders.
**Reason.** The legacy tree is a 40-model monolith with no shared error handling or validation layer; the game needs its own. A single tree keeps the answer-key boundary, caching and content controls reviewable in one place.
**Alternatives.** Flat placement alongside legacy code; a separate service. **Tradeoff.** Two conventions coexist in the repo; the mount point and shared pieces (User model, JWT secret, admin role, analytics segment) are the only coupling.

## 2026-09-17 — Signed guest tokens instead of client-generated guest ids
**Decision.** Guests receive a server-signed JWT (`typ: guest`) on first play; all later requests carry it.
**Reason.** A client-chosen id could be guessed to read or answer another guest's session. Signing with the existing `JWT_SECRET` costs nothing and makes guest→user migration trustworthy.
**Alternatives.** Cookie session; unsigned localStorage id. **Tradeoff.** Clearing storage loses a guest's history unless they signed up first (the product prompt for exactly that).

## 2026-09-17 — Answer keys stored on the question with `select: false` and an atomic claim
**Decision.** Persist the private key on `QuestionInstance`, excluded from default queries; grade inside one `findOneAndUpdate` that flips `PENDING → ANSWERED`.
**Reason.** Never sends the answer to the browser, prevents double submission without transactions, keeps response time server-authoritative.
**Alternatives.** HMAC-reconstructed keys; in-memory question store. **Tradeoff.** One document per served question (bounded by session size; cheap).

## 2026-09-17 — Daily 10 stored as a full spec, generated once per UTC day with a seeded PRNG
**Decision.** Seed = SHA-256(private salt + date). The first request generates and inserts the spec; a unique index resolves races.
**Reason.** Every player must get the same logical set and the set must be auditable after the fact. Storing the spec makes the audit trivial and decouples players from catalog drift during the day.
**Tradeoff.** The catalog state at generation time defines the day; content pulled later is still honoured at serve time through eligibility checks.

## 2026-09-17 — Lyric IQ as a weighted composite with shrinkage, not accuracy
**Decision.** Five normalised components (accuracy, difficulty conquered, recall, breadth, consistency), Bayesian shrinkage on rates, provisional below 10 questions, category scores withheld below 15.
**Reason.** A percentage rewards easy questions and tiny samples. The composite rewards range and depth, which is the identity the product sells.
**Tradeoff.** Harder to explain in one line, so the profile ships a component explanation.

## 2026-09-17 — Lyric content cached with a licence TTL at the storage layer
**Decision.** `LyricAsset.expiresAt` from `LYRICIQ_CACHE_LYRIC_TTL_MS` (default one hour); stale assets are refetched, or served only when the provider is down.
**Reason.** Provider contracts limit lyric retention; enforcing it in the database rather than only in memory survives restarts and multiple instances.

## 2026-09-17 — Gameplay exempt from the site-wide IP limiter; own per-player limits
**Decision.** `/api/game`, `/api/daily`, `/api/profile`, `/api/leaderboards` skip the 300-requests-per-15-minutes IP cap and use 240 answers/min + 30 sessions/min keyed by player credential. The analytics `/track` per-IP cap was raised from 60 to 240 per minute.
**Reason.** Rapid Fire legitimately sends about one request per second; shared IPs (carriers, offices) would hit the old caps within minutes.

## 2026-09-17 — Metadata distractors from the whole catalog; template relaxed after half the attempts
**Decision.** Title/artist distractors draw from the full eligible pool (same genre preferred by score); a requested template is dropped after half the generation budget.
**Reason.** Found by an intermittent integration failure: a five-track category has too few artists for "name the artist", and retrying one template exhausted the budget. Any valid question beats a 503.

## 2026-09-17 — Tests accept `MONGODB_TEST_URI` with a memory-server fallback
**Decision.** Lyric IQ tests connect to `MONGODB_TEST_URI` when set (one database per test file) and otherwise start mongodb-memory-server.
**Reason.** The binary download for memory-server is blocked in some CI/sandbox networks; this made the suites runnable against FerretDB/SQLite locally and against real mongod anywhere.

## 2026-09-17 — Art direction: bright brand world, not a dark concept
**Decision.** Drop the dark oxblood "inside the mouth" direction. The game world is "the world between thought and speech": Wordeth's own palette and type in a bright, deep, cartoon-platformer scene (thoughts drift high, become letter blocks, land as words on mint hills), playful for adults.
**Reason.** Product review found the dark direction depressing and off brand; the game must feel like stepping into another world that is inviting and replayable, with room for its own sound design later.
**Tradeoff.** Bright surfaces need dark ink outlines and white cards for legibility; decorative layers are pushed to the edges on phones so they never sit behind answers.
