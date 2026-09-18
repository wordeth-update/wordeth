# Game engine notes

## Templates

| Template | Skill | Answer types | Prompt |
|---|---|---|---|
| FINISH_THE_LYRIC | Recall | MC, typed | Previous line for context + line with the last 1–2 words hidden |
| MISSING_WORD | Recall | MC, typed | One meaningful word hidden anywhere in a line |
| MISSING_PHRASE | Recall | MC, typed | 2–3 word phrase hidden; harder |
| NEXT_LINE | Recall | MC | One line shown; choose the line that follows |
| GUESS_THE_SONG | Recognition | MC | 1–2 lines; choose the title (song identity hidden) |
| GUESS_THE_ARTIST | Recognition | MC | 1–2 lines; choose the artist |

No prompt ever exceeds `maxExcerptLines` (2) of lyric text.

## Blank selection

```
BlankQuality = semanticImportance + memorability + rhymeImportance + phraseUniqueness
             + linePositionWeight − stopwordPenalty − ambiguityPenalty
```

Weights: `config.blank.weights`. Stopwords (`utilities/text.js`) are never chosen. A word repeated elsewhere in the visible line is penalised because the answer would leak. The top three candidates are sampled with weights 0.6/0.28/0.12 so replays vary.

## Distractors

Heuristic candidates scored on length similarity, rhyme key, crude part of speech, same-track and same-genre bonuses (`config.distractors.weights`). Candidates that are stopwords, visible in the prompt, within one edit of the answer, or prefixes of it are excluded. Word and phrase choices are re-cased to match the answer so capitalisation cannot hint. Title/artist distractors always draw from the full eligible catalog (same genre preferred) so a narrow category never starves. The engine is a class with one method per distractor kind; a semantic or phonetic model can replace the scoring without touching the question engine.

## Difficulty

`templateBase` per template + typed bonus + hidden-word count + answer length (blank prompts only, capped) + obscurity (100 − popularity) + choice similarity. Bands: 0–24 easy, 25–49 medium, 50–74 hard, 75–100 elite.

## Modes

| Mode | Questions | Timer | Ends on miss | Template mix |
|---|---|---|---|---|
| QUICK_PLAY | 10 | – | no | weighted mix; ~20% typed from question 3 when `typedAnswers` is on |
| DAILY_10 | 10 | – | no | fixed audited sequence, two typed |
| RAPID_FIRE | up to 60 | 60 s server deadline | no | fast MC templates only |
| STREAK | until miss | – | yes | target difficulty = 15 + 6·streak; typed after 8 |

## Daily determinism

Seed = SHA-256(`LYRICIQ_DAILY_SEED_SALT` + date). The generator runs the template sequence with a seeded PRNG, stores the full spec (including answer keys) in `DailyChallenge`, and every player's session instantiates `QuestionInstance`s from those specs. `GET /api/internal/daily/:date/audit` returns the record.

## Validator rejection reasons

`PROMPT_MALFORMED`, `PROMPT_MISSING_BLANK`, `EXCERPT_TOO_LONG`, `EXCERPT_UNUSABLE`, `ANSWER_EMPTY`, `ANSWER_IN_PROMPT`, `BLANK_TRIVIAL`, `ANSWER_TOO_LONG_FOR_TYPED`, `CHOICE_COUNT_INVALID`, `CHOICE_EMPTY`, `DISTRACTOR_DUPLICATE`, `DISTRACTOR_EQUALS_ANSWER`, `CHOICE_INDEX_INVALID`, `QUESTION_AMBIGUOUS`, `ANSWER_TYPE_INVALID`, `TRACK_RESTRICTED`, `TRACK_MISSING`. Rejection counts are visible at `GET /api/internal/catalog/stats`.
