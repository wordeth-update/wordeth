const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const UsageEvent = require('../models/UsageEvent');
const Advertiser = require('../models/Advertiser');
const archiver = require('../services/archiver');

function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ error: 'Server configuration error' });
        }
        const decoded = jwt.verify(token, jwtSecret);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        req.adminId = decoded.advertiserId;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

const USAGE_TIERS = {
    low: { min: 1, max: 3, label: 'Low' },
    moderate: { min: 4, max: 10, label: 'Moderate' },
    high: { min: 11, max: 30, label: 'High' },
    hyper: { min: 31, max: Infinity, label: 'Hyper' }
};

function classifyTier(eventCount) {
    if (eventCount >= USAGE_TIERS.hyper.min) return 'hyper';
    if (eventCount >= USAGE_TIERS.high.min) return 'high';
    if (eventCount >= USAGE_TIERS.moderate.min) return 'moderate';
    return 'low';
}

const trackingLimiter = new Map();
const TRACK_LIMIT = 60;
const TRACK_WINDOW = 60000;

function checkTrackingRate(ip) {
    const now = Date.now();
    const entry = trackingLimiter.get(ip);
    if (!entry || now - entry.start > TRACK_WINDOW) {
        trackingLimiter.set(ip, { start: now, count: 1 });
        return true;
    }
    entry.count++;
    return entry.count <= TRACK_LIMIT;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of trackingLimiter) {
        if (now - entry.start > TRACK_WINDOW) trackingLimiter.delete(ip);
    }
}, 120000);

router.post('/track', (req, res) => {
    if (!checkTrackingRate(req.ip)) {
        return res.status(429).json({ error: 'Too many tracking requests' });
    }

    const { eventType, segment, metadata, sessionId, consentGiven } = req.body;

    if (consentGiven === false) {
        return res.json({ success: true, skipped: true });
    }

    if (!eventType || !segment) {
        return res.status(400).json({ error: 'eventType and segment required' });
    }

    const allowedSegments = ['lyrics', 'community', 'merch', 'auth', 'general'];
    if (!allowedSegments.includes(segment)) {
        return res.status(400).json({ error: 'Invalid segment' });
    }

    const event = new UsageEvent({
        userId: req.user?.id || null,
        sessionId: sessionId || req.sessionID || null,
        segment,
        eventType: eventType.substring(0, 50),
        metadata: {
            page: metadata?.page?.substring(0, 200),
            duration: typeof metadata?.duration === 'number' ? metadata.duration : undefined,
            roomId: metadata?.roomId?.substring(0, 50),
            roomName: metadata?.roomName?.substring(0, 100),
            query: metadata?.query?.substring(0, 200),
            artist: metadata?.artist?.substring(0, 100),
            genre: metadata?.genre?.substring(0, 50),
            productId: metadata?.productId?.substring(0, 50),
            extra: metadata?.extra
        },
        ip: req.ip
    });

    event.save().catch(err => console.error('Track save error:', err.message));
    res.json({ success: true });
});

router.get('/admin/summary', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const [totalEvents, segmentBreakdown, eventTypes, dailyTrend] = await Promise.all([
            UsageEvent.countDocuments({ timestamp: { $gte: since } }),

            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since } } },
                { $group: { _id: '$segment', count: { $sum: 1 }, uniqueUsers: { $addToSet: '$userId' } } },
                { $project: { segment: '$_id', count: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } }
            ]),

            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since } } },
                { $group: { _id: { segment: '$segment', eventType: '$eventType' }, count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 20 }
            ]),

            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since } } },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' }
                }},
                { $project: { date: '$_id', count: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
                { $sort: { date: 1 } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                totalEvents,
                segments: segmentBreakdown,
                topEventTypes: eventTypes.map(e => ({
                    segment: e._id.segment,
                    eventType: e._id.eventType,
                    count: e.count
                })),
                dailyTrend
            }
        });
    } catch (error) {
        console.error('Summary error:', error);
        res.status(500).json({ error: 'Failed to generate summary' });
    }
});

