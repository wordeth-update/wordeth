'use strict';

const { GENRE_LABELS } = require('../lyricIq/lyricIqService');

/**
 * Builds the reusable share payload. Reveals identity/status only — never
 * lyric excerpts. Rendering (image cards) is a later phase; the text block is
 * ready for the Web Share API / clipboard today.
 */
function buildSharePayload({ lyricIq, session = null, displayName = null, dailyStreak = 0, challengeUrl = null }) {
    const lines = [];
    const stats = [];
    const iqValue = lyricIq && lyricIq.value !== null ? lyricIq.value : null;

    if (iqValue !== null) {
        lines.push(`LYRIC IQ: ${iqValue}${lyricIq.provisional ? ' (provisional)' : ''}`);
        stats.push({ label: 'Lyric IQ', value: iqValue });
    }
    const genres = lyricIq?.subScores?.genres || {};
    const genreRows = Object.entries(genres).sort((a, b) => b[1].value - a[1].value).slice(0, 3);
    if (genreRows.length) {
        lines.push('');
        for (const [key, s] of genreRows) {
            const label = (GENRE_LABELS[key] || key).replace(' IQ', '').toUpperCase();
            lines.push(`${label.padEnd(9)} ${s.value}`);
            stats.push({ label, value: s.value });
        }
    }
    const eras = lyricIq?.subScores?.eras || {};
    const bestEra = Object.entries(eras).sort((a, b) => b[1].value - a[1].value)[0];
    if (bestEra) {
        lines.push(`${bestEra[0].padEnd(9)} ${bestEra[1].value}`);
        stats.push({ label: bestEra[0], value: bestEra[1].value });
    }
    if (session) {
        lines.push('');
        const answered = session.correctCount + session.wrongCount;
        if (session.gameMode === 'DAILY_10') {
            lines.push('DAILY 10');
            lines.push(`${session.correctCount}/${answered || session.questionCount}`);
        } else if (session.gameMode === 'STREAK') {
            lines.push(`STREAK ${session.bestStreak}`);
        } else if (session.gameMode === 'RAPID_FIRE') {
            lines.push(`RAPID FIRE ${session.correctCount} in 60s`);
        } else {
            lines.push(`${session.correctCount}/${answered} · ${session.score} pts`);
        }
        stats.push({ label: 'Session', value: `${session.correctCount}/${answered}` });
    }
    if (dailyStreak > 1) {
        lines.push('');
        lines.push(`${dailyStreak} DAY STREAK`);
        stats.push({ label: 'Daily streak', value: dailyStreak });
    }
    lines.push('');
    lines.push('wordeth.com/lyric-iq');

    return {
        headline: iqValue !== null ? `LYRIC IQ: ${iqValue}` : 'LYRIC IQ',
        displayName: displayName || null,
        stats,
        text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
        url: challengeUrl,
        version: 1
    };
}

module.exports = { buildSharePayload };
