# Lyric IQ architecture

The subsystem lives in `src/lyriciq/` and is mounted into the existing Express app by `server.js` (`lyricIq.mount(app, '/api')`, then `lyricIq.bootstrap()` after Mongo connects). It reuses the existing User model, JWT secret, admin role check and analytics pipeline; everything else is self-contained.

```
src/lyriciq/
  index.js                 mount + bootstrap (templates, catalog seed, idle-session sweep)
  config/                  every tunable weight/threshold + startup env validation
  models/                  Track, LyricAsset, QuestionTemplate, QuestionInstance, GameSession,
                           AnswerAttempt, DailyChallenge, LeaderboardRecord, PlayerMetrics,
                           ContentRestriction, FeatureFlag
  providers/lyrics/        LyricProvider (contract), MusixmatchProvider, SyntheticProvider,
                           normalizeTrack (NormalizedTrack / NormalizedLyricAsset)
  fixtures/                synthetic catalog — TEST CONTENT, NOT REAL LYRICS
  engines/
    question/              QuestionEngine pipeline, TrackSelector, LineSelector, BlankSelector,
                           templates (6 question types), QuestionFormatter
    distractor/            DistractorEngine + bounded VocabularyBank
    difficulty/            DifficultyEngine (0–100, bands)
    validation/            validateQuestion → structured rejection reasons
  services/
    content/               catalogService (provider access + licence cache), eligibility,
                           restrictionService, featureFlags, providerCache
    game/                  sessionService, dailyService, answerService, gameModes
    scoring/               scoringService (model v1)
    lyricIq/               lyricIqService (model v1), playerMetricsService (knowledge graph)
    leaderboard/           leaderboardService
    share/                 shareService
  middleware/              playerIdentity (user JWT | signed guest token), validate,
                           requireDatabase, internalAuth, errorHandler
  routes/                  game, daily, profile, leaderboards, internal (+ router factory)
  utilities/               logger (JSON lines, redacting), text, random, errors
```

## Question generation pipeline

```
SELECT ELIGIBLE TRACK  (TrackSelector, popularity-weighted, excludes session repeats)
→ RESOLVE LYRIC ASSET  (catalogService: stored + fresh → else provider → cache with TTL)
→ SELECT EXCERPT       (LineSelector: length, lexical density, dedupe)
→ CHOOSE TEMPLATE      (gameModes.planNextQuestion; daily uses a fixed sequence)
→ SELECT BLANK         (BlankSelector: configurable weighted score)
→ GENERATE DISTRACTORS (DistractorEngine: word / phrase / line / title / artist)
→ CALCULATE DIFFICULTY (DifficultyEngine)
→ VALIDATE             (validateQuestion; reasons logged as question_rejected)
→ ACCEPT OR REGENERATE (up to LYRICIQ_MAX_GENERATION_ATTEMPTS; the requested
                        template is relaxed after half the budget)
→ FORMAT               (public shape for the client; private answer key stored with select:false)
```

The engine takes its catalog and distractor engine by injection, so unit tests run it against in-memory fixtures with no database.

## Answer key protection

`QuestionInstance.answerKey` is declared `select: false`; only `sessionService.submitAnswer` reads it, through an atomic `findOneAndUpdate` that moves the question from `PENDING` to `ANSWERED`. A second submission cannot win that update, and `AnswerAttempt.questionId` is unique as a second guard. `QuestionInstance.toPublic()` is the only serialisation sent to clients before an answer.

## Content safety

`isTrackEligibleForGame(track, context, restrictions)` is the single eligibility function. Restrictions are `ContentRestriction` documents (track, artist, album, provider, territory, game mode, explicit) cached for 60 seconds, so content can be pulled with an internal API call and no deploy.

## Caching

`providerCache` is an in-memory, namespaced TTL/LRU cache with independent TTLs for track metadata, lyric content, questions, daily challenges, restrictions and feature flags. Lyric bodies are also persisted as `LyricAsset` documents with `expiresAt` set from `LYRICIQ_CACHE_LYRIC_TTL_MS` so contractual limits are enforced at the storage layer, not just in memory. The interface is small enough to swap for Redis.

## Observability

`utilities/logger` writes JSON lines with the event vocabulary: `session_started`, `question_generated`, `question_rejected`, `question_answered`, `session_completed`, `daily_generated`, `daily_completed`, `provider_error`, `content_restricted`, `guest_claimed`, `sessions_expired`. Lyric bodies and secrets are never logged. Client analytics events go to the existing `POST /api/analytics/track` under the `lyriciq` segment.

## Failure handling

| Failure | Behaviour |
|---|---|
| Mongo down | `503 DATABASE_UNAVAILABLE` from `requireDatabase` before any handler runs |
| Provider timeout / rate limit / bad payload | `ProviderError` with a normalised code; stale stored lyrics are used if present; otherwise the track is skipped and, for NOT_FOUND/RESTRICTED, marked lyric-less |
| No eligible content | `503 NO_ELIGIBLE_QUESTIONS` |
| Expired / invalid session | `409 SESSION_NOT_ACTIVE` / `404 SESSION_NOT_FOUND` |
| Duplicate answer | `409 QUESTION_ALREADY_ANSWERED`; the client resyncs with `GET /question` |
| Network drop mid-answer | client keeps the question, retries, then resyncs |
| Idle sessions | swept to `EXPIRED` every five minutes |
