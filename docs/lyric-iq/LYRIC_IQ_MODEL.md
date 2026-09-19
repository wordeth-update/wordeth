# Lyric IQ model (version 1)

Lyric IQ is a Wordeth gameplay metric. It is not a psychometric IQ test and is never described as one. It answers: *how well does this player actually know music, across recall and recognition, difficulty and breadth?*

## Formula

```
LyricIQ = 100 × ( 0.35·Accuracy + 0.25·Difficulty + 0.15·Recall + 0.15·Breadth + 0.10·Consistency )
```

Weights live in `config.lyricIq.weights`. Every component is normalised to 0–1.

| Component | Definition |
|---|---|
| Accuracy | Correct ÷ attempts, shrunk toward a prior of 0.5 with strength 6, so three lucky answers cannot claim 100 |
| Difficulty | Mean difficulty of *correctly answered* questions ÷ 80, capped at 1 — the difficulty you conquer, not the difficulty you were shown |
| Recall | Shrunk accuracy on recall templates (finish the lyric, missing word/phrase, next line) as opposed to recognition (name the song/artist) |
| Breadth | Mean of saturating counts: artists with ≥ 2 attempts ÷ 25, genres ÷ 5, decades ÷ 5 |
| Consistency | 1 − 2·σ of the last 20 session accuracies (0.5 until two sessions exist) |

## Presentation rules

* Provisional until `minQuestionsForScore` (10) questions have been answered.
* Category sub-scores (Hip-Hop IQ, R&B IQ, Pop IQ, Rock IQ, Country IQ, era IQs, Recall IQ, Recognition IQ) appear only after `minQuestionsForCategoryScore` (15) attempts in that bucket. Each is `100 × (0.6·shrunkAccuracy + 0.4·difficultyConquered)`.
* The profile screen always ships a plain-language explanation of the five components.

## Recomputation

Every answer is stored as an `AnswerAttempt` with difficulty, response time, correctness, template, skill, answer type, track dimensions and `scoreModelVersion`. `PlayerMetrics` holds the aggregates the model reads. A future model version recomputes from attempts; `lyricIq.version` is stored alongside every value.

## Scoring (model v1)

```
points = base(100) × difficultyMultiplier(1.0–2.0) × typedMultiplier(1.25 for typed recall)
       + speedBonus(≤ 50, linear from 250 ms to 10 s)
       + streakBonus(10 per prior streak step, cap 100)
capped at 450 per question; wrong or timed-out answers score 0
```
