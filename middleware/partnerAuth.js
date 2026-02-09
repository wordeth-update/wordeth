const jwt = require('jsonwebtoken');
const PartnerUser = require('../models/PartnerUser');
const Label = require('../models/Label');
const DashboardShare = require('../models/DashboardShare');

const partnerAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            throw new Error('No authorization header');
        }

        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded.partnerId) {
            throw new Error('Not a partner token');
        }

        const partner = await PartnerUser.findById(decoded.partnerId);
        if (!partner || partner.status !== 'active') {
            throw new Error('Partner not found or inactive');
        }

        const label = await Label.findById(partner.labelId);
        if (!label || label.status !== 'active') {
            throw new Error('Label not found or inactive');
        }

        req.partner = partner;
        req.label = label;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Partner authentication required.' });
    }
};

const shareTokenAuth = async (req, res, next) => {
    try {
        const shareToken = req.params.shareToken || req.query.shareToken;
        if (!shareToken) {
            throw new Error('No share token');
        }

        const share = await DashboardShare.findOne({
            token: shareToken,
            active: true,
            expiresAt: { $gt: new Date() }
        });

        if (!share) {
            throw new Error('Invalid or expired share link');
        }

        const label = await Label.findById(share.labelId);
        if (!label) {
            throw new Error('Label not found');
        }

        share.accessCount += 1;
        await share.save();

        req.share = share;
        req.label = label;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid or expired share link.' });
    }
};

module.exports = { partnerAuth, shareTokenAuth };
