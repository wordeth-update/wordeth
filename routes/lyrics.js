const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Musixmatch API configuration
const MUSIXMATCH_BASE_URL = 'https://api.musixmatch.com/ws/1.1';
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_TIMEOUT = 10000;

// Artist name variations for better search results
const artistVariations = {
    'ti': ['T.I.', 'TI', 'T.I', 'Tip'],
    't.i.': ['T.I.', 'TI', 'T.I', 'Tip'],
    't.i': ['T.I.', 'TI', 'T.I.', 'Tip'],
    'tip': ['T.I.', 'TI', 'Tip'],
    'jayz': ['Jay-Z', 'Jay Z', 'Jigga'],
    'jay-z': ['Jay-Z', 'Jay Z', 'Jigga'],
    'jay z': ['Jay-Z', 'Jay Z', 'Jigga'],
    'emcee': ['MC', 'Emcee'],
    'mc': ['MC', 'Emcee'],
    'biggie': ['The Notorious B.I.G.', 'Biggie Smalls', 'Biggie'],
    'notorious big': ['The Notorious B.I.G.', 'Biggie Smalls'],
    '2pac': ['2Pac', 'Tupac', 'Tupac Shakur'],
    'tupac': ['2Pac', 'Tupac', 'Tupac Shakur'],
    'asap': ['A$AP', 'ASAP'],
    'a$ap': ['A$AP', 'ASAP']
};

// Search for songs using Musixmatch
router.get('/search', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        let { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }

        // Check if the query matches any artist variations
        const lowerQuery = q.toLowerCase().trim();
        let searchQueries = [q];
        
        // Check for artist variations at the start of the query
        for (const [key, variations] of Object.entries(artistVariations)) {
            if (lowerQuery.startsWith(key + ' ') || lowerQuery === key) {
                const rest = lowerQuery.slice(key.length);
                searchQueries = variations.map(v => v + rest);
                break;
            }
        }

        // Try each search query until we get results
        let allHits = [];
        
        for (const searchQuery of searchQueries) {
            try {
                const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                    params: {
                        apikey: MUSIXMATCH_API_KEY,
                        q: searchQuery,
                        page_size: 20,
                        page: 1,
                        s_track_rating: 'desc'
                    },
                    timeout: MUSIXMATCH_TIMEOUT
                });

                if (response.data.message.header.status_code === 200) {
                    const tracks = response.data.message.body.track_list;
                    const hits = tracks.map(item => ({
                        id: item.track.track_id,
                        title: item.track.track_name,
                        artist: item.track.artist_name,
                        album: item.track.album_name,
                        image: item.track.album_coverart_500x500 || item.track.album_coverart_350x350 || item.track.album_coverart_100x100 || null,
                        url: item.track.track_share_url,
                        release_date: item.track.first_release_date ? new Date(item.track.first_release_date).toLocaleDateString() : null,
                        has_lyrics: item.track.has_lyrics === 1,
                        explicit: item.track.explicit === 1,
                        genres: item.track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || []
                    }));

                    if (hits.length > 0) {
                        allHits = hits;
                        break;
                    }
                }
            } catch (err) {
                console.log(`Search variation failed: ${searchQuery}`, err.message);
            }
        }

        res.json({ hits: allHits });
    } catch (error) {
        console.error('Musixmatch search error:', error);
        res.status(500).json({ message: 'Error searching for songs' });
    }
});

// Get song details
router.get('/song/:id', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { id } = req.params;

        // Get track details from Musixmatch
        const trackResponse = await axios.get(`${MUSIXMATCH_BASE_URL}/track.get`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                track_id: id
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (trackResponse.data.message.header.status_code !== 200) {
            return res.status(404).json({ message: 'Song not found' });
        }

        const track = trackResponse.data.message.body.track;
        
        const songData = {
            id: track.track_id,
            title: track.track_name,
            artist: track.artist_name,
            artist_id: track.artist_id,
            album: track.album_name,
            album_id: track.album_id,
            image: track.album_coverart_500x500 || track.album_coverart_350x350 || track.album_coverart_100x100 || null,
            url: track.track_share_url,
            release_date: track.first_release_date ? new Date(track.first_release_date).toLocaleDateString() : null,
            has_lyrics: track.has_lyrics === 1,
            explicit: track.explicit === 1,
            genres: track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || [],
            lyrics: 'Use the lyrics endpoint to get full lyrics'
        };

        res.json(songData);
    } catch (error) {
        console.error('Musixmatch song error:', error);
        res.status(500).json({ message: 'Error fetching song details' });
    }
});

