const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const DesignTemplate = require('../models/DesignTemplate');
const UploadToken = require('../models/UploadToken');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    }
});

const VALID_GENRES = [
    'Hip-Hop', 'R&B', 'Pop', 'Rock', 'Jazz', 'Electronic',
    'Country', 'Latin', 'Afrobeats', 'Indie', 'Metal', 'Classical', 'Reggae', 'Other'
];
const VALID_PRODUCTS = ['tshirt', 'hoodie', 'tank', 'longsleeve', 'sweatshirt', 'hat'];
const MAX_DESIGN_BYTES = 500000;

function generateTemplateId() {
    return 'TPL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateUploadToken() {
    return 'wdth_dsgn_' + crypto.randomBytes(16).toString('hex');
}

router.post('/upload-tokens', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { count } = req.body;
        const num = Math.min(Math.max(parseInt(count) || 1, 1), 20);
        const tokens = [];
        for (let i = 0; i < num; i++) {
            const raw = generateUploadToken();
            const hash = UploadToken.hashToken(raw);
            await UploadToken.create({
                tokenHash: hash,
                createdBy: req.user.id,
                maxUses: 50
            });
            tokens.push(raw);
        }
        res.json({ success: true, data: { tokens } });
    } catch (error) {
        console.error('Error generating upload tokens:', error);
        res.status(500).json({ success: false, message: 'Failed to generate tokens' });
    }
});

router.post('/validate-token', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token || !token.startsWith('wdth_dsgn_') || token.length < 40) {
            return res.json({ success: false, message: 'Invalid upload token' });
        }
        const hash = UploadToken.hashToken(token);
        const record = await UploadToken.findOne({ tokenHash: hash });
        if (!record) {
            return res.json({ success: false, message: 'Invalid upload token' });
        }
        if (record.revoked) {
            return res.json({ success: false, message: 'This token has been revoked' });
        }
        if (record.expiresAt && record.expiresAt < new Date()) {
            return res.json({ success: false, message: 'This token has expired' });
        }
        if (record.usedCount >= record.maxUses) {
            return res.json({ success: false, message: 'Token has reached its upload limit' });
        }
        res.json({ success: true, data: { remaining: record.maxUses - record.usedCount } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Validation failed' });
    }
});

