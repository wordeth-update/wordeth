const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const Report = require('../models/Report');
const Message = require('../models/Message');
const mailer = require('../services/mailer');
const { blockedBetween, sameId } = require('../services/moderation');
const { authenticateAdvertiser, requireAdmin } = require('./ads');

/**
 * Block and report.
 *
 * Blocking is yours alone to do and undo, and it cuts both ways at once.
 * A report goes to Wordeth, with what was said captured at the time, so
 * it can be judged even after the thing is deleted. The terms promise an
 * answer within a day; the Reports tab in w-admin is where that happens.
 */

router.get('/blocks', auth, async (req, res) => {
    try {
        const me = await User.findById(req.user._id).select('blockedUserIds').populate('blockedUserIds', 'name avatar');
        res.json({ blocked: (me.blockedUserIds || []).map((u) => ({ _id: u._id, name: u.name, avatar: u.avatar || null })) });
    } catch (error) {
        console.error('[Moderation] blocks:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/block/:userId', auth, async (req, res) => {
    try {
        const target = req.params.userId;
        if (sameId(target, req.user._id)) return res.status(400).json({ message: 'You cannot block yourself.' });
        const them = await User.findById(target).select('_id name');
        if (!them) return res.status(404).json({ message: 'No such person.' });
        await User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUserIds: them._id } });
        // Blocking also undoes any dap between the two.
        await User.updateOne({ _id: req.user._id }, { $pull: { following: them._id, followers: them._id } });
        await User.updateOne({ _id: them._id }, { $pull: { following: req.user._id, followers: req.user._id } });
        res.json({ message: `${them.name} is blocked. They can no longer message you, dap you up, or join your rooms.` });
    } catch (error) {
        console.error('[Moderation] block:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete('/block/:userId', auth, async (req, res) => {
    try {
        await User.updateOne({ _id: req.user._id }, { $pull: { blockedUserIds: req.params.userId } });
        res.json({ message: 'Unblocked.' });
    } catch (error) {
        console.error('[Moderation] unblock:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/** Whether either of the two has blocked the other: the app asks before drawing Message and Dap up. */
router.get('/between/:userId', auth, async (req, res) => {
    try {
        const me = await User.findById(req.user._id).select('blockedUserIds').lean();
        const iBlocked = (me.blockedUserIds || []).some((id) => sameId(id, req.params.userId));
        const blocked = iBlocked || await blockedBetween(req.user._id, req.params.userId);
        res.json({ blocked, iBlocked });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

const REASONS = ['harassment', 'hate', 'sexual', 'violence', 'spam', 'impersonation', 'other'];

router.post('/reports', auth, async (req, res) => {
    try {
        const { targetType, targetId, targetUserId, reason, details, roomId } = req.body || {};
        if (!['user', 'message', 'room', 'photo', 'replay'].includes(targetType)) return res.status(400).json({ message: 'Say what you are reporting.' });
        if (!REASONS.includes(reason)) return res.status(400).json({ message: 'Pick a reason.' });
        // Three reports a minute is plenty; past that it is a flood.
        const recent = await Report.countDocuments({ reporterId: req.user._id, createdAt: { $gt: new Date(Date.now() - 60000) } });
        if (recent >= 3) return res.status(429).json({ message: 'Thanks, we have those. Give it a minute.' });

        let excerpt = '';
        let accused = targetUserId || null;
        if (targetType === 'message' && targetId) {
            const m = await Message.findById(targetId).select('text senderId').lean();
            if (m) { excerpt = m.text || '(voice message)'; accused = m.senderId; }
        }
        const report = await Report.create({
            reporterId: req.user._id, targetType, targetId: String(targetId || roomId || ''), targetUserId: accused,
            reason, details: String(details || '').slice(0, 1000), excerpt: String(excerpt).slice(0, 2000)
        });
        // Somebody should know today, not when they next open the admin page.
        if (mailer.configured()) {
            const who = accused ? await User.findById(accused).select('name email').lean() : null;
            mailer.send({
                to: 'support@wordeth.com',
                subject: `Report: ${reason} (${targetType})`,
                text: `Reporter ${req.user.name} <${req.user.email}>\nAbout ${who ? `${who.name} <${who.email}>` : targetType + ' ' + report.targetId}\nReason ${reason}\n\n${report.details}\n\n${excerpt ? 'Excerpt: ' + excerpt : ''}\n\nReview: https://www.wordeth.com/w-admin.html (Reports tab)`
            }).catch(() => {});
        }
        res.json({ message: 'Thank you. We look at every report within a day.', reportId: report._id });
    } catch (error) {
        console.error('[Moderation] report:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ── Admin ──────────────────────────────────────────────────────────────

router.get('/admin/reports', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const status = ['open', 'actioned', 'dismissed'].includes(req.query.status) ? req.query.status : 'open';
        const list = await Report.find({ status }).sort({ createdAt: status === 'open' ? 1 : -1 }).limit(200)
            .populate('reporterId', 'name email').populate('targetUserId', 'name email suspendedUntil');
        res.json({ reports: list.map((r) => ({
            id: r._id, targetType: r.targetType, targetId: r.targetId, reason: r.reason, details: r.details, excerpt: r.excerpt,
            status: r.status, action: r.action, note: r.note, createdAt: r.createdAt, decidedAt: r.decidedAt,
            reporter: r.reporterId ? { id: r.reporterId._id, name: r.reporterId.name, email: r.reporterId.email } : null,
            accused: r.targetUserId ? { id: r.targetUserId._id, name: r.targetUserId.name, email: r.targetUserId.email, suspendedUntil: r.targetUserId.suspendedUntil } : null
        })) });
    } catch (error) {
        console.error('[Moderation] admin list:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

/**
 * Decide a report. action: 'dismiss' | 'warn' | 'suspend7' | 'suspend30' | 'close'.
 * Suspensions and closures land on the accused account; a note is kept.
 */
router.post('/admin/reports/:id/decide', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        const { action, note } = req.body || {};
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ message: 'No such report.' });
        const days = { suspend7: 7, suspend30: 30 }[action];
        if (report.targetUserId && (days || action === 'close')) {
            const until = action === 'close' ? new Date('9999-01-01') : new Date(Date.now() + days * 86400000);
            await User.updateOne({ _id: report.targetUserId }, { $set: { suspendedUntil: until, suspendedReason: `${report.reason}: ${note || ''}`.slice(0, 300) } });
        }
        report.status = action === 'dismiss' ? 'dismissed' : 'actioned';
        report.action = String(action || 'dismiss');
        report.note = String(note || '').slice(0, 500);
        report.decidedBy = String(req.advertiserId || 'admin');
        report.decidedAt = new Date();
        await report.save();
        res.json({ message: action === 'dismiss' ? 'Dismissed.' : action === 'warn' ? 'Marked as warned.' : action === 'close' ? 'Account closed.' : `Suspended for ${days} days.` });
    } catch (error) {
        console.error('[Moderation] decide:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/admin/users/:id/unsuspend', authenticateAdvertiser, requireAdmin, async (req, res) => {
    try {
        await User.updateOne({ _id: req.params.id }, { $set: { suspendedUntil: null, suspendedReason: '' } });
        res.json({ message: 'Suspension lifted.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;