// Get lyrics content for a song
router.get('/lyrics/:id', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { id } = req.params;

        // First get track details from Musixmatch
        const trackResponse = await axios.get(`${MUSIXMATCH_BASE_URL}/track.get`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                track_id: id
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (trackResponse.data.message.header.status_code !== 200) {
            return res.status(404).json({ message: 'Song not found' });
        }

        const track = trackResponse.data.message.body.track;
        const artist = track.artist_name;
        const title = track.track_name;

        let lyrics = '';
        let syncedLyrics = null;
        let source = 'none';

        // Try Musixmatch lyrics first
        try {
            const lyricsResponse = await axios.get(`${MUSIXMATCH_BASE_URL}/track.lyrics.get`, {
                params: {
                    apikey: MUSIXMATCH_API_KEY,
                    track_id: id
                },
                timeout: MUSIXMATCH_TIMEOUT
            });

            if (lyricsResponse.data.message.header.status_code === 200 && 
                lyricsResponse.data.message.body.lyrics) {
                const lyricsData = lyricsResponse.data.message.body.lyrics;
                if (lyricsData.lyrics_body && lyricsData.lyrics_body.length > 50) {
                    lyrics = lyricsData.lyrics_body;
                    source = 'musixmatch';
                }
            }
        } catch (mxmError) {
            console.log('Musixmatch lyrics lookup failed:', mxmError.message);
        }

        // Try LRCLIB for synced lyrics (for karaoke feature)
        try {
            const lrclibResponse = await axios.get('https://lrclib.net/api/get', {
                params: {
                    artist_name: artist,
                    track_name: title
                },
                headers: {
                    'User-Agent': 'Wordeth/1.0 (https://wordeth.replit.app)'
                },
                timeout: 5000
            });

            if (lrclibResponse.data) {
                // Prefer synced lyrics if available
                if (lrclibResponse.data.syncedLyrics) {
                    syncedLyrics = lrclibResponse.data.syncedLyrics;
                    // If we don't have lyrics yet, extract from synced
                    if (!lyrics || lyrics.length < 50) {
                        lyrics = lrclibResponse.data.syncedLyrics
                            .split('\n')
                            .map(line => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s*/, ''))
                            .join('\n');
                        source = 'lrclib-synced';
                    }
                } else if (lrclibResponse.data.plainLyrics && (!lyrics || lyrics.length < 50)) {
                    lyrics = lrclibResponse.data.plainLyrics;
                    source = 'lrclib';
                }
            }
        } catch (lrclibError) {
            console.log('LRCLIB lookup failed:', lrclibError.message);
        }

        // Fallback to Lyrics.ovh if still no lyrics
        if (!lyrics || lyrics.length < 50) {
            try {
                const lyricsOvhResponse = await axios.get(
                    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
                    { timeout: 5000 }
                );

                if (lyricsOvhResponse.data && lyricsOvhResponse.data.lyrics) {
                    lyrics = lyricsOvhResponse.data.lyrics;
                    source = 'lyrics.ovh';
                }
            } catch (ovhError) {
                console.log('Lyrics.ovh lookup failed:', ovhError.message);
            }
        }
        
        // Clean up lyrics if we found them
        if (lyrics) {
            // Remove Musixmatch copyright notice if present
            lyrics = lyrics.replace(/\*{7}[\s\S]*?This Lyrics is NOT for Commercial use[\s\S]*?\*{7}/gi, '').trim();
            // Remove script tags
            lyrics = lyrics.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
            // Remove style tags
            lyrics = lyrics.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
            // Remove comments
            lyrics = lyrics.replace(/<!--[\s\S]*?-->/g, '');
            // Convert <br> tags to line breaks
            lyrics = lyrics.replace(/<br\s*\/?>/gi, '\n');
            // Convert <p> tags to line breaks
            lyrics = lyrics.replace(/<\/p>/gi, '\n');
            // Remove HTML tags but keep text
            lyrics = lyrics.replace(/<[^>]*>/g, '');
            // Decode HTML entities
            lyrics = lyrics.replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&#39;/g, "'")
                          .replace(/&nbsp;/g, ' ')
                          .replace(/&apos;/g, "'")
                          .replace(/&rsquo;/g, "'")
                          .replace(/&lsquo;/g, "'")
                          .replace(/&rdquo;/g, '"')
                          .replace(/&ldquo;/g, '"')
                          .replace(/&hellip;/g, '...')
                          .replace(/&mdash;/g, '—')
                          .replace(/&ndash;/g, '–');
            // Clean up extra whitespace
            lyrics = lyrics.replace(/\n\s*\n/g, '\n\n')
                          .replace(/^\s+|\s+$/g, '')
                          .replace(/\n{3,}/g, '\n\n');
        }
        
        // Final fallback if no lyrics found
        if (!lyrics || lyrics.length < 50) {
            source = 'unavailable';
            lyrics = `Lyrics not available for "${title}" by ${artist}.\n\nVisit the song page for more information.`;
        }
        
        res.json({
            id: track.track_id,
            title: title,
            artist: artist,
            image: track.album_coverart_500x500 || track.album_coverart_350x350 || track.album_coverart_100x100 || null,
            url: track.track_share_url,
            release_date: track.first_release_date ? new Date(track.first_release_date).toLocaleDateString() : null,
            lyrics: lyrics,
            syncedLyrics: syncedLyrics,
            source: source,
            album: track.album_name || null,
            album_image: track.album_coverart_500x500 || track.album_coverart_350x350 || null,
            explicit: track.explicit === 1,
            genres: track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || []
        });

    } catch (error) {
        console.error('Lyrics fetch error:', error);
        res.status(500).json({ 
            message: 'Error fetching lyrics',
            error: error.message 
        });
    }
});

