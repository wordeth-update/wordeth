const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Musixmatch API configuration
const MUSIXMATCH_BASE_URL = 'https://api.musixmatch.com/ws/1.1';
const MUSIXMATCH_API_KEY = process.env.MUSIXMATCH_API_KEY;
const MUSIXMATCH_TIMEOUT = 10000;

// Deezer API for album artwork fallback (no auth required)
const DEEZER_BASE_URL = 'https://api.deezer.com';

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
    'a$ap': ['A$AP', 'ASAP'],
    'lil baby': ['Lil Baby'],
    'lil uzi': ['Lil Uzi Vert'],
    'lil wayne': ['Lil Wayne'],
    'lil durk': ['Lil Durk'],
    'young thug': ['Young Thug'],
    'future': ['Future'],
    'drake': ['Drake'],
    'kendrick': ['Kendrick Lamar'],
    'travis scott': ['Travis Scott'],
    'post malone': ['Post Malone']
};

// Helper function to fetch album art from Deezer
async function fetchDeezerArtwork(artist, track) {
    try {
        const searchQuery = `artist:"${artist}" track:"${track}"`;
        const response = await axios.get(`${DEEZER_BASE_URL}/search`, {
            params: { q: searchQuery, limit: 1 },
            timeout: 5000
        });
        
        if (response.data.data && response.data.data.length > 0) {
            const result = response.data.data[0];
            return {
                cover_small: result.album?.cover_small,
                cover_medium: result.album?.cover_medium,
                cover_big: result.album?.cover_big,
                cover_xl: result.album?.cover_xl
            };
        }
    } catch (err) {
        // Silently fail - Deezer is just a fallback
    }
    return null;
}

// Helper function to process track results
function processTrackResults(tracks) {
    return tracks.map(item => ({
        id: item.track.track_id,
        title: item.track.track_name,
        artist: item.track.artist_name,
        artist_id: item.track.artist_id,
        album: item.track.album_name,
        album_id: item.track.album_id,
        image: item.track.album_coverart_800x800 || 
               item.track.album_coverart_500x500 || 
               item.track.album_coverart_350x350 || 
               item.track.album_coverart_100x100 || null,
        url: item.track.track_share_url,
        release_date: item.track.first_release_date ? new Date(item.track.first_release_date).toLocaleDateString() : null,
        has_lyrics: item.track.has_lyrics === 1,
        instrumental: item.track.instrumental === 1,
        explicit: item.track.explicit === 1,
        rating: item.track.track_rating,
        genres: item.track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || [],
        duration: item.track.track_length || null
    }));
}

