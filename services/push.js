/**
 * Push notifications to the native app, through Expo's push service.
 *
 * The app registers an Expo push token per device (POST /api/user/push-token).
 * Expo fronts APNs and FCM, so the server talks to one endpoint with no
 * certificates of its own. Sending is fire-and-forget: a notification is
 * already stored in Mongo before this runs, so a failed push loses nothing
 * the app cannot fetch later. Tokens Expo reports as DeviceNotRegistered
 * are removed so a reinstalled phone stops accumulating dead entries.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function isExpoToken(token) {
    return typeof token === 'string' && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

/** Title and body for each notification type the model allows. */
function describe(n) {
    const who = n.fromUserName || 'Someone';
    const room = n.roomName || 'a room';
    switch (n.type) {
        case 'room_invite': return { title: `${who} invited you`, body: `Join "${room}" on Verses` };
        case 'room_live': return { title: `${who} is live`, body: room };
        case 'follower_created_room': return { title: `${who} opened a room`, body: room };
        case 'follower_joined_room': return { title: `${who} joined a room`, body: room };
        case 'new_follower': return { title: 'New follower', body: `${who} followed you` };
        case 'collab_invite': return { title: `${who} wants to collab`, body: room };
        case 'collab_response': return { title: `${who} answered your collab`, body: room };
        case 'room_nudge_5min': return { title: 'Starting in 5 minutes', body: room };
        case 'room_nudge_start': return { title: 'Starting now', body: room };
        case 'wildcard_peek_available': return { title: 'Your Wildcard is ready', body: 'Peek into any paid room' };
        default: return null;
    }
}

async function sendToTokens(tokens, message) {
    const valid = tokens.filter(isExpoToken);
    if (valid.length === 0) return [];
    const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(valid.map(to => ({ to, sound: 'default', ...message }))),
    });
    if (!res.ok) throw new Error(`Expo push responded ${res.status}`);
    const { data } = await res.json();
    const dead = [];
    (data || []).forEach((ticket, i) => {
        if (ticket && ticket.status === 'error' && ticket.details && ticket.details.error === 'DeviceNotRegistered') {
            dead.push(valid[i]);
        }
    });
    return dead;
}

/** Sends the stored notification to every device of its recipient. */
async function pushNotification(notification) {
    const text = describe(notification);
    if (!text) return;
    const User = require('../models/User');
    const user = await User.findById(notification.userId).select('pushTokens').lean();
    const tokens = (user && user.pushTokens || []).map(t => t.token);
    if (tokens.length === 0) return;
    const dead = await sendToTokens(tokens, {
        ...text,
        data: { type: notification.type, roomId: notification.roomId || null, notificationId: String(notification._id) },
    });
    if (dead.length > 0) {
        await User.updateOne({ _id: notification.userId }, { $pull: { pushTokens: { token: { $in: dead } } } });
    }
}

module.exports = { pushNotification, isExpoToken, describe, sendToTokens };
