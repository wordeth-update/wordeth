const crypto = require('crypto');

function secureEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length &&
        crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseApliiqJson(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    try {
        if (Buffer.isBuffer(req.body)) {
            req.rawBody = req.body;
            req.body = req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
        } else {
            req.rawBody = Buffer.from(JSON.stringify(req.body || {}), 'utf8');
        }
        next();
    } catch (error) {
        res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }
}

function requireFulfillmentSignature(req, res, next) {
    const secret = process.env.APLIIQ_SHARED_SECRET;
    if (!secret) {
        return res.status(503).json({ success: false, message: 'Apliiq webhook is not configured' });
    }

    const supplied = req.get('x-apliiq-hmac');
    if (!supplied) {
        return res.status(401).json({ success: false, message: 'Missing Apliiq signature' });
    }

    // Apliiq documents: base64(HMAC-SHA256(base64(payload), shared secret)).
    const encodedPayload = (req.rawBody || Buffer.alloc(0)).toString('base64');
    const expected = crypto
        .createHmac('sha256', secret)
        .update(encodedPayload, 'utf8')
        .digest('base64');

    if (!secureEqual(supplied, expected)) {
        return res.status(401).json({ success: false, message: 'Invalid Apliiq signature' });
    }

    next();
}

function requireWarehouseAppId(req, res, next) {
    const appKey = process.env.APLIIQ_APP_KEY;
    if (!appKey) {
        return res.status(503).json({ success: false, message: 'Apliiq warehouse webhook is not configured' });
    }

    const supplied = req.get('x-apliiq-appid');
    if (!supplied || !secureEqual(supplied, appKey)) {
        return res.status(401).json({ success: false, message: 'Invalid Apliiq app ID' });
    }

    next();
}

module.exports = {
    parseApliiqJson,
    requireFulfillmentSignature,
    requireWarehouseAppId
};