// Search for songs using Musixmatch with comprehensive strategies
router.get('/search', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        let { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }

        const lowerQuery = q.toLowerCase().trim();
        let searchQueries = [q];
        
        // Check for artist variations
        for (const [key, variations] of Object.entries(artistVariations)) {
            if (lowerQuery.startsWith(key + ' ') || lowerQuery === key) {
                const rest = lowerQuery.slice(key.length);
                searchQueries = variations.map(v => v + rest);
                break;
            }
        }

        let allHits = [];
        
        for (const searchQuery of searchQueries) {
            if (allHits.length > 0) break;
            
            // Detect if query looks like "Artist - Song" or "Artist Song Title"
            const hasSeparator = searchQuery.includes(' - ') || searchQuery.includes(' – ');
            let artistPart = searchQuery;
            let trackPart = '';
            
            if (hasSeparator) {
                const parts = searchQuery.split(/\s[-–]\s/);
                artistPart = parts[0].trim();
                trackPart = parts[1]?.trim() || '';
            }

            // Strategy 1: Artist + Track search (most specific)
            if (trackPart) {
                try {
                    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                        params: {
                            apikey: MUSIXMATCH_API_KEY,
                            q_artist: artistPart,
                            q_track: trackPart,
                            f_has_lyrics: 1,
                            page_size: 25,
                            page: 1,
                            s_track_rating: 'desc'
                        },
                        timeout: MUSIXMATCH_TIMEOUT
                    });

                    if (response.data.message.header.status_code === 200) {
                        const tracks = response.data.message.body.track_list;
                        if (tracks && tracks.length > 0) {
                            allHits = processTrackResults(tracks);
                        }
                    }
                } catch (err) {
                    console.log(`Artist+Track search failed: ${searchQuery}`, err.message);
                }
            }

            // Strategy 2: q_track_artist combined search
            if (allHits.length === 0) {
                try {
                    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                        params: {
                            apikey: MUSIXMATCH_API_KEY,
                            q_track_artist: searchQuery,
                            f_has_lyrics: 1,
                            page_size: 25,
                            page: 1,
                            s_track_rating: 'desc'
                        },
                        timeout: MUSIXMATCH_TIMEOUT
                    });

                    if (response.data.message.header.status_code === 200) {
                        const tracks = response.data.message.body.track_list;
                        if (tracks && tracks.length > 0) {
                            allHits = processTrackResults(tracks);
                        }
                    }
                } catch (err) {
                    console.log(`Track+Artist search failed: ${searchQuery}`, err.message);
                }
            }

            // Strategy 3: Artist-only search
            if (allHits.length === 0) {
                try {
                    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                        params: {
                            apikey: MUSIXMATCH_API_KEY,
                            q_artist: searchQuery,
                            f_has_lyrics: 1,
                            page_size: 25,
                            page: 1,
                            s_track_rating: 'desc'
                        },
                        timeout: MUSIXMATCH_TIMEOUT
                    });

                    if (response.data.message.header.status_code === 200) {
                        const tracks = response.data.message.body.track_list;
                        if (tracks && tracks.length > 0) {
                            allHits = processTrackResults(tracks);
                        }
                    }
                } catch (err) {
                    console.log(`Artist search failed: ${searchQuery}`, err.message);
                }
            }

            // Strategy 4: Track title search
            if (allHits.length === 0) {
                try {
                    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                        params: {
                            apikey: MUSIXMATCH_API_KEY,
                            q_track: searchQuery,
                            f_has_lyrics: 1,
                            page_size: 25,
                            page: 1,
                            s_track_rating: 'desc'
                        },
                        timeout: MUSIXMATCH_TIMEOUT
                    });

                    if (response.data.message.header.status_code === 200) {
                        const tracks = response.data.message.body.track_list;
                        if (tracks && tracks.length > 0) {
                            allHits = processTrackResults(tracks);
                        }
                    }
                } catch (err) {
                    console.log(`Track search failed: ${searchQuery}`, err.message);
                }
            }

            // Strategy 5: General search (last resort)
            if (allHits.length === 0) {
                try {
                    const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
                        params: {
                            apikey: MUSIXMATCH_API_KEY,
                            q: searchQuery,
                            f_has_lyrics: 1,
                            page_size: 25,
                            page: 1,
                            s_track_rating: 'desc'
                        },
                        timeout: MUSIXMATCH_TIMEOUT
                    });

                    if (response.data.message.header.status_code === 200) {
                        const tracks = response.data.message.body.track_list;
                        if (tracks && tracks.length > 0) {
                            allHits = processTrackResults(tracks);
                        }
                    }
                } catch (err) {
                    console.log(`General search failed: ${searchQuery}`, err.message);
                }
            }
        }

        // Enhance results with Deezer artwork for tracks missing images
        const enhancedHits = await Promise.all(allHits.map(async (hit) => {
            if (!hit.image || hit.image.includes('nocover')) {
                const deezerArt = await fetchDeezerArtwork(hit.artist, hit.title);
                if (deezerArt) {
                    hit.image = deezerArt.cover_xl || deezerArt.cover_big || deezerArt.cover_medium;
                }
            }
            return hit;
        }));

        // Sort by rating (popularity) and filter out duplicates
        const uniqueHits = enhancedHits.reduce((acc, hit) => {
            const key = `${hit.title.toLowerCase()}-${hit.artist.toLowerCase()}`;
            if (!acc.seen.has(key)) {
                acc.seen.add(key);
                acc.results.push(hit);
            }
            return acc;
        }, { seen: new Set(), results: [] }).results;

        res.json({ hits: uniqueHits });
    } catch (error) {
        console.error('Musixmatch search error:', error);
        res.status(500).json({ message: 'Error searching for songs' });
    }
});

