const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Ad = require('../models/Ad');
const Advertiser = require('../models/Advertiser');

const AD_SIZES = {
    'header': { width: 728, height: 90, label: 'Leaderboard (728x90)' },
    'footer': { width: 728, height: 90, label: 'Leaderboard (728x90)' },
    'mobile-header': { width: 320, height: 50, label: 'Mobile Banner (320x50)' },
    'mobile-footer': { width: 320, height: 50, label: 'Mobile Banner (320x50)' },
    'sidebar': { width: 300, height: 250, label: 'Medium Rectangle (300x250)' }
};

const MAX_KEYWORDS = 25;

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function authenticateAdvertiser(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'wordeth-ads-secret');
        req.advertiserId = decoded.advertiserId;
        req.advertiserRole = decoded.role;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    if (req.advertiserRole !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

router.post('/advertisers/register', async (req, res) => {
    try {
        const { email, password, companyName, contactName, phone, website } = req.body;

        if (!email || !password || !companyName || !contactName) {
            return res.status(400).json({ error: 'Email, password, company name, and contact name are required' });
        }

        const existing = await Advertiser.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const advertiser = new Advertiser({
            email,
            password,
            companyName,
            contactName,
            phone,
            website,
            accountType: 'self-serve',
            status: 'approved'
        });

        await advertiser.save();

        const token = jwt.sign(
            { advertiserId: advertiser._id, role: advertiser.role },
            process.env.JWT_SECRET || 'wordeth-ads-secret',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            token,
            advertiser: {
                id: advertiser._id,
                email: advertiser.email,
                companyName: advertiser.companyName,
                accountType: advertiser.accountType
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

router.post('/advertisers/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const advertiser = await Advertiser.findOne({ email });
        if (!advertiser) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const isMatch = await advertiser.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (advertiser.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Please contact support.' });
        }

        const token = jwt.sign(
            { advertiserId: advertiser._id, role: advertiser.role },
            process.env.JWT_SECRET || 'wordeth-ads-secret',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            advertiser: {
                id: advertiser._id,
                email: advertiser.email,
                companyName: advertiser.companyName,
                accountType: advertiser.accountType,
                role: advertiser.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.get('/advertisers/profile', authenticateAdvertiser, async (req, res) => {
    try {
        const advertiser = await Advertiser.findById(req.advertiserId).select('-password');
        if (!advertiser) {
            return res.status(404).json({ error: 'Advertiser not found' });
        }
        res.json(advertiser);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

router.get('/sizes', (req, res) => {
    res.json({
        sizes: AD_SIZES,
        maxKeywords: MAX_KEYWORDS
    });
});

router.post('/create', authenticateAdvertiser, async (req, res) => {
    try {
        const { title, description, imageUrl, linkUrl, placement, size, keywords } = req.body;

        if (!title || !imageUrl || !linkUrl || !placement || !size) {
            return res.status(400).json({ error: 'Title, image URL, link URL, placement, and size are required' });
        }

        if (!isValidUrl(imageUrl) || !isValidUrl(linkUrl)) {
            return res.status(400).json({ error: 'Image URL and Link URL must be valid HTTP/HTTPS URLs' });
        }

        if (keywords && keywords.length > MAX_KEYWORDS) {
            return res.status(400).json({ error: `Maximum ${MAX_KEYWORDS} keywords allowed` });
        }

        const validSizes = ['728x90', '320x50', '300x250'];
        if (!validSizes.includes(size)) {
            return res.status(400).json({ error: 'Invalid ad size' });
        }

        const advertiser = await Advertiser.findById(req.advertiserId);
        const status = advertiser.role === 'admin' ? 'active' : 'pending';

        const ad = new Ad({
            advertiserId: req.advertiserId,
            title,
            description,
            imageUrl,
            linkUrl,
            placement,
            size,
            keywords: keywords || [],
            status,
            createdBy: advertiser.role === 'admin' ? 'admin' : 'self-serve'
        });

        await ad.save();

        res.status(201).json({
            success: true,
            message: status === 'active' ? 'Ad created and activated' : 'Ad created and pending review',
            ad
        });
    } catch (error) {
        console.error('Ad creation error:', error);
        res.status(500).json({ error: 'Failed to create ad' });
    }
});

router.get('/my-ads', authenticateAdvertiser, async (req, res) => {
    try {
        const ads = await Ad.find({ advertiserId: req.advertiserId }).sort({ createdAt: -1 });
        res.json({ ads });
    } catch (error) {
        console.error('Fetch ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

router.put('/update/:adId', authenticateAdvertiser, async (req, res) => {
    try {
        const { adId } = req.params;
        const { title, description, imageUrl, linkUrl, keywords, status } = req.body;

        const ad = await Ad.findById(adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        const advertiser = await Advertiser.findById(req.advertiserId);
        if (ad.advertiserId.toString() !== req.advertiserId && advertiser.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to update this ad' });
        }

        if (keywords && keywords.length > MAX_KEYWORDS) {
            return res.status(400).json({ error: `Maximum ${MAX_KEYWORDS} keywords allowed` });
        }

        if (title) ad.title = title;
        if (description !== undefined) ad.description = description;
        if (imageUrl) ad.imageUrl = imageUrl;
        if (linkUrl) ad.linkUrl = linkUrl;
        if (keywords) ad.keywords = keywords;

        if (advertiser.role === 'admin' && status) {
            ad.status = status;
        } else if (status === 'paused' || status === 'active') {
            if (ad.status === 'approved' || ad.status === 'active' || ad.status === 'paused') {
                ad.status = status;
            }
        }

        await ad.save();

        res.json({ success: true, message: 'Ad updated', ad });
    } catch (error) {
        console.error('Update ad error:', error);
        res.status(500).json({ error: 'Failed to update ad' });
    }
});

router.delete('/delete/:adId', authenticateAdvertiser, async (req, res) => {
    try {
        const { adId } = req.params;

        const ad = await Ad.findById(adId);
        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        const advertiser = await Advertiser.findById(req.advertiserId);
        if (ad.advertiserId.toString() !== req.advertiserId && advertiser.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized to delete this ad' });
        }

        await Ad.findByIdAndDelete(adId);

        res.json({ success: true, message: 'Ad deleted' });
    } catch (error) {
        console.error('Delete ad error:', error);
        res.status(500).json({ error: 'Failed to delete ad' });
    }
});

router.get('/match', async (req, res) => {
    try {
        const { q, placement } = req.query;

        if (!q) {
            return res.json({ ads: { header: null, footer: null } });
        }

        const headerAds = await Ad.findMatchingAds(q, 'header');
        const footerAds = await Ad.findMatchingAds(q, 'footer');

        const headerAd = headerAds.length > 0 ? headerAds[0] : null;
        const footerAd = footerAds.length > 0 ? footerAds[0] : null;

        res.json({
            ads: {
                header: headerAd ? {
                    id: headerAd._id,
                    title: headerAd.title,
                    imageUrl: headerAd.imageUrl,
                    linkUrl: headerAd.linkUrl,
                    size: headerAd.size
                } : null,
                footer: footerAd ? {
                    id: footerAd._id,
                    title: footerAd.title,
                    imageUrl: footerAd.imageUrl,
                    linkUrl: footerAd.linkUrl,
                    size: footerAd.size
                } : null
            }
        });
    } catch (error) {
        console.error('Ad match error:', error);
        res.json({ ads: { header: null, footer: null } });
    }
});

router.get('/match-modal', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.json({ ads: { sidebar: null, bottom: null } });
        }

        const sidebarAds = await Ad.findMatchingAds(q, 'sidebar');
        const bottomAds = await Ad.findMatchingAds(q, 'lyrics-bottom');

        const sidebarAd = sidebarAds.length > 0 ? sidebarAds[0] : null;
        const bottomAd = bottomAds.length > 0 ? bottomAds[0] : null;

        res.json({
            ads: {
                sidebar: sidebarAd ? {
                    id: sidebarAd._id,
                    title: sidebarAd.title,
                    imageUrl: sidebarAd.imageUrl,
                    linkUrl: sidebarAd.linkUrl,
                    size: sidebarAd.size
                } : null,
                bottom: bottomAd ? {
                    id: bottomAd._id,
                    title: bottomAd.title,
                    imageUrl: bottomAd.imageUrl,
                    linkUrl: bottomAd.linkUrl,
                    size: bottomAd.size
                } : null
            }
        });
    } catch (error) {
        console.error('Modal ad match error:', error);
        res.json({ ads: { sidebar: null, bottom: null } });
    }
});

router.post('/impression/:adId', async (req, res) => {
    try {
        const { adId } = req.params;

        await Ad.findByIdAndUpdate(adId, {
            $inc: { 'stats.impressions': 1 }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Impression tracking error:', error);
        res.status(500).json({ error: 'Failed to track impression' });
    }
});

router.post('/click/:adId', async (req, res) => {
    try {
        const { adId } = req.params;

        await Ad.findByIdAndUpdate(adId, {
            $inc: { 'stats.clicks': 1 }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Click tracking error:', error);
        res.status(500).json({ error: 'Failed to track click' });
    }
});

router.get('/admin/all-ads', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const query = {};
        if (status) query.status = status;

        const ads = await Ad.find(query)
            .populate('advertiserId', 'companyName email')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Ad.countDocuments(query);

        res.json({
            ads,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Admin fetch ads error:', error);
        res.status(500).json({ error: 'Failed to fetch ads' });
    }
});

router.get('/admin/pending', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const ads = await Ad.find({ status: 'pending' })
            .populate('advertiserId', 'companyName email')
            .sort({ createdAt: 1 });

        res.json({ ads });
    } catch (error) {
        console.error('Admin fetch pending error:', error);
        res.status(500).json({ error: 'Failed to fetch pending ads' });
    }
});

router.put('/admin/approve/:adId', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { adId } = req.params;

        const ad = await Ad.findByIdAndUpdate(
            adId,
            { status: 'active' },
            { new: true }
        );

        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        res.json({ success: true, message: 'Ad approved and activated', ad });
    } catch (error) {
        console.error('Admin approve error:', error);
        res.status(500).json({ error: 'Failed to approve ad' });
    }
});

router.put('/admin/reject/:adId', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { adId } = req.params;
        const { reason } = req.body;

        const ad = await Ad.findByIdAndUpdate(
            adId,
            { status: 'rejected' },
            { new: true }
        );

        if (!ad) {
            return res.status(404).json({ error: 'Ad not found' });
        }

        res.json({ success: true, message: 'Ad rejected', ad });
    } catch (error) {
        console.error('Admin reject error:', error);
        res.status(500).json({ error: 'Failed to reject ad' });
    }
});

router.get('/admin/all-advertisers', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const advertisers = await Advertiser.find({ role: 'advertiser' })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json({ advertisers });
    } catch (error) {
        console.error('Admin fetch advertisers error:', error);
        res.status(500).json({ error: 'Failed to fetch advertisers' });
    }
});

router.post('/admin/create-admin', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { email, password, contactName } = req.body;

        const existing = await Advertiser.findOne({ email });
        if (existing) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const admin = new Advertiser({
            email,
            password,
            companyName: 'Wordeth',
            contactName,
            accountType: 'managed',
            role: 'admin',
            status: 'approved'
        });

        await admin.save();

        res.status(201).json({
            success: true,
            message: 'Admin account created',
            admin: {
                id: admin._id,
                email: admin.email,
                contactName: admin.contactName
            }
        });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ error: 'Failed to create admin account' });
    }
});

router.get('/admin/analytics', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const totalAds = await Ad.countDocuments();
        const activeAds = await Ad.countDocuments({ status: 'active' });
        const pendingAds = await Ad.countDocuments({ status: 'pending' });
        const totalAdvertisers = await Advertiser.countDocuments({ role: 'advertiser' });

        const stats = await Ad.aggregate([
            { $match: { status: 'active' } },
            {
                $group: {
                    _id: null,
                    totalImpressions: { $sum: '$stats.impressions' },
                    totalClicks: { $sum: '$stats.clicks' }
                }
            }
        ]);

        const topAds = await Ad.find({ status: 'active' })
            .sort({ 'stats.impressions': -1 })
            .limit(10)
            .populate('advertiserId', 'companyName');

        res.json({
            overview: {
                totalAds,
                activeAds,
                pendingAds,
                totalAdvertisers
            },
            performance: stats[0] || { totalImpressions: 0, totalClicks: 0 },
            topAds
        });
    } catch (error) {
        console.error('Admin analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

router.post('/admin/upload-for-client', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { clientEmail, title, description, imageUrl, linkUrl, placement, size, keywords } = req.body;

        if (!isValidUrl(imageUrl) || !isValidUrl(linkUrl)) {
            return res.status(400).json({ error: 'Image URL and Link URL must be valid HTTP/HTTPS URLs' });
        }

        let advertiser = await Advertiser.findOne({ email: clientEmail });

        if (!advertiser) {
            advertiser = new Advertiser({
                email: clientEmail,
                password: Math.random().toString(36).slice(-12),
                companyName: title.split(' ')[0] || 'Client',
                contactName: 'Managed Account',
                accountType: 'managed',
                status: 'approved'
            });
            await advertiser.save();
        }

        const ad = new Ad({
            advertiserId: advertiser._id,
            title,
            description,
            imageUrl,
            linkUrl,
            placement,
            size,
            keywords: keywords || [],
            status: 'active',
            createdBy: 'admin'
        });

        await ad.save();

        res.status(201).json({
            success: true,
            message: 'Ad created for client',
            ad
        });
    } catch (error) {
        console.error('Upload for client error:', error);
        res.status(500).json({ error: 'Failed to create ad for client' });
    }
});

module.exports = router;
