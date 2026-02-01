const express = require('express');
const router = express.Router();
const axios = require('axios');
const auth = require('../middleware/auth');

// Genius API configuration
const GENIUS_BASE_URL = 'https://api.genius.com';
const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

// Search for songs
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({ message: 'Search query must be at least 2 characters' });
        }

        const response = await axios.get(`${GENIUS_BASE_URL}/search`, {
            headers: {
                'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
            },
            params: {
                q: q
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

        res.json({ hits });
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

// Get lyrics content for a song
router.get('/lyrics/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // First get the song URL from Genius API
        const songResponse = await axios.get(`${GENIUS_BASE_URL}/songs/${id}`, {
            headers: {
                'Authorization': `Bearer ${GENIUS_ACCESS_TOKEN}`
            }
        });

        const songUrl = songResponse.data.response.song.url;

        // Fetch the song page HTML
        const pageResponse = await axios.get(songUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const html = pageResponse.data;

        // Extract lyrics using more sophisticated patterns
        let lyrics = '';
        
        // Try multiple approaches to extract lyrics
        const extractionMethods = [
            // Method 1: Look for lyrics in specific containers
            () => {
                const patterns = [
                    /<div[^>]*class="[^"]*Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                    /<div[^>]*class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                    /<div[^>]*class="[^"]*Lyrics__Root[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                    /<div[^>]*class="[^"]*SongPageGriddesktop__LyricsWrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
                    /<div[^>]*class="[^"]*SongPageGriddesktop__Lyrics[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
                ];
                
                for (const pattern of patterns) {
                    const matches = html.match(pattern);
                    if (matches && matches.length > 0) {
                        return matches.reduce((longest, current) => 
                            current.length > longest.length ? current : longest
                        );
                    }
                }
                return null;
            },
            
            // Method 2: Look for lyrics in data attributes
            () => {
                const dataMatch = html.match(/data-lyrics-container="([^"]*)"[^>]*>([\s\S]*?)<\/div>/gi);
                if (dataMatch) {
                    return dataMatch.join('\n');
                }
                return null;
            },
            
            // Method 3: Look for lyrics in specific sections
            () => {
                const sectionMatch = html.match(/<section[^>]*class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/section>/gi);
                if (sectionMatch) {
                    return sectionMatch.join('\n');
                }
                return null;
            },
            
            // Method 4: Look for lyrics in article tags
            () => {
                const articleMatch = html.match(/<article[^>]*class="[^"]*lyrics[^"]*"[^>]*>([\s\S]*?)<\/article>/gi);
                if (articleMatch) {
                    return articleMatch.join('\n');
                }
                return null;
            },
            
            // Method 5: Look for lyrics in main content areas
            () => {
                const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/gi);
                if (mainMatch) {
                    // Extract text content from main
                    const mainContent = mainMatch.join('\n');
                    // Look for text that looks like lyrics (multiple lines with line breaks)
                    const lyricsPattern = /([A-Z][a-z\s]+(?:\n[A-Z][a-z\s]+){3,})/g;
                    const lyricsMatches = mainContent.match(lyricsPattern);
                    if (lyricsMatches) {
                        return lyricsMatches.join('\n\n');
                    }
                }
                return null;
            }
        ];
        
        // Try each extraction method
        for (const method of extractionMethods) {
            const result = method();
            if (result && result.length > 100) { // Ensure we got substantial content
                lyrics = result;
                break;
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
        
        // If we still don't have lyrics, try a fallback approach
        if (!lyrics || lyrics.length < 50) {
            // Look for any text that might be lyrics (multiple lines with proper formatting)
            const textBlocks = html.match(/>([A-Z][^<]{20,})</g);
            if (textBlocks) {
                const potentialLyrics = textBlocks
                    .map(block => block.replace(/^>|<$/g, '').trim())
                    .filter(block => block.length > 20 && !block.includes('script') && !block.includes('style'))
                    .slice(0, 10) // Take first 10 potential blocks
                    .join('\n\n');
                
                if (potentialLyrics.length > 100) {
                    lyrics = potentialLyrics;
                }
            }
        }
        
        // Final fallback if no lyrics found
        if (!lyrics || lyrics.length < 50) {
            lyrics = `🎵 "${songResponse.data.response.song.title}" by ${songResponse.data.response.song.primary_artist.name}

📖 We're working on displaying lyrics directly on our site!
🔗 For now, click "View on Genius" below to see the complete lyrics with annotations and translations.

💡 Genius provides:
• Complete lyrics with proper formatting
• Community annotations and explanations
• Multiple translations available
• Background information and context
• Verified and accurate content

🎶 We're continuously improving our lyrics display feature!`;
        }

        const song = songResponse.data.response.song;
        
        res.json({
            id: song.id,
            title: song.title,
            artist: song.primary_artist.name,
            image: song.song_art_image_url,
            url: song.url,
            release_date: song.release_date_for_display,
            lyrics: lyrics,
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

module.exports = router;