router.get('/admin/usage-tiers', authenticateAdmin, async (req, res) => {
    try {
        const { days = 7, segment } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const match = { timestamp: { $gte: since }, userId: { $ne: null } };
        if (segment) match.segment = segment;

        const userCounts = await UsageEvent.aggregate([
            { $match: match },
            { $group: { _id: '$userId', eventCount: { $sum: 1 } } }
        ]);

        const tiers = { low: 0, moderate: 0, high: 0, hyper: 0 };
        const tierUsers = { low: [], moderate: [], high: [], hyper: [] };

        userCounts.forEach(u => {
            const tier = classifyTier(u.eventCount);
            tiers[tier]++;
            tierUsers[tier].push({ userId: u._id, eventCount: u.eventCount });
        });

        Object.keys(tierUsers).forEach(t => {
            tierUsers[t].sort((a, b) => b.eventCount - a.eventCount);
            tierUsers[t] = tierUsers[t].slice(0, 10);
        });

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                totalTrackedUsers: userCounts.length,
                tiers,
                tierDefinitions: USAGE_TIERS,
                topUsersPerTier: tierUsers
            }
        });
    } catch (error) {
        console.error('Usage tiers error:', error);
        res.status(500).json({ error: 'Failed to generate usage tiers' });
    }
});

router.get('/admin/genre-propensity', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const genres = await UsageEvent.aggregate([
            { $match: {
                timestamp: { $gte: since },
                segment: 'lyrics',
                'metadata.genre': { $exists: true, $ne: null, $ne: '' }
            }},
            { $group: {
                _id: '$metadata.genre',
                searchCount: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' }
            }},
            { $project: {
                genre: '$_id',
                searchCount: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                _id: 0
            }},
            { $sort: { searchCount: -1 } },
            { $limit: 25 }
        ]);

        const totalSearches = genres.reduce((sum, g) => sum + g.searchCount, 0);
        const genresWithPct = genres.map(g => ({
            ...g,
            percentage: totalSearches > 0 ? Math.round((g.searchCount / totalSearches) * 1000) / 10 : 0
        }));

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                totalGenreTaggedSearches: totalSearches,
                genres: genresWithPct
            }
        });
    } catch (error) {
        console.error('Genre propensity error:', error);
        res.status(500).json({ error: 'Failed to generate genre data' });
    }
});

router.get('/admin/merch-metrics', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const [orderStats, funnelStages, topProducts] = await Promise.all([
            UsageEvent.aggregate([
                { $match: {
                    timestamp: { $gte: since },
                    segment: 'merch',
                    eventType: 'merch_order',
                    'metadata.orderValue': { $exists: true, $gt: 0 }
                }},
                { $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$metadata.orderValue' },
                    avgOrderValue: { $avg: '$metadata.orderValue' },
                    maxOrderValue: { $max: '$metadata.orderValue' },
                    minOrderValue: { $min: '$metadata.orderValue' },
                    avgQuantity: { $avg: '$metadata.quantity' }
                }}
            ]),

            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since }, segment: 'merch' } },
                { $group: { _id: '$eventType', count: { $sum: 1 }, uniqueUsers: { $addToSet: '$userId' } } },
                { $project: { stage: '$_id', count: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
                { $sort: { count: -1 } }
            ]),

            UsageEvent.aggregate([
                { $match: {
                    timestamp: { $gte: since },
                    segment: 'merch',
                    'metadata.productId': { $exists: true, $ne: null }
                }},
                { $group: { _id: '$metadata.productId', interactions: { $sum: 1 } } },
                { $sort: { interactions: -1 } },
                { $limit: 10 }
            ])
        ]);

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                orderStats: orderStats[0] || {
                    totalOrders: 0, totalRevenue: 0, avgOrderValue: 0,
                    maxOrderValue: 0, minOrderValue: 0, avgQuantity: 0
                },
                funnel: funnelStages,
                topProducts: topProducts.map(p => ({ productId: p._id, interactions: p.interactions }))
            }
        });
    } catch (error) {
        console.error('Merch metrics error:', error);
        res.status(500).json({ error: 'Failed to generate merch metrics' });
    }
});

router.get('/admin/community-metrics', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const [activityBreakdown, roomStats, dailyActivity] = await Promise.all([
            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since }, segment: 'community' } },
                { $group: { _id: '$eventType', count: { $sum: 1 }, uniqueUsers: { $addToSet: '$userId' } } },
                { $project: { eventType: '$_id', count: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
                { $sort: { count: -1 } }
            ]),

            UsageEvent.aggregate([
                { $match: {
                    timestamp: { $gte: since },
                    segment: 'community',
                    'metadata.roomId': { $exists: true, $ne: null }
                }},
                { $group: {
                    _id: '$metadata.roomId',
                    roomName: { $first: '$metadata.roomName' },
                    totalEvents: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                    avgDuration: { $avg: '$metadata.duration' }
                }},
                { $project: {
                    roomId: '$_id', roomName: 1, totalEvents: 1,
                    uniqueUsers: { $size: '$uniqueUsers' }, avgDuration: 1, _id: 0
                }},
                { $sort: { totalEvents: -1 } },
                { $limit: 10 }
            ]),

            UsageEvent.aggregate([
                { $match: { timestamp: { $gte: since }, segment: 'community' } },
                { $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    count: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' }
                }},
                { $project: { date: '$_id', count: 1, uniqueUsers: { $size: '$uniqueUsers' }, _id: 0 } },
                { $sort: { date: 1 } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                activityBreakdown,
                topRooms: roomStats,
                dailyActivity
            }
        });
    } catch (error) {
        console.error('Community metrics error:', error);
        res.status(500).json({ error: 'Failed to generate community metrics' });
    }
});

