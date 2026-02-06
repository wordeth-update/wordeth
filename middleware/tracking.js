const UsageEvent = require('../models/UsageEvent');

const ROUTE_MAP = {
    'GET /api/lyrics/search': { segment: 'lyrics', eventType: 'lyrics_search' },
    'GET /api/lyrics/song': { segment: 'lyrics', eventType: 'lyrics_view_song' },
    'GET /api/lyrics/lyrics': { segment: 'lyrics', eventType: 'lyrics_view_lyrics' },
    'GET /api/lyrics/trending': { segment: 'lyrics', eventType: 'lyrics_trending' },
    'GET /api/lyrics/karaoke-lyrics': { segment: 'lyrics', eventType: 'karaoke_lyrics' },
    'GET /api/lyrics/youtube-search': { segment: 'lyrics', eventType: 'karaoke_youtube' },
    'GET /api/merch/products': { segment: 'merch', eventType: 'merch_browse' },
    'POST /api/merch/designs': { segment: 'merch', eventType: 'merch_create_design' },
    'POST /api/merch/orders': { segment: 'merch', eventType: 'merch_order' },
    'POST /api/merch/shipping/calculate': { segment: 'merch', eventType: 'merch_shipping_calc' },
    'GET /api/articles': { segment: 'general', eventType: 'articles_browse' },
    'GET /api/articles/featured': { segment: 'general', eventType: 'articles_featured' },
    'POST /api/auth/signup': { segment: 'auth', eventType: 'user_signup' },
    'POST /api/auth/signin': { segment: 'auth', eventType: 'user_signin' },
};

function matchRoute(method, path) {
    const key = `${method} ${path}`;
    if (ROUTE_MAP[key]) return ROUTE_MAP[key];

    for (const [pattern, config] of Object.entries(ROUTE_MAP)) {
        const [pMethod, pPath] = pattern.split(' ');
        if (method !== pMethod) continue;
        if (path.startsWith(pPath + '/') || path === pPath) return config;
    }
    return null;
}

function extractMetadata(req, routeConfig) {
    const meta = {};

    if (req.query.q) meta.query = req.query.q.substring(0, 200);
    if (req.query.artist) meta.artist = req.query.artist.substring(0, 100);
    if (req.params?.id) meta.songTitle = req.params.id;
    if (req.body?.productId) meta.productId = req.body.productId;
    if (req.body?.quantity) meta.quantity = req.body.quantity;
    if (req.body?.lyrics) meta.extra = { hasLyrics: true };

    meta.userAgent = (req.headers['user-agent'] || '').substring(0, 200);

    return meta;
}

function trackingMiddleware(req, res, next) {
    const routeConfig = matchRoute(req.method, req.path);
    if (!routeConfig) return next();

    const originalJson = res.json.bind(res);
    res.json = function(body) {
        try {
            const metadata = extractMetadata(req, routeConfig);

            if (routeConfig.eventType === 'lyrics_search' && body?.results) {
                const firstResult = body.results[0];
                if (firstResult?.primary_genres?.music_genre_list?.[0]?.music_genre?.music_genre_name) {
                    metadata.genre = firstResult.primary_genres.music_genre_list[0].music_genre.music_genre_name;
                }
            }

            if (routeConfig.eventType === 'merch_order' && body?.data) {
                metadata.orderValue = body.data.total || body.data.orderTotal || 0;
                metadata.designId = body.data.designId;
            }

            const event = new UsageEvent({
                userId: req.user?.id || req.user?._id || null,
                sessionId: req.sessionID || req.headers['x-session-id'] || null,
                segment: routeConfig.segment,
                eventType: routeConfig.eventType,
                metadata,
                ip: req.ip
            });

            event.save().catch(err => {
                if (process.env.NODE_ENV !== 'test') {
                    console.error('Tracking save error:', err.message);
                }
            });
        } catch (err) {
            // never block request
        }

        return originalJson(body);
    };

    next();
}

module.exports = trackingMiddleware;
