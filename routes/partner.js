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
            .map(a => ({ name: a.name, slug: a.slug, genre: a.genre }));
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

router.post('/bulk/label', partnerAuth, csvUpload.single('csvFile'), async (req, res) => {
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

        const requiredCols = ['artist_name', 'artist_slug'];
        const headers = Object.keys(records[0]);
        const missingCols = requiredCols.filter(c => !headers.includes(c));
        if (missingCols.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required columns: ${missingCols.join(', ')}`,
                expected: ['artist_name', 'artist_slug', 'artist_genre', 'artist_image_url']
            });
        }

        const label = req.label;
        const newArtists = [];
        const errors = [];

        records.forEach((row, i) => {
            const rowNum = i + 2;

            if (!row.artist_name || !row.artist_slug) {
                errors.push(`Row ${rowNum}: Missing artist_name or artist_slug`);
                return;
            }

            const artistSlug = row.artist_slug.toLowerCase().trim();
            const alreadyOnLabel = label.artists.find(a => a.slug === artistSlug);
            const alreadyInBatch = newArtists.find(a => a.slug === artistSlug);

            if (!alreadyOnLabel && !alreadyInBatch) {
                newArtists.push({
                    name: row.artist_name.trim(),
                    slug: artistSlug,
                    genre: (row.artist_genre || '').trim(),
                    imageUrl: (row.artist_image_url || '').trim(),
                    active: true
                });
            }
        });

        if (newArtists.length) {
            label.artists.push(...newArtists);
            await label.save();
        }

        res.json({
            success: true,
            message: `Processed ${records.length} rows for ${label.name}`,
            data: {
                artistsAdded: newArtists.length,
                artistsSkipped: records.length - newArtists.length - errors.length,
                errors: errors.length ? errors : undefined
            }
        });
    } catch (error) {
        console.error('Bulk label upload error:', error);
        res.status(500).json({ success: false, message: 'Failed to process CSV upload' });
    }
});

router.post('/bulk/sales', partnerAuth, csvUpload.single('csvFile'), async (req, res) => {
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

        const requiredCols = ['order_id', 'artist_name', 'artist_slug', 'product_name', 'sku', 'quantity', 'unit_price'];
        const headers = Object.keys(records[0]);
        const missingCols = requiredCols.filter(c => !headers.includes(c));
        if (missingCols.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required columns: ${missingCols.join(', ')}`,
                expected: requiredCols.concat(['product_type', 'song_title', 'album_title', 'lyrics_snippet', 'sale_date', 'country', 'country_code', 'region', 'city', 'lat', 'lng'])
            });
        }

        const label = req.label;
        const sales = [];
        const errors = [];

        records.forEach((row, i) => {
            const rowNum = i + 2;
            const quantity = parseInt(row.quantity);
            const unitPrice = parseFloat(row.unit_price);

            if (!row.order_id || !row.artist_name || !row.sku) {
                errors.push(`Row ${rowNum}: Missing required fields`);
                return;
            }
            if (isNaN(quantity) || quantity <= 0) {
                errors.push(`Row ${rowNum}: Invalid quantity`);
                return;
            }
            if (isNaN(unitPrice) || unitPrice <= 0) {
                errors.push(`Row ${rowNum}: Invalid unit_price`);
                return;
            }

            const totalAmount = quantity * unitPrice;
            sales.push({
                labelId: label._id,
                labelName: label.name,
                orderId: row.order_id.trim(),
                artistName: row.artist_name.trim(),
                artistSlug: row.artist_slug.toLowerCase().trim(),
                productName: row.product_name.trim(),
                productType: (row.product_type || 'apparel').trim(),
                sku: row.sku.trim(),
                songTitle: (row.song_title || '').trim(),
                albumTitle: (row.album_title || '').trim(),
                lyricsSnippet: (row.lyrics_snippet || '').trim(),
                quantity,
                unitPrice,
                totalAmount,
                revenueShare: totalAmount * (label.revenueShare || 0.15),
                saleDate: row.sale_date ? new Date(row.sale_date) : new Date(),
                geo: {
                    country: (row.country || '').trim(),
                    countryCode: (row.country_code || '').trim(),
                    region: (row.region || '').trim(),
                    city: (row.city || '').trim(),
                    lat: parseFloat(row.lat) || null,
                    lng: parseFloat(row.lng) || null
                }
            });
        });

        let inserted = 0;
        if (sales.length) {
            const result = await MerchSale.insertMany(sales, { ordered: false });
            inserted = result.length;
        }

        res.json({
            success: true,
            message: `Processed ${records.length} rows`,
            data: {
                salesImported: inserted,
                rowErrors: errors.length,
                errors: errors.length ? errors.slice(0, 20) : undefined
            }
        });
    } catch (error) {
        console.error('Bulk sales upload error:', error);
        res.status(500).json({ success: false, message: 'Failed to process sales CSV' });
    }
});

module.exports = router;
