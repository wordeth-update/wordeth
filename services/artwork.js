/**
 * A picture for a song, when Musixmatch has none.
 *
 * Musixmatch answers most tracks with its "nocover" placeholder. Deezer's
 * public search (no key) knows the real cover for most of them. Three
 * tries, each less exact than the last:
 *
 *   1. the artist and the title, exactly;
 *   2. the title without its "(feat. …)" / "- Remastered" tail, which is
 *      where the exact search usually trips;
 *   3. the artist's own picture — not the cover, but theirs, and better
 *      than a grey square.
 *
 * A loose free-text search is deliberately not one of the tries: it finds
 * *a* cover by that artist, and showing the wrong album is worse than
 * showing the artist.
 *
 * Answers, including "nothing found", are remembered for a day so a row of
 * cards costs Deezer one question per song, once.
 */
const axios = require('axios');

const DEEZER_BASE_URL = 'https://api.deezer.com';
const TIMEOUT_MS = 4000;
const REMEMBER_MS = 24 * 60 * 60 * 1000;
const REMEMBER_MAX = 3000;
const remembered = new Map();

const keyOf = (artist, track) => `${String(artist || '').toLowerCase().trim()}|${String(track || '').toLowerCase().trim()}`;

/** "Superman (feat. Dina Rae)" → "Superman"; "Song - Remastered 2011" → "Song". */
function bareTitle(title) {
    return String(title || '')
        .replace(/\s*[\(\[](feat\.?|ft\.?|with)\b[^\)\]]*[\)\]]/gi, '')
        .replace(/\s+-\s+.*(remaster|version|edit|mix|live|mono|stereo).*$/i, '')
        .trim();
}

async function search(path, q) {
    const response = await axios.get(`${DEEZER_BASE_URL}${path}`, { params: { q, limit: 1 }, timeout: TIMEOUT_MS });
    const list = response.data && response.data.data;
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

function covers(album) {
    if (!album || !(album.cover_xl || album.cover_big || album.cover_medium)) return null;
    return { cover_small: album.cover_small, cover_medium: album.cover_medium, cover_big: album.cover_big, cover_xl: album.cover_xl };
}

/** Same shape the lyrics routes have always used: { cover_small, cover_medium, cover_big, cover_xl } or null. */
async function fetchDeezerArtwork(artist, track) {
    if (!artist && !track) return null;
    const key = keyOf(artist, track);
    const hit = remembered.get(key);
    if (hit && Date.now() - hit.at < REMEMBER_MS) return hit.art;

    let art = null;
    try {
        const exact = await search('/search', `artist:"${artist}" track:"${track}"`);
        art = covers(exact && exact.album);
        const bare = bareTitle(track);
        if (!art && bare && bare !== track) {
            const again = await search('/search', `artist:"${artist}" track:"${bare}"`);
            art = covers(again && again.album);
        }
        if (!art && artist) {
            // First name on the bill: "Money Man feat. Lil Baby" → "Money Man".
            const lead = String(artist).split(/\s+(feat\.?|ft\.?|&|x|with)\s+|,/i)[0].trim();
            const person = await search('/search/artist', lead);
            if (person && person.picture_xl && !/\/artist\/\/|images\/artist\/\//.test(person.picture_xl)) {
                art = { cover_small: person.picture_small, cover_medium: person.picture_medium, cover_big: person.picture_big, cover_xl: person.picture_xl };
            }
        }
    } catch (err) {
        // Deezer is a courtesy: a failure is "no picture", and is not remembered.
        return null;
    }
    if (remembered.size >= REMEMBER_MAX) remembered.delete(remembered.keys().next().value);
    remembered.set(key, { at: Date.now(), art });
    return art;
}

/** One https URL, or '' when there is nothing to show. */
async function artworkUrl(artist, track) {
    const art = await fetchDeezerArtwork(artist, track);
    const url = art && (art.cover_xl || art.cover_big || art.cover_medium);
    return typeof url === 'string' && /^https:\/\//.test(url) ? url : '';
}

module.exports = { fetchDeezerArtwork, artworkUrl, bareTitle };