router.post('/submit', upload.single('previewImage'), async (req, res) => {
    try {
        const { uploadToken, title, description, designerName, designerEmail, genre, artistName, artistId, labelName, labelId, products, frontDesign, backDesign, tags, defaultProduct, defaultColor } = req.body;

        if (!uploadToken || !uploadToken.startsWith('wdth_dsgn_') || uploadToken.length < 40) {
            return res.status(400).json({ success: false, message: 'Invalid upload token' });
        }

        const tokenHash = UploadToken.hashToken(uploadToken);
        const tokenRecord = await UploadToken.findOneAndUpdate(
            { tokenHash, revoked: false, usedCount: { $lt: 50 } },
            { $inc: { usedCount: 1 } },
            { new: true }
        );
        if (!tokenRecord) {
            return res.status(400).json({ success: false, message: 'Invalid, revoked, or exhausted upload token' });
        }
        if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
            await UploadToken.updateOne({ _id: tokenRecord._id }, { $inc: { usedCount: -1 } });
            return res.status(400).json({ success: false, message: 'Upload token has expired' });
        }

        if (!title || title.trim().length < 2 || title.trim().length > 120) {
            return res.status(400).json({ success: false, message: 'Title must be between 2 and 120 characters' });
        }

        if (!designerName || designerName.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Designer name is required' });
        }

        if (!genre || !VALID_GENRES.includes(genre)) {
            return res.status(400).json({ success: false, message: 'Valid genre is required' });
        }

        if (designerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(designerEmail)) {
            return res.status(400).json({ success: false, message: 'Invalid email format' });
        }

        if (!frontDesign || typeof frontDesign !== 'string') {
            return res.status(400).json({ success: false, message: 'Front design data is required' });
        }
        if (frontDesign.length > MAX_DESIGN_BYTES) {
            return res.status(400).json({ success: false, message: 'Front design data exceeds maximum size' });
        }
        try {
            var parsedFront = JSON.parse(frontDesign);
            if (!parsedFront.objects || !Array.isArray(parsedFront.objects)) {
                return res.status(400).json({ success: false, message: 'Front design must be valid Fabric.js JSON with objects array' });
            }
        } catch (e) {
            return res.status(400).json({ success: false, message: 'Front design must be valid Fabric.js JSON' });
        }
        if (backDesign) {
            if (typeof backDesign !== 'string') {
                return res.status(400).json({ success: false, message: 'Back design must be a string' });
            }
            if (backDesign.length > MAX_DESIGN_BYTES) {
                return res.status(400).json({ success: false, message: 'Back design data exceeds maximum size' });
            }
            try {
                var parsedBack = JSON.parse(backDesign);
                if (!parsedBack.objects || !Array.isArray(parsedBack.objects)) {
                    return res.status(400).json({ success: false, message: 'Back design must be valid Fabric.js JSON with objects array' });
                }
            } catch (e) {
                return res.status(400).json({ success: false, message: 'Back design must be valid Fabric.js JSON' });
            }
        }

        let productList = [];
        try {
            productList = typeof products === 'string' ? JSON.parse(products) : products;
            if (!Array.isArray(productList) || productList.length === 0) throw new Error();
            productList = productList.filter(p => VALID_PRODUCTS.includes(p));
            if (productList.length === 0) throw new Error();
        } catch {
            return res.status(400).json({ success: false, message: 'At least one valid product type is required' });
        }

        let tagList = [];
        try {
            tagList = typeof tags === 'string' ? JSON.parse(tags) : (tags || []);
            if (Array.isArray(tagList)) {
                tagList = tagList.slice(0, 10).map(t => String(t).trim().toLowerCase().substring(0, 40)).filter(Boolean);
            } else {
                tagList = [];
            }
        } catch { tagList = []; }

        let previewImageUrl = '';
        let previewObjectPath = '';
        if (req.file) {
            try {
                const { Client } = require('@replit/object-storage');
                const client = new Client();
                const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
                const objPath = `merch-templates/previews/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
                await client.uploadFromBytes(objPath, req.file.buffer);
                previewObjectPath = objPath;
                const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
                if (publicPaths) {
                    previewImageUrl = `/object-storage/${objPath}`;
                }
            } catch (err) {
                console.error('Template preview upload error:', err);
            }
        }

        const template = await DesignTemplate.create({
            templateId: generateTemplateId(),
            title: title.trim(),
            description: description ? String(description).trim().substring(0, 500) : '',
            designerName: designerName.trim(),
            designerEmail: designerEmail ? String(designerEmail).trim().toLowerCase() : '',
            uploadToken,
            genre,
            artistName: artistName ? String(artistName).trim().substring(0, 100) : '',
            artistId: artistId ? String(artistId).substring(0, 100) : '',
            labelName: labelName ? String(labelName).trim().substring(0, 100) : '',
            labelId: labelId ? String(labelId).substring(0, 100) : '',
            products: productList,
            defaultProduct: VALID_PRODUCTS.includes(defaultProduct) ? defaultProduct : productList[0],
            defaultColor: defaultColor || 'black',
            frontDesign: frontDesign,
            backDesign: backDesign || null,
            previewImageUrl,
            previewObjectPath,
            tags: tagList,
            status: 'pending'
        });

        res.json({
            success: true,
            data: { templateId: template.templateId, title: template.title },
            message: 'Template submitted for review'
        });
    } catch (error) {
        console.error('Error submitting template:', error);
        res.status(500).json({ success: false, message: 'Failed to submit template' });
    }
});

router.get('/browse', async (req, res) => {
    try {
        const { genre, artist, label, featured, sort, page, limit: lim } = req.query;
        const query = { status: 'approved' };
        if (genre) query.genre = genre;
        if (artist) query.artistName = { $regex: artist, $options: 'i' };
        if (label) query.labelName = { $regex: label, $options: 'i' };
        if (featured === 'true') query.featured = true;

        const pageNum = Math.max(parseInt(page) || 1, 1);
        const perPage = Math.min(Math.max(parseInt(lim) || 20, 1), 50);
        const skip = (pageNum - 1) * perPage;

        let sortObj = { createdAt: -1 };
        if (sort === 'popular') sortObj = { salesCount: -1, createdAt: -1 };
        if (sort === 'trending') sortObj = { weekSalesCount: -1, createdAt: -1 };
        if (sort === 'featured') sortObj = { featuredAt: -1, createdAt: -1 };

        const [templates, total] = await Promise.all([
            DesignTemplate.find(query)
                .select('templateId title designerName genre artistName labelName products previewImageUrl tags featured salesCount weekSalesCount createdAt')
                .sort(sortObj).skip(skip).limit(perPage),
            DesignTemplate.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: {
                templates,
                pagination: { page: pageNum, perPage, total, pages: Math.ceil(total / perPage) }
            }
        });
    } catch (error) {
        console.error('Error browsing templates:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch templates' });
    }
});

router.get('/trending', async (req, res) => {
    try {
        const templates = await DesignTemplate.find({ status: 'approved' })
            .select('templateId title designerName genre artistName labelName products previewImageUrl tags salesCount weekSalesCount createdAt')
            .sort({ weekSalesCount: -1, createdAt: -1 }).limit(10);
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch trending templates' });
    }
});

router.get('/featured', async (req, res) => {
    try {
        const templates = await DesignTemplate.find({ status: 'approved', featured: true })
            .select('templateId title designerName genre artistName labelName products previewImageUrl tags salesCount createdAt featuredAt')
            .sort({ featuredAt: -1 }).limit(12);
        res.json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch featured templates' });
    }
});

router.get('/:templateId', async (req, res) => {
    try {
        const template = await DesignTemplate.findOne({ templateId: req.params.templateId, status: 'approved' })
            .select('-uploadToken -activatedBy');
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        res.json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch template' });
    }
});

router.get('/admin/queue', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { status, page, limit: lim } = req.query;
        const query = {};
        if (status && ['pending', 'approved', 'rejected', 'archived'].includes(status)) {
            query.status = status;
        } else {
            query.status = 'pending';
        }

        const pageNum = Math.max(parseInt(page) || 1, 1);
        const perPage = Math.min(Math.max(parseInt(lim) || 20, 1), 50);
        const skip = (pageNum - 1) * perPage;

        const [templates, total, pendingCount] = await Promise.all([
            DesignTemplate.find(query).sort({ createdAt: -1 }).skip(skip).limit(perPage),
            DesignTemplate.countDocuments(query),
            DesignTemplate.countDocuments({ status: 'pending' })
        ]);

        res.json({
            success: true,
            data: {
                templates,
                pagination: { page: pageNum, perPage, total, pages: Math.ceil(total / perPage) },
                pendingCount
            }
        });
    } catch (error) {
        console.error('Error fetching admin queue:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch queue' });
    }
});

router.patch('/admin/:templateId/approve', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const template = await DesignTemplate.findOne({ templateId: req.params.templateId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        template.status = 'approved';
        template.activatedBy = req.user.id;
        template.activatedAt = new Date();
        template.rejectionReason = '';
        await template.save();
        res.json({ success: true, data: { templateId: template.templateId, status: 'approved' } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to approve template' });
    }
});

router.patch('/admin/:templateId/reject', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { reason } = req.body;
        const template = await DesignTemplate.findOne({ templateId: req.params.templateId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        template.status = 'rejected';
        template.rejectionReason = reason ? String(reason).substring(0, 500) : '';
        await template.save();
        res.json({ success: true, data: { templateId: template.templateId, status: 'rejected' } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to reject template' });
    }
});

router.patch('/admin/:templateId/feature', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { featured } = req.body;
        const template = await DesignTemplate.findOne({ templateId: req.params.templateId, status: 'approved' });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Approved template not found' });
        }
        template.featured = !!featured;
        template.featuredAt = featured ? new Date() : null;
        await template.save();
        res.json({ success: true, data: { templateId: template.templateId, featured: template.featured } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to update featured status' });
    }
});

router.delete('/admin/:templateId', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const template = await DesignTemplate.findOne({ templateId: req.params.templateId });
        if (!template) {
            return res.status(404).json({ success: false, message: 'Template not found' });
        }
        template.status = 'archived';
        await template.save();
        res.json({ success: true, message: 'Template archived' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to archive template' });
    }
});

router.get('/admin/genres', auth, requireRole('ADMIN'), (req, res) => {
    res.json({ success: true, data: VALID_GENRES });
});

module.exports = router;
