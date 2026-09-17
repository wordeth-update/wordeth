/* Wordeth Lyric IQ — interface copy. Rotated contextually; never on every element. */
(function () {
    'use strict';

    var CORRECT = ['Too easy.', 'Yeah, you know that.', 'Clean.', 'Talk your talk.', 'Locked in.', 'Say less.', 'That one lives in you.'];
    var CORRECT_FAST = ['Instant.', 'Didn’t even blink.', 'Reflex.'];
    var CORRECT_STREAK = ['Still going.', 'Nobody’s stopping this.', 'Keep talking.'];
    var INCORRECT = ['Almost.', 'Nah.', 'Run that one back.', 'You knew better.', 'Close.', 'Not that one.', 'It’s in there somewhere.'];
    var INCORRECT_STREAK_BROKEN = ['That’s the run.', 'Ended on your terms? No.', 'Good run. Go again.'];
    var TIMEOUT = ['Time.', 'Clock ran out.'];

    var lastPick = {};

    function rotate(pool, key) {
        if (!pool.length) return '';
        var idx = Math.floor(Math.random() * pool.length);
        if (pool.length > 1 && idx === lastPick[key]) idx = (idx + 1) % pool.length;
        lastPick[key] = idx;
        return pool[idx];
    }

    function feedback(result, context) {
        context = context || {};
        if (context.timedOut) return rotate(TIMEOUT, 'timeout');
        if (result.correct) {
            if (context.streak >= 5 && Math.random() < 0.5) return rotate(CORRECT_STREAK, 'cstreak');
            if (result.responseTimeMs < 1500 && Math.random() < 0.5) return rotate(CORRECT_FAST, 'cfast');
            return rotate(CORRECT, 'correct');
        }
        if (context.streakBroken && context.brokenStreak >= 3) return rotate(INCORRECT_STREAK_BROKEN, 'broken');
        return rotate(INCORRECT, 'incorrect');
    }

    var INSTRUCTIONS = {
        FINISH_THE_LYRIC: 'Finish the line',
        MISSING_WORD: 'Missing word',
        MISSING_PHRASE: 'Missing phrase',
        NEXT_LINE: 'What comes next',
        GUESS_THE_SONG: 'Name the song',
        GUESS_THE_ARTIST: 'Name the artist'
    };

    var MODE_LABELS = { QUICK_PLAY: 'Play', DAILY_10: 'Daily 10', RAPID_FIRE: 'Rapid Fire', STREAK: 'Streak' };
    var BAND_LABELS = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard', ELITE: 'Elite' };

    function iqLine(value) {
        if (value === null || value === undefined) return 'Unscored.';
        if (value >= 90) return 'Encyclopedic. People should be scared.';
        if (value >= 80) return 'You run the aux and everyone knows it.';
        if (value >= 70) return 'Sharp. The chorus and the deep cuts.';
        if (value >= 60) return 'Solid. Some records you’ve lived in.';
        if (value >= 50) return 'Getting there. The hooks are yours.';
        if (value >= 35) return 'Casual listener. For now.';
        return 'Fresh ears. Everything ahead of you.';
    }

    window.LiqCopy = { feedback: feedback, INSTRUCTIONS: INSTRUCTIONS, MODE_LABELS: MODE_LABELS, BAND_LABELS: BAND_LABELS, iqLine: iqLine };
})();
