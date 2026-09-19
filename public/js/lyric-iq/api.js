/* Wordeth Lyric IQ — API client. Handles player identity (user JWT or signed guest token). */
(function () {
    'use strict';

    var GUEST_KEY = 'liq_guest_token';
    var base = (typeof apiUrl === 'function') ? apiUrl : function (p) { return p; };

    function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function safeSet(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* storage blocked */ } }
    function safeRemove(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

    function cookieToken() {
        try {
            var m = document.cookie.match(/(?:^|;\s*)wordeth_token=([^;]+)/);
            return m ? decodeURIComponent(m[1]) : null;
        } catch (e) { return null; }
    }
    /* Token from this origin's storage, else the shared .wordeth.com cookie (play.wordeth.com ↔ wordeth.com). */
    function authToken() {
        var t = safeGet('authToken');
        if (t) return t;
        var c = cookieToken();
        if (c) safeSet('authToken', c);
        return c;
    }
    function guestToken() { return safeGet(GUEST_KEY); }

    function headers(json) {
        var h = {};
        if (json) h['Content-Type'] = 'application/json';
        var auth = authToken();
        if (auth) h.Authorization = 'Bearer ' + auth;
        var guest = guestToken();
        if (guest) h['X-Guest-Token'] = guest;
        return h;
    }

    function ApiError(status, code, message, details) {
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.message = message;
        this.details = details;
    }
    ApiError.prototype = Object.create(Error.prototype);

    function request(method, path, body, opts) {
        opts = opts || {};
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeoutMs || 12000) : null;
        return fetch(base(path), {
            method: method,
            headers: headers(!!body),
            body: body ? JSON.stringify(body) : undefined,
            signal: controller ? controller.signal : undefined,
            credentials: 'same-origin'
        }).then(function (res) {
            if (timer) clearTimeout(timer);
            return res.text().then(function (text) {
                var data = null;
                try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
                if (!res.ok) {
                    var err = (data && data.error) || {};
                    throw new ApiError(res.status, err.code || 'HTTP_' + res.status, err.message || 'Something went wrong.', err.details);
                }
                if (data && data.guestToken && !authToken()) safeSet(GUEST_KEY, data.guestToken);
                return data;
            });
        }).catch(function (err) {
            if (timer) clearTimeout(timer);
            if (err instanceof ApiError) throw err;
            if (err && err.name === 'AbortError') throw new ApiError(0, 'TIMEOUT', 'That took too long. Check your connection and try again.');
            throw new ApiError(0, 'NETWORK', 'You look offline. Reconnect and try again.');
        });
    }

    var api = {
        ApiError: ApiError,
        hasAuth: function () { return !!authToken(); },
        hasGuest: function () { return !!guestToken(); },
        clearGuest: function () { safeRemove(GUEST_KEY); },
        config: function () { return request('GET', '/api/game/config'); },
        startSession: function (gameMode, category, challengeCode, artist) {
            var body = { gameMode: gameMode, category: category || undefined, challengeCode: challengeCode || undefined };
            if (artist && (artist.key || artist.providerArtistId)) body.artist = { key: artist.key || undefined, name: artist.name || undefined, providerArtistId: artist.providerArtistId || undefined };
            return request('POST', '/api/game/sessions', body, { timeoutMs: 25000 });
        },
        artists: function (q) { return request('GET', '/api/game/artists?q=' + encodeURIComponent(q), null, { timeoutMs: 10000 }); },
        artistBoard: function (key) { return request('GET', '/api/leaderboards/artist/' + encodeURIComponent(key)); },
        question: function (sessionId) { return request('GET', '/api/game/sessions/' + sessionId + '/question'); },
        shown: function (sessionId, questionId) { return request('POST', '/api/game/sessions/' + sessionId + '/questions/' + questionId + '/shown', {}, { timeoutMs: 6000 }); },
        answer: function (sessionId, payload) { return request('POST', '/api/game/sessions/' + sessionId + '/answer', payload, { timeoutMs: 15000 }); },
        results: function (sessionId) { return request('GET', '/api/game/sessions/' + sessionId + '/results'); },
        abandon: function (sessionId) { return request('POST', '/api/game/sessions/' + sessionId + '/abandon', {}); },
        daily: function () { return request('GET', '/api/daily'); },
        startDaily: function () { return request('POST', '/api/daily/start', {}); },
        profile: function () { return request('GET', '/api/profile/me'); },
        claimGuest: function (token) { return request('POST', '/api/profile/claim-guest', { guestToken: token }); },
        leaderboard: function (board) { return request('GET', '/api/leaderboards/' + board); },
        /** Fire-and-forget analytics into the existing usage pipeline. */
        track: function (eventType, props) {
            try {
                var payload = JSON.stringify({ eventType: eventType, segment: 'lyriciq', metadata: { page: 'lyric-iq', genre: props && props.game_mode, extra: props || {} } });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(base('/api/analytics/track'), new Blob([payload], { type: 'application/json' }));
                } else {
                    fetch(base('/api/analytics/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(function () {});
                }
            } catch (e) { /* analytics must never break play */ }
        },
        /** Merge a guest history into the signed-in account once. */
        claimIfNeeded: function () {
            var guest = guestToken();
            if (!authToken() || !guest) return Promise.resolve(false);
            return api.claimGuest(guest).then(function () { safeRemove(GUEST_KEY); return true; }).catch(function (err) {
                if (err.status === 400 || err.status === 403) safeRemove(GUEST_KEY);
                return false;
            });
        }
    };

    window.LiqApi = api;
})();
