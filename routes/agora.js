const express = require('express');
const router = express.Router();
const { RtcTokenBuilder, RtcRole } = require('agora-token');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

router.post('/token', (req, res) => {
  try {
    const { channelName, uid, role } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: 'channelName is required' });
    }
    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Agora credentials missing - APP_ID:', !!APP_ID, 'APP_CERTIFICATE:', !!APP_CERTIFICATE);
      return res.status(500).json({ error: 'Agora credentials not configured' });
    }

    const agoraRole = role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
    const agoraUid = parseInt(uid) || 0;
    const tokenExpireSeconds = 3600;
    const privilegeExpireSeconds = 3600;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      agoraRole,
      tokenExpireSeconds,
      privilegeExpireSeconds
    );

    console.log(`Agora token generated: channel=${channelName}, uid=${agoraUid}, role=${role}`);

    return res.json({
      token,
      appId: APP_ID,
      channel: channelName,
      uid: agoraUid
    });
  } catch (error) {
    console.error('Agora token generation error:', error);
    return res.status(500).json({ error: 'Failed to generate token: ' + error.message });
  }
});

router.get('/test', (req, res) => {
  try {
    if (!APP_ID || !APP_CERTIFICATE) {
      return res.json({
        status: 'error',
        message: 'Agora credentials not configured',
        appIdPresent: !!APP_ID,
        certificatePresent: !!APP_CERTIFICATE
      });
    }

    const testToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      'test-channel',
      0,
      RtcRole.PUBLISHER,
      3600,
      3600
    );

    return res.json({
      status: 'ok',
      message: 'Agora credentials valid, token generation works',
      appIdPresent: true,
      certificatePresent: true,
      tokenGenerated: !!testToken,
      tokenPrefix: testToken.substring(0, 10) + '...'
    });
  } catch (error) {
    return res.json({
      status: 'error',
      message: 'Token generation failed: ' + error.message,
      appIdPresent: !!APP_ID,
      certificatePresent: !!APP_CERTIFICATE
    });
  }
});

module.exports = router;