// Get song details with enhanced metadata
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
        
        let image = track.album_coverart_800x800 || 
                    track.album_coverart_500x500 || 
                    track.album_coverart_350x350 || 
                    track.album_coverart_100x100;

        // Fetch Deezer artwork if Musixmatch doesn't have it
        if (!image || image.includes('nocover')) {
            const deezerArt = await fetchDeezerArtwork(track.artist_name, track.track_name);
            if (deezerArt) {
                image = deezerArt.cover_xl || deezerArt.cover_big || deezerArt.cover_medium;
            }
        }

        res.json({
            id: track.track_id,
            title: track.track_name,
            artist: track.artist_name,
            artist_id: track.artist_id,
            album: track.album_name,
            album_id: track.album_id,
            image: image,
            url: track.track_share_url,
            release_date: track.first_release_date ? new Date(track.first_release_date).toLocaleDateString() : null,
            has_lyrics: track.has_lyrics === 1,
            instrumental: track.instrumental === 1,
            explicit: track.explicit === 1,
            rating: track.track_rating,
            duration: track.track_length,
            genres: track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || []
        });
    } catch (error) {
        console.error('Error fetching song:', error);
        res.status(500).json({ message: 'Error fetching song details' });
    }
});

// Get lyrics for a song with multi-source fallback
router.get('/lyrics/:id', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { id } = req.params;

        // Get lyrics from Musixmatch
        const lyricsResponse = await axios.get(`${MUSIXMATCH_BASE_URL}/track.lyrics.get`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                track_id: id
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (lyricsResponse.data.message.header.status_code === 200) {
            const lyrics = lyricsResponse.data.message.body.lyrics;
            return res.json({
                lyrics: lyrics.lyrics_body,
                copyright: lyrics.lyrics_copyright,
                explicit: lyrics.explicit === 1,
                synced: false
            });
        }

        res.status(404).json({ message: 'Lyrics not found' });
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        res.status(500).json({ message: 'Error fetching lyrics' });
    }
});

// Get synced lyrics for karaoke (multi-source)
router.get('/synced-lyrics', async (req, res) => {
    try {
        const { artist, track } = req.query;
        
        if (!artist || !track) {
            return res.status(400).json({ message: 'Artist and track are required' });
        }

        // Try LRCLIB first (best synced lyrics source)
        try {
            const lrclibResponse = await axios.get('https://lrclib.net/api/get', {
                params: {
                    artist_name: artist,
                    track_name: track
                },
                timeout: 8000
            });

            if (lrclibResponse.data && lrclibResponse.data.syncedLyrics) {
                return res.json({
                    lyrics: lrclibResponse.data.syncedLyrics,
                    synced: true,
                    source: 'lrclib'
                });
            }
        } catch (err) {
            console.log('LRCLIB failed:', err.message);
        }

        // Fallback to Lyrics.ovh for plain lyrics
        try {
            const lyricsOvhResponse = await axios.get(
                `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(track)}`,
                { timeout: 8000 }
            );

            if (lyricsOvhResponse.data && lyricsOvhResponse.data.lyrics) {
                return res.json({
                    lyrics: lyricsOvhResponse.data.lyrics,
                    synced: false,
                    source: 'lyrics.ovh'
                });
            }
        } catch (err) {
            console.log('Lyrics.ovh failed:', err.message);
        }

        res.status(404).json({ message: 'Synced lyrics not available' });
    } catch (error) {
        console.error('Error fetching synced lyrics:', error);
        res.status(500).json({ message: 'Error fetching synced lyrics' });
    }
});

