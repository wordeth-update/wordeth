const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { body, validationResult } = require('express-validator');
const PartnerUser = require('../models/PartnerUser');
const Label = require('../models/Label');
const MerchSale = require('../models/MerchSale');
const DashboardShare = require('../models/DashboardShare');
const { partnerAuth, shareTokenAuth } = require('../middleware/partnerAuth');

const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'), false);
        }
    }
});

router.post('/auth/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;
        const partner = await PartnerUser.findOne({ email });

        if (!partner || !(await partner.comparePassword(password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (partner.status !== 'active') {
            return res.status(403).json({ message: 'Account is not active' });
        }

        partner.lastLogin = new Date();
        await partner.save();

        const label = await Label.findById(partner.labelId);
        const token = jwt.sign(
            { partnerId: partner._id, labelId: partner.labelId, role: partner.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            partner: partner.getPublicProfile(),
            label: label ? { _id: label._id, name: label.name, slug: label.slug, logoUrl: label.logoUrl } : null
        });
    } catch (error) {
        console.error('Partner login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/auth/verify', partnerAuth, async (req, res) => {
    const label = req.label;
    res.json({
        partner: req.partner.getPublicProfile(),
        label: { _id: label._id, name: label.name, slug: label.slug, logoUrl: label.logoUrl }
    });
});

router.get('/dashboard/artists', partnerAuth, async (req, res) => {
    try {
        const artists = (req.label.artists || [])
            .filter(a => a.active !== false)
            .map(a => ({ artistId: a.artistId || a._id.toString(), name: a.name, slug: a.slug, genre: a.genre, artworkCount: (a.templateArtwork || []).length }));
        res.json({ success: true, data: artists });
    } catch (error) {
        console.error('Artists list error:', error);
        res.status(500).json({ success: false, message: 'Failed to load artists' });
    }
});

router.get('/dashboard/summary', partnerAuth, async (req, res) => {
    try {
        const labelId = req.label._id;
        const { startDate, endDate } = req.query;

        const dateFilter = { labelId };
        if (startDate || endDate) {
            dateFilter.saleDate = {};
            if (startDate) dateFilter.saleDate.$gte = new Date(startDate);
            if (endDate) dateFilter.saleDate.$lte = new Date(endDate);
        }

        const [totalStats, artistBreakdown, recentSales, monthlyTrend] = await Promise.all([
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalRevenueShare: { $sum: '$revenueShare' },
                    totalOrders: { $sum: 1 },
                    totalUnits: { $sum: '$quantity' },
                    avgOrderValue: { $avg: '$totalAmount' }
                }}
            ]),
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: '$artistSlug',
                    artistName: { $first: '$artistName' },
                    revenue: { $sum: '$totalAmount' },
                    revenueShare: { $sum: '$revenueShare' },
                    orders: { $sum: 1 },
                    units: { $sum: '$quantity' }
                }},
                { $sort: { revenue: -1 } }
            ]),
            MerchSale.find(dateFilter)
                .sort({ saleDate: -1 })
                .limit(20)
                .select('orderId artistName productName sku quantity totalAmount revenueShare geo.city geo.country saleDate songTitle'),
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: {
                        year: { $year: '$saleDate' },
                        month: { $month: '$saleDate' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    revenueShare: { $sum: '$revenueShare' },
                    orders: { $sum: 1 },
                    units: { $sum: '$quantity' }
                }},
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        const stats = totalStats[0] || { totalRevenue: 0, totalRevenueShare: 0, totalOrders: 0, totalUnits: 0, avgOrderValue: 0 };

        res.json({
            success: true,
            data: {
                label: { name: req.label.name, slug: req.label.slug, revenueShare: req.label.revenueShare },
                stats,
                artistBreakdown,
                recentSales,
                monthlyTrend
            }
        });
    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ success: false, message: 'Failed to load dashboard' });
    }
});