// Get trending/chart songs using Musixmatch
router.get('/trending', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const response = await axios.get(`${MUSIXMATCH_BASE_URL}/chart.tracks.get`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                page: 1,
                page_size: 20,
                country: 'us',
                f_has_lyrics: 1
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (response.data.message.header.status_code !== 200) {
            return res.status(500).json({ message: 'Error fetching trending songs' });
        }

        const tracks = response.data.message.body.track_list;
        const songs = tracks.map(item => ({
            id: item.track.track_id,
            title: item.track.track_name,
            artist: item.track.artist_name,
            album: item.track.album_name,
            image: item.track.album_coverart_500x500 || item.track.album_coverart_350x350 || item.track.album_coverart_100x100 || null,
            url: item.track.track_share_url,
            has_lyrics: item.track.has_lyrics === 1
        }));

        res.json({ songs });
    } catch (error) {
        console.error('Musixmatch trending error:', error);
        res.status(500).json({ message: 'Error fetching trending songs' });
    }
});

// YouTube search for karaoke audio
router.get('/youtube-search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) {
            return res.status(400).json({ message: 'Search query required' });
        }

        // Use YouTube's search via Invidious API (privacy-respecting YouTube frontend)
        const instances = [
            'https://inv.nadeko.net',
            'https://invidious.snopyta.org',
            'https://invidious.kavin.rocks'
        ];
        
        let videoId = null;
        
        for (const instance of instances) {
            try {
                const searchUrl = `${instance}/api/v1/search?q=${encodeURIComponent(q)}&type=video`;
                const response = await axios.get(searchUrl, { timeout: 5000 });
                
                if (response.data && response.data.length > 0) {
                    const video = response.data[0];
                    videoId = video.videoId;
                    break;
                }
            } catch (instanceError) {
                console.log(`Invidious instance ${instance} failed, trying next...`);
                continue;
            }
        }
        
        // Fallback: scrape YouTube search results page
        if (!videoId) {
            try {
                const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
                const response = await axios.get(ytSearchUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 5000
                });
                
                const videoIdMatch = response.data.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (videoIdMatch) {
                    videoId = videoIdMatch[1];
                }
            } catch (ytError) {
                console.log('YouTube direct search failed:', ytError.message);
            }
        }
        
        if (videoId) {
            res.json({ videoId });
        } else {
            res.json({ videoId: null, message: 'No video found' });
        }
    } catch (error) {
        console.error('YouTube search error:', error);
        res.status(500).json({ message: 'Error searching YouTube' });
    }
});

module.exports = router;