// Get trending/chart songs
router.get('/trending', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { country = 'us' } = req.query;

        const response = await axios.get(`${MUSIXMATCH_BASE_URL}/chart.tracks.get`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                chart_name: 'top',
                page: 1,
                page_size: 20,
                country: country,
                f_has_lyrics: 1
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (response.data.message.header.status_code === 200) {
            const tracks = response.data.message.body.track_list;
            const hits = await Promise.all(tracks.map(async (item) => {
                let image = item.track.album_coverart_800x800 || 
                            item.track.album_coverart_500x500 || 
                            item.track.album_coverart_350x350 || 
                            item.track.album_coverart_100x100;

                // Fetch Deezer artwork if needed
                if (!image || image.includes('nocover')) {
                    const deezerArt = await fetchDeezerArtwork(item.track.artist_name, item.track.track_name);
                    if (deezerArt) {
                        image = deezerArt.cover_xl || deezerArt.cover_big || deezerArt.cover_medium;
                    }
                }

                return {
                    id: item.track.track_id,
                    title: item.track.track_name,
                    artist: item.track.artist_name,
                    album: item.track.album_name,
                    image: image,
                    url: item.track.track_share_url,
                    explicit: item.track.explicit === 1,
                    rating: item.track.track_rating,
                    genres: item.track.primary_genres?.music_genre_list?.map(g => g.music_genre.music_genre_name) || []
                };
            }));

            return res.json({ hits });
        }

        res.json({ hits: [] });
    } catch (error) {
        console.error('Error fetching trending:', error);
        res.status(500).json({ message: 'Error fetching trending songs' });
    }
});

// Search artists
router.get('/artists', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }

        const response = await axios.get(`${MUSIXMATCH_BASE_URL}/artist.search`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                q_artist: q,
                page_size: 10,
                page: 1
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (response.data.message.header.status_code === 200) {
            const artists = response.data.message.body.artist_list;
            const results = artists.map(item => ({
                id: item.artist.artist_id,
                name: item.artist.artist_name,
                country: item.artist.artist_country,
                rating: item.artist.artist_rating,
                twitter_url: item.artist.artist_twitter_url,
                alias_list: item.artist.artist_alias_list?.map(a => a.artist_alias) || []
            }));

            return res.json({ artists: results });
        }

        res.json({ artists: [] });
    } catch (error) {
        console.error('Error searching artists:', error);
        res.status(500).json({ message: 'Error searching artists' });
    }
});

// Get artist's top tracks
router.get('/artist/:id/tracks', async (req, res) => {
    try {
        if (!MUSIXMATCH_API_KEY) {
            return res.status(500).json({ message: 'Lyrics service not configured' });
        }

        const { id } = req.params;
        const { page = 1, page_size = 20 } = req.query;

        const response = await axios.get(`${MUSIXMATCH_BASE_URL}/track.search`, {
            params: {
                apikey: MUSIXMATCH_API_KEY,
                f_artist_id: id,
                f_has_lyrics: 1,
                page: page,
                page_size: page_size,
                s_track_rating: 'desc'
            },
            timeout: MUSIXMATCH_TIMEOUT
        });

        if (response.data.message.header.status_code === 200) {
            const tracks = response.data.message.body.track_list;
            const hits = await Promise.all(tracks.map(async (item) => {
                let image = item.track.album_coverart_800x800 || 
                            item.track.album_coverart_500x500 || 
                            item.track.album_coverart_350x350;

                if (!image || image.includes('nocover')) {
                    const deezerArt = await fetchDeezerArtwork(item.track.artist_name, item.track.track_name);
                    if (deezerArt) {
                        image = deezerArt.cover_xl || deezerArt.cover_big;
                    }
                }

                return {
                    id: item.track.track_id,
                    title: item.track.track_name,
                    artist: item.track.artist_name,
                    album: item.track.album_name,
                    image: image,
                    explicit: item.track.explicit === 1,
                    rating: item.track.track_rating
                };
            }));

            return res.json({ hits });
        }

        res.json({ hits: [] });
    } catch (error) {
        console.error('Error fetching artist tracks:', error);
        res.status(500).json({ message: 'Error fetching artist tracks' });
    }
});

module.exports = router;
