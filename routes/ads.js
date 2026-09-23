const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const adTickets = require('../services/adTickets');
const adBilling = require('../services/adBilling');
const AdEvent = require('../models/AdEvent');
const limits = require('../middleware/limits');
const adCredit = require('../services/adCredit');
const adInvoicing = require('../services/adInvoicing');
const AdLedger = require('../models/AdLedger');
const AdInvoice = require('../models/AdInvoice');
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

/**
 * Artwork comes from the advertiser's own machine. Their browser sends the
 * file; it is stored here and the ad points at our copy, so a client never
 * has to host an image somewhere first and paste a link.
 */
const AD_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const adImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
        if (!AD_IMAGE_TYPES.has(file.mimetype)) return cb(new Error('UNSUPPORTED_IMAGE_TYPE'));
        cb(null, true);
    }
}).single('image');

/** Wrap multer so a rejected file answers in JSON rather than crashing the request. */
function acceptAdImage(req, res, next) {
    adImage(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'That image is larger than 3 MB. Save it smaller and try again.' });
        if (err.message === 'UNSUPPORTED_IMAGE_TYPE') return res.status(415).json({ error: 'Use a PNG, JPEG, WebP or GIF image.' });
        return res.status(400).json({ error: 'That image could not be read.' });
    });
}

const EXT_FOR = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Store an uploaded ad image and return its address on our own domain.
 * Returns null when no file was sent, so a pasted link still works.
 */