router.get('/dashboard/artist/:artistSlug', partnerAuth, async (req, res) => {
    try {
        const labelId = req.label._id;
        const { artistSlug } = req.params;
        const { startDate, endDate } = req.query;

        const artist = req.label.artists.find(a => a.slug === artistSlug);
        if (!artist) {
            return res.status(404).json({ message: 'Artist not found' });
        }

        const dateFilter = { labelId, artistSlug };
        if (startDate || endDate) {
            dateFilter.saleDate = {};
            if (startDate) dateFilter.saleDate.$gte = new Date(startDate);
            if (endDate) dateFilter.saleDate.$lte = new Date(endDate);
        }

        const [stats, skuBreakdown, songBreakdown, albumBreakdown, lyricsLeaderboard, geoBreakdown, monthlyTrend] = await Promise.all([
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalRevenueShare: { $sum: '$revenueShare' },
                    totalOrders: { $sum: 1 },
                    totalUnits: { $sum: '$quantity' }
                }}
            ]),
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: '$sku',
                    productName: { $first: '$productName' },
                    productType: { $first: '$productType' },
                    songTitle: { $first: '$songTitle' },
                    albumTitle: { $first: '$albumTitle' },
                    revenue: { $sum: '$totalAmount' },
                    revenueShare: { $sum: '$revenueShare' },
                    units: { $sum: '$quantity' },
                    orders: { $sum: 1 }
                }},
                { $sort: { revenue: -1 } }
            ]),
            MerchSale.aggregate([
                { $match: { ...dateFilter, songTitle: { $ne: '' } } },
                { $group: {
                    _id: '$songTitle',
                    albumTitle: { $first: '$albumTitle' },
                    lyricsSnippets: { $addToSet: '$lyricsSnippet' },
                    revenue: { $sum: '$totalAmount' },
                    units: { $sum: '$quantity' },
                    skuCount: { $addToSet: '$sku' },
                    productTypes: { $addToSet: '$productType' }
                }},
                { $addFields: {
                    skuCount: { $size: '$skuCount' },
                    lyricsSnippets: { $filter: { input: '$lyricsSnippets', as: 'l', cond: { $and: [{ $ne: ['$$l', ''] }, { $ne: ['$$l', null] }] } } }
                }},
                { $sort: { revenue: -1 } }
            ]),
            MerchSale.aggregate([
                { $match: { ...dateFilter, albumTitle: { $ne: '' } } },
                { $group: {
                    _id: '$albumTitle',
                    songs: { $addToSet: '$songTitle' },
                    revenue: { $sum: '$totalAmount' },
                    units: { $sum: '$quantity' },
                    skuCount: { $addToSet: '$sku' },
                    productTypes: { $addToSet: '$productType' }
                }},
                { $addFields: {
                    songCount: { $size: { $filter: { input: '$songs', as: 's', cond: { $and: [{ $ne: ['$$s', ''] }, { $ne: ['$$s', null] }] } } } },
                    skuCount: { $size: '$skuCount' }
                }},
                { $sort: { revenue: -1 } }
            ]),
            MerchSale.aggregate([
                { $match: { ...dateFilter, lyricsSnippet: { $exists: true, $nin: ['', null] } } },
                { $group: {
                    _id: '$lyricsSnippet',
                    songTitle: { $first: '$songTitle' },
                    albumTitle: { $first: '$albumTitle' },
                    totalMakes: { $sum: '$quantity' },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 },
                    productTypes: { $addToSet: '$productType' },
                    skus: { $addToSet: '$sku' }
                }},
                { $addFields: {
                    skuCount: { $size: '$skus' },
                    coined: { $gte: ['$totalMakes', 400] }
                }},
                { $project: { skus: 0 } },
                { $sort: { totalMakes: -1 } }
            ]),
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: { country: '$geo.country', countryCode: '$geo.countryCode' },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 },
                    units: { $sum: '$quantity' },
                    avgLat: { $avg: '$geo.lat' },
                    avgLng: { $avg: '$geo.lng' }
                }},
                { $sort: { revenue: -1 } }
            ]),
            MerchSale.aggregate([
                { $match: dateFilter },
                { $group: {
                    _id: { year: { $year: '$saleDate' }, month: { $month: '$saleDate' } },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 }
                }},
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        res.json({
            success: true,
            data: {
                artist,
                stats: stats[0] || { totalRevenue: 0, totalRevenueShare: 0, totalOrders: 0, totalUnits: 0 },
                skuBreakdown,
                songBreakdown,
                albumBreakdown,
                lyricsLeaderboard,
                geoBreakdown,
                monthlyTrend
            }
        });
    } catch (error) {
        console.error('Artist dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to load artist dashboard' });
    }
});

