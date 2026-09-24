'use strict';

const express = require('express');
const router = express.Router();
const optionalAuth = require('../middleware/optionalAuth');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const limits = require('../middleware/limits');
const Feedback = require('../models/Feedback');

/** Trim and cap, so a pasted essay cannot become a database problem. */
function text(value, max) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
}

/** Only the answers we offered; anything else becomes empty rather than stored. */
function choice(value, allowed) {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return allowed.includes(v) ? v : '';
}

/**
 * Leave feedback. Open to anyone, because a tester who has signed out
 * still has something worth hearing, but the account is recorded when
 * there is one.
 */
router.post('/', optionalAuth, limits.feedback, async (req, res) => {
    try {
        const b = req.body || {};

        const entry = {
            userId: req.user ? req.user._id : null,
            name: text(b.name, 120) || (req.user ? req.user.name : ''),
            email: text(b.email, 200).toLowerCase() || (req.user ? req.user.email : ''),
            event: text(b.event, 60) || 'general',
            device: text(b.device, 120),
            network: choice(b.network, ['wifi', 'cellular', 'both', 'unsure']),
            audioWorked: choice(b.audioWorked, ['yes', 'mostly', 'no', 'did-not-try']),
            audioDetail: text(b.audioDetail, 4000),
            worstMoment: text(b.worstMoment, 4000),
            bestMoment: text(b.bestMoment, 4000),
            wouldReturn: choice(b.wouldReturn, ['yes', 'no', 'maybe']),
            wouldReturnWhy: text(b.wouldReturnWhy, 4000),
            anythingElse: text(b.anythingElse, 4000),
            userAgent: text(req.headers['user-agent'], 500)
        };

        // Something has to have been said, or it is an empty form submission.
        const said = [entry.audioDetail, entry.worstMoment, entry.bestMoment, entry.wouldReturnWhy, entry.anythingElse]
            .some((v) => v.length > 0);
        const answered = [entry.network, entry.audioWorked, entry.wouldReturn].some((v) => v.length > 0);
        if (!said && !answered) {
            return res.status(400).json({ error: 'Answer at least one question before sending.' });
        }

        const saved = await Feedback.create(entry);
        res.status(201).json({ success: true, id: saved._id });
    } catch (error) {
        console.error('Feedback submit error:', error);
        res.status(500).json({ error: 'That did not send. Try once more.' });
    }
});

/**
 * Read what came in. Admin only, newest first, with a small summary so the
 * shape of the answers is visible before reading any of them.
 */
router.get('/admin', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const query = {};
        if (req.query.event) query.event = text(req.query.event, 60);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));

        const entries = await Feedback.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('userId', 'name email')
            .lean();

        const tally = (field, values) => {
            const out = {};
            for (const v of values) out[v] = 0;
            for (const e of entries) if (e[field] && out[e[field]] !== undefined) out[e[field]]++;
            return out;
        };

        res.json({
            total: entries.length,
            summary: {
                wouldReturn: tally('wouldReturn', ['yes', 'maybe', 'no']),
                audioWorked: tally('audioWorked', ['yes', 'mostly', 'no', 'did-not-try']),
                network: tally('network', ['wifi', 'cellular', 'both', 'unsure']),
                signedIn: entries.filter((e) => e.userId).length
            },
            entries
        });
    } catch (error) {
        console.error('Feedback read error:', error);
        res.status(500).json({ error: 'Failed to read feedback' });
    }
});

/** Everything said during one round of testing, as a spreadsheet. */
router.get('/admin/export', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const query = {};
        if (req.query.event) query.event = text(req.query.event, 60);
        const entries = await Feedback.find(query).sort({ createdAt: 1 }).lean();

        const cols = ['createdAt', 'name', 'email', 'event', 'device', 'network', 'audioWorked', 'audioDetail', 'worstMoment', 'bestMoment', 'wouldReturn', 'wouldReturnWhy', 'anythingElse'];
        const cell = (v) => {
            const s = v === null || v === undefined ? '' : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const rows = [cols.join(',')];
        for (const e of entries) rows.push(cols.map((c) => cell(c === 'createdAt' ? new Date(e.createdAt).toISOString() : e[c])).join(','));

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="wordeth-feedback-${Date.now()}.csv"`);
        res.send(rows.join('\n'));
    } catch (error) {
        console.error('Feedback export error:', error);
        res.status(500).json({ error: 'Failed to export feedback' });
    }
});

module.exports = router;
