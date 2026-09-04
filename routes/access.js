const express = require('express');
const auth = require('../middleware/auth');
const {
    getUserAccess,
    recordActiveHeartbeat
} = require('../services/userAccess');

const router = express.Router();

router.get('/me', auth, async (req, res) => {
    try {
        res.json({ success: true, access: await getUserAccess(req.user) });
    } catch (error) {
        console.error('[Access] Status error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to load access status' });
    }
});

router.post('/heartbeat', auth, async (req, res) => {
    try {
        res.json({ success: true, access: await recordActiveHeartbeat(req.user._id) });
    } catch (error) {
        console.error('[Access] Heartbeat error:', error.message);
        res.status(500).json({ success: false, message: 'Unable to record active time' });
    }
});

module.exports = router;