router.get('/admin/segment-comparison', authenticateAdmin, async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days));

        const segments = await UsageEvent.aggregate([
            { $match: { timestamp: { $gte: since } } },
            { $group: {
                _id: '$segment',
                totalEvents: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' },
                uniqueSessions: { $addToSet: '$sessionId' }
            }},
            { $project: {
                segment: '$_id',
                totalEvents: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                uniqueSessions: { $size: '$uniqueSessions' },
                _id: 0
            }}
        ]);

        const crossSegment = await UsageEvent.aggregate([
            { $match: { timestamp: { $gte: since }, userId: { $ne: null } } },
            { $group: { _id: '$userId', segments: { $addToSet: '$segment' } } },
            { $group: { _id: { $size: '$segments' }, userCount: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            data: {
                period: { days: parseInt(days), since },
                segments,
                crossSegmentEngagement: crossSegment.map(c => ({
                    segmentCount: c._id,
                    userCount: c.userCount
                }))
            }
        });
    } catch (error) {
        console.error('Segment comparison error:', error);
        res.status(500).json({ error: 'Failed to generate segment comparison' });
    }
});

router.get('/admin/archive/status', authenticateAdmin, (req, res) => {
    res.json({ configured: archiver.isConfigured() });
});

router.post('/admin/archive', authenticateAdmin, async (req, res) => {
    if (!archiver.isConfigured()) {
        return res.status(400).json({ error: 'AWS S3 not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET.' });
    }
    try {
        const { mode, date, startDate, endDate, daysOld } = req.body;

        let results;
        if (mode === 'day' && date) {
            results = await archiver.archiveDay(date);
        } else if (mode === 'range' && startDate && endDate) {
            results = await archiver.archiveRange(startDate, endDate);
        } else {
            results = await archiver.archiveOldData(daysOld || 7);
        }

        res.json({ success: true, results });
    } catch (error) {
        console.error('Archive error:', error);
        res.status(500).json({ error: 'Failed to archive data' });
    }
});

function requireArchiveConfig(req, res, next) {
    if (!archiver.isConfigured()) {
        return res.status(400).json({ error: 'AWS S3 not configured. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET.' });
    }
    next();
}

router.get('/admin/archive/months', authenticateAdmin, requireArchiveConfig, async (req, res) => {
    try {
        const months = await archiver.listArchivedMonths();
        res.json({ months });
    } catch (error) {
        console.error('List months error:', error);
        res.status(500).json({ error: 'Failed to list archived months' });
    }
});

router.get('/admin/archive/month/:yearMonth', authenticateAdmin, requireArchiveConfig, async (req, res) => {
    try {
        const summary = await archiver.getMonthSummary(req.params.yearMonth);
        if (!summary) {
            return res.status(404).json({ error: 'No archived data for this month' });
        }
        res.json(summary);
    } catch (error) {
        console.error('Month summary error:', error);
        res.status(500).json({ error: 'Failed to get month summary' });
    }
});

router.get('/admin/archive/range', authenticateAdmin, requireArchiveConfig, async (req, res) => {
    try {
        const { start, end } = req.query;
        if (!start || !end) {
            return res.status(400).json({ error: 'start and end query params required (YYYY-MM-DD)' });
        }
        const summaries = await archiver.getArchivedRange(start, end);
        res.json({ summaries, count: summaries.length });
    } catch (error) {
        console.error('Archive range error:', error);
        res.status(500).json({ error: 'Failed to get archived range' });
    }
});

router.get('/admin/archive/compare', authenticateAdmin, requireArchiveConfig, async (req, res) => {
    try {
        const { months } = req.query;
        if (!months) {
            return res.status(400).json({ error: 'months query param required (comma-separated YYYY-MM)' });
        }

        const monthList = months.split(',').map(m => m.trim());
        const comparisons = [];

        for (const month of monthList) {
            const summary = await archiver.getMonthSummary(month);
            if (summary) comparisons.push(summary);
        }

        res.json({ comparisons });
    } catch (error) {
        console.error('Compare error:', error);
        res.status(500).json({ error: 'Failed to compare months' });
    }
});

module.exports = router;