router.get('/dashboard/geo', partnerAuth, async (req, res) => {
    try {
        const labelId = req.label._id;
        const { artistSlug } = req.query;

        const match = { labelId };
        if (artistSlug) match.artistSlug = artistSlug;

        const geoData = await MerchSale.aggregate([
            { $match: match },
            { $group: {
                _id: {
                    country: '$geo.country',
                    countryCode: '$geo.countryCode',
                    region: '$geo.region',
                    city: '$geo.city'
                },
                revenue: { $sum: '$totalAmount' },
                orders: { $sum: 1 },
                units: { $sum: '$quantity' },
                lat: { $avg: '$geo.lat' },
                lng: { $avg: '$geo.lng' }
            }},
            { $sort: { revenue: -1 } },
            { $limit: 200 }
        ]);

        res.json({ success: true, data: geoData });
    } catch (error) {
        console.error('Geo data error:', error);
        res.status(500).json({ success: false, message: 'Failed to load geographic data' });
    }
});

router.get('/dashboard/skus', partnerAuth, async (req, res) => {
    try {
        const labelId = req.label._id;
        const { artistSlug, productType } = req.query;

        const match = { labelId };
        if (artistSlug) match.artistSlug = artistSlug;
        if (productType) match.productType = productType;

        const skuData = await MerchSale.aggregate([
            { $match: match },
            { $group: {
                _id: '$sku',
                productName: { $first: '$productName' },
                productType: { $first: '$productType' },
                artistName: { $first: '$artistName' },
                songTitle: { $first: '$songTitle' },
                albumTitle: { $first: '$albumTitle' },
                lyricsSnippet: { $first: '$lyricsSnippet' },
                revenue: { $sum: '$totalAmount' },
                revenueShare: { $sum: '$revenueShare' },
                units: { $sum: '$quantity' },
                orders: { $sum: 1 },
                lastSale: { $max: '$saleDate' }
            }},
            { $sort: { revenue: -1 } }
        ]);

        res.json({ success: true, data: skuData });
    } catch (error) {
        console.error('SKU data error:', error);
        res.status(500).json({ success: false, message: 'Failed to load SKU data' });
    }
});

router.post('/share', partnerAuth, async (req, res) => {
    try {
        const { scope, artistSlug, expiresInDays, permissions } = req.body;

        if (scope === 'artist' && artistSlug) {
            const artist = req.label.artists.find(a => a.slug === artistSlug);
            if (!artist) {
                return res.status(404).json({ message: 'Artist not found' });
            }
        }

        const share = new DashboardShare({
            token: DashboardShare.generateToken(),
            labelId: req.label._id,
            scope: scope || 'label',
            artistSlug: scope === 'artist' ? artistSlug : null,
            createdBy: req.partner._id,
            expiresAt: new Date(Date.now() + (expiresInDays || 30) * 24 * 60 * 60 * 1000),
            permissions: permissions || { revenue: true, skuDetails: true, geoData: true }
        });

        await share.save();

        res.json({
            success: true,
            data: {
                token: share.token,
                expiresAt: share.expiresAt,
                scope: share.scope,
                artistSlug: share.artistSlug
            }
        });
    } catch (error) {
        console.error('Share creation error:', error);
        res.status(500).json({ success: false, message: 'Failed to create share link' });
    }
});

