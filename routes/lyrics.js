const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Genius API configuration
const GENIUS_BASE_URL = 'https://api.genius.com';
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

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

// Search for songs
router.get('/search', async (req, res) => {
    try {
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
                const response = await axios.get(`${GENIUS_BASE_URL}/search`, {
                    headers: {
                        'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
                    },
                    params: {
                        q: searchQuery
                    }
                });

                const hits = response.data.response.hits.map(hit => ({
                    id: hit.result.id,
                    title: hit.result.title,
                    artist: hit.result.primary_artist.name,
                    image: hit.result.song_art_image_url,
                    url: hit.result.url,
                    release_date: hit.result.release_date_for_display
                }));

                if (hits.length > 0) {
                    allHits = hits;
                    break; // Found results, stop searching
                }
            } catch (err) {
                console.log(`Search variation failed: ${searchQuery}`);
            }
        }

        res.json({ hits: allHits });
    } catch (error) {
        console.error('Genius search error:', error);
        res.status(500).json({ message: 'Error searching for songs' });
    }
});

// Get song details and lyrics
router.get('/song/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Get song details from Genius API
        const songResponse = await axios.get(`${GENIUS_BASE_URL}/songs/${id}`, {
            headers: {
                'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
            }
        });

        const song = songResponse.data.response.song;
        
        const songData = {
            id: song.id,
            title: song.title,
            artist: song.primary_artist.name,
            image: song.song_art_image_url,
            url: song.url,
            release_date: song.release_date_for_display,
            lyrics: 'Lyrics available at: ' + song.url,
            album: song.album?.name || null,
            featured_artists: song.featured_artists?.map(artist => artist.name) || []
        };

        res.json(songData);
    } catch (error) {
        console.error('Genius song error:', error);
        res.status(500).json({ message: 'Error fetching song details' });
    }
});

// Get lyrics content for a song using multiple APIs
router.get('/lyrics/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // First get song details from Genius API for artist/title info
        const songResponse = await axios.get(`${GENIUS_BASE_URL}/songs/${id}`, {
            headers: {
                'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
            }
        });

        const song = songResponse.data.response.song;
        const artist = song.primary_artist.name;
        const title = song.title;

        let lyrics = '';
        let syncedLyrics = null;
        let source = 'none';

        // Try LRCLIB first (provides synced lyrics for karaoke)
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
                    // Also extract plain text from synced lyrics
                    lyrics = lrclibResponse.data.syncedLyrics
                        .split('\n')
                        .map(line => line.replace(/^\[\d{2}:\d{2}\.\d{2,3}\]\s*/, ''))
                        .join('\n');
                    source = 'lrclib-synced';
                } else if (lrclibResponse.data.plainLyrics) {
                    lyrics = lrclibResponse.data.plainLyrics;
                    source = 'lrclib';
                }
            }
        } catch (lrclibError) {
            console.log('LRCLIB lookup failed, trying Lyrics.ovh:', lrclibError.message);
        }

        // Fallback to Lyrics.ovh if LRCLIB didn't work
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
        
        // If we found lyrics, clean them up
        if (lyrics) {
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
                          .replace(/^\s+|\s+$/g, '') // trim
                          .replace(/\n{3,}/g, '\n\n'); // max 2 consecutive line breaks
        }
        
        // Final fallback if no lyrics found
        if (!lyrics || lyrics.length < 50) {
            source = 'unavailable';
            lyrics = `Lyrics not available for "${title}" by ${artist}.\n\nVisit Genius for the full lyrics.`;
        }
        
        res.json({
            id: song.id,
            title: title,
            artist: artist,
            image: song.song_art_image_url,
            url: song.url,
            release_date: song.release_date_for_display,
            lyrics: lyrics,
            syncedLyrics: syncedLyrics,
            source: source,
            album: song.album?.name || null,
            album_image: song.album?.cover_art_url || song.song_art_image_url,
            featured_artists: song.featured_artists?.map(artist => artist.name) || [],
            producer_artists: song.producer_artists?.map(artist => artist.name) || [],
            writer_artists: song.writer_artists?.map(artist => artist.name) || [],
            description: song.description?.plain || null,
            language: song.language || null,
            genres: song.genres?.map(genre => genre.name) || [],
            tags: song.tags?.map(tag => tag.name) || []
        });

    } catch (error) {
        console.error('Lyrics fetch error:', error);
        res.status(500).json({ 
            message: 'Error fetching lyrics',
            error: error.message 
        });
    }
});

// Get trending songs
router.get('/trending', async (req, res) => {
    try {
        const response = await axios.get(`${GENIUS_BASE_URL}/songs/chart`, {
            headers: {
                'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
            },
            params: {
                time_period: 'day',
                chart_genre: 'all'
            }
        });

        const songs = response.data.response.chart_items.map(item => ({
            id: item.item.id,
            title: item.item.title,
            artist: item.item.primary_artist.name,
            image: item.item.song_art_image_url,
            url: item.item.url
        }));

        res.json({ songs });
    } catch (error) {
        console.error('Genius trending error:', error);
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
        // Invidious instances provide a free API without requiring API keys
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
                    // Get the first video result
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
                
                // Extract video ID from response
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