async function storeAdImage(file) {
    if (!file || !file.buffer || !file.buffer.length) return null;
    const fileStorage = require('../services/fileStorage');
    const ext = EXT_FOR[file.mimetype] || 'png';
    const key = `ads/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const { url } = await fileStorage.uploadBytes(key, file.buffer, file.mimetype);
    return url;
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Artwork is either a full address the advertiser pasted, or a path on our own
 * domain that came from storing their upload. Both are acceptable; anything
 * else is not.
 */
function isValidImageRef(value) {
    if (typeof value !== 'string' || !value) return false;
    if (value.startsWith('/api/files/')) return true;
    return isValidUrl(value);
}

function authenticateAdvertiser(req, res, next) {
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
        const {
            email, password, companyName, contactName, phone, website,
            accountType, application
        } = req.body;

        if (!email || !password || !companyName || !contactName) {
            return res.status(400).json({ error: 'Email, password, company name, and contact name are required' });
        }

        const validTypes = ['self-serve', 'partner'];
        const type = validTypes.includes(accountType) ? accountType : 'self-serve';

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
            accountType: type,
            role: 'advertiser',
            status: 'pending',
            application: application || {}
        });

        await advertiser.save();

        res.status(201).json({
            success: true,
            message: 'Your application has been submitted and is under review. Our advertising team at advertising@wordeth.com will respond within 48-72 hours.',
            advertiser: {
                id: advertiser._id,
                email: advertiser.email,
                companyName: advertiser.companyName,
                accountType: advertiser.accountType,
                status: 'pending'
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

        if (advertiser.status === 'pending') {
            return res.status(403).json({ error: 'Your application is still under review. Our advertising team at advertising@wordeth.com will respond within 48-72 hours.', status: 'pending' });
        }

        if (advertiser.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Please contact support.', status: 'suspended' });
        }

        const token = jwt.sign(
            { advertiserId: advertiser._id, role: advertiser.role },
            process.env.JWT_SECRET,
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

/* ------------------------------------------------------------------ */
/* Money: what an advertiser owes, adds, and is billed                  */
/* ------------------------------------------------------------------ */

const TOP_UPS = [25, 50, 100, 250, 500, 1000];
const MIN_TOP_UP = 10;
const MAX_TOP_UP = 10000;

function siteUrl() {
    return process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
        : process.env.CLIENT_URL || 'http://localhost:5000';
}

/** The account's standing: balance or terms, and whether ads can run. */
router.get('/billing', authenticateAdvertiser, async (req, res) => {
    try {
        const a = await Advertiser.findById(req.advertiserId).select('billing companyName email').lean();
        if (!a) return res.status(404).json({ error: 'Account not found' });
        const b = a.billing || {};
        const invoiced = b.mode === 'invoiced';
        const creditLimit = Number(b.creditLimit) || 0;
        const outstanding = Number(b.outstanding) || 0;
        const balance = Number(b.balance) || 0;

        res.json({
            mode: invoiced ? 'invoiced' : 'prepaid',
            balance,
            totalSpent: Number(b.totalSpent) || 0,
            topUps: TOP_UPS,
            ...(invoiced ? {
                creditLimit,
                outstanding,
                available: creditLimit > 0 ? Math.max(0, Math.round((creditLimit - outstanding) * 100) / 100) : null,
                termsDays: Number(b.termsDays) || 30,
                pastDue: !!b.pastDue
            } : {}),
            canServe: invoiced
                ? !b.pastDue && (creditLimit <= 0 || outstanding < creditLimit)
                : balance > 0,
            reason: invoiced
                ? (b.pastDue ? 'An invoice is past its due date.' : (creditLimit > 0 && outstanding >= creditLimit ? 'The credit limit has been reached.' : null))
                : (balance > 0 ? null : 'Add funds to start running ads.')
        });
    } catch (error) {
        console.error('Billing read error:', error);
        res.status(500).json({ error: 'Failed to read billing' });
    }
});

/** Every movement of money on this account, newest first. */
router.get('/billing/statement', authenticateAdvertiser, async (req, res) => {
    try {
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const rows = await AdLedger.find({ advertiserId: req.advertiserId })
            .sort({ createdAt: -1 }).limit(limit)
            .select('type amount balanceAfter description adId createdAt').lean();
        res.json({ entries: rows });
    } catch (error) {
        console.error('Statement error:', error);
        res.status(500).json({ error: 'Failed to read statement' });
    }
});

/** Send an advertiser to Stripe to add funds. Prepaid accounts only. */
router.post('/billing/top-up', authenticateAdvertiser, limits.adTopUp, async (req, res) => {
    try {
        const advertiser = await Advertiser.findById(req.advertiserId).select('billing email companyName stripeCustomerId');
        if (!advertiser) return res.status(404).json({ error: 'Account not found' });
        if (advertiser.billing?.mode === 'invoiced') {
            return res.status(400).json({ error: 'This account is billed on terms, so there is nothing to top up.', code: 'ON_TERMS' });
        }

        const amount = Math.round(Number(req.body && req.body.amount) * 100) / 100;
        if (!Number.isFinite(amount) || amount < MIN_TOP_UP || amount > MAX_TOP_UP) {
            return res.status(400).json({ error: `Choose an amount between $${MIN_TOP_UP} and $${MAX_TOP_UP}.` });
        }

        const { getStripeClient } = require('../services/stripeClient');
        const stripe = getStripeClient();
        const domain = siteUrl();

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: advertiser.email,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    unit_amount: Math.round(amount * 100),
                    product_data: { name: 'Wordeth advertising credit', description: `Credit for ${advertiser.companyName || 'your account'}` }
                },
                quantity: 1
            }],
            success_url: `${domain}/ad-admin.html?funds=added`,
            cancel_url: `${domain}/ad-admin.html?funds=cancelled`,
            metadata: {
                type: 'ad_credit',
                advertiserId: String(advertiser._id),
                amount: String(amount)
            }
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Top-up error:', error);
        res.status(500).json({ error: 'Could not start the payment. Try again shortly.' });
    }
});

/** This account's invoices. */
router.get('/billing/invoices', authenticateAdvertiser, async (req, res) => {
    try {
        const invoices = await AdInvoice.find({ advertiserId: req.advertiserId })
            .sort({ issuedAt: -1 }).limit(50).lean();
        res.json({ invoices: invoices.map((i) => ({ ...i, overdue: i.status === 'open' && new Date(i.dueAt) < new Date() })) });
    } catch (error) {
        console.error('Invoice list error:', error);
        res.status(500).json({ error: 'Failed to read invoices' });
    }
});

/** Pay an invoice by card. Bank transfer is recorded by an administrator instead. */
router.post('/billing/invoices/:id/pay', authenticateAdvertiser, limits.adTopUp, async (req, res) => {
    try {
        const invoice = await AdInvoice.findOne({ _id: req.params.id, advertiserId: req.advertiserId });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status !== 'open') return res.status(400).json({ error: 'That invoice is already settled.' });

        const due = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
        if (!(due > 0)) return res.status(400).json({ error: 'Nothing is outstanding on that invoice.' });

        const { getStripeClient } = require('../services/stripeClient');
        const stripe = getStripeClient();
        const domain = siteUrl();
        const advertiser = await Advertiser.findById(req.advertiserId).select('email companyName');

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: advertiser?.email,
            line_items: [{
                price_data: {
                    currency: 'usd',
                    unit_amount: Math.round(due * 100),
                    product_data: { name: `Wordeth invoice ${invoice.number}`, description: `Advertising for ${advertiser?.companyName || 'your account'}` }
                },
                quantity: 1
            }],
            success_url: `${domain}/ad-admin.html?invoice=paid`,
            cancel_url: `${domain}/ad-admin.html?invoice=cancelled`,
            metadata: {
                type: 'ad_invoice',
                invoiceId: String(invoice._id),
                advertiserId: String(req.advertiserId),
                amount: String(due)
            }
        });

        res.json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Invoice payment error:', error);
        res.status(500).json({ error: 'Could not start the payment. Try again shortly.' });
    }
});

router.get('/sizes', (req, res) => {
    res.json({
        sizes: AD_SIZES,
        maxKeywords: MAX_KEYWORDS
    });
});

router.post('/create', authenticateAdvertiser, acceptAdImage, async (req, res) => {
    try {
        const { title, description, linkUrl, placement, size } = req.body;
        let { imageUrl, keywords } = req.body;
        // Sent as a multipart form, keywords arrive as text.
        if (typeof keywords === 'string') keywords = keywords.split(',').map((k) => k.trim()).filter(Boolean);

        const uploaded = await storeAdImage(req.file);
        if (uploaded) imageUrl = uploaded;

        if (!title || !imageUrl || !linkUrl || !placement || !size) {
            return res.status(400).json({ error: 'Title, artwork, link, placement and size are all required.' });
        }

        if (!isValidImageRef(imageUrl) || !isValidUrl(linkUrl)) {
            return res.status(400).json({ error: 'The artwork and link must be valid web addresses.' });
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

/**
 * What a page receives for one slot: the creative, and a ticket that lets it
 * report back. Without the ticket nothing can be counted, which is the point.
 */
function served(ad, slot, req) {
    if (!ad) return null;
    return {
        id: ad._id,
        title: ad.title,
        imageUrl: ad.imageUrl,
        linkUrl: ad.linkUrl,
        size: ad.size,
        ticket: adTickets.issue(String(ad._id), slot, req)
    };
}

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
                header: served(headerAd, 'header', req),
                footer: served(footerAd, 'footer', req)
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
                sidebar: served(sidebarAd, 'sidebar', req),
                bottom: served(bottomAd, 'lyrics-bottom', req)
            }
        });
    } catch (error) {
        console.error('Modal ad match error:', error);
        res.json({ ads: { sidebar: null, bottom: null } });
    }
});

/**
 * Record an event against a ticket. Shared by impressions and clicks.
 *
 * Order matters: the ticket is claimed first, by writing a row whose unique
 * index rejects a second use, and only then is anything charged. A replay
 * therefore costs the advertiser nothing and reports success, because from
 * the page's point of view the event was already recorded.
 */
async function record(req, res, type) {
    const ticket = (req.body && req.body.ticket) || req.query.ticket;
    const check = adTickets.verify(ticket, req);
    if (!check.ok) {
        // Say little: a prober should not learn which part was wrong.
        return res.status(400).json({ success: false, error: 'Invalid or expired ad ticket' });
    }
    // The ticket names the ad; a path parameter that disagrees is an attempt to move it.
    if (req.params.adId && req.params.adId !== check.adId) {
        return res.status(400).json({ success: false, error: 'Invalid or expired ad ticket' });
    }

    const ad = await Ad.findById(check.adId).select('advertiserId status');
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    const viewer = adTickets.viewerHash(req);

    // A click is only real if this viewer was shown the ad on this ticket.
    if (type === 'click') {
        const seen = await AdEvent.findOne({ nonce: check.nonce, type: 'impression' }).select('_id').lean();
        if (!seen) return res.status(409).json({ success: false, error: 'No impression recorded for this ad' });
    }

    try {
        await AdEvent.create({
            adId: ad._id,
            advertiserId: ad.advertiserId,
            type,
            nonce: check.nonce,
            slot: check.slot,
            viewer
        });
    } catch (e) {
        // Already claimed: idempotent, not an error.
        if (e && e.code === 11000) return res.json({ success: true, duplicate: true });
        throw e;
    }

    const { charged, exhausted } = await adBilling.charge(ad._id, type);
    if (charged > 0) {
        await AdEvent.updateOne({ nonce: check.nonce, type }, { $set: { charged } }).catch(() => {});
    }
    res.json({ success: true, exhausted });
}

router.post('/impression/:adId', limits.adImpression, async (req, res) => {
    try {
        await record(req, res, 'impression');
    } catch (error) {
        console.error('Impression tracking error:', error);
        res.status(500).json({ error: 'Failed to track impression' });
    }
});

router.post('/click/:adId', limits.adClick, async (req, res) => {
    try {
        await record(req, res, 'click');
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

/* ------------------------------------------------------------------ */
/* Admin: who is on terms, what they owe, and raising invoices          */
/* ------------------------------------------------------------------ */

/**
 * Put an account on credit terms, or back on prepaid.
 *
 * Extending credit is a commercial decision, so it is made here and never
 * by the advertiser. A limit of zero on terms means unlimited, which is
 * only sensible for a client you would invoice regardless.
 */
router.put('/admin/advertisers/:id/terms', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { mode, creditLimit, termsDays, billingEmail } = req.body || {};
        if (mode && !['prepaid', 'invoiced'].includes(mode)) {
            return res.status(400).json({ error: 'Mode must be prepaid or invoiced.' });
        }
        const set = {};
        if (mode) set['billing.mode'] = mode;
        if (creditLimit !== undefined) {
            const n = Number(creditLimit);
            if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'The credit limit must be zero or more.' });
            set['billing.creditLimit'] = Math.round(n * 100) / 100;
        }
        if (termsDays !== undefined) {
            const n = parseInt(termsDays, 10);
            if (!Number.isFinite(n) || n < 1 || n > 120) return res.status(400).json({ error: 'Terms must be between 1 and 120 days.' });
            set['billing.termsDays'] = n;
        }
        if (billingEmail !== undefined) set['billing.billingEmail'] = billingEmail || null;

        const advertiser = await Advertiser.findByIdAndUpdate(req.params.id, { $set: set }, { new: true })
            .select('companyName email billing');
        if (!advertiser) return res.status(404).json({ error: 'Advertiser not found' });
        res.json({ success: true, advertiser });
    } catch (error) {
        console.error('Terms update error:', error);
        res.status(500).json({ error: 'Failed to update terms' });
    }
});

/** Everyone on terms, with what they owe and whether they are late. */
router.get('/admin/receivables', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        await adCredit.refreshPastDue();
        const accounts = await Advertiser.find({ 'billing.mode': 'invoiced' })
            .select('companyName email billing').lean();
        const open = await AdInvoice.find({ status: 'open' }).select('advertiserId number total amountPaid dueAt').lean();
        const byAccount = new Map();
        for (const i of open) {
            const k = String(i.advertiserId);
            if (!byAccount.has(k)) byAccount.set(k, []);
            byAccount.get(k).push({ ...i, outstanding: Math.round((i.total - i.amountPaid) * 100) / 100, overdue: new Date(i.dueAt) < new Date() });
        }
        res.json({
            accounts: accounts.map((a) => ({
                id: a._id,
                companyName: a.companyName,
                email: a.email,
                creditLimit: a.billing?.creditLimit || 0,
                outstanding: a.billing?.outstanding || 0,
                termsDays: a.billing?.termsDays || 30,
                pastDue: !!a.billing?.pastDue,
                openInvoices: byAccount.get(String(a._id)) || []
            }))
        });
    } catch (error) {
        console.error('Receivables error:', error);
        res.status(500).json({ error: 'Failed to read receivables' });
    }
});

/** Raise invoices for last month, or for a named period, across all terms accounts. */
router.post('/admin/invoices/run', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { periodStart, periodEnd, advertiserId } = req.body || {};
        const period = periodStart && periodEnd
            ? { periodStart: new Date(periodStart), periodEnd: new Date(periodEnd) }
            : adInvoicing.lastMonth();
        if (Number.isNaN(period.periodStart.getTime()) || Number.isNaN(period.periodEnd.getTime()) || period.periodStart >= period.periodEnd) {
            return res.status(400).json({ error: 'Give a period whose start is before its end.' });
        }

        if (advertiserId) {
            const one = await adInvoicing.raiseInvoice(advertiserId, period);
            return res.json({ success: true, raised: one ? 1 : 0, invoices: one ? [one] : [] });
        }
        const raised = await adInvoicing.raiseAllInvoices(period);
        res.json({ success: true, raised: raised.length, invoices: raised });
    } catch (error) {
        console.error('Invoice run error:', error);
        res.status(400).json({ error: error.message || 'Failed to raise invoices' });
    }
});

/** Record a payment that arrived outside Stripe, such as a bank transfer. */
router.post('/admin/invoices/:id/record-payment', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const amount = req.body && req.body.amount !== undefined ? Number(req.body.amount) : null;
        if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
            return res.status(400).json({ error: 'A payment must be a positive amount.' });
        }
        const invoice = await adInvoicing.recordPayment(req.params.id, { amount, note: (req.body && req.body.note) || '' });
        res.json({ success: true, invoice });
    } catch (error) {
        console.error('Record payment error:', error);
        res.status(400).json({ error: error.message || 'Failed to record payment' });
    }
});

/** Every invoice, newest first, for the admin view. */
router.get('/admin/invoices', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const q = {};
        if (req.query.status && ['open', 'paid', 'void'].includes(req.query.status)) q.status = req.query.status;
        const invoices = await AdInvoice.find(q).sort({ issuedAt: -1 }).limit(200)
            .populate('advertiserId', 'companyName email').lean();
        res.json({ invoices });
    } catch (error) {
        console.error('Invoice list error:', error);
        res.status(500).json({ error: 'Failed to read invoices' });
    }
});

/** Void an invoice raised in error, returning what it claimed to the account. */
router.put('/admin/invoices/:id/void', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const invoice = await AdInvoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        if (invoice.status === 'paid') return res.status(400).json({ error: 'A paid invoice cannot be voided. Refund it instead.' });
        if (invoice.status === 'void') return res.json({ success: true, invoice });

        const unpaid = Math.round((invoice.total - invoice.amountPaid) * 100) / 100;
        invoice.status = 'void';
        await invoice.save();
        if (unpaid > 0) {
            await Advertiser.updateOne({ _id: invoice.advertiserId }, { $inc: { 'billing.outstanding': -unpaid } });
        }
        await adCredit.refreshPastDue();
        res.json({ success: true, invoice });
    } catch (error) {
        console.error('Void invoice error:', error);
        res.status(500).json({ error: 'Failed to void invoice' });
    }
});

/** Add or remove credit by hand, for a goodwill gesture or a correction. */
router.post('/admin/advertisers/:id/adjust', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const amount = Number(req.body && req.body.amount);
        if (!Number.isFinite(amount) || amount === 0) return res.status(400).json({ error: 'Give an amount to add or remove.' });
        const description = (req.body && req.body.description) || 'Manual adjustment';
        if (amount > 0) {
            const r = await adCredit.credit({ advertiserId: req.params.id, amount, type: 'adjustment', description });
            return res.json({ success: true, ...r });
        }
        const r = await adCredit.debit({ advertiserId: req.params.id, amount: Math.abs(amount), type: 'adjustment', description });
        res.json({ success: true, ...r });
    } catch (error) {
        console.error('Adjustment error:', error);
        res.status(400).json({ error: error.message || 'Failed to adjust' });
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

router.post('/admin/upload-for-client', authenticateAdvertiser, requireAdmin, acceptAdImage, async (req, res) => {
    try {
        const { clientEmail, title, description, linkUrl, placement, size } = req.body;
        let { imageUrl, keywords } = req.body;
        if (typeof keywords === 'string') keywords = keywords.split(',').map((k) => k.trim()).filter(Boolean);

        const uploaded = await storeAdImage(req.file);
        if (uploaded) imageUrl = uploaded;

        if (!clientEmail || !title || !imageUrl || !linkUrl || !placement || !size) {
            return res.status(400).json({ error: 'Client email, title, artwork, link, placement and size are all required.' });
        }
        if (!isValidImageRef(imageUrl) || !isValidUrl(linkUrl)) {
            return res.status(400).json({ error: 'The artwork and link must be valid web addresses.' });
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

router.get('/admin/pending-applications', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const applications = await Advertiser.find({ role: 'advertiser', status: 'pending' })
            .select('-password')
            .sort({ createdAt: 1 });

        res.json({ applications });
    } catch (error) {
        console.error('Fetch pending applications error:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

router.put('/admin/approve-application/:id', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewNotes, setAsAdmin } = req.body;

        const advertiser = await Advertiser.findById(id);
        if (!advertiser) {
            return res.status(404).json({ error: 'Application not found' });
        }

        advertiser.status = 'approved';
        advertiser.reviewedBy = req.advertiserId;
        advertiser.reviewedAt = new Date();
        advertiser.reviewNotes = reviewNotes || '';

        if (setAsAdmin && advertiser.accountType === 'managed') {
            advertiser.role = 'admin';
        }

        await advertiser.save();

        res.json({ success: true, message: 'Application approved', advertiser: { id: advertiser._id, email: advertiser.email, companyName: advertiser.companyName, status: 'approved' } });
    } catch (error) {
        console.error('Approve application error:', error);
        res.status(500).json({ error: 'Failed to approve application' });
    }
});

router.put('/admin/reject-application/:id', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reviewNotes } = req.body;

        const advertiser = await Advertiser.findById(id);
        if (!advertiser) {
            return res.status(404).json({ error: 'Application not found' });
        }

        advertiser.status = 'suspended';
        advertiser.reviewedBy = req.advertiserId;
        advertiser.reviewedAt = new Date();
        advertiser.reviewNotes = reviewNotes || '';
        await advertiser.save();

        res.json({ success: true, message: 'Application rejected' });
    } catch (error) {
        console.error('Reject application error:', error);
        res.status(500).json({ error: 'Failed to reject application' });
    }
});

module.exports = router;