router.get('/shared/:shareToken', shareTokenAuth, async (req, res) => {
    try {
        const share = req.share;
        const label = req.label;
        const match = { labelId: label._id };

        if (share.scope === 'artist' && share.artistSlug) {
            match.artistSlug = share.artistSlug;
        }

        const [stats, artistBreakdown, geoBreakdown, skuBreakdown] = await Promise.all([
            MerchSale.aggregate([
                { $match: match },
                { $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalRevenueShare: { $sum: '$revenueShare' },
                    totalOrders: { $sum: 1 },
                    totalUnits: { $sum: '$quantity' }
                }}
            ]),
            share.scope === 'label' ? MerchSale.aggregate([
                { $match: match },
                { $group: {
                    _id: '$artistSlug',
                    artistName: { $first: '$artistName' },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 }
                }},
                { $sort: { revenue: -1 } }
            ]) : Promise.resolve([]),
            share.permissions.geoData ? MerchSale.aggregate([
                { $match: match },
                { $group: {
                    _id: { country: '$geo.country', countryCode: '$geo.countryCode', city: '$geo.city' },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 },
                    lat: { $avg: '$geo.lat' },
                    lng: { $avg: '$geo.lng' }
                }},
                { $sort: { revenue: -1 } },
                { $limit: 100 }
            ]) : Promise.resolve([]),
            share.permissions.skuDetails ? MerchSale.aggregate([
                { $match: match },
                { $group: {
                    _id: '$sku',
                    productName: { $first: '$productName' },
                    productType: { $first: '$productType' },
                    artistName: { $first: '$artistName' },
                    songTitle: { $first: '$songTitle' },
                    revenue: { $sum: '$totalAmount' },
                    units: { $sum: '$quantity' }
                }},
                { $sort: { revenue: -1 } }
            ]) : Promise.resolve([])
        ]);

        res.json({
            success: true,
            data: {
                label: { name: label.name },
                scope: share.scope,
                artistSlug: share.artistSlug,
                stats: stats[0] || { totalRevenue: 0, totalRevenueShare: 0, totalOrders: 0, totalUnits: 0 },
                artistBreakdown,
                geoBreakdown,
                skuBreakdown,
                permissions: share.permissions
            }
        });
    } catch (error) {
        console.error('Shared dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to load shared dashboard' });
    }
});

router.get('/shares', partnerAuth, async (req, res) => {
    try {
        const shares = await DashboardShare.find({
            labelId: req.label._id,
            active: true
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: shares });
    } catch (error) {
        console.error('List shares error:', error);
        res.status(500).json({ success: false, message: 'Failed to list shares' });
    }
});

router.delete('/share/:shareId', partnerAuth, async (req, res) => {
    try {
        const share = await DashboardShare.findOneAndUpdate(
            { _id: req.params.shareId, labelId: req.label._id },
            { active: false },
            { new: true }
        );

        if (!share) {
            return res.status(404).json({ message: 'Share not found' });
        }

        res.json({ success: true, message: 'Share link deactivated' });
    } catch (error) {
        console.error('Delete share error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete share' });
    }
});

const { getSellerPayoutRate, getPayoutSummary } = require('../services/payoutService');

router.get('/dashboard/payout-info', partnerAuth, async (req, res) => {
    try {
        const label = req.label;
        const { payoutRate } = await getSellerPayoutRate('label', label._id);
        const summary = await getPayoutSummary('label', label._id);

        res.json({
            success: true,
            data: {
                payoutRate,
                payoutPercentage: (payoutRate * 100).toFixed(1),
                platformFeePercentage: ((1 - payoutRate) * 100).toFixed(1),
                ...summary
            }
        });
    } catch (error) {
        console.error('Payout info error:', error);
        res.status(500).json({ success: false, message: 'Failed to load payout info' });
    }
});

router.get('/dashboard/ledger', partnerAuth, async (req, res) => {
    try {
        const { startDate, endDate, limit } = req.query;
        const EventsLedger = require('../models/EventsLedger');

        const match = {
            eventType: { $in: ['gmv_order', 'platform_fee_recorded'] },
            'metadata.sellerType': 'label',
            'metadata.sellerId': req.label._id.toString()
        };

        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const entries = await EventsLedger.find(match)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit) || 100);

        res.json({ success: true, data: entries });
    } catch (error) {
        console.error('Ledger error:', error);
        res.status(500).json({ success: false, message: 'Failed to load ledger' });
    }
});

