const express = require('express');
const router = express.Router();
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

router.post('/token', (req, res) => {
  try {
    const { channelName, uid, role } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: 'channelName is required' });
    }
    if (!APP_ID || !APP_CERTIFICATE) {
      return res.status(500).json({ error: 'Agora credentials not configured' });
    }

    const agoraRole = role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
    const agoraUid = parseInt(uid) || 0;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      agoraRole,
      privilegeExpiredTs
    );

    return res.json({
      token,
      appId: APP_ID,
      channel: channelName,
      uid: agoraUid,
      expireTs: privilegeExpiredTs
    });
  } catch (error) {
    console.error('Agora token generation error:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
});

module.exports = router;
