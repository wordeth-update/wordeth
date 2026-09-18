# Lyric IQ API

All routes are mounted under `/api`. Responses are JSON. Errors always have the shape:

```json
{ "error": { "code": "SESSION_NOT_ACTIVE", "message": "Session is completed", "details": { } } }
```

Stack traces and provider internals are never returned.

## Player identity

| Credential | Header | Who |
|---|---|---|
| User JWT (existing Wordeth auth) | `Authorization: Bearer <token>` | registered user, `playerKey = user:<id>` |
| Guest token (signed by the server) | `X-Guest-Token: <token>` | guest, `playerKey = guest:<id>` |

`POST /api/game/sessions` and `POST /api/daily/start` mint a guest token when no credential is present. It is returned as `guestToken` in the body and as the `X-Guest-Token` response header. The client stores it and sends it on every later request. Guest tokens expire after `LYRICIQ_GUEST_TOKEN_TTL` (30 days).

## Gameplay

### `GET /api/game/config`
Modes currently enabled (feature flags applied), catalog categories, public flags, and the caller's identity if any.

### `POST /api/game/sessions`
Body: `{ "gameMode": "QUICK_PLAY" | "RAPID_FIRE" | "STREAK" | "DAILY_10", "category": "pop", "challengeCode": "<session id>" }` (all optional).

Returns `201` with `{ session, question, player, guestToken? }`. The first question is included so play begins with one round-trip. Starting a new non-daily session abandons any other active session for the player. `DAILY_10` delegates to the daily service (see below) and may return `200` with `resumed: true`.

### `GET /api/game/sessions/:id/question`
The current pending question. An expired pending question is retired and replaced without penalty. `409 SESSION_NOT_ACTIVE` (with `details.status`) when the session is over.

### `POST /api/game/sessions/:id/questions/:qid/shown`
The next question is generated during the previous answer's round trip and returned as `nextQuestion`. When the client puts it on screen it posts here so the response clock starts then, not at generation. Accepted once per pending question and clamped to `LYRICIQ_SHOWN_GRACE_MS` (10 s) after generation, so a late call cannot buy reading time. Returns `{ ok, changed }`.

### `POST /api/game/sessions/:id/answer`
Body: `{ "questionId": "...", "choiceIndex": 2 }` for multiple choice or `{ "questionId": "...", "answer": "tonight" }` for typed.

Response:

```json
{
  "correct": true,
  "canonicalAnswer": "tonight",
  "normalizedInput": "tonight",
  "choiceIndex": 2,
  "correctChoiceIndex": 2,
  "pointsAwarded": 191,
  "responseTimeMs": 1420,
  "scoreBreakdown": { "base": 138, "difficultyMultiplier": 1.38, "speedBonus": 43, "streakBonus": 10, "typedMultiplier": 1 },
  "streak": 2,
  "track": { "title": "...", "artist": "...", "genre": "pop", "decade": "2010s" },
  "session": { "...": "public session state" },
  "sessionCompleted": false,
  "nextQuestion": { "...": "next public question" },
  "results": null
}
```

Response time is measured server-side from when the question was served. A second submission for the same question returns `409 QUESTION_ALREADY_ANSWERED`. When the session ends (`sessionCompleted: true`) the full results payload is included. In Rapid Fire, an answer after the deadline completes the session and returns `timedOut: true`.

### `GET /api/game/sessions/:id/results`
Results for any session the caller owns: public session state, Lyric IQ before/after, per-question breakdown (no lyric text), daily streak, and the share payload.

### `POST /api/game/sessions/:id/abandon`
Ends an active session early.

## Daily 10

### `GET /api/daily`
Today's date key, question count, the caller's status (`NOT_STARTED | ACTIVE | COMPLETED`), summary when completed, daily streak, aggregate stats and the top ten of the daily board.

### `POST /api/daily/start`
Starts or resumes today's challenge. `409 DAILY_ALREADY_PLAYED` (with `details.results`) after completion. One session per player per UTC day is enforced by a unique index.

## Profile

### `GET /api/profile/me`
Lyric IQ (value, provisional flag, components, sub-scores, thresholds), a plain-language explanation, aggregate metrics by genre / decade / mode / template, and recent sessions.

### `GET /api/profile/me/lyric-iq`
Lyric IQ and explanation only.

### `POST /api/profile/claim-guest`
Body: `{ "guestToken": "..." }`, authenticated as a user. Migrates the guest's sessions, attempts, metrics and leaderboard rows into the user account (merging when the user already has history). The web client calls this automatically after sign-in when a guest token is present.

## Leaderboards

`GET /api/leaderboards/daily`, `/weekly`, `/all-time` with optional `?period=YYYY-MM-DD|YYYY-Www&limit=25`. Only registered users are listed; guests receive their own unranked row in `me`. Daily = best daily score, weekly = cumulative session score, all-time = Lyric IQ.

## Internal (protected)

Requires `X-Internal-Key: <LYRICIQ_INTERNAL_API_KEY>` or an admin user JWT.

| Route | Effect |
|---|---|
| `POST /api/internal/tracks/:id/disable` `{ reason }` | Track removed from gameplay immediately |
| `POST /api/internal/tracks/:id/enable` | Restore |
| `POST /api/internal/artists/:id/disable` `{ reason, gameModes? }` | `:id` is the artist slug (e.g. `vera-solace`); optional mode scoping |
| `POST /api/internal/artists/:id/enable` | Restore |
| `POST /api/internal/questions/:id/reject` `{ reason, disableTrack? }` | Retire a served question, optionally disable its track |
| `GET/POST/DELETE /api/internal/restrictions` | Generic restrictions: TRACK, ARTIST, ALBUM, PROVIDER, TERRITORY, GAME_MODE, EXPLICIT |
| `GET /api/internal/flags`, `PUT /api/internal/flags/:key` `{ enabled }` | Feature flags |
| `POST /api/internal/catalog/seed` `{ queries?, pages?, country?, genres?, genrePages? }` | Pull tracks from the licensed provider: country chart, per-genre top lists, free-text queries |
| `POST /api/internal/catalog/refresh` `{ warm?, chartPages?, genrePages? }` | Full upkeep pass (chart + every genre + lyric warming); the same job the in-process schedule runs |
| `POST /api/internal/catalog/warm` `{ limit? }` | Fetch lyric bodies ahead of play for the most popular tracks without a fresh stored copy |
| `GET /api/internal/catalog/stats` | Catalog counts and generation/rejection statistics |
| `GET /api/internal/daily/:dateKey/audit` | Full daily spec including answer keys |

## Rate limits

Gameplay paths are exempt from the coarse site-wide limiter and carry their own: 240 answers/minute and 30 new sessions/minute per player credential.
