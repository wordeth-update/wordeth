const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;
const ROOM_KEY_PREFIX = 'wordeth:room:';
const ROOMS_INDEX_KEY = 'wordeth:rooms';

let redis = null;
let isConnected = false;

function getClient() {
  if (redis) return redis;
  if (!REDIS_URL) {
    console.warn('[Redis] No REDIS_URL configured — room persistence disabled');
    return null;
  }

  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 200, 5000);
    },
    reconnectOnError(err) {
      return err.message.includes('READONLY');
    },
    lazyConnect: false,
    connectTimeout: 10000,
  });

  redis.on('connect', () => {
    isConnected = true;
    console.log('[Redis] Connected');
  });

  redis.on('error', (err) => {
    console.error('[Redis] Error:', err.message);
  });

  redis.on('close', () => {
    isConnected = false;
    console.log('[Redis] Connection closed');
  });

  return redis;
}

function roomKey(roomId) {
  return `${ROOM_KEY_PREFIX}${roomId}`;
}

function serializeRoom(room) {
  return JSON.stringify({
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    creatorUserId: room.creatorUserId,
    karaokeEnabled: room.karaokeEnabled,
    videoMode: room.videoMode || 'off',
    isLocked: room.isLocked,
    stageAccess: room.stageAccess || 'invite-only',
    tokenPrice: room.tokenPrice || 0,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity || room.createdAt || Date.now(),
    participants: Array.from(room.participants.values()),
    activeVideos: Array.from(room.activeVideos || []),
    participantHistory: room.participantHistory ? Array.from(room.participantHistory) : [],
    peakParticipants: room.peakParticipants || 0,
    genre: room.genre || '',
  });
}

function deserializeRoom(json) {
  const data = JSON.parse(json);
  const participantsMap = new Map();
  if (data.participants) {
    for (const p of data.participants) {
      participantsMap.set(p.socketId, p);
    }
  }
  return {
    id: data.id,
    name: data.name,
    hostId: data.hostId,
    creatorUserId: data.creatorUserId,
    participants: participantsMap,
    karaokeEnabled: data.karaokeEnabled || false,
    videoMode: data.videoMode || 'off',
    activeVideos: new Set(data.activeVideos || []),
    isLocked: data.isLocked || false,
    stageAccess: data.stageAccess || 'invite-only',
    tokenPrice: data.tokenPrice || 0,
    createdAt: data.createdAt || Date.now(),
    lastActivity: data.lastActivity || data.createdAt || Date.now(),
    participantHistory: new Set(data.participantHistory || []),
    peakParticipants: data.peakParticipants || 0,
    genre: data.genre || '',
  };
}

async function saveRoom(roomId, room) {
  const client = getClient();
  if (!client) return;
  if (!isConnected) {
    const connected = await waitForConnection(3000);
    if (!connected) return;
  }
  try {
    const pipeline = client.pipeline();
    pipeline.set(roomKey(roomId), serializeRoom(room), 'EX', 86400);
    pipeline.sadd(ROOMS_INDEX_KEY, roomId);
    const results = await Promise.race([
      pipeline.exec(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Redis save timeout')), 5000))
    ]);
    const hasError = results.some(([err]) => err);
    if (hasError) {
      console.error('[Redis] saveRoom partial failure for', roomId, results);
    } else {
      console.log(`[Redis] Room saved: ${roomId} (${room.name || 'unnamed'}, ${room.participants.size} participants)`);
    }
  } catch (err) {
    console.error('[Redis] saveRoom error:', err.message);
  }
}

async function deleteRoom(roomId) {
  const client = getClient();
  if (!client || !isConnected) return;
  try {
    const pipeline = client.pipeline();
    pipeline.del(roomKey(roomId));
    pipeline.srem(ROOMS_INDEX_KEY, roomId);
    await pipeline.exec();
  } catch (err) {
    console.error('[Redis] deleteRoom error:', err.message);
  }
}

async function waitForConnection(timeoutMs = 5000) {
  const client = getClient();
  if (!client) return false;
  if (isConnected) return true;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    client.once('connect', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function loadAllRooms() {
  const client = getClient();
  if (!client) return new Map();
  if (!isConnected) {
    const connected = await waitForConnection(5000);
    if (!connected) {
      console.warn('[Redis] Could not connect in time — skipping room restore');
      return new Map();
    }
  }
  try {
    const roomIds = await Promise.race([
      client.smembers(ROOMS_INDEX_KEY),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Redis smembers timeout')), 5000))
    ]);
    if (!roomIds || roomIds.length === 0) return new Map();

    const pipeline = client.pipeline();
    for (const id of roomIds) {
      pipeline.get(roomKey(id));
    }
    const results = await Promise.race([
      pipeline.exec(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Redis pipeline timeout')), 5000))
    ]);

    const rooms = new Map();
    const staleIds = [];

    for (let i = 0; i < roomIds.length; i++) {
      const [err, json] = results[i];
      if (err || !json) {
        staleIds.push(roomIds[i]);
        continue;
      }
      try {
        const room = deserializeRoom(json);
        rooms.set(roomIds[i], room);
      } catch (parseErr) {
        console.error(`[Redis] Failed to parse room ${roomIds[i]}:`, parseErr.message);
        staleIds.push(roomIds[i]);
      }
    }

    if (staleIds.length > 0) {
      const cleanup = client.pipeline();
      for (const id of staleIds) {
        cleanup.del(roomKey(id));
        cleanup.srem(ROOMS_INDEX_KEY, id);
      }
      await cleanup.exec();
    }

    console.log(`[Redis] Restored ${rooms.size} room(s) from Redis`);
    return rooms;
  } catch (err) {
    console.error('[Redis] loadAllRooms error:', err.message);
    return new Map();
  }
}

async function loadRoom(roomId) {
  const client = getClient();
  if (!client) {
    console.warn(`[Redis] loadRoom: no client available for ${roomId}`);
    return null;
  }
  if (!isConnected) {
    console.log(`[Redis] loadRoom: waiting for connection to load ${roomId}...`);
    const connected = await waitForConnection(5000);
    if (!connected) {
      console.warn(`[Redis] loadRoom: connection timeout for ${roomId}`);
      return null;
    }
  }
  try {
    const json = await client.get(roomKey(roomId));
    if (!json) {
      console.log(`[Redis] loadRoom: no data found for ${roomId}`);
      return null;
    }
    console.log(`[Redis] loadRoom: found room ${roomId}`);
    return deserializeRoom(json);
  } catch (err) {
    console.error(`[Redis] loadRoom error for ${roomId}:`, err.message);
    return null;
  }
}

module.exports = {
  getClient,
  saveRoom,
  deleteRoom,
  loadAllRooms,
  loadRoom,
};
