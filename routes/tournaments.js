const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, param, query, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { requireRole, requireAccountType } = require('../middleware/rbac');
const VerseSeason = require('../models/VerseSeason');
const VerseRound = require('../models/VerseRound');
const VerseSubmission = require('../models/VerseSubmission');
const VerseMatch = require('../models/VerseMatch');
const VerseVote = require('../models/VerseVote');
const VerseReaction = require('../models/VerseReaction');
const VerseLeaderboardEntry = require('../models/VerseLeaderboardEntry');
const Sponsor = require('../models/Sponsor');
const SponsorAssignment = require('../models/SponsorAssignment');
const SiteSettings = require('../models/SiteSettings');
const SponsorMetricEvent = require('../models/SponsorMetricEvent');

function hashPrivacy(value) {
    if (!value) return '';
    return crypto.createHash('sha256').update(value + (process.env.JWT_SECRET || '')).digest('hex').substring(0, 16);
}

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (authHeader) {
            const jwt = require('jsonwebtoken');
            const User = require('../models/User');
            const token = authHeader.replace('Bearer ', '');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (user) {
                req.user = user;
                req.token = token;
            }
        }
    } catch (e) {}
    next();
};

router.get('/seasons/current', async (req, res) => {
    try {
        const season = await VerseSeason.findOne({
            status: { $in: ['active', 'voting', 'upcoming'] }
        }).sort({ startAt: -1 });

        if (!season) {
            return res.json({ success: true, data: null });
        }

        const rounds = await VerseRound.find({ seasonId: season._id })
            .sort({ roundNumber: 1 });

        const assignments = await SponsorAssignment.find({
            scopeType: 'season', scopeId: season._id, isActive: true,
            startAt: { $lte: new Date() }, endAt: { $gte: new Date() }
        }).populate('sponsorId');

        res.json({ success: true, data: { season, rounds, sponsorships: assignments } });
    } catch (err) {
        console.error('Get current season error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/seasons', async (req, res) => {
    try {
        const seasons = await VerseSeason.find({ status: { $ne: 'draft' } })
            .sort({ startAt: -1 }).limit(20);
        res.json({ success: true, data: seasons });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/seasons/:id', async (req, res) => {
    try {
        const season = await VerseSeason.findById(req.params.id);
        if (!season) return res.status(404).json({ success: false, message: 'Season not found' });

        const rounds = await VerseRound.find({ seasonId: season._id }).sort({ roundNumber: 1 });
        const assignments = await SponsorAssignment.find({
            scopeType: 'season', scopeId: season._id, isActive: true
        }).populate('sponsorId');

        res.json({ success: true, data: { season, rounds, sponsorships: assignments } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/rounds/:id', async (req, res) => {
    try {
        const round = await VerseRound.findById(req.params.id).populate('seasonId');
        if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

        const submissions = await VerseSubmission.find({
            roundId: round._id, status: 'approved'
        }).populate('artistUserId', 'name avatar creatorProfile').sort({ seed: 1, createdAt: 1 });

        const matches = await VerseMatch.find({ roundId: round._id })
            .populate('submissionA', 'title artistUserId audioUrl lyricsText submissionType originalSong')
            .populate('submissionB', 'title artistUserId audioUrl lyricsText submissionType originalSong')
            .sort({ matchNumber: 1 });

        const assignments = await SponsorAssignment.find({
            scopeType: 'round', scopeId: round._id, isActive: true
        }).populate('sponsorId');

        res.json({ success: true, data: { round, submissions, matches, sponsorships: assignments } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/matches/:id', optionalAuth, async (req, res) => {
    try {
        const match = await VerseMatch.findById(req.params.id)
            .populate({
                path: 'submissionA',
                populate: { path: 'artistUserId', select: 'name avatar creatorProfile' }
            })
            .populate({
                path: 'submissionB',
                populate: { path: 'artistUserId', select: 'name avatar creatorProfile' }
            });

        if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

        let userVote = null;
        if (req.user) {
            userVote = await VerseVote.findOne({ matchId: match._id, voterUserId: req.user._id });
        }

        res.json({ success: true, data: { match, userVote } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/leaderboard', async (req, res) => {
    try {
        const { seasonId, limit = 50 } = req.query;
        if (!seasonId) return res.status(400).json({ success: false, message: 'seasonId required' });

        const entries = await VerseLeaderboardEntry.find({ seasonId })
            .populate('userId', 'name avatar creatorProfile')
            .sort({ points: -1 })
            .limit(parseInt(limit));

        const assignments = await SponsorAssignment.find({
            scopeType: 'leaderboard', isActive: true,
            startAt: { $lte: new Date() }, endAt: { $gte: new Date() }
        }).populate('sponsorId');

        res.json({ success: true, data: { entries, sponsorships: assignments } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/winners', async (req, res) => {
    try {
        const { seasonId } = req.query;
        const filter = {};
        if (seasonId) filter.seasonId = seasonId;
        filter.status = 'completed';
        filter.winnerSubmissionId = { $ne: null };

        const winners = await VerseMatch.find(filter)
            .populate({
                path: 'winnerSubmissionId',
                populate: { path: 'artistUserId', select: 'name avatar creatorProfile' }
            })
            .populate('roundId', 'name theme roundType')
            .populate('seasonId', 'name slug')
            .sort({ updatedAt: -1 })
            .limit(50);

        res.json({ success: true, data: winners });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/rounds/:id/submissions', auth, requireAccountType('artist'), [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('lyricsText').trim().notEmpty().withMessage('Lyrics are required'),
    body('submissionType').isIn(['original', 'cover']).withMessage('Must be original or cover'),
    body('ownershipConfirmed').equals('true').withMessage('You must confirm ownership/rights')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const round = await VerseRound.findById(req.params.id);
        if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

        if (round.status !== 'submissions_open') {
            return res.status(400).json({ success: false, message: 'Submissions are not open for this round' });
        }

        const now = new Date();
        if (now < round.submissionOpenAt || now > round.submissionCloseAt) {
            return res.status(400).json({ success: false, message: 'Submission window is closed' });
        }

        const existing = await VerseSubmission.findOne({ roundId: round._id, artistUserId: req.user._id });
        if (existing) {
            return res.status(400).json({ success: false, message: 'You already submitted a verse for this round' });
        }

        const submissionCount = await VerseSubmission.countDocuments({ roundId: round._id, status: { $ne: 'withdrawn' } });
        if (submissionCount >= round.maxSubmissions) {
            return res.status(400).json({ success: false, message: 'Maximum submissions reached for this round' });
        }

        const submissionData = {
            roundId: round._id,
            seasonId: round.seasonId,
            artistUserId: req.user._id,
            title: req.body.title,
            lyricsText: req.body.lyricsText,
            submissionType: req.body.submissionType,
            audioUrl: req.body.audioUrl || '',
            audioDurationSec: req.body.audioDurationSec || 0,
            ownershipConfirmed: true,
            status: 'pending'
        };

        if (req.body.submissionType === 'cover') {
            submissionData.originalSong = {
                songTitle: req.body.originalSongTitle || '',
                originalArtist: req.body.originalArtist || '',
                source: req.body.originalSource || ''
            };
        }

        const submission = new VerseSubmission(submissionData);
        await submission.save();

        res.status(201).json({ success: true, data: submission });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'You already submitted for this round' });
        }
        console.error('Submission error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/me/submissions', auth, async (req, res) => {
    try {
        const submissions = await VerseSubmission.find({ artistUserId: req.user._id })
            .populate('roundId', 'name theme roundType status')
            .populate('seasonId', 'name slug')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: submissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/me/votes', auth, async (req, res) => {
    try {
        const votes = await VerseVote.find({ voterUserId: req.user._id })
            .populate('matchId')
            .populate('voteForSubmissionId', 'title artistUserId')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, data: votes });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/matches/:id/vote', auth, [
    body('voteForSubmissionId').notEmpty().withMessage('Must select a submission to vote for')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const match = await VerseMatch.findById(req.params.id).populate('roundId');
        if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

        if (match.locked) {
            return res.status(400).json({ success: false, message: 'This match is locked' });
        }

        if (match.status !== 'voting' && match.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Voting is not open for this match' });
        }

        const round = match.roundId;
        if (round) {
            const now = new Date();
            if (now < round.votingOpenAt || now > round.votingCloseAt) {
                return res.status(400).json({ success: false, message: 'Voting window is closed' });
            }
        }

        const validSubmissions = [match.submissionA.toString(), match.submissionB.toString()];
        if (!validSubmissions.includes(req.body.voteForSubmissionId)) {
            return res.status(400).json({ success: false, message: 'Invalid submission selection' });
        }

        const subA = await VerseSubmission.findById(match.submissionA);
        const subB = await VerseSubmission.findById(match.submissionB);
        if ((subA && subA.artistUserId.toString() === req.user._id.toString()) ||
            (subB && subB.artistUserId.toString() === req.user._id.toString())) {
            return res.status(400).json({ success: false, message: 'You cannot vote on your own match' });
        }

        const existingVote = await VerseVote.findOne({ matchId: match._id, voterUserId: req.user._id });
        if (existingVote) {
            return res.status(400).json({ success: false, message: 'You have already voted on this match' });
        }

        const vote = new VerseVote({
            matchId: match._id,
            roundId: match.roundId._id || match.roundId,
            seasonId: match.seasonId,
            voterUserId: req.user._id,
            voteForSubmissionId: req.body.voteForSubmissionId,
            ratings: {
                performance: req.body.performanceRating || null,
                originality: req.body.originalityRating || null,
                themeFit: req.body.themeFitRating || null
            },
            ipHash: hashPrivacy(req.ip),
            userAgentHash: hashPrivacy(req.headers['user-agent'])
        });

        await vote.save();

        if (req.body.voteForSubmissionId === match.submissionA.toString()) {
            match.scoreA += 1;
        } else {
            match.scoreB += 1;
        }
        match.totalVotes += 1;
        await match.save();

        res.status(201).json({ success: true, message: 'Vote recorded' });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'You have already voted on this match' });
        }
        console.error('Vote error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/submissions/:id/react', auth, [
    body('type').isIn(['cheer', 'fire', 'clap', 'heart', 'mind_blown']).withMessage('Invalid reaction type')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const submission = await VerseSubmission.findById(req.params.id);
        if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

        try {
            const reaction = new VerseReaction({
                targetType: 'submission',
                targetId: submission._id,
                userId: req.user._id,
                type: req.body.type
            });
            await reaction.save();

            submission.reactionCounts[req.body.type] = (submission.reactionCounts[req.body.type] || 0) + 1;
            submission.totalReactions += 1;
            await submission.save();

            res.status(201).json({ success: true, message: 'Reaction added' });
        } catch (err) {
            if (err.code === 11000) {
                await VerseReaction.deleteOne({
                    targetType: 'submission', targetId: submission._id,
                    userId: req.user._id, type: req.body.type
                });
                submission.reactionCounts[req.body.type] = Math.max(0, (submission.reactionCounts[req.body.type] || 1) - 1);
                submission.totalReactions = Math.max(0, submission.totalReactions - 1);
                await submission.save();
                res.json({ success: true, message: 'Reaction removed' });
            } else {
                throw err;
            }
        }
    } catch (err) {
        console.error('Reaction error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/metrics', optionalAuth, [
    body('eventType').isIn(['impression', 'click', 'sting_played', 'room_join', 'winner_view', 'leaderboard_view', 'cta_click', 'banner_view']),
    body('sponsorId').notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false });

        const event = new SponsorMetricEvent({
            sponsorId: req.body.sponsorId,
            assignmentId: req.body.assignmentId || null,
            eventType: req.body.eventType,
            refId: req.body.refId || null,
            userId: req.user?._id || null,
            meta: req.body.meta || {}
        });
        await event.save();

        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

router.get('/sponsorships/active', async (req, res) => {
    try {
        const { scopeType, scopeId } = req.query;
        const filter = {
            isActive: true,
            startAt: { $lte: new Date() },
            endAt: { $gte: new Date() }
        };
        if (scopeType) filter.scopeType = scopeType;
        if (scopeId) filter.scopeId = scopeId;

        const assignments = await SponsorAssignment.find(filter).populate('sponsorId');
        res.json({ success: true, data: assignments });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/seasons', auth, requireRole('ADMIN'), [
    body('name').trim().notEmpty(),
    body('startAt').isISO8601(),
    body('endAt').isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const slug = req.body.name.toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

        const season = new VerseSeason({
            name: req.body.name,
            slug,
            description: req.body.description || '',
            startAt: req.body.startAt,
            endAt: req.body.endAt,
            status: req.body.status || 'draft',
            bannerImageUrl: req.body.bannerImageUrl || '',
            rules: req.body.rules || '',
            prizeDescription: req.body.prizeDescription || '',
            cadenceConfig: req.body.cadenceConfig || {},
            createdBy: req.user._id
        });

        await season.save();
        res.status(201).json({ success: true, data: season });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'Season with this name already exists' });
        }
        console.error('Create season error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/seasons/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const season = await VerseSeason.findById(req.params.id);
        if (!season) return res.status(404).json({ success: false, message: 'Season not found' });

        const allowedFields = ['name', 'description', 'startAt', 'endAt', 'status', 'bannerImageUrl', 'rules', 'prizeDescription', 'cadenceConfig'];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) season[field] = req.body[field];
        }
        if (req.body.name) {
            season.slug = req.body.name.toLowerCase().trim()
                .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
        }

        await season.save();
        res.json({ success: true, data: season });
    } catch (err) {
        console.error('Update season error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/rounds', auth, requireRole('ADMIN'), [
    body('seasonId').notEmpty(),
    body('name').trim().notEmpty(),
    body('theme').trim().notEmpty(),
    body('submissionOpenAt').isISO8601(),
    body('submissionCloseAt').isISO8601(),
    body('votingOpenAt').isISO8601(),
    body('votingCloseAt').isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const season = await VerseSeason.findById(req.body.seasonId);
        if (!season) return res.status(404).json({ success: false, message: 'Season not found' });

        const roundCount = await VerseRound.countDocuments({ seasonId: season._id });

        const round = new VerseRound({
            seasonId: season._id,
            name: req.body.name,
            theme: req.body.theme,
            themeDescription: req.body.themeDescription || '',
            roundNumber: req.body.roundNumber || (roundCount + 1),
            roundType: req.body.roundType || 'qualifying',
            submissionOpenAt: req.body.submissionOpenAt,
            submissionCloseAt: req.body.submissionCloseAt,
            showcaseStartAt: req.body.showcaseStartAt || null,
            showcaseEndAt: req.body.showcaseEndAt || null,
            votingOpenAt: req.body.votingOpenAt,
            votingCloseAt: req.body.votingCloseAt,
            maxSubmissions: req.body.maxSubmissions || 32,
            bracketSize: req.body.bracketSize || 16,
            status: req.body.status || 'draft'
        });

        await round.save();
        res.status(201).json({ success: true, data: round });
    } catch (err) {
        console.error('Create round error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/rounds/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const round = await VerseRound.findById(req.params.id);
        if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

        const allowedFields = ['name', 'theme', 'themeDescription', 'roundType', 'submissionOpenAt', 'submissionCloseAt', 'showcaseStartAt', 'showcaseEndAt', 'votingOpenAt', 'votingCloseAt', 'status', 'maxSubmissions', 'bracketSize', 'locked'];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) round[field] = req.body[field];
        }

        await round.save();
        res.json({ success: true, data: round });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/submissions', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const { roundId, seasonId, status } = req.query;
        const filter = {};
        if (roundId) filter.roundId = roundId;
        if (seasonId) filter.seasonId = seasonId;
        if (status) filter.status = status;

        const submissions = await VerseSubmission.find(filter)
            .populate('artistUserId', 'name email avatar creatorProfile')
            .populate('roundId', 'name theme')
            .sort({ createdAt: -1 });

        res.json({ success: true, data: submissions });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/submissions/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const submission = await VerseSubmission.findById(req.params.id);
        if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

        if (req.body.status) {
            submission.status = req.body.status;
            submission.moderatedBy = req.user._id;
            submission.moderatedAt = new Date();
        }
        if (req.body.moderationNotes !== undefined) submission.moderationNotes = req.body.moderationNotes;
        if (req.body.seed !== undefined) submission.seed = req.body.seed;

        await submission.save();
        res.json({ success: true, data: submission });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/rounds/:id/seed', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const round = await VerseRound.findById(req.params.id);
        if (!round) return res.status(404).json({ success: false, message: 'Round not found' });

        const approved = await VerseSubmission.find({ roundId: round._id, status: 'approved' })
            .sort({ seed: 1, totalReactions: -1, createdAt: 1 });

        if (approved.length < 2) {
            return res.status(400).json({ success: false, message: 'Need at least 2 approved submissions to seed' });
        }

        await VerseMatch.deleteMany({ roundId: round._id });

        const bracketSize = Math.min(approved.length, round.bracketSize);
        const seeded = approved.slice(0, bracketSize);

        if (seeded.length % 2 !== 0) {
            seeded.pop();
        }

        const matches = [];
        for (let i = 0; i < seeded.length; i += 2) {
            const match = new VerseMatch({
                roundId: round._id,
                seasonId: round.seasonId,
                matchNumber: Math.floor(i / 2) + 1,
                submissionA: seeded[i]._id,
                submissionB: seeded[i + 1]._id,
                status: 'pending'
            });
            await match.save();
            matches.push(match);
        }

        round.status = 'submissions_closed';
        await round.save();

        res.json({ success: true, data: { matchesCreated: matches.length, matches } });
    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/matches/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const match = await VerseMatch.findById(req.params.id);
        if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

        if (req.body.status) match.status = req.body.status;
        if (req.body.locked !== undefined) match.locked = req.body.locked;

        if (req.body.winnerSubmissionId) {
            match.winnerSubmissionId = req.body.winnerSubmissionId;
            match.status = 'completed';

            const winnerSub = await VerseSubmission.findById(req.body.winnerSubmissionId);
            const loserSubId = match.submissionA.toString() === req.body.winnerSubmissionId
                ? match.submissionB : match.submissionA;
            const loserSub = await VerseSubmission.findById(loserSubId);

            if (winnerSub) {
                await VerseLeaderboardEntry.findOneAndUpdate(
                    { seasonId: match.seasonId, userId: winnerSub.artistUserId },
                    {
                        $inc: { points: 3, wins: 1, totalVotesReceived: match.scoreA + match.scoreB },
                        $setOnInsert: { seasonId: match.seasonId, userId: winnerSub.artistUserId }
                    },
                    { upsert: true, new: true }
                );
            }
            if (loserSub) {
                await VerseLeaderboardEntry.findOneAndUpdate(
                    { seasonId: match.seasonId, userId: loserSub.artistUserId },
                    {
                        $inc: { losses: 1 },
                        $setOnInsert: { seasonId: match.seasonId, userId: loserSub.artistUserId }
                    },
                    { upsert: true, new: true }
                );
            }
        }

        await match.save();
        res.json({ success: true, data: match });
    } catch (err) {
        console.error('Update match error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/sponsors', auth, requireRole('ADMIN'), [
    body('name').trim().notEmpty()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const slug = req.body.name.toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

        const sponsor = new Sponsor({
            name: req.body.name,
            slug,
            logoUrl: req.body.logoUrl || '',
            ctaUrl: req.body.ctaUrl || '',
            ctaText: req.body.ctaText || 'Learn More',
            category: req.body.category || 'brand',
            audioStingUrl: req.body.audioStingUrl || '',
            audioStingDurationMs: req.body.audioStingDurationMs || 0,
            contactEmail: req.body.contactEmail || '',
            notes: req.body.notes || ''
        });

        await sponsor.save();
        res.status(201).json({ success: true, data: sponsor });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, message: 'Sponsor already exists' });
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/sponsors', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const sponsors = await Sponsor.find().sort({ name: 1 });
        res.json({ success: true, data: sponsors });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/sponsors/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const sponsor = await Sponsor.findById(req.params.id);
        if (!sponsor) return res.status(404).json({ success: false, message: 'Sponsor not found' });

        const allowedFields = ['name', 'logoUrl', 'ctaUrl', 'ctaText', 'category', 'audioStingUrl', 'audioStingDurationMs', 'isActive', 'contactEmail', 'notes'];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) sponsor[field] = req.body[field];
        }

        await sponsor.save();
        res.json({ success: true, data: sponsor });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.post('/admin/sponsors/assignments', auth, requireRole('ADMIN'), [
    body('sponsorId').notEmpty(),
    body('scopeType').isIn(['season', 'round', 'leaderboard', 'tile', 'room', 'winner', 'theme']),
    body('placementKey').notEmpty(),
    body('startAt').isISO8601(),
    body('endAt').isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const assignment = new SponsorAssignment({
            sponsorId: req.body.sponsorId,
            scopeType: req.body.scopeType,
            scopeId: req.body.scopeId || null,
            placementKey: req.body.placementKey,
            startAt: req.body.startAt,
            endAt: req.body.endAt,
            rules: req.body.rules || {}
        });

        await assignment.save();
        res.status(201).json({ success: true, data: assignment });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/reports/season/:id', auth, requireRole('ADMIN'), async (req, res) => {
    try {
        const season = await VerseSeason.findById(req.params.id);
        if (!season) return res.status(404).json({ success: false, message: 'Season not found' });

        const rounds = await VerseRound.countDocuments({ seasonId: season._id });
        const submissions = await VerseSubmission.countDocuments({ seasonId: season._id });
        const approvedSubmissions = await VerseSubmission.countDocuments({ seasonId: season._id, status: 'approved' });
        const matches = await VerseMatch.countDocuments({ seasonId: season._id });
        const completedMatches = await VerseMatch.countDocuments({ seasonId: season._id, status: 'completed' });
        const totalVotes = await VerseVote.countDocuments({ seasonId: season._id });
        const uniqueVoters = await VerseVote.distinct('voterUserId', { seasonId: season._id });
        const reactions = await VerseReaction.countDocuments();

        const topArtists = await VerseLeaderboardEntry.find({ seasonId: season._id })
            .populate('userId', 'name avatar')
            .sort({ points: -1 }).limit(10);

        const sponsorMetrics = await SponsorMetricEvent.aggregate([
            { $match: { createdAt: { $gte: season.startAt, $lte: season.endAt || new Date() } } },
            { $group: { _id: { sponsorId: '$sponsorId', eventType: '$eventType' }, count: { $sum: 1 } } }
        ]);

        res.json({
            success: true,
            data: {
                season: season.name,
                rounds,
                submissions,
                approvedSubmissions,
                matches,
                completedMatches,
                totalVotes,
                uniqueVoters: uniqueVoters.length,
                reactions,
                topArtists,
                sponsorMetrics
            }
        });
    } catch (err) {
        console.error('Report error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/feature-flags', async (req, res) => {
    try {
        const setting = await SiteSettings.findOne({ key: 'tournaments_nav_visible' });
        res.json({
            success: true,
            data: {
                tournaments_nav_visible: setting ? setting.value : false
            }
        });
    } catch (err) {
        res.json({ success: true, data: { tournaments_nav_visible: false } });
    }
});

router.patch('/admin/feature-flags', auth, requireRole('ADMIN'), [
    body('tournaments_nav_visible').isBoolean()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        await SiteSettings.findOneAndUpdate(
            { key: 'tournaments_nav_visible' },
            { value: req.body.tournaments_nav_visible, updatedBy: req.user._id },
            { upsert: true, new: true }
        );

        res.json({ success: true, data: { tournaments_nav_visible: req.body.tournaments_nav_visible } });
    } catch (err) {
        console.error('Feature flag update error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
