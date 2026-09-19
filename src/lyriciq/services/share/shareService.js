'use strict';

const { GENRE_LABELS } = require('../lyricIq/lyricIqService');
const config = require('../../config');

/** Same tiers the client uses for its worlds. */
function worldForIq(value) {
    if (value === null || value === undefined) return 'block';
    if (value >= 75) return 'rooftop';
    if (value >= 50) return 'court';
    return 'block';
}

/** Same voice as the results screen (public/js/lyric-iq/copy.js). */
function iqLine(value) {
    if (value === null || value === undefined) return 'Unscored. Ten questions fixes that.';
    if (value >= 90) return 'Encyclopedic. People should be scared.';
    if (value >= 80) return 'Runs the aux and everyone knows it.';
    if (value >= 70) return 'Sharp. The chorus and the deep cuts.';
    if (value >= 60) return 'Solid. Some records they’ve lived in.';
    if (value >= 50) return 'Getting there. The hooks are theirs.';
    if (value >= 35) return 'Casual listener. For now.';
    return 'Fresh ears. Everything ahead of them.';
}

/** One-line result for the session: the thing worth bragging about. */
function sessionHeadline(session) {
    if (!session) return null;
    const answered = (session.correctCount || 0) + (session.wrongCount || 0);
    switch (session.gameMode) {
        case 'DAILY_10': return `Daily 10 · ${session.correctCount}/${answered || session.questionCount}`;
        case 'STREAK': return `Streak of ${session.bestStreak}`;
        case 'RAPID_FIRE': return `Rapid Fire · ${session.correctCount} in 60s`;
        default: return `${session.correctCount}/${answered} · ${session.score} pts`;
    }
}

/** First name for users; guests stay anonymous. */
function publicName(displayName, isGuest) {
    if (isGuest || !displayName || displayName === 'Guest') return 'Someone on Wordeth';
    return String(displayName).trim().split(/\s+/)[0].slice(0, 24);
}

/**
 * The snapshot stored on a completed session and drawn on its share card. It
 * captures the moment, so the card never changes as the player keeps playing.
 */
function buildShareCard({ lyricIq, session, displayName = null, isGuest = false, dailyStreak = 0 }) {
    const value = lyricIq && lyricIq.value !== null && lyricIq.value !== undefined ? lyricIq.value : null;
    const genres = lyricIq?.subScores?.genres || {};
    const top = Object.entries(genres).sort((a, b) => b[1].value - a[1].value)[0];
    const artistKey = session?.artist?.key || null;
    const artistIq = artistKey ? lyricIq?.subScores?.artists?.[artistKey] : null;
    return {
        version: 1,
        displayName: publicName(displayName, isGuest),
        lyricIq: value,
        provisional: !!(lyricIq && lyricIq.provisional),
        line: iqLine(value),
        headline: sessionHeadline(session),
        topGenre: top ? { key: top[0], label: (GENRE_LABELS[top[0]] || top[0]).replace(' IQ', ' IQ'), value: top[1].value } : null,
        artist: artistKey ? { key: artistKey, name: session.artist.name || artistKey, value: artistIq ? artistIq.value : null, sessionAccuracy: session.toPublic ? session.toPublic().accuracy : null } : null,
        dailyStreak: dailyStreak || 0,
        world: worldForIq(value)
    };
}

/** Card data for any completed session, including ones finished before snapshots existed. */
function cardForSession(session) {
    if (session.shareCard && session.shareCard.version) return session.shareCard;
    const value = session.lyricIqAfter ?? null;
    return { version: 0, displayName: 'Someone on Wordeth', lyricIq: value, provisional: false, line: iqLine(value), headline: sessionHeadline(session), topGenre: null, artist: null, dailyStreak: 0, world: worldForIq(value) };
}

/** Where a result lives publicly: page, link-preview card and story cut. */
function shareLinks(sessionId) {
    const id = String(sessionId);
    const paths = { pagePath: `/s/${id}`, cardPath: `/s/${id}/card.png`, storyPath: `/s/${id}/story.png` };
    return { ...paths, pageUrl: `${config.publicUrl}${paths.pagePath}`, cardUrl: `${config.publicUrl}${paths.cardPath}`, storyUrl: `${config.publicUrl}${paths.storyPath}` };
}

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
    lines.push(config.publicUrl.replace(/^https?:\/\//, ''));

    const links = session ? shareLinks(session.id || session._id) : {};
    return {
        headline: iqValue !== null ? `LYRIC IQ: ${iqValue}` : 'LYRIC IQ',
        // One sentence for share sheets, where the card image and link carry the rest.
        short: iqValue !== null ? `My Lyric IQ is ${iqValue}. Think you know more?` : 'I took the Lyric IQ test. Think you know more?',
        displayName: displayName || null,
        stats,
        text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
        url: challengeUrl,
        ...links,
        version: 2
    };
}

module.exports = { buildSharePayload, buildShareCard, cardForSession, shareLinks, worldForIq, iqLine, sessionHeadline, publicName };
