const express = require('express');
const router = express.Router();
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const crypto = require('crypto');
const { authorizePaidRoomEntry } = require('../services/userAccess');

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

const TOKEN_EXPIRY_SECONDS = 86400;
const PRIVILEGE_EXPIRY_SECONDS = 86400;
const RENEWABLE_TOKEN_SECONDS = 60;

function allocateAgoraUid(channelName, participant) {
  if (Number.isInteger(participant.agoraUid) && participant.agoraUid > 0) {
    return participant.agoraUid;
  }
  const digest = crypto.createHash('sha256')
    .update(`${channelName}:${participant.userId}:${participant.socketId}`)
    .digest();
  participant.agoraUid = digest.readUInt32BE(0) || 1;
  return participant.agoraUid;
}

router.post('/token', auth, async (req, res) => {
  try {
    const { channelName, uid, role } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: 'channelName is required' });
    }
    if (!APP_ID || !APP_CERTIFICATE) {
      console.error('Agora credentials missing - APP_ID:', !!APP_ID, 'APP_CERTIFICATE:', !!APP_CERTIFICATE);
      return res.status(500).json({ error: 'Agora credentials not configured' });
    }

    const { getRoomById } = require('./signaling');
    const room = getRoomById(channelName);
    const participant = room && Array.from(room.participants.values()).find(
      item => String(item.userId || '') === String(req.user._id)
    );
    if (!participant) {
      return res.status(403).json({ error: 'Join this room before requesting audio access' });
    }
    if (participant.peekExpiresAt && new Date(participant.peekExpiresAt) <= new Date()) {
      return res.status(403).json({ error: 'Your Wildcard peek has ended', code: 'WILDCARD_EXPIRED' });
    }

    if (room.tokenPrice > 0) {
      const isCreator = String(room.creatorUserId || '') === String(req.user._id);
      const hasFreePass = Array.isArray(room.freeEntryUserIds) &&
        room.freeEntryUserIds.includes(String(req.user._id));
      if (!isCreator && !hasFreePass) {
        const access = await authorizePaidRoomEntry({
          userId: req.user._id,
          roomId: channelName
        });
        if (!access.allowed) {
          return res.status(403).json({ error: access.message, code: access.code });
        }
      }
    }

    const agoraRole = participant.isHost || participant.isSpeaker
      ? RtcRole.PUBLISHER
      : RtcRole.SUBSCRIBER;
    const agoraUid = allocateAgoraUid(channelName, participant);
    const accessSeconds = participant.peekExpiresAt
      ? Math.max(1, Math.min(
          RENEWABLE_TOKEN_SECONDS,
          Math.ceil((new Date(participant.peekExpiresAt).getTime() - Date.now()) / 1000)
        ))
      : RENEWABLE_TOKEN_SECONDS;

    const canPublishAudio = participant.isHost || participant.isSpeaker;
    const token = RtcTokenBuilder.buildTokenWithUidAndPrivilege(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      agoraUid,
      accessSeconds,
      Math.min(PRIVILEGE_EXPIRY_SECONDS, accessSeconds),
      canPublishAudio ? accessSeconds : 0,
      0,
      0
    );

    if (!token) {
      console.error('Agora token build returned empty - check APP_ID/APP_CERTIFICATE format (must be 32-char hex)');
      return res.status(500).json({ error: 'Token generation returned empty' });
    }

    console.log(`Agora token generated: channel=${channelName}, uid=${agoraUid}, role=${agoraRole}, len=${token.length}, expiresIn=${accessSeconds}s`);

    return res.json({
      token,
      appId: APP_ID,
      channel: channelName,
      uid: agoraUid,
      expiresIn: accessSeconds
    });
  } catch (error) {
    console.error('Agora token generation error:', error);
    return res.status(500).json({ error: 'Failed to generate token: ' + error.message });
  }
});

router.get('/test', auth, requireRole('ADMIN'), (req, res) => {
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
      TOKEN_EXPIRY_SECONDS,
      PRIVILEGE_EXPIRY_SECONDS
    );

    return res.json({
      status: 'ok',
      message: 'Agora credentials valid, token generation works',
      appIdPresent: true,
      certificatePresent: true,
      tokenGenerated: !!testToken,
      tokenPrefix: testToken.substring(0, 10) + '...',
      tokenFormat: '007',
      expires: `${TOKEN_EXPIRY_SECONDS}s (24 hours)`
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