function generateSlug(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function generateArtistId(labelSlug, artistSlug) {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `${labelSlug}-${artistSlug}-${timestamp}${rand}`;
}

router.post('/bulk/roster', partnerAuth, csvUpload.single('csvFile'), async (req, res) => {
    try {
        if (req.partner.role === 'viewer') {
            return res.status(403).json({ success: false, message: 'Viewers cannot upload data' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
        }

        const csvContent = req.file.buffer.toString('utf-8');
        let records;
        try {
            records = parse(csvContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
                relax_column_count: true
            });
        } catch (parseErr) {
            return res.status(400).json({ success: false, message: `CSV parsing error: ${parseErr.message}` });
        }

        if (!records.length) {
            return res.status(400).json({ success: false, message: 'CSV file is empty' });
        }

        const requiredCols = ['artist_name'];
        const headers = Object.keys(records[0]);
        const missingCols = requiredCols.filter(c => !headers.includes(c));
        if (missingCols.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required column: artist_name`,
                expected: ['artist_name', 'artist_genre']
            });
        }

        const label = req.label;
        const newArtists = [];
        const errors = [];

        records.forEach((row, i) => {
            const rowNum = i + 2;

            if (!row.artist_name) {
                errors.push(`Row ${rowNum}: Missing artist_name`);
                return;
            }

            const artistName = row.artist_name.trim();
            const artistSlug = generateSlug(artistName);

            if (!artistSlug) {
                errors.push(`Row ${rowNum}: Could not generate a valid identifier from "${artistName}"`);
                return;
            }

            const alreadyOnLabel = label.artists.find(a => a.slug === artistSlug);
            const alreadyInBatch = newArtists.find(a => a.slug === artistSlug);

            if (!alreadyOnLabel && !alreadyInBatch) {
                newArtists.push({
                    artistId: generateArtistId(label.slug, artistSlug),
                    name: artistName,
                    slug: artistSlug,
                    genre: (row.artist_genre || row.genre || '').trim(),
                    imageUrl: '',
                    templateArtwork: [],
                    active: true
                });
            }
        });

        if (newArtists.length) {
            label.artists.push(...newArtists);
            await label.save();
        }

        const addedArtists = newArtists.map(a => ({
            artistId: a.artistId,
            name: a.name,
            slug: a.slug,
            genre: a.genre
        }));

        res.json({
            success: true,
            message: `Processed ${records.length} rows for ${label.name}`,
            data: {
                artistsAdded: newArtists.length,
                artistsSkipped: records.length - newArtists.length - errors.length,
                artists: addedArtists,
                errors: errors.length ? errors : undefined
            }
        });
    } catch (error) {
        console.error('Bulk roster upload error:', error);
        res.status(500).json({ success: false, message: 'Failed to process CSV upload' });
    }
});

const fileStorage = require('../services/fileStorage');

const artworkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'image/png',
            'image/svg+xml',
            'application/pdf',
            'application/postscript',
            'application/illustrator',
            'image/vnd.adobe.photoshop',
            'application/octet-stream'
        ];
        const allowedExts = ['.png', '.svg', '.pdf', '.eps', '.ai', '.psd'];
        const ext = '.' + file.originalname.split('.').pop().toLowerCase();

        if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file format. Use PNG, SVG, PDF, EPS, AI, or PSD.'), false);
        }
    }
});

router.post('/artwork/upload', partnerAuth, artworkUpload.single('artworkFile'), async (req, res) => {
    try {
        if (req.partner.role === 'viewer') {
            return res.status(403).json({ success: false, message: 'Viewers cannot upload artwork' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No artwork file uploaded' });
        }

        const { artistSlug } = req.body;
        if (!artistSlug) {
            return res.status(400).json({ success: false, message: 'Artist selection is required' });
        }

        const label = req.label;
        const artist = label.artists.find(a => a.slug === artistSlug);
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Artist not found on your label' });
        }

        const ext = req.file.originalname.split('.').pop().toLowerCase();
        const timestamp = Date.now();
        const rand = require('crypto').randomBytes(6).toString('hex');
        const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectPath = `artwork/${label.slug}/${artistSlug}/${timestamp}-${rand}-${safeFilename}`;

        const { url: artworkUrl } = await fileStorage.uploadBytes(objectPath, req.file.buffer, req.file.mimetype);

        const artworkEntry = {
            url: artworkUrl,
            objectPath: objectPath,
            filename: req.file.originalname,
            format: ext,
            fileSize: req.file.size,
            width: parseInt(req.body.width) || 0,
            height: parseInt(req.body.height) || 0,
            uploadedAt: new Date()
        };

        artist.templateArtwork.push(artworkEntry);
        await label.save();

        res.json({
            success: true,
            message: `Artwork uploaded for ${artist.name}`,
            data: {
                artistId: artist.artistId,
                artistName: artist.name,
                artwork: artworkEntry
            }
        });
    } catch (error) {
        console.error('Artwork upload error:', error);
        res.status(500).json({ success: false, message: 'Failed to upload artwork' });
    }
});

router.get('/artwork/:artistSlug', partnerAuth, async (req, res) => {
    try {
        const label = req.label;
        const artist = label.artists.find(a => a.slug === req.params.artistSlug);
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Artist not found' });
        }

        // Stable URLs served from MongoDB (also covers legacy objects via
        // the files route's fallback), so no signed-URL refresh needed.
        const artworkWithUrls = artist.templateArtwork.map((art) => ({
            ...art.toObject(),
            url: art.objectPath ? fileStorage.publicUrl(art.objectPath) : art.url
        }));

        res.json({
            success: true,
            data: {
                artistId: artist.artistId,
                artistName: artist.name,
                artwork: artworkWithUrls
            }
        });
    } catch (error) {
        console.error('Fetch artwork error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch artwork' });
    }
});

router.delete('/artwork/:artistSlug/:artworkId', partnerAuth, async (req, res) => {
    try {
        if (req.partner.role === 'viewer') {
            return res.status(403).json({ success: false, message: 'Viewers cannot delete artwork' });
        }

        const label = req.label;
        const artist = label.artists.find(a => a.slug === req.params.artistSlug);
        if (!artist) {
            return res.status(404).json({ success: false, message: 'Artist not found' });
        }

        const artwork = artist.templateArtwork.id(req.params.artworkId);
        if (!artwork) {
            return res.status(404).json({ success: false, message: 'Artwork not found' });
        }

        try {
            await fileStorage.deleteByKey(artwork.objectPath);
        } catch (e) {}

        artwork.deleteOne();
        await label.save();

        res.json({ success: true, message: 'Artwork deleted' });
    } catch (error) {
        console.error('Delete artwork error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete artwork' });
    }
});

const inkSoftService = require('../services/inkSoftService');

router.get('/inksoft/status', partnerAuth, async (req, res) => {
    try {
        const status = await inkSoftService.getSyncStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        console.error('InkSoft status error:', error);
        res.status(500).json({ success: false, message: 'Failed to get sync status' });
    }
});

router.post('/inksoft/poll', partnerAuth, async (req, res) => {
    try {
        if (req.partner.role === 'viewer') {
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        }

        const result = await inkSoftService.pollOrders();

        if (!result) {
            return res.status(404).json({ success: false, message: 'InkSoft sync is not active' });
        }

        if (result.error) {
            return res.status(500).json({ success: false, message: result.error });
        }

        res.json({
            success: true,
            message: `Sync complete: ${result.recorded} new sales recorded, ${result.unmatched} unmatched`,
            data: result
        });
    } catch (error) {
        console.error('InkSoft manual poll error:', error);
        res.status(500).json({ success: false, message: 'Failed to sync with InkSoft' });
    }
});

module.exports = router;
