// Audio Rooms JavaScript - Twitter Spaces / Clubhouse style functionality

class AudioRoomsManager {
    constructor() {
        this.currentRoom = null;
        this.localStream = null;
        this.agoraClient = null;
        this.agoraLocalAudioTrack = null;
        this.agoraMusicAudioTrack = null;
        this.agoraLocalVideoTrack = null;
        this.agoraUid = null;
        this.agoraAppId = null;
        this.agoraRemoteUsers = new Map();
        this.socket = null;
        this.isAudioMuted = false;
        this.isSpeaker = false;
        this.handRaised = false;
        this.chatVisible = true;
        this.chatMessages = [];
        this.replays = [];
        this.replayData = [];
        this.replayPage = 1;
        this.replayGenre = 'all';
        this.replaySort = 'recent';
        this.replayHasMore = false;
        this._selectedRating = 0;
        this._selectedTags = [];
        this._lastLeftRoomId = null;
        this.currentFilterTab = 'all';
        
        // New features state
        this.isRoomLocked = false;
        this.currentAudioFilter = 'normal';
        this.audioContext = null;
        this.audioFilterNodes = {};
        this.karaokeActive = false;
        this.karaokeInterval = null;
        this.currentLyricIndex = 0;
        this.karaokeLyrics = [];
        
        // YouTube player state
        this.youtubeReady = false;
        this.ytPlayer = null;
        this.currentVideoId = null;
        this.videoQueue = [];
        this.videoQueueIndex = 0;
        this.scrollSpeed = 1.0;
        this.baseScrollInterval = 3000;
        this.previewMode = false;
        this.karaokeCanvas = null;
        this.karaokeCanvasCtx = null;
        this.karaokeEnabled = false;
        this.isRoomHost = false;
        this.pendingRequests = [];
        
        
        // Karaoke video state
        this.karaokeVideoStream = null;
        this.karaokeVideoActive = false;
        this.stageAccess = 'invite-only';
        
        this._sfx = {
            enterRoom: new Audio('/sounds/wordeth_door_close.mp3'),
            leaveRoom: new Audio('/sounds/wordeth_enter_room.mp3'),
            onStage: new Audio('/sounds/wordeth_onstage_notification.mp3')
        };
        Object.values(this._sfx).forEach(a => { a.preload = 'auto'; a.volume = 0.5; });
        
        // Video grid state
        this.videoMode = 'off';
        this.localVideoStream = null;
        this.isVideoActive = false;
        this.activeVideoFeeds = new Map();
        this.MAX_VIDEO_TILES = 6;
        
        // AR filter engine
        this.arFilterEngine = null;
        this.arFilterLoading = false;
        this._activeCanvasFilter = null;
        
        // Permission tracking
        this.pendingPermissionRequestId = null;
        this.karaokeStartNotified = false;
        
        this.micTempoEnabled = false;
        this.micAnalyser = null;
        this.micTempoRAF = null;
        this.micEnergySmoothed = 0;
        this.silenceStartTime = 0;
        this.manualSpeedOverride = false;
        this.manualOverrideTimeout = null;
        
        this.audioMixEnabled = false;
        this.mixedStream = null;
        this.youtubeAudioSource = null;
        this.musicAudioSource = null;
        this.musicAudioElement = null;
        this.musicGainNode = null;
        this.micAudioSource = null;
        this.mixDestination = null;
        this._wakeLock = null;
        this._silentAudioTimer = null;

        this._agoraJoinLock = null;
        this._serverReady = null;
        this._invite = { status: 'idle', roomId: null, retries: 0, maxRetries: 5 };
        this._initComplete = false;
        this.isGuest = !localStorage.getItem('authToken');
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingCanvas = null;
        this.recordingCtx = null;
        this.recordingRAF = null;
        this.recordingStartTime = 0;
        this.currentVideoFilter = 'none';
        
        // Deep link: host "go live" straight from their profile card
        const openScheduledId = new URLSearchParams(window.location.search).get('openScheduled');
        if (openScheduledId && localStorage.getItem('authToken')) {
            setTimeout(() => this.openScheduledRoom(openScheduledId), 800);
        }

        const urlRoom = this._parseRoomFromUrl();
        if (urlRoom) {
            this.queueInvite(urlRoom);
            this._showJoiningOverlay();
            this._inviteHardTimeout = setTimeout(async () => {
                if (this._invite.status === 'joining' || this._invite.status === 'pending') {
                    console.warn('Invite: hard timeout reached (30s)');
                    const socketState = `socket: ${this.socket?.connected ? 'connected' : (this.lobbySocket?.connected ? 'lobby-connected' : 'disconnected')}, id: ${this.socket?.id || this.lobbySocket?.id || 'none'}`;
                    let debugInfo = socketState;
                    try {
                        const debugResp = await fetch(apiUrl(`/api/rooms/debug/${urlRoom}`));
                        const debugData = await debugResp.json();
                        debugInfo += ` | room: mem=${debugData.inMemory}, redis=${debugData.inRedis}, sockets=${debugData.connectedSockets}, uptime=${debugData.serverUptime}s`;
                    } catch (e) {
                        debugInfo += ` | debug endpoint unreachable: ${e.message}`;
                    }
                    this._lastJoinDebug = debugInfo;
                    this._invite.status = 'failed';
                    this._invite.roomId = null;
                    this._showRoomEndedScreen('Could not connect to the room. The server may be unreachable.');
                }
            }, 30000);
        }
        
        this.initYouTubePlayer();
        
        try {
            this.initializeElements();
            this.setupEventListeners();
            this.setupVisibilityHandler();
            this._setupTokenListeners();
            this.loadTokenBalance();
        } catch (e) {
            console.error('[Verses] Error during element/event setup:', e);
        }
        this._init();
    }

    _el(tag, attrs, ...children) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'className') el.className = v;
                else if (k === 'textContent') el.textContent = v;
                else if (k === 'cssText') el.style.cssText = v;
                else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
                else el.setAttribute(k, v);
            }
        }
        for (const child of children) {
            if (typeof child === 'string') el.appendChild(document.createTextNode(child));
            else if (child) el.appendChild(child);
        }
        return el;
    }

    _icon(cls) {
        const i = document.createElement('i');
        i.className = cls;
        return i;
    }

    _text(str) {
        return document.createTextNode(str);
    }

    _clearEl(el) {
        if (el) el.replaceChildren();
    }

    _setBtn(el, iconClass, label) {
        if (!el) return;
        el.replaceChildren();
        el.appendChild(this._icon(iconClass));
        if (label) el.appendChild(this._text(' ' + label));
    }

    _buildAvatar(container, avatarUrl, name, initial, bgColor) {
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = name || '';
            img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
            img.addEventListener('error', () => {
                const fallback = document.createElement('div');
                fallback.className = 'avatar-initial';
                fallback.style.cssText = 'width:100%;height:100%;border-radius:50%;background:' + (bgColor || 'var(--purple,#8a2be2)') + ';display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:white;';
                fallback.textContent = initial || '?';
                img.replaceWith(fallback);
            });
            container.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'avatar-initial';
            fallback.style.cssText = 'width:100%;height:100%;border-radius:50%;background:' + (bgColor || 'var(--purple,#8a2be2)') + ';display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:white;';
            fallback.textContent = initial || '?';
            container.appendChild(fallback);
        }
    }

    _buildListenerAvatar(container, avatarUrl, name, initial, bgColor) {
        if (avatarUrl) {
            const img = document.createElement('img');
            img.src = avatarUrl;
            img.alt = name || '';
            img.style.cssText = 'width:40px;height:40px;border-radius:50%;object-fit:cover;';
            img.addEventListener('error', () => {
                const fallback = document.createElement('div');
                fallback.className = 'avatar-initial';
                fallback.style.cssText = 'width:40px;height:40px;border-radius:50%;background:' + (bgColor || 'var(--purple,#8a2be2)') + ';display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;';
                fallback.textContent = initial || '?';
                img.replaceWith(fallback);
            });
            container.appendChild(img);
        } else {
            const fallback = document.createElement('div');
            fallback.className = 'avatar-initial';
            fallback.style.cssText = 'width:40px;height:40px;border-radius:50%;background:' + (bgColor || 'var(--purple,#8a2be2)') + ';display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;';
            fallback.textContent = initial || '?';
            container.appendChild(fallback);
        }
    }

    _setBtnWithSpan(el, iconClass, label) {
        if (!el) return;
        el.replaceChildren();
        el.appendChild(this._icon(iconClass));
        const span = document.createElement('span');
        span.className = 'ctrl-label';
        span.textContent = label;
        el.appendChild(span);
    }

    _parseRoomFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        let roomId = urlParams.get('room');
        if (!roomId) {
            const fullPath = window.location.pathname + window.location.search;
            const pathMatch = fullPath.match(/\/room\/([^/?&#\s]+)/);
            if (pathMatch) {
                roomId = decodeURIComponent(pathMatch[1]);
            }
        }
        if (roomId) {
            roomId = roomId.split('?')[0].split('&')[0].split('#')[0].trim();
        }
        this._inviteMeta = {
            name: urlParams.get('name') || null,
            host: urlParams.get('host') || null
        };
        if (!roomId) {
            const pending = localStorage.getItem('wordeth_pending_room');
            const pendingTs = parseInt(localStorage.getItem('wordeth_pending_room_ts') || '0', 10);
            if (pending && localStorage.getItem('authToken') && (Date.now() - pendingTs < 60000)) {
                roomId = pending;
            }
            localStorage.removeItem('wordeth_pending_room');
            localStorage.removeItem('wordeth_pending_room_ts');
        }
        return roomId || null;
    }

    _showJoiningOverlay() {
        const doShow = () => {
            const banner = document.getElementById('cookie-consent-banner');
            if (banner) {
                banner.style.display = 'none';
                setTimeout(() => { banner.style.display = ''; }, 15000);
            }
            const roomSel = document.getElementById('room-selection');
            if (roomSel) roomSel.style.display = 'none';

            if (!document.getElementById('invite-joining-msg')) {
                const meta = this._inviteMeta || {};
                const roomLabel = meta.name || '';
                const hostLabel = meta.host || '';
                const joiningMsg = document.createElement('div');
                joiningMsg.id = 'invite-joining-msg';
                joiningMsg.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;min-height:60vh;color:#fff;font-family:Inter,sans-serif;text-align:center;padding:20px;';
                const spinner = this._el('div', {id: 'invite-spinner', cssText: 'width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#a855f7;border-radius:50%;animation:spin 0.8s linear infinite;'});
                joiningMsg.appendChild(spinner);
                if (roomLabel) {
                    joiningMsg.appendChild(this._el('div', {cssText: 'font-size:20px;font-weight:600;color:#d8b4fe;', textContent: 'Joining \u201C' + roomLabel + '\u201D'}));
                } else {
                    joiningMsg.appendChild(this._el('div', {cssText: 'font-size:18px;font-weight:500;', textContent: 'Joining room\u2026'}));
                }
                if (hostLabel) {
                    joiningMsg.appendChild(this._el('div', {cssText: 'font-size:14px;color:rgba(255,255,255,0.6);', textContent: 'Hosted by ' + hostLabel}));
                }
                joiningMsg.appendChild(this._el('div', {id: 'invite-status', cssText: 'font-size:13px;color:rgba(255,255,255,0.4);margin-top:4px;', textContent: 'Connecting\u2026'}));
                if (!document.getElementById('invite-spin-style')) {
                    const styleEl = document.createElement('style');
                    styleEl.id = 'invite-spin-style';
                    styleEl.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
                    document.head.appendChild(styleEl);
                }
                const mainEl = document.querySelector('main');
                if (mainEl) mainEl.prepend(joiningMsg);
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', doShow);
        } else {
            doShow();
        }
    }

    _updateJoiningStatus(text) {
        const el = document.getElementById('invite-status');
        if (el) el.textContent = text;
    }

    async _init() {
        try {
            if (this._invite.status === 'pending') {
                this._initComplete = true;
                this._updateJoiningStatus('Connecting\u2026');
                await this.connectToServer();
                this._updateJoiningStatus('Joining room\u2026');
                this._processInvite();
                this.loadActiveRooms().catch(() => {});
                this.loadReplays();
                return;
            }
            await this.connectToServer();
            await this.loadActiveRooms();
            this.loadReplays();
            this.initRoomSearch();
        } catch (e) {
            console.error('Initialization error:', e);
        } finally {
            this._initComplete = true;
            if (this._invite.status === 'pending') {
                this._processInvite();
            }
        }
    }

    queueInvite(roomId) {
        if (!roomId) return;
        if (this.currentRoom) {
            console.log('Invite: already in a room, ignoring invite for', roomId);
            return;
        }
        if (this._invite.status === 'joining' || this._invite.status === 'pending') {
            console.log('Invite: already processing', this._invite.roomId, '- ignoring new invite for', roomId);
            return;
        }
        console.log('Invite: queued room', roomId);
        this._invite = { status: 'pending', roomId, retries: 0, maxRetries: 5 };
        if (this._initComplete && this.lobbySocket?.connected) {
            this._processInvite();
        }
    }

    async _processInvite() {
        const inv = this._invite;
        if (inv.status !== 'pending' || !inv.roomId) return;
        if (this.currentRoom) { inv.status = 'idle'; return; }
        inv.status = 'joining';
        console.log('Invite: processing room', inv.roomId, 'attempt', inv.retries + 1);

        try {
            if (this.currentRoom) { inv.status = 'idle'; return; }

            // Paid room? Show the price and get confirmation BEFORE joining
            // (the server charges at join time). Skipped once confirmed.
            if (!inv.priceCleared) {
                const gate = await this._checkEntryPrice(inv.roomId);
                if (gate === 'gated') {
                    inv.status = 'idle';
                    return; // token gate modal takes over; confirm re-enters
                }
                inv.priceCleared = true;
            }

            this._updateJoiningStatus('Joining room\u2026');
            await this.joinRoom(inv.roomId, false, true);
        } catch (e) {
            console.error('Invite: join failed:', e);
            this._failInvite('Could not connect to the room. Please try joining from the list.');
        }
    }

    // Returns 'free' (join right away) or 'gated' (token gate modal shown).
    // Fails CLOSED: if we cannot learn the price, we throw so the invite
    // retry logic kicks in — a user is never charged without seeing a price.
    async _checkEntryPrice(roomId) {
        const token = localStorage.getItem('authToken');
        const res = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(roomId)}/info`), {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.status === 404) return 'free'; // room gone — join will surface the real error
        if (!res.ok) throw new Error(`room info lookup failed (${res.status})`);
        const info = await res.json();
        if (!info.tokenPrice || info.freeEntry) return 'free';
        // Hide the joining overlay so the gate modal is usable
        document.getElementById('invite-joining-msg')?.remove();
        if (this.roomSelection) this.roomSelection.style.display = '';
        if (this._inviteHardTimeout) { clearTimeout(this._inviteHardTimeout); this._inviteHardTimeout = null; }
        this._showTokenGate(roomId, info.tokenPrice);
        return 'gated';
    }

    _failInvite(message, permanent = false) {
        const inv = this._invite;
        inv.retries++;
        if (this._inviteHardTimeout) {
            clearTimeout(this._inviteHardTimeout);
            this._inviteHardTimeout = null;
        }
        if (this.currentRoom && !this._joinConfirmed) {
            this.currentRoom = null;
            this._pendingJoinRoom = null;
        }
        const hardPermanent = permanent && !message?.includes('no longer live');
        const isPermanent = hardPermanent ||
            (message && (message.includes('expired') || message.includes('not found')));
        if (!isPermanent && inv.retries < inv.maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, inv.retries - 1), 4000);
            console.log(`Invite: retrying in ${delay}ms, attempt ${inv.retries + 1} of ${inv.maxRetries}`);
            this._updateJoiningStatus(`Connecting to room\u2026 (attempt ${inv.retries + 1})`);
            inv.status = 'pending';
            setTimeout(() => this._processInvite(), delay);
        } else {
            console.warn('Invite: giving up -', isPermanent ? 'room gone' : `max retries (${inv.retries})`);
            inv.status = 'failed';
            // Keep the room id around so the ended screen can offer "Try Again"
            // (only when the failure was transient, not when the room is truly gone)
            inv.lastRoomId = isPermanent ? null : inv.roomId;
            inv.roomId = null;
            inv.retries = 0;
            this._showRoomEndedScreen(message);
        }
    }

    _showRoomEndedScreen(message) {
        const inviteSpinner = document.getElementById('invite-joining-msg');
        if (inviteSpinner) inviteSpinner.remove();
        if (this.roomSelection) this.roomSelection.style.display = 'none';
        this.audioRoom?.classList.add('hidden');
        document.body.classList.remove('in-room');
        const pageFooter = document.querySelector('footer');
        if (pageFooter) pageFooter.style.display = '';

        this.currentRoom = null;
        this._pendingJoinRoom = null;
        this._joinConfirmed = false;
        this._pendingJoinIsInvite = false;
        this._pendingJoinIsHost = false;
        this.isRoomHost = false;
        this.isSpeaker = false;
        this.isAudioMuted = false;
        this._releaseWakeLock();

        const existing = document.getElementById('room-ended-screen');
        if (existing) existing.remove();

        const meta = this._inviteMeta || {};
        const roomLabel = meta.name || '';
        const hostLabel = meta.host || '';

        const screen = document.createElement('div');
        screen.id = 'room-ended-screen';
        screen.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;min-height:60vh;color:#fff;font-family:Inter,sans-serif;text-align:center;padding:40px 20px;';
        const micIcon = this._icon('fas fa-microphone-slash');
        micIcon.style.color = '#a855f7';
        screen.appendChild(this._el('div', {cssText: 'font-size:48px;margin-bottom:8px;'}, micIcon));
        if (roomLabel) {
            screen.appendChild(this._el('div', {cssText: 'font-size:22px;font-weight:600;color:#d8b4fe;', textContent: '\u201C' + roomLabel + '\u201D'}));
        }
        screen.appendChild(this._el('div', {cssText: 'font-size:18px;font-weight:500;color:rgba(255,255,255,0.8);', textContent: message || 'This room has ended.'}));
        if (hostLabel) {
            screen.appendChild(this._el('div', {cssText: 'font-size:14px;color:rgba(255,255,255,0.5);', textContent: 'Was hosted by ' + hostLabel}));
        }
        const retryRoomId = this._invite?.lastRoomId || null;
        if (retryRoomId) {
            const retryBtn = this._el('a', {href: '/verses.html?room=' + encodeURIComponent(retryRoomId), cssText: 'margin-top:16px;display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;transition:transform 0.15s;'},
                this._icon('fas fa-redo'), ' Try Again');
            screen.appendChild(retryBtn);
        }
        const browseLink = this._el('a', {href: '/verses.html', cssText: 'margin-top:' + (retryRoomId ? '4px' : '16px') + ';display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:' + (retryRoomId ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#7c3aed,#a855f7)') + ';color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;transition:transform 0.15s;' + (retryRoomId ? 'border:1px solid rgba(255,255,255,0.15);' : '')},
            this._icon('fas fa-headphones'), ' Browse Active Rooms');
        screen.appendChild(browseLink);
        if (this._lastJoinDebug) {
            screen.appendChild(this._el('div', {cssText: 'margin-top:24px;padding:12px 16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:11px;color:rgba(255,255,255,0.4);font-family:monospace;word-break:break-all;max-width:90vw;text-align:left;', textContent: 'Debug: ' + this._lastJoinDebug}));
            this._lastJoinDebug = null;
        }

        const mainEl = document.querySelector('main');
        if (mainEl) mainEl.prepend(screen);

        this._invite = { status: 'idle', roomId: null, retries: 0, maxRetries: 5 };
        localStorage.removeItem('wordeth_pending_room');
        localStorage.removeItem('wordeth_pending_room_ts');
        if (window.location.pathname.startsWith('/room/')) {
            window.history.replaceState({}, '', window.location.pathname);
        }
    }
    
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._handleAppHidden();
            } else {
                this._handleAppVisible();
            }
        });
    }

    async _requestWakeLock() {
        if (this._wakeLock) return;
        try {
            if ('wakeLock' in navigator) {
                this._wakeLock = await navigator.wakeLock.request('screen');
                this._wakeLock.addEventListener('release', () => {
                    this._wakeLock = null;
                    if (this.isInRoom() && !document.hidden) {
                        this._requestWakeLock();
                    }
                });
            }
        } catch (e) {}
    }

    _releaseWakeLock() {
        if (this._wakeLock) {
            this._wakeLock.release().catch(() => {});
            this._wakeLock = null;
        }
    }

    _startSilentAudioKeepAlive() {
        if (this._silentAudioTimer) return;
        this._silentAudioTimer = setInterval(() => {
            if (!this.isInRoom()) return;
            this._resumeAllAudioContexts();
        }, 3000);
    }

    _resumeAllAudioContexts() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
        try {
            if (window.AgoraRTC && window.AgoraRTC._audioContext && window.AgoraRTC._audioContext.state === 'suspended') {
                window.AgoraRTC._audioContext.resume().catch(() => {});
            }
        } catch (_) {}
        this.agoraRemoteUsers.forEach((user) => {
            if (user.audioTrack) {
                try {
                    const track = user.audioTrack;
                    if (track._source?.context?.state === 'suspended') {
                        track._source.context.resume().catch(() => {});
                    }
                    if (track._mediaStreamTrack && !track._mediaStreamTrack.enabled) {
                        track._mediaStreamTrack.enabled = true;
                    }
                    try { track.play(); } catch (_) {}
                } catch (_) {}
            }
        });
    }

    _setupRoomInteractionListener() {
        if (this._roomInteractionBound) return;
        this._roomInteractionBound = true;
        const handler = () => {
            this._resumeAllAudioContexts();
            const banner = document.getElementById('agora-autoplay-banner');
            if (banner) {
                this.agoraRemoteUsers.forEach(user => {
                    if (user.audioTrack) {
                        try { user.audioTrack.play(); } catch (_) {}
                    }
                });
                banner.remove();
            }
        };
        document.addEventListener('click', handler, { capture: true });
        document.addEventListener('touchstart', handler, { capture: true });
        this._roomInteractionCleanup = () => {
            document.removeEventListener('click', handler, { capture: true });
            document.removeEventListener('touchstart', handler, { capture: true });
            this._roomInteractionBound = false;
        };
    }

    _teardownRoomInteractionListener() {
        if (this._roomInteractionCleanup) {
            this._roomInteractionCleanup();
            this._roomInteractionCleanup = null;
        }
    }

    _stopSilentAudioKeepAlive() {
        if (this._silentAudioTimer) {
            clearInterval(this._silentAudioTimer);
            this._silentAudioTimer = null;
        }
    }

    _scheduleAudioHealthCheck() {
        this._stopAudioHealthCheck();
        this._audioHealthTimer = setTimeout(() => this._runAudioHealthCheck(), 3000);
    }

    _stopAudioHealthCheck() {
        if (this._audioHealthTimer) { clearTimeout(this._audioHealthTimer); this._audioHealthTimer = null; }
        if (this._audioHealthInterval) { clearInterval(this._audioHealthInterval); this._audioHealthInterval = null; }
    }

    _startSpeakingIndicator() {
        this._stopSpeakingIndicator();
        const THRESHOLD = 0.05;
        this._speakingInterval = setInterval(() => {
            if (!this.isInRoom() || !this.agoraClient) { this._stopSpeakingIndicator(); return; }

            const selfRing = document.querySelector('[data-participant-id="self"] .avatar-ring');
            if (selfRing) {
                let localVol = 0;
                if (this.agoraLocalAudioTrack && !this.isAudioMuted) {
                    localVol = this.agoraLocalAudioTrack.getVolumeLevel?.() ?? 0;
                }
                selfRing.classList.toggle('speaking', localVol > THRESHOLD);
            }

            for (const [key, user] of this.agoraRemoteUsers) {
                const vol = user.audioTrack?.getVolumeLevel?.() ?? 0;
                const socketId = this._findParticipantIdByAgoraUid(parseInt(key) || key);
                if (!socketId) continue;
                const ring = document.querySelector(`[data-participant-id="${socketId}"] .avatar-ring`);
                if (ring) ring.classList.toggle('speaking', vol > THRESHOLD);
            }
        }, 200);
    }

    _stopSpeakingIndicator() {
        if (this._speakingInterval) {
            clearInterval(this._speakingInterval);
            this._speakingInterval = null;
        }
        document.querySelectorAll('.avatar-ring.speaking').forEach(el => el.classList.remove('speaking'));
    }

    _startRecurringAudioHealthCheck() {
        this._stopAudioHealthCheck();
        this._runAudioHealthCheck();
        this._audioHealthInterval = setInterval(() => this._runAudioHealthCheck(), 8000);
    }

    async _runAudioHealthCheck() {
        if (!this.isInRoom() || !this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') return;
        this._resumeAllAudioContexts();
        const remoteUsers = this.agoraClient.remoteUsers || [];
        let silentCount = 0;
        for (const user of remoteUsers) {
            if (!user.hasAudio) continue;
            const key = String(user.uid);
            const existing = this.agoraRemoteUsers.get(key);
            if (!existing || !existing.audioTrack) {
                console.log('[AudioHealth] uid', user.uid, 'has audio but not subscribed — fixing');
                try {
                    await this.agoraClient.subscribe(user, 'audio');
                    if (user.audioTrack) {
                        user.audioTrack.setVolume(100);
                        user.audioTrack.play();
                        this.agoraRemoteUsers.set(key, user);
                        console.log('[AudioHealth] subscribed+playing uid', user.uid);
                    }
                } catch (e) {
                    console.warn('[AudioHealth] subscribe failed uid', user.uid, e.message);
                }
            } else if (existing.audioTrack) {
                const vol = existing.audioTrack.getVolumeLevel?.() ?? -1;
                if (vol === 0 || vol === -1) {
                    silentCount++;
                    try { existing.audioTrack.setVolume(100); existing.audioTrack.play(); } catch (_) {}
                }
            }
        }
        if (silentCount > 0) {
            console.warn('[AudioHealth]', silentCount, 'silent track(s) — showing tap banner');
            this._showAutoplayBanner?.();
        }
    }

    _handleAppHidden() {
        if (!this.isInRoom()) return;
        this._hiddenTimestamp = Date.now();
        if (this.audioContext && this.audioContext.state === 'running') {
            this._audioContextWasRunning = true;
        }
    }

    _handleAppVisible() {
        if (!this.isInRoom()) return;
        this._resumeAllAudioContexts();
        if (this.musicAudioElement && this.musicAudioElement.paused && this._audioContextWasRunning) {
            this.musicAudioElement.play().catch(() => {});
        }
        this._audioContextWasRunning = false;
        
        if (this.socket && !this.socket.connected) {
            this.socket.connect();
            this.socket.once('connect', () => {
                this._reconnectRoomMedia();
            });
        } else {
            this._reconnectRoomMedia();
        }
        this._requestWakeLock();
    }

    initializeElements() {
        // Main containers
        this.roomSelection = document.getElementById('room-selection');
        this.audioRoom = document.getElementById('audio-room');
        
        // Modals
        this.createRoomModal = document.getElementById('create-room-modal');
        this.createRoomForm = document.getElementById('create-room-form');
        this.addUsersModal = document.getElementById('add-users-modal');
        this.replayModal = document.getElementById('replay-modal');
        this.topicEditModal = document.getElementById('topic-edit-modal');
        this.topicEditForm = document.getElementById('topic-edit-form');
        
        // Audio elements (speakers stage and listeners)
        this.speakersStage = document.getElementById('speakers-stage');
        this.listenersGrid = document.getElementById('listeners-grid');
        
        // Chat elements
        this.chatSection = document.getElementById('chat-section');
        this.chatMessagesContainer = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendMessageBtn = document.getElementById('send-message');
        this.participantCount = document.getElementById('participant-count');
        
        // Control buttons
        this.createRoomBtn = document.getElementById('create-room');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.raiseHandBtn = document.getElementById('raise-hand');
        this.toggleChatBtn = document.getElementById('toggle-chat');
        this.shareMusicBtn = document.getElementById('share-music');
        this.leaveRoomBtn = document.getElementById('leave-room-btn');
        
        // Action buttons
        this.addUsersBtn = document.getElementById('add-users');
        this.replayBtn = document.getElementById('replay-btn');
        this.editTopicBtn = document.getElementById('edit-topic');
        
        // New feature elements
        this.lockRoomBtn = document.getElementById('lock-room-btn');
        this.audioFilterBtn = document.getElementById('audio-filter-btn');
        this.karaokeBtn = document.getElementById('karaoke-btn');
        this.audioFiltersModal = document.getElementById('audio-filters-modal');
        this.karaokeModal = document.getElementById('karaoke-modal');
        
    }

    setupEventListeners() {
        // Create room button
        this.createRoomBtn?.addEventListener('click', () => {
            this._primeSfx();
            this.showCreateRoomModal();
        });

        // Create room form submission
        this.createRoomForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });

        this._setupSchedulingUI();

        // Tip button (in-room)
        document.getElementById('tip-room-btn')?.addEventListener('click', () => this.sendTip());

        // Topic editing
        this.editTopicBtn?.addEventListener('click', () => {
            this.showTopicEditModal();
        });

        this.topicEditForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateTopic();
        });

        // Modal close buttons
        document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.hideAllModals();
            });
        });

        // View tabs (Live / Replays)
        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const view = tab.dataset.view;
                document.getElementById('live-view').style.display = view === 'live' ? '' : 'none';
                document.getElementById('replays-view').style.display = view === 'replays' ? '' : 'none';
                if (view === 'replays') this._fetchReplays(true);
            });
        });

        // Replay genre filters
        document.querySelectorAll('#replay-genre-filters .filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#replay-genre-filters .filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.replayGenre = tab.dataset.filter;
                this._fetchReplays(true);
            });
        });

        // Replay sort
        document.getElementById('replay-sort')?.addEventListener('change', (e) => {
            this.replaySort = e.target.value;
            this._fetchReplays(true);
        });

        // Load more replays
        document.getElementById('load-more-replays')?.addEventListener('click', () => {
            this.replayPage++;
            this._fetchReplays(false);
        });

        // Rating and boost listeners
        this._setupRatingListeners();
        this._setupBoostListeners();

        // Room controls
        this.toggleAudioBtn?.addEventListener('click', () => this.toggleAudio());
        this.raiseHandBtn?.addEventListener('click', () => this.toggleHandRaise());
        this.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this._initChatSwipeToDismiss();
        this.shareMusicBtn?.addEventListener('click', () => this.shareMusic());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());
        document.getElementById('join-stage-btn')?.addEventListener('click', () => this.joinStage());
        document.getElementById('stage-access-toggle')?.addEventListener('click', () => this.toggleStageAccess());

        // Action buttons
        this.addUsersBtn?.addEventListener('click', () => this.showAddUsersModal());
        this.replayBtn?.addEventListener('click', () => this.showReplayModal());
        document.getElementById('room-guide-btn')?.addEventListener('click', () => {
            window.open('verses-guide.html', '_blank');
        });
        
        document.getElementById('share-room-btn')?.addEventListener('click', () => this.shareRoom());
        document.getElementById('share-room-mobile-btn')?.addEventListener('click', () => this.shareRoom());
        // New feature event listeners
        this.lockRoomBtn?.addEventListener('click', () => this.toggleRoomLock());
        this.audioFilterBtn?.addEventListener('click', () => this.showAudioFiltersModal());
        this.karaokeBtn?.addEventListener('click', () => this.showKaraokeModal());
        
        // Karaoke permission toggle (host/moderator only)
        document.getElementById('karaoke-toggle-btn')?.addEventListener('click', () => this.toggleKaraokePermission());
        
        window.addEventListener('resize', () => {
            const isMobile = window.innerWidth <= 768;
            if (this.chatSection) {
                if (isMobile) {
                    this.chatVisible = this.chatSection.classList.contains('mobile-visible');
                } else {
                    this.chatSection.classList.remove('mobile-visible');
                    this.chatVisible = !this.chatSection.classList.contains('hidden');
                }
                this.toggleChatBtn?.classList.toggle('active', this.chatVisible);
            }
        });

        document.getElementById('share-photo-btn')?.addEventListener('click', () => {
            if (window.Capacitor) {
                this.showMobileShareModal();
            } else {
                document.getElementById('photo-input')?.click();
            }
        });
        document.getElementById('photo-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.shareImage(file);
            e.target.value = '';
        });
        
        // Video grid controls
        document.getElementById('video-toggle-btn')?.addEventListener('click', () => this.cycleVideoMode());
        document.getElementById('video-btn')?.addEventListener('click', () => this.toggleLocalVideo());
        document.getElementById('mute-all-btn')?.addEventListener('click', () => this.muteAllParticipants());
        document.getElementById('close-room-btn')?.addEventListener('click', () => this.closeRoom());

        this.setupMobileShareListeners();
        this.initHostPanel();
        this.initMusicSharing();
        
        // Karaoke scroll speed controls
        document.getElementById('karaoke-slower')?.addEventListener('click', () => this.adjustScrollSpeed(-0.25));
        document.getElementById('karaoke-faster')?.addEventListener('click', () => this.adjustScrollSpeed(0.25));

        // Karaoke video controls
        document.getElementById('karaoke-camera-toggle')?.addEventListener('click', () => this.toggleKaraokeCamera());
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.setVideoFilter(filter);
            });
        });
        document.querySelectorAll('.ar-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.arFilter;
                if (this.currentVideoFilter === filter) {
                    this.setVideoFilter('none');
                } else {
                    this.setVideoFilter(filter);
                }
            });
        });
        
        // Audio filter selection
        document.querySelectorAll('#audio-filters-modal .filter-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.applyAudioFilter(filter);
            });
        });
        
        // Karaoke search
        document.getElementById('karaoke-search-btn')?.addEventListener('click', () => this.searchKaraokeSongs());
        document.getElementById('karaoke-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchKaraokeSongs();
        });
        
        // YouTube embed controls
        document.getElementById('yt-embed-btn')?.addEventListener('click', () => this.embedYouTubeFromInput());
        document.getElementById('yt-url-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.embedYouTubeFromInput();
        });
        document.getElementById('yt-embed-close')?.addEventListener('click', () => this.closeYouTubeEmbed());
        
        // Karaoke controls
        document.getElementById('karaoke-play-pause')?.addEventListener('click', () => this.toggleKaraokePlayback());
        document.getElementById('karaoke-restart')?.addEventListener('click', () => this.restartKaraoke());
        document.getElementById('karaoke-new-song')?.addEventListener('click', () => this.newKaraokeSong());
        document.getElementById('karaoke-stop')?.addEventListener('click', () => this.stopKaraoke());
        document.getElementById('karaoke-record-btn')?.addEventListener('click', () => this.toggleRecording());

        // Chat functionality
        this.sendMessageBtn?.addEventListener('click', () => this.sendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // User search
        document.getElementById('search-users')?.addEventListener('click', () => {
            this.searchUsers();
        });

        document.getElementById('user-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchUsers();
            }
        });

        // Filter tabs
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterRooms(filter);
            });
        });

        // Refresh button
        document.querySelector('.refresh-btn')?.addEventListener('click', () => {
            this.refreshFriendsRooms();
        });

        document.addEventListener('click', (e) => {
            if (this._invite.status === 'joining') return;

            const replayPlayBtn = e.target.closest('.replay-play-btn');
            if (replayPlayBtn) {
                const replayId = replayPlayBtn.dataset.replayId;
                const tokenPrice = parseInt(replayPlayBtn.dataset.tokenPrice || '0', 10);
                if (replayId) this._playReplay(replayId, tokenPrice);
                return;
            }

            const boostBtn = e.target.closest('.boost-replay-btn');
            if (boostBtn) {
                const replayId = boostBtn.dataset.replayId;
                if (replayId) this._showBoostModal(replayId);
                return;
            }

            const joinBtn = e.target.closest('.join-room-btn:not(.replay-play-btn)');
            const clickedCard = !joinBtn ? e.target.closest('.room-card:not(.replay-card)') : null;
            if (joinBtn || clickedCard) {
                const roomCard = joinBtn ? joinBtn.closest('.room-card') : clickedCard;
                if (roomCard && !roomCard.classList.contains('replay-card')) {
                    const roomId = roomCard.dataset.roomId;
                    const tokenPrice = parseInt(roomCard.dataset.tokenPrice || '0', 10);
                    if (roomId) {
                        if (tokenPrice > 0) {
                            this._showTokenGate(roomId, tokenPrice);
                        } else {
                            this.joinRoom(roomId);
                        }
                    }
                }
                return;
            }
            
            const previewBtn = e.target.closest('.preview-btn');
            if (previewBtn) {
                const roomCard = previewBtn.closest('.room-card');
                if (roomCard) this.previewRoom(roomCard);
                return;
            }
            
            const knockBtn = e.target.closest('.knock-btn');
            if (knockBtn) {
                const friendRoom = knockBtn.closest('.friend-room');
                if (friendRoom) this.knockOnRoom(friendRoom);
                return;
            }

            const joinFriendBtn = e.target.closest('.join-friend-btn');
            if (joinFriendBtn) {
                const friendRoom = joinFriendBtn.closest('.friend-room');
                if (friendRoom) this.joinFriendRoom(friendRoom);
                return;
            }

            const inviteBtn = e.target.closest('.invite-btn');
            if (inviteBtn) {
                const userId = inviteBtn.dataset.userId;
                if (userId) this.inviteUser(userId);
                return;
            }

            const replayItem = e.target.closest('.replay-item');
            if (replayItem) {
                const replayId = replayItem.dataset.replayId;
                if (replayId) this.playReplay(replayId);
                return;
            }
        });
    }

    _emitRegisterUser() {
        try {
            const user = JSON.parse(localStorage.getItem('user'));
            if (user && user._id) {
                const sock = this.lobbySocket || this.socket;
                if (sock && sock.connected) {
                    sock.emit('register-user', { userId: user._id, userName: user.name || 'User' });
                }
            }
        } catch(e) {}
    }

    connectToServer() {
        return new Promise((resolve, reject) => {
            if (typeof io === 'undefined') {
                console.warn('[Socket] socket.io not loaded yet, waiting...');
                const waitForIo = setInterval(() => {
                    if (typeof io !== 'undefined') {
                        clearInterval(waitForIo);
                        this.connectToServer().then(resolve).catch(reject);
                    }
                }, 200);
                setTimeout(() => { clearInterval(waitForIo); resolve(); }, 5000);
                return;
            }
            console.log('Connecting to signaling server...');
            const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
            this.lobbySocket = io(serverUrl, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                timeout: 10000
            });

            const connectTimeout = setTimeout(() => {
                console.warn('Signaling server connection timed out');
                resolve();
            }, 12000);

            this.lobbySocket.on('connect', () => {
                clearTimeout(connectTimeout);
                console.log('Connected to signaling server');
                this._emitRegisterUser();
                resolve();
            });

            this.lobbySocket.on('connect_error', (err) => {
                console.warn('Signaling connection error:', err.message);
            });

            this.lobbySocket.on('rooms-updated', (rooms) => {
                console.log('Rooms updated in real-time:', rooms.length, 'rooms');
                this.renderRooms(rooms);
            });

            this.lobbySocket.on('room-invite', (data) => {
                this.showRoomInviteNotification(data);
            });

            this.lobbySocket.on('room-tip', (data) => {
                if (data && data.roomId === this.currentRoom) {
                    this.addChatMessage('System', `${data.fromUserName || 'Someone'} tipped ${data.amount} token${data.amount === 1 ? '' : 's'}! Pool: ${data.poolBalance}`, true);
                    this._playSfx?.('enterRoom');
                }
            });

            this.lobbySocket.on('disconnect', () => {
                console.log('Lobby socket disconnected');
            });
        });
    }

    

    async loadActiveRooms() {
        if (this._loadingRooms) return;
        this._loadingRooms = true;
        try {
            const rooms = await this.fetchActiveRooms();
            this.renderRooms(rooms);
        } catch (error) {
            console.error('Error loading rooms:', error);
        } finally {
            this._loadingRooms = false;
        }
        this.loadComingUp().catch(() => {});
    }

    // ==================== Scheduled Rooms: Coming Up ====================

    _authHeaders() {
        const token = localStorage.getItem('authToken');
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    async loadComingUp() {
        const section = document.getElementById('coming-up-section');
        const list = document.getElementById('coming-up-list');
        if (!section || !list) return;
        try {
            const signedIn = !!localStorage.getItem('authToken');
            const [rooms, mine] = await Promise.all([
                fetch(apiUrl('/api/scheduled-rooms/coming-up'), { headers: this._authHeaders() })
                    .then(r => r.ok ? r.json() : []),
                signedIn
                    ? fetch(apiUrl('/api/scheduled-rooms/mine'), { headers: this._authHeaders() })
                        .then(r => r.ok ? r.json() : { invites: [] }).catch(() => ({ invites: [] }))
                    : Promise.resolve({ invites: [] })
            ]);
            const invites = (mine.invites || []);
            if (!rooms.length && !invites.length) { section.style.display = 'none'; return; }
            const myId = (JSON.parse(localStorage.getItem('user') || '{}'))._id || null;
            list.innerHTML = '';
            invites.forEach(inv => list.appendChild(this._createInviteCard(inv)));
            rooms.slice(0, 10).forEach(r => list.appendChild(this._createComingUpCard(r, myId)));
            section.style.display = '';
        } catch (e) {
            console.warn('[ComingUp] load failed:', e.message);
        }
    }

    // Pending collab invite: approve/decline with your split shown
    _createInviteCard(inv) {
        const card = document.createElement('div');
        card.className = 'coming-up-card collab-invite-card';
        const esc = (t) => window.escapeHtml(String(t == null ? '' : t));
        card.innerHTML = `
            <div class="coming-up-info">
                <div class="coming-up-title"><i class="fas fa-handshake"></i> Collab invite: ${esc(inv.title)}</div>
                <div class="coming-up-meta">
                    <span class="coming-up-time"><i class="fas fa-clock"></i> ${esc(this._formatStartTime(inv.startTime))}</span>
                    <span class="coming-up-split">Your split: ${esc(inv.mySplit)}%</span>
                </div>
                <div class="coming-up-host">Hosted by ${esc(inv.hostName)}</div>
            </div>
            <div class="coming-up-actions">
                <button class="coming-up-btn go-live-btn" data-action="approve">Approve</button>
                <button class="coming-up-btn decline-btn" data-action="decline">Decline</button>
            </div>`;
        const respond = async (action) => {
            try {
                const res = await fetch(apiUrl(`/api/scheduled-rooms/${encodeURIComponent(inv.id)}/respond`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
                    body: JSON.stringify({ action })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    this.showToast?.(data.message || 'Could not respond', 'fa-exclamation-circle');
                    return;
                }
                this.showToast?.(action === 'approve' ? 'Approved! You\'re on the bill.' : 'Invite declined', 'fa-check');
                this.loadComingUp().catch(() => {});
            } catch (e) {
                this.showToast?.('Could not respond. Try again.', 'fa-exclamation-circle');
            }
        };
        card.querySelector('[data-action="approve"]').addEventListener('click', () => respond('approve'));
        card.querySelector('[data-action="decline"]').addEventListener('click', () => respond('decline'));
        return card;
    }

    _formatStartTime(iso) {
        const d = new Date(iso);
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const tomorrow = new Date(now.getTime() + 86400000).toDateString() === d.toDateString();
        const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        if (sameDay) return `Today ${time}`;
        if (tomorrow) return `Tomorrow ${time}`;
        return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
    }

    _createComingUpCard(r, myId) {
        const card = document.createElement('div');
        card.className = 'coming-up-card' + (r.tokenPrice > 0 ? ' coming-up-paid' : '');
        card.dataset.scheduledId = r.id;
        const esc = (t) => window.escapeHtml(String(t == null ? '' : t));
        const collabs = (r.collaborators || []).map(c => esc(c.userName)).filter(Boolean);
        const hostLine = esc(r.hostName) + (collabs.length ? ` + ${collabs.join(', ')}` : '');
        const isMine = myId && String(r.hostUserId) === String(myId);
        card.innerHTML = `
            <div class="coming-up-info">
                <div class="coming-up-title">${esc(r.title)}</div>
                <div class="coming-up-meta">
                    <span class="coming-up-time"><i class="fas fa-clock"></i> ${esc(this._formatStartTime(r.startTime))}</span>
                    ${r.genre ? `<span class="coming-up-genre">${esc(r.genre)}</span>` : ''}
                    ${r.tokenPrice > 0 ? `<span class="coming-up-price"><i class="fas fa-key"></i> ${r.tokenPrice}</span>` : ''}
                </div>
                <div class="coming-up-host">${hostLine}</div>
            </div>
            <div class="coming-up-actions">
                <span class="coming-up-interest"><i class="fas fa-bell"></i> <span class="interest-count">${parseInt(r.interestCount, 10) || 0}</span></span>
                ${isMine
                    ? `<button class="coming-up-btn go-live-btn" data-action="go-live">Go Live</button>`
                    : `<button class="coming-up-btn remind-btn ${r.isInterested ? 'active' : ''}" data-action="remind">${r.isInterested ? 'Reminding' : 'Remind me'}</button>`}
            </div>`;
        card.querySelector('[data-action="remind"]')?.addEventListener('click', () => this._toggleInterest(r.id, card));
        card.querySelector('[data-action="go-live"]')?.addEventListener('click', () => this.openScheduledRoom(r.id));
        return card;
    }

    async _toggleInterest(scheduledId, card) {
        if (!localStorage.getItem('authToken')) {
            this.showToast?.('Sign in to get reminded', 'fa-bell');
            window.location.href = `/signin.html?redirect=${encodeURIComponent('/verses.html')}`;
            return;
        }
        try {
            const res = await fetch(apiUrl(`/api/scheduled-rooms/${encodeURIComponent(scheduledId)}/interest`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders() }
            });
            if (!res.ok) throw new Error('interest failed');
            const data = await res.json();
            const btn = card.querySelector('.remind-btn');
            const count = card.querySelector('.interest-count');
            if (btn) {
                btn.classList.toggle('active', data.isInterested);
                btn.textContent = data.isInterested ? 'Reminding' : 'Remind me';
            }
            if (count) count.textContent = data.interestCount;
        } catch (e) {
            this.showToast?.('Could not update reminder', 'fa-exclamation-circle');
        }
    }

    // Host go-live: open the scheduled room server-side, then join as host
    async openScheduledRoom(scheduledId) {
        try {
            const res = await fetch(apiUrl(`/api/scheduled-rooms/${encodeURIComponent(scheduledId)}/open`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders() }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.showToast?.(data.message || 'Could not go live', 'fa-exclamation-circle');
                return;
            }
            if (data.roomId) {
                await this.joinRoom(data.roomId, true);
            }
        } catch (e) {
            this.showToast?.('Could not go live. Please try again.', 'fa-exclamation-circle');
        }
    }

    // ==================== Scheduling UI (create-room modal) ====================

    _setupSchedulingUI() {
        this._selectedCollabs = [];
        const toggle = document.getElementById('schedule-room-toggle');
        const options = document.getElementById('schedule-options');
        const searchInput = document.getElementById('collab-search-input');
        const results = document.getElementById('collab-search-results');
        if (!toggle || !options) return;

        toggle.addEventListener('change', () => {
            options.style.display = toggle.checked ? '' : 'none';
            const submitBtn = this.createRoomForm?.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = toggle.checked ? 'Schedule Room' : 'Create Room';
            if (toggle.checked) {
                if (!localStorage.getItem('authToken')) {
                    this.showToast?.('Sign in to schedule rooms', 'fa-calendar-alt');
                    toggle.checked = false;
                    options.style.display = 'none';
                    return;
                }
                // Default: one hour from now, minute precision, local time
                const startEl = document.getElementById('schedule-start-time');
                if (startEl && !startEl.value) {
                    const d = new Date(Date.now() + 60 * 60 * 1000);
                    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                    startEl.value = d.toISOString().slice(0, 16);
                }
                this._loadMyCollabId();
            }
        });

        let searchTimer = null;
        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimer);
            const q = searchInput.value.trim();
            if (q.length < 2) { if (results) results.innerHTML = ''; return; }
            searchTimer = setTimeout(() => this._searchCollaborators(q), 300);
        });
    }

    async _loadMyCollabId() {
        const el = document.getElementById('my-collab-id');
        if (!el || el.textContent) return;
        try {
            const res = await fetch(apiUrl('/api/scheduled-rooms/my-collab-id'), { headers: this._authHeaders() });
            if (res.ok) {
                const data = await res.json();
                if (data.collabId) el.textContent = `Your ID: ${data.collabId}`;
            }
        } catch (e) { /* non-fatal */ }
    }

    async _searchCollaborators(q) {
        const results = document.getElementById('collab-search-results');
        if (!results) return;
        try {
            const res = await fetch(apiUrl(`/api/scheduled-rooms/collaborator-search?q=${encodeURIComponent(q)}`), { headers: this._authHeaders() });
            if (!res.ok) return;
            const users = await res.json();
            const esc = (t) => window.escapeHtml(String(t == null ? '' : t));
            results.innerHTML = '';
            users.forEach(u => {
                if (this._selectedCollabs.some(c => c.userId === u._id)) return;
                const row = document.createElement('div');
                row.className = 'collab-result' + (u.busy ? ' busy' : '');
                row.innerHTML = `
                    <img src="${esc(u.avatar)}" alt="" onerror="this.src='assets/default-avatar.png'">
                    <span class="collab-result-name">${esc(u.name)}</span>
                    ${u.collabId ? `<span class="collab-result-id">${esc(u.collabId)}</span>` : ''}
                    ${u.busy ? '<span class="collab-busy-tag">busy</span>' : ''}`;
                if (!u.busy) {
                    row.addEventListener('click', () => this._addCollaborator(u));
                }
                results.appendChild(row);
            });
            if (!users.length) results.innerHTML = '<div class="collab-result none">No matches</div>';
        } catch (e) { /* non-fatal */ }
    }

    _addCollaborator(u) {
        if (this._selectedCollabs.length >= 5) {
            this.showToast?.('Maximum 5 collaborators', 'fa-exclamation-circle');
            return;
        }
        this._selectedCollabs.push({ userId: u._id, name: u.name, avatar: u.avatar, splitPercent: 0 });
        this._autoBalanceSplits();
        const searchInput = document.getElementById('collab-search-input');
        const results = document.getElementById('collab-search-results');
        if (searchInput) searchInput.value = '';
        if (results) results.innerHTML = '';
        this._renderSelectedCollabs();
    }

    _autoBalanceSplits() {
        // Even split across host + collaborators, host absorbs the remainder
        const n = this._selectedCollabs.length + 1;
        const each = Math.floor(100 / n);
        this._selectedCollabs.forEach(c => { c.splitPercent = each; });
    }

    _hostSplit() {
        const collabTotal = this._selectedCollabs.reduce((s, c) => s + (Number(c.splitPercent) || 0), 0);
        return Math.round((100 - collabTotal) * 100) / 100;
    }

    _renderSelectedCollabs() {
        const wrap = document.getElementById('collab-selected');
        const summary = document.getElementById('collab-split-summary');
        const approvalGroup = document.getElementById('approval-mode-group');
        if (!wrap) return;
        const esc = (t) => window.escapeHtml(String(t == null ? '' : t));
        wrap.innerHTML = '';
        this._selectedCollabs.forEach((c, i) => {
            const chip = document.createElement('div');
            chip.className = 'collab-chip';
            chip.innerHTML = `
                <img src="${esc(c.avatar)}" alt="" onerror="this.src='assets/default-avatar.png'">
                <span class="collab-chip-name">${esc(c.name)}</span>
                <input type="number" class="collab-split-input" min="1" max="99" step="1" value="${Number(c.splitPercent) || 0}" aria-label="Split % for ${esc(c.name)}">%
                <button type="button" class="collab-remove" aria-label="Remove ${esc(c.name)}">&times;</button>`;
            chip.querySelector('.collab-split-input').addEventListener('input', (e) => {
                this._selectedCollabs[i].splitPercent = Number(e.target.value) || 0;
                this._updateSplitSummary();
            });
            chip.querySelector('.collab-remove').addEventListener('click', () => {
                this._selectedCollabs.splice(i, 1);
                this._autoBalanceSplits();
                this._renderSelectedCollabs();
            });
            wrap.appendChild(chip);
        });
        if (approvalGroup) approvalGroup.style.display = this._selectedCollabs.length ? '' : 'none';
        if (summary) summary.style.display = this._selectedCollabs.length ? '' : 'none';
        this._updateSplitSummary();
    }

    _updateSplitSummary() {
        const summary = document.getElementById('collab-split-summary');
        if (!summary || !this._selectedCollabs.length) return;
        const host = this._hostSplit();
        const ok = host >= 0 && this._selectedCollabs.every(c => Number(c.splitPercent) > 0);
        summary.classList.toggle('invalid', !ok);
        summary.textContent = ok
            ? `You keep ${host}% — splits total 100%`
            : 'Splits must total exactly 100% (each collaborator above 0%)';
    }

    async _createScheduledRoom(formData, submitBtn, origText) {
        const title = (formData.get('room-name-input') || '').toString().trim() || 'Untitled Room';
        const genre = (formData.get('room-genre') || '').toString();
        const topic = (formData.get('initial-song') || '').toString();
        const description = (document.getElementById('schedule-description')?.value || '').trim();
        const tokenPrice = parseInt(formData.get('room-token-price'), 10) || 0;
        const startRaw = document.getElementById('schedule-start-time')?.value;
        const approvalMode = document.getElementById('approval-mode')?.value || 'real-time';

        if (!startRaw) {
            this.showToast?.('Pick a date and time', 'fa-clock');
            return;
        }
        const start = new Date(startRaw);
        if (isNaN(start.getTime()) || start.getTime() < Date.now() + 60 * 1000) {
            this.showToast?.('Start time must be in the future', 'fa-clock');
            return;
        }
        if (this._selectedCollabs.length && (this._hostSplit() < 0 || this._selectedCollabs.some(c => !(Number(c.splitPercent) > 0)))) {
            this.showToast?.('Splits must total exactly 100%', 'fa-percent');
            return;
        }

        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Scheduling...'; }
        try {
            const res = await fetch(apiUrl('/api/scheduled-rooms'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
                body: JSON.stringify({
                    title, genre, topic, description, tokenPrice,
                    startTime: start.toISOString(),
                    approvalMode,
                    hostSplitPercent: this._selectedCollabs.length ? this._hostSplit() : 100,
                    collaborators: this._selectedCollabs.map(c => ({ userId: c.userId, splitPercent: Number(c.splitPercent) }))
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.showToast?.(data.message || 'Could not schedule the room', 'fa-exclamation-circle');
                return;
            }
            this.hideAllModals();
            this.createRoomForm?.reset();
            this._selectedCollabs = [];
            this._renderSelectedCollabs();
            const optEl = document.getElementById('schedule-options');
            if (optEl) optEl.style.display = 'none';
            this.showToast?.(data.status === 'pending_approval'
                ? 'Room saved — waiting on collaborator approvals'
                : 'Room scheduled! It\'s now in Coming Up.', 'fa-calendar-check');
            this.loadComingUp().catch(() => {});
        } catch (e) {
            this.showToast?.('Could not schedule the room', 'fa-exclamation-circle');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText || 'Create Room'; }
        }
    }

    // ==================== Tips ====================

    async sendTip() {
        if (!this.currentRoom) return;
        if (!localStorage.getItem('authToken')) {
            this.showToast?.('Sign in to tip the creators', 'fa-coins');
            return;
        }
        const raw = prompt('How many tokens would you like to tip?', '5');
        if (raw == null) return;
        const amount = Math.floor(Number(raw));
        if (!Number.isFinite(amount) || amount <= 0) {
            this.showToast?.('Enter a valid number of tokens', 'fa-exclamation-circle');
            return;
        }
        try {
            const res = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(this.currentRoom)}/tip`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
                body: JSON.stringify({ amount })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.showToast?.(data.message || 'Tip failed', 'fa-exclamation-circle');
                return;
            }
            this.showToast?.(`Tipped ${amount} token${amount === 1 ? '' : 's'}!`, 'fa-coins');
        } catch (e) {
            this.showToast?.('Tip failed. Please try again.', 'fa-exclamation-circle');
        }
    }

    async fetchActiveRooms() {
        try {
            const response = await fetch(apiUrl('/api/rooms/active'));
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching active rooms:', error);
        }
        return [];
    }

    renderRooms(rooms) {
        const roomsGrid = document.getElementById('rooms-grid');
        if (!roomsGrid) return;

        if (rooms.length === 0) {
            const emptyState = this._el('div', {className: 'empty-rooms-state'},
                this._icon('fas fa-headphones'),
                this._el('h3', {textContent: 'No live rooms right now'}),
                this._el('p', {textContent: 'Be the first to start a conversation \u2014 create a room and invite friends!'}));
            roomsGrid.replaceChildren(emptyState);
            const emptyFeatured = document.getElementById('featured-section');
            if (emptyFeatured) emptyFeatured.style.display = 'none';
            const emptyFeedTitle = document.getElementById('live-feed-title');
            if (emptyFeedTitle) emptyFeedTitle.style.display = 'none';
            const friendsList = document.getElementById('friends-list');
            if (friendsList && !friendsList.textContent.trim()) {
                const friendsEmpty = this._el('div', {className: 'empty-rooms-state', cssText: 'padding: 1.5rem;'},
                    this._el('p', {cssText: 'color: rgba(255,255,255,0.5); text-align: center;', textContent: 'No friends are in rooms right now'}));
                friendsList.replaceChildren(friendsEmpty);
            }
            return;
        }

        roomsGrid.replaceChildren();

        // Split the busiest rooms into the featured carousel (Live Feed layout)
        const featuredSection = document.getElementById('featured-section');
        const featuredWrap = document.getElementById('featured-rooms');
        const feedTitle = document.getElementById('live-feed-title');
        let featured = [];
        let feed = rooms;
        if (featuredWrap && rooms.length >= 3) {
            const sorted = [...rooms].sort((a, b) => (b.participantCount || 0) - (a.participantCount || 0));
            featured = sorted.slice(0, 2);
            const featuredIds = new Set(featured.map(r => r.id));
            feed = rooms.filter(r => !featuredIds.has(r.id));
        }
        if (featuredWrap) {
            featuredWrap.replaceChildren();
            featured.forEach(room => featuredWrap.appendChild(this._createFeaturedCard(room)));
        }
        if (featuredSection) featuredSection.style.display = featured.length ? '' : 'none';
        if (feedTitle) feedTitle.style.display = '';

        feed.forEach(room => {
            roomsGrid.appendChild(this.createRoomCard(room));
        });

        const statUsers = document.getElementById('stat-active-users');
        const statRooms = document.getElementById('stat-live-rooms');
        if (statUsers) {
            const total = rooms.reduce((sum, r) => sum + (r.participantCount || 0), 0);
            statUsers.textContent = total.toLocaleString();
        }
        if (statRooms) statRooms.textContent = rooms.length;

        this._applyRoomFilters();
    }

    createRoomCard(room) {
        const participants = room.participants || [];
        const avatarEls = participants.slice(0, 3).map(p => {
            const name = p.userName || p.name || 'User';
            const initial = name.charAt(0).toUpperCase();
            const avatarInitial = this._el('div', {className: 'avatar-initial', cssText: 'width:40px;height:40px;border-radius:50%;background:var(--purple);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;', textContent: initial});
            return this._el('div', {className: 'participant-avatar'}, avatarInitial);
        });

        const count = room.participantCount || participants.length || 0;
        const participantsPreview = this._el('div', {className: 'participants-preview'}, ...avatarEls);
        if (count > 3) {
            participantsPreview.appendChild(this._el('div', {className: 'more-participants', textContent: '+' + (count - 3)}));
        }

        const genre = room.genre || 'general';
        const genreIconCls = this.getGenreIconClass(genre);
        const roomName = room.name || ('Room ' + room.id.slice(-5));
        const host = participants.find(p => p.isHost);
        const hostName = host ? (host.userName || host.name || 'Unknown') : 'Unknown';

        const elapsed = room.createdAt ? Math.round((Date.now() - room.createdAt) / 60000) : 0;
        const duration = elapsed < 60 ? elapsed + 'm' : Math.round(elapsed / 60) + 'h';

        const statsDiv = this._el('div', {className: 'room-stats'},
            this._el('span', {className: 'stat'}, this._icon('fas fa-users'), this._text(' ' + count)),
            this._el('span', {className: 'stat'}, this._icon('fas fa-clock'), this._text(' ' + duration)));
        if (room.isLocked) {
            statsDiv.appendChild(this._el('span', {className: 'stat'}, this._icon('fas fa-lock')));
        }

        const tokenPrice = room.tokenPrice || 0;
        const priceBadge = tokenPrice > 0
            ? this._el('span', {className: 'room-token-badge gated'}, this._text('\uD83C\uDF9F ' + tokenPrice + ' tokens'))
            : this._el('span', {className: 'room-token-badge free'}, this._text('FREE'));

        const roomInfo = this._el('div', {className: 'room-info'},
            this._el('div', {className: 'room-genre'}, this._icon(genreIconCls), this._el('span', {textContent: this.capitalizeFirst(genre)})),
            this._el('h3', {textContent: roomName}),
            priceBadge,
            this._el('p', {className: 'room-topic', textContent: 'Hosted by ' + hostName}),
            statsDiv);

        const joinBtn = this._el('button', {className: 'join-room-btn primary'}, this._icon('fas fa-play'), this._text(room.isLocked ? ' Locked' : ' Join Room'));
        if (room.isLocked) joinBtn.disabled = true;

        const isTrending = count >= 5;
        if (isTrending) {
            const trendBadge = this._el('span', {className: 'room-trending-badge'}, this._icon('fas fa-fire'), this._text(' Trending'));
            roomInfo.insertBefore(trendBadge, roomInfo.firstChild);
        }

        const cardClass = tokenPrice > 0 ? 'room-card room-card-gated' : 'room-card';
        const card = this._el('div', {className: cardClass},
            this._el('div', {className: 'room-preview'}, participantsPreview, roomInfo),
            this._el('div', {className: 'room-actions'}, joinBtn));
        card.dataset.roomId = room.id;
        card.dataset.genre = genre;
        card.dataset.roomName = (room.name || '').toLowerCase();
        if (tokenPrice > 0) card.dataset.tokenPrice = tokenPrice;
        return card;
    }

    _createFeaturedCard(room) {
        const participants = room.participants || [];
        const count = room.participantCount || participants.length || 0;
        const genre = room.genre || 'general';
        const roomName = room.name || ('Room ' + room.id.slice(-5));
        const host = participants.find(p => p.isHost);
        const hostName = host ? (host.userName || host.name || 'Unknown') : 'Unknown';
        const tokenPrice = room.tokenPrice || 0;

        const badges = this._el('div', {className: 'featured-badges'},
            this._el('span', {className: 'featured-live-badge'}, this._el('span', {className: 'live-dot'}), this._text('LIVE')),
            this._el('span', {className: 'featured-stat-badge'}, this._icon('fas fa-users'), this._text(' ' + count.toLocaleString())));
        if (tokenPrice > 0) {
            badges.appendChild(this._el('span', {className: 'featured-token-badge'}, this._icon('fas fa-coins'), this._text(' ' + tokenPrice)));
        }

        const joinBtn = this._el('button', {className: 'join-room-btn featured-join-btn'},
            this._text(room.isLocked ? 'Locked' : 'Join Verse'), this._icon('fas fa-chevron-right'));
        if (room.isLocked) joinBtn.disabled = true;

        const card = this._el('div', {className: 'room-card featured-room-card' + (tokenPrice > 0 ? ' room-card-gated' : '')},
            this._el('div', {className: 'featured-card-glow'}),
            badges,
            this._el('h3', {className: 'featured-room-title', textContent: roomName}),
            this._el('p', {className: 'room-topic featured-room-host'},
                this._text('Host '), this._el('span', {className: 'featured-host-chip', textContent: hostName})),
            this._el('div', {className: 'featured-genre-row'}, this._icon(this.getGenreIconClass(genre)), this._el('span', {textContent: this.capitalizeFirst(genre)})),
            joinBtn);
        card.dataset.roomId = room.id;
        card.dataset.genre = genre;
        card.dataset.roomName = (room.name || '').toLowerCase();
        if (tokenPrice > 0) card.dataset.tokenPrice = tokenPrice;
        return card;
    }

    getGenreIconClass(genre) {
        const icons = {
            'hip-hop': 'fas fa-music',
            'rock': 'fas fa-guitar',
            'pop': 'fas fa-headphones',
            'jazz': 'fas fa-saxophone',
            'electronic': 'fas fa-synth',
            'r&b': 'fas fa-microphone'
        };
        return icons[genre] || 'fas fa-music';
    }

    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    async shareRoom() {
        if (!this.currentRoom) return;

        const roomName = document.getElementById('room-name')?.textContent || 'a room';
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const hostName = user.name || user.username || '';
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/room/${encodeURIComponent(this.currentRoom)}?name=${encodeURIComponent(roomName)}&host=${encodeURIComponent(hostName)}`;
        const shareText = `Join me in "${roomName}" on Wordeth! Live music discussion happening now.`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Wordeth - ${roomName}`,
                    text: shareText,
                    url: shareUrl
                });
                this.addChatMessage('System', 'Room link shared!', true);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    this.copyShareLink(shareUrl);
                }
            }
        } else {
            this.copyShareLink(shareUrl);
        }
    }

    copyShareLink(url) {
        navigator.clipboard.writeText(url).then(() => {
            this.showShareToast('Room link copied to clipboard!');
            this.addChatMessage('System', 'Room link copied to clipboard!', true);
        }).catch(() => {
            const input = document.createElement('input');
            input.value = url;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            this.showShareToast('Room link copied!');
            this.addChatMessage('System', 'Room link copied to clipboard!', true);
        });
    }

    showShareToast(message) {
        const existing = document.querySelector('.share-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'share-toast';
        toast.appendChild(this._icon('fas fa-check-circle'));
        toast.appendChild(this._text(' ' + message));
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showRoomInviteNotification(data) {
        if (this.currentRoom === data.roomId) return;

        const dedupKey = `${data.roomId}_${data.inviterId}_${Math.floor((data.timestamp || Date.now()) / 5000)}`;
        if (this._lastInviteKey === dedupKey) return;
        this._lastInviteKey = dedupKey;

        const existing = document.getElementById('wordeth-invite-notification');
        if (existing) existing.remove();


        const inviterInitial = (data.inviterName || 'U').charAt(0).toUpperCase();
        const roomName = data.roomName || 'a Verse';

        const notification = document.createElement('div');
        notification.id = 'wordeth-invite-notification';
        notification.className = 'invite-notification';
        const tokenPrice = parseInt(data.tokenPrice, 10) || 0;
        const freePass = !!data.freePass;
        const liveBadge = this._el('div', {className: 'invite-live-badge'},
            this._el('span', {className: 'invite-live-dot'}), 'LIVE NOW');
        const logo = this._el('img', {className: 'invite-logo', src: '/images/logo.png', alt: 'Wordeth'});
        const cardTop = this._el('div', {className: 'invite-card-top'}, liveBadge, logo);

        const fromStrong = this._el('strong', {textContent: data.inviterName});
        const fromText = this._el('div', {className: 'invite-from-text'}, fromStrong, ' invited you');
        const cardBody = this._el('div', {className: 'invite-card-body'},
            this._el('div', {className: 'invite-room-name', textContent: roomName}),
            this._el('div', {className: 'invite-from'},
                this._el('div', {className: 'invite-from-avatar', textContent: inviterInitial}), fromText));
        if (tokenPrice > 0) {
            cardBody.appendChild(freePass
                ? this._el('div', {className: 'invite-price-tag free-pass'},
                    this._icon('fas fa-ticket-alt'), this._text(' Free pass from the host'))
                : this._el('div', {className: 'invite-price-tag paid'},
                    this._icon('fas fa-key'), this._text(` ${tokenPrice} token${tokenPrice === 1 ? '' : 's'} to enter`)));
        }

        const dismissBtn = this._el('button', {className: 'invite-action-btn dismiss', textContent: 'Not now'});
        const joinBtn = this._el('button', {className: 'invite-action-btn join'},
            this._icon('fas fa-headphones'), ' Join');
        const actions = this._el('div', {className: 'invite-card-actions'}, dismissBtn, joinBtn);

        const card = this._el('div', {className: 'invite-card'},
            this._el('div', {className: 'invite-card-glow'}), cardTop, cardBody, actions,
            this._el('div', {className: 'invite-timer-bar'}));
        notification.appendChild(card);

        document.body.appendChild(notification);
        requestAnimationFrame(() => notification.classList.add('visible'));

        joinBtn.addEventListener('click', () => {
            notification.remove();
            if (this.currentRoom) {
                this.leaveRoom();
            }
            if (tokenPrice > 0 && !freePass) {
                this._showTokenGate(data.roomId, tokenPrice);
            } else {
                this.joinRoom(data.roomId);
            }
        });

        dismissBtn.addEventListener('click', () => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 400);
        });

        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 400);
        }, 15000);
    }

    filterRooms(filter) {
        this.currentFilterTab = filter;
        
        document.querySelectorAll('#live-view .filter-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.querySelector(`#live-view [data-filter="${filter}"]`);
        if (activeTab) activeTab.classList.add('active');
        
        this._applyRoomFilters();
    }

    _applyRoomFilters() {
        const searchVal = (this._roomSearchQuery || '').toLowerCase();
        const genreFilter = this.currentFilterTab || 'all';
        const roomCards = document.querySelectorAll('.room-card');
        roomCards.forEach(card => {
            const matchGenre = genreFilter === 'all' || card.dataset.genre === genreFilter;
            const matchSearch = !searchVal || (card.dataset.roomName || '').includes(searchVal);
            card.style.display = (matchGenre && matchSearch) ? '' : 'none';
        });
    }

    initRoomSearch() {
        const input = document.getElementById('room-search-input');
        if (!input) return;
        let debounce;
        input.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                this._roomSearchQuery = input.value;
                this._applyRoomFilters();
            }, 200);
        });
    }

    previewRoom(roomCard) {
        const roomId = roomCard.dataset.roomId;
        const roomName = roomCard.querySelector('h3').textContent;
        const roomTopic = roomCard.querySelector('.room-topic').textContent;
        
        // Show a preview modal or notification
        alert(`Previewing: ${roomName}\n\n${roomTopic}\n\nThis feature would show a live preview of the room without joining.`);
    }

    refreshFriendsRooms() {
        const refreshBtn = document.querySelector('.refresh-btn');
        refreshBtn.style.transform = 'rotate(360deg)';
        
        setTimeout(() => {
            refreshBtn.style.transform = 'rotate(0deg)';
            // Simulate refreshing friends' rooms
            console.log('Refreshing friends\' rooms...');
        }, 1000);
    }

    joinFriendRoom(friendRoom) {
        const friendName = friendRoom?.querySelector('.friend-info h4')?.textContent;
        alert(`Joining ${friendName}'s room!`);
    }

    // Modal Management
    showCreateRoomModal() {
        const token = localStorage.getItem('authToken');
        console.log('[CreateRoom] token:', !!token, 'modal element:', !!this.createRoomModal);
        if (!token) {
            console.log('[CreateRoom] No token — showing auth prompt');
            this._showAuthPrompt();
            console.log('[CreateRoom] Auth prompt should now be visible');
            return;
        }
        if (!this.createRoomModal) {
            this.createRoomModal = document.getElementById('create-room-modal');
            console.log('[CreateRoom] re-queried modal:', !!this.createRoomModal);
        }
        if (this.createRoomModal) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const acctType = (user.accountType || 'fan').toLowerCase();
            const isCreator = ['artist', 'designer', 'creator', 'label'].includes(acctType);
            const tokenGroup = document.getElementById('token-price-group');
            if (tokenGroup) {
                tokenGroup.style.display = isCreator ? '' : 'none';
                if (!isCreator) {
                    const priceInput = document.getElementById('room-token-price');
                    if (priceInput) priceInput.value = '0';
                }
            }
            this.createRoomModal.classList.add('active');
            console.log('[CreateRoom] modal active class added');
        } else {
            console.error('[CreateRoom] create-room-modal element not found in DOM');
        }
    }

    _showAuthPrompt() {
        console.log('[AuthPrompt] Creating auth prompt modal');
        const existing = document.getElementById('auth-prompt-modal');
        if (existing) { existing.classList.add('active'); console.log('[AuthPrompt] Reusing existing modal'); return; }
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'auth-prompt-modal';
        modal.style.zIndex = '10001';
        const closeBtn = this._el('button', {className: 'close-modal', textContent: '\u00D7'});
        const modalHeader = this._el('div', {className: 'modal-header', cssText: 'justify-content:flex-end;'}, closeBtn);
        const headphonesIcon = this._icon('fas fa-headphones');
        headphonesIcon.style.cssText = 'font-size:2.5rem;color:var(--mint,#00E5A8);margin-bottom:1rem;';
        const title = this._el('h3', {cssText: 'font-family:var(--font-display,"Syne",sans-serif);font-size:1.3rem;margin-bottom:0.5rem;', textContent: 'Join the Conversation'});
        const desc = this._el('p', {cssText: 'color:rgba(255,255,255,0.5);font-size:0.9rem;margin-bottom:1.5rem;', textContent: 'Sign in or create an account to start your own audio room and connect with other music lovers.'});
        const signInLink = this._el('a', {className: 'create-btn', href: '/signin.html?return=' + encodeURIComponent('/verses.html'), cssText: 'display:inline-block;text-decoration:none;text-align:center;padding:0.75rem 1.5rem;border-radius:12px;font-weight:600;', textContent: 'Sign In'});
        const signUpLink = this._el('a', {href: '/signup.html?return=' + encodeURIComponent('/verses.html'), cssText: 'color:var(--mint,#00E5A8);text-decoration:none;font-size:0.85rem;'},
            'Don\u2019t have an account? ', this._el('strong', {textContent: 'Sign Up'}));
        const linksWrap = this._el('div', {cssText: 'display:flex;flex-direction:column;gap:0.75rem;'}, signInLink, signUpLink);
        const body = this._el('div', {cssText: 'padding:0 0.5rem 1.5rem;'}, headphonesIcon, title, desc, linksWrap);
        const content = this._el('div', {className: 'modal-content', cssText: 'max-width:400px;text-align:center;'}, modalHeader, body);
        modal.appendChild(content);
        document.body.appendChild(modal);
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            modal.remove();
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal) { modal.classList.remove('active'); modal.remove(); }
        });
        localStorage.setItem('wordeth_return_url', '/verses.html');
    }

    showTopicEditModal() {
        const currentTopic = document.getElementById('current-song')?.textContent || '';
        const topicInput = document.getElementById('topic-input');
        if (topicInput) {
            topicInput.value = currentTopic.replace('Currently discussing: ', '').replace(/"/g, '');
        }
        this.topicEditModal?.classList.add('active');
    }

    showAddUsersModal() {
        this.addUsersModal?.classList.add('active');
        const userSearchInput = document.getElementById('user-search-input');
        if (userSearchInput) userSearchInput.value = '';
        this.loadFriendsForInvite();
    }

    showReplayModal() {
        this.loadReplayList();
        this.replayModal?.classList.add('active');
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        
        // Clean up karaoke camera when modal closes
        if (this.karaokeVideoActive) {
            this.stopKaraokeCamera();
        }
        
        // Reset forms and clear inputs
        this.createRoomForm?.reset();
        this.topicEditForm?.reset();
        const userSearchInput = document.getElementById('user-search-input');
        if (userSearchInput) userSearchInput.value = '';
        const searchResults = document.getElementById('search-results');
        this._clearEl(searchResults);
    }

    // Topic Management
    updateTopic() {
        const topicInput = document.getElementById('topic-input');
        const newTopic = topicInput?.value;
        if (newTopic && newTopic.trim()) {
            const currentSongElement = document.getElementById('current-song');
            if (currentSongElement) {
                currentSongElement.textContent = `Currently discussing: "${newTopic}"`;
            }
            this.hideAllModals();
            
            this.notifyParticipants('topic-change', { topic: newTopic });
            this.addChatMessage('System', `Topic changed to: "${newTopic}"`, true);
        }
    }

    // Enhanced User Search with Phone Number Support
    async searchUsers() {
        const userSearchInput = document.getElementById('user-search-input');
        const query = userSearchInput?.value;
        if (!query || !query.trim()) return;

        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) {
            resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'Searching...'})));
        }

        try {
            const token = localStorage.getItem('authToken');
            const res = await fetch(`/api/user/search?q=${encodeURIComponent(query.trim())}`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const users = await res.json();
            this.renderSearchResults(users, query.trim());
        } catch (error) {
            console.error('User search error:', error);
            if (resultsContainer) {
                resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'Search failed. Please try again.'})));
            }
        }
    }

    async loadFriendsForInvite() {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        const token = localStorage.getItem('authToken');
        if (!token) {
            resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'Sign in to see your friends'})));
            return;
        }

        resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'Loading friends...'})));

        try {
            const res = await fetch('/api/user/friends', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const friends = await res.json();

            if (!friends || friends.length === 0) {
                resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'No friends yet. Search for users above to invite them!'})));
                return;
            }

            this.renderSearchResults(friends, null, true);
        } catch (error) {
            console.error('Load friends error:', error);
            resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: 'Could not load friends. Try searching instead.'})));
        }
    }

    renderSearchResults(users, searchQuery, isFriendsList = false) {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        if (!users || users.length === 0) {
            const msg = searchQuery ? 'No users found matching \u201C' + searchQuery + '\u201D' : 'No results found';
            resultsContainer.replaceChildren(this._el('div', {className: 'no-results'}, this._el('p', {textContent: msg})));
            return;
        }

        const currentUserId = (() => {
            try { return JSON.parse(localStorage.getItem('user'))?._id; } catch(e) { return null; }
        })();

        const roomParticipants = this.currentRoom && this.socket ? 
            Array.from(document.querySelectorAll('.participant-item')).map(el => el.dataset?.userId).filter(Boolean) : [];

        resultsContainer.replaceChildren();
        if (isFriendsList) {
            resultsContainer.appendChild(this._el('div', {className: 'search-section-label', textContent: 'Your Friends'}));
        }
        users.filter(u => (u._id || u.id) !== currentUserId).forEach(user => {
            resultsContainer.appendChild(this.renderUserCard(user, roomParticipants));
        });
    }

    renderUserCard(user, roomParticipants = []) {
        const userId = user._id || user.id;
        const displayName = user.name || user.displayName || 'User';
        const avatar = user.avatar || '';
        const isInRoom = roomParticipants.includes(userId);

        const avatarDiv = this._el('div', {className: 'search-result-avatar'});
        if (avatar) {
            const img = this._el('img', {src: avatar, alt: displayName});
            img.addEventListener('error', function() { this.replaceWith(document.createElement('i')).className = 'fas fa-user'; });
            avatarDiv.appendChild(img);
        } else {
            avatarDiv.appendChild(this._icon('fas fa-user'));
        }

        const infoDiv = this._el('div', {className: 'search-result-info'},
            this._el('div', {className: 'search-result-name', textContent: displayName}));
        if (user.bio) {
            infoDiv.appendChild(this._el('div', {className: 'search-result-id', textContent: user.bio.substring(0, 50)}));
        }

        const item = this._el('div', {className: 'search-result-item'}, avatarDiv, infoDiv);
        if (isInRoom) {
            item.appendChild(this._el('span', {className: 'in-room-badge', textContent: 'In Room'}));
        } else {
            const inviteBtn = this._el('button', {className: 'invite-btn', textContent: 'Invite'});
            inviteBtn.dataset.userId = userId;
            item.appendChild(inviteBtn);
        }
        return item;
    }

    async inviteUser(userId) {
        const userElement = document.querySelector(`[data-user-id="${userId}"]`)?.closest('.search-result-item');
        const userName = userElement?.querySelector('.search-result-name')?.textContent || 'User';

        let currentUserName = 'Someone';
        try {
            currentUserName = JSON.parse(localStorage.getItem('user'))?.name || 'Someone';
        } catch(e) {}

        // If I'm hosting a paid room, comp this person's entry first
        // (authenticated server-side; only the host can do this).
        if (this.isRoomHost && this.currentRoom && localStorage.getItem('authToken')) {
            try {
                await fetch(apiUrl(`/api/rooms/${encodeURIComponent(this.currentRoom)}/grant-pass`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this._authHeaders() },
                    body: JSON.stringify({ targetUserId: userId })
                });
            } catch (e) { /* invite still goes out; they'd just pay normally */ }
        }

        const roomNameEl = document.getElementById('room-name');
        const displayRoomName = roomNameEl?.textContent || this.currentRoom;

        const activeSocket = this.socket || this.lobbySocket;
        if (activeSocket && activeSocket.connected) {
            activeSocket.emit('room-invite', {
                targetUserId: userId,
                roomId: this.currentRoom,
                roomName: displayRoomName,
                inviterName: currentUserName
            });

            activeSocket.once('invite-sent', (response) => {
                if (response.success) {
                    this.showShareToast(`Invite sent to ${userName}!`);
                } else {
                    this.fallbackInvite(userName);
                }
            });

            setTimeout(() => {
                activeSocket.off('invite-sent');
            }, 3000);
        } else {
            this.fallbackInvite(userName);
        }
    }

    fallbackInvite(userName) {
        const roomNameEl = document.getElementById('room-name');
        const displayRoomName = roomNameEl?.textContent || this.currentRoom;
        const shareUrl = `${window.location.origin}/room/${encodeURIComponent(this.currentRoom)}`;
        const shareText = `Join me in "${displayRoomName}" on Wordeth!`;

        if (navigator.share) {
            navigator.share({
                title: `Wordeth - ${displayRoomName}`,
                text: shareText,
                url: shareUrl
            }).then(() => {
                this.showShareToast(`Invite link shared for ${userName}!`);
            }).catch(() => {});
        } else {
            navigator.clipboard?.writeText(shareUrl).then(() => {
                this.showShareToast(`${userName} is offline — room link copied!`);
            }).catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = shareUrl;
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showShareToast(`${userName} is offline — room link copied!`);
            });
        }
    }

    // Chat Management
    toggleChat() {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            const isVisible = this.chatSection?.classList.contains('mobile-visible');
            if (isVisible) {
                this.chatSection?.classList.remove('mobile-visible');
                this.chatVisible = false;
            } else {
                this.chatSection?.classList.add('mobile-visible');
                this.chatVisible = true;
                this.chatInput?.focus();
            }
        } else {
            this.chatVisible = !this.chatVisible;
            this.chatSection?.classList.toggle('hidden', !this.chatVisible);
        }
        this.toggleChatBtn?.classList.toggle('active', this.chatVisible);
        if (this.chatVisible) {
            this.toggleChatBtn?.classList.remove('chat-glow');
        }
    }

    _initChatSwipeToDismiss() {
        const chatEl = this.chatSection;
        if (!chatEl) return;
        let startY = 0, currentY = 0, isDragging = false;
        const header = chatEl.querySelector('.chat-header');
        if (!header) return;

        header.addEventListener('touchstart', (e) => {
            if (window.innerWidth > 768) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            chatEl.style.transition = 'none';
        }, { passive: true });

        header.addEventListener('touchmove', (e) => {
            if (!isDragging || window.innerWidth > 768) return;
            currentY = e.touches[0].clientY;
            const dy = currentY - startY;
            if (dy > 0) {
                chatEl.style.transform = `translateY(${dy}px)`;
            }
        }, { passive: true });

        const endSwipe = () => {
            if (!isDragging || window.innerWidth > 768) return;
            isDragging = false;
            chatEl.style.transition = '';
            const dy = currentY - startY;
            if (dy > 80) {
                chatEl.classList.remove('mobile-visible');
                this.chatVisible = false;
                this.toggleChatBtn?.classList.remove('active');
            }
            chatEl.style.transform = '';
        };

        header.addEventListener('touchend', endSwipe);
        header.addEventListener('touchcancel', endSwipe);
    }

    _guestGate(action) {
        if (!this.isGuest) return false;
        this._showGuestSignupPrompt(action);
        return true;
    }

    _showGuestSignupPrompt(action) {
        if (document.getElementById('guest-signup-modal')) return;
        const roomId = this.currentRoom || '';
        const returnUrl = `/verses.html?room=${encodeURIComponent(roomId)}`;
        const encodedReturn = encodeURIComponent(returnUrl);
        const messages = {
            chat: 'Sign up to chat with everyone in the room.',
            'raise hand': 'Sign up to raise your hand and get on stage.',
            mic: 'Sign up to use your microphone.',
            interact: 'Sign up to participate in the conversation.',
            leave: 'You just experienced a live Verse! Create a free account to join conversations, chat, and more.'
        };
        const msg = messages[action] || messages.interact;
        const isLeave = action === 'leave';

        const modal = document.createElement('div');
        modal.id = 'guest-signup-modal';
        modal.style.cssText = 'position:fixed;inset:0;z-index:10002;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;';
        const emojiDiv = this._el('div', {cssText: 'font-size:40px;margin-bottom:16px;', textContent: isLeave ? '\uD83C\uDFB6' : '\uD83D\uDD12'});
        const titleEl = this._el('h3', {cssText: 'margin:0 0 8px;font-size:1.2rem;color:#96c5b0;', textContent: isLeave ? 'Enjoying the Vibe?' : 'Join the Conversation'});
        const descEl = this._el('p', {cssText: 'margin:0 0 24px;color:#ccc;font-size:0.95rem;line-height:1.5;', textContent: msg});
        const signupLink = this._el('a', {href: '/signup.html?return=' + encodedReturn, cssText: 'display:block;background:#7c3aed;color:white;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:600;font-size:1rem;', textContent: 'Sign Up Free'});
        const signinLink = this._el('a', {href: '/signin.html?return=' + encodedReturn, cssText: 'display:block;background:rgba(124,58,237,0.2);color:#a78bfa;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:0.95rem;border:1px solid rgba(124,58,237,0.3);', textContent: 'Sign In'});
        const dismissBtn = this._el('button', {id: 'guest-signup-dismiss', cssText: 'background:none;border:none;color:#888;padding:10px;font-size:0.85rem;cursor:pointer;margin-top:4px;', textContent: isLeave ? 'Leave without signing up' : 'Maybe later'});
        const linksDiv = this._el('div', {cssText: 'display:flex;flex-direction:column;gap:10px;'}, signupLink, signinLink, dismissBtn);
        const card = this._el('div', {cssText: 'background:linear-gradient(135deg,#1a1033,#2d1b4e);border:1px solid rgba(124,58,237,0.4);border-radius:16px;padding:32px 24px;max-width:380px;width:100%;text-align:center;color:#fff;font-family:Inter,sans-serif;'}, emojiDiv, titleEl, descEl, linksDiv);
        modal.appendChild(card);
        document.body.appendChild(modal);

        [signupLink, signinLink].forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const href = link.getAttribute('href');
                modal.remove();
                window.location.href = href;
            });
        });

        dismissBtn.addEventListener('click', () => {
            modal.remove();
            if (isLeave) {
                this.isGuest = false;
                this.leaveRoom();
                this.isGuest = true;
            }
        }, { once: true });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                if (isLeave) {
                    this.isGuest = false;
                    this.leaveRoom();
                    this.isGuest = true;
                }
            }
        });
    }

    sendMessage() {
        if (this._guestGate('chat')) return;
        const message = this.chatInput?.value.trim();
        if (!message) return;

        const linkPattern = /(https?:\/\/[^\s]+)|([^\s]+\.[a-z]{2,})/i;
        if (linkPattern.test(message)) {
            alert('Links are not allowed in chat.');
            return;
        }

        this.addChatMessage('You', message);
        
        if (this.chatInput) {
            this.chatInput.value = '';
        }
        
        if (this.socket && this.socket.connected && this.currentRoom) {
            this.socket.emit('chat-message', {
                roomId: this.currentRoom,
                message
            });
        }
    }

    addChatMessage(sender, message, isSystem = false) {
        if (!this.chatMessagesContainer) return;

        const displaySender = (sender === 'System' && isSystem) ? 'WrdyBot' : sender;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender === 'You' ? 'own' : ''} ${isSystem ? 'system' : ''}`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const header = this._el('div', {className: 'chat-message-header'},
            this._el('span', {className: 'sender', textContent: displaySender}),
            this._el('span', {className: 'timestamp', textContent: timestamp}));
        const content = this._el('div', {className: 'chat-message-content', textContent: message});
        messageElement.append(header, content);
        
        this.chatMessagesContainer.appendChild(messageElement);
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }

    escapeHtml(text) {
        return window.escapeHtml(text);
    }

    _primeSfx() {
        if (this._sfxPrimed) return;
        try {
            Object.values(this._sfx).forEach(a => {
                a.muted = true;
                a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; }).catch(() => { a.muted = false; });
            });
            this._sfxPrimed = true;
            console.log('[SFX] audio primed');
        } catch(e) {}
    }

    _playSfx(name) {
        try {
            const sound = this._sfx?.[name];
            if (!sound) return;
            const now = Date.now();
            if (!this._sfxLastPlayed) this._sfxLastPlayed = {};
            if (this._sfxLastPlayed[name] && now - this._sfxLastPlayed[name] < 800) return;
            this._sfxLastPlayed[name] = now;
            sound.currentTime = 0;
            sound.play().catch(() => {});
        } catch(e) {}
    }

    _showToast(message, type = 'info') {
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        this.showToast(message, icons[type] || icons.info);
    }

    showToast(message, icon = 'fa-info-circle', duration = 4000) {
        let container = document.getElementById('room-toasts');
        if (!container) {
            container = document.createElement('div');
            container.id = 'room-toasts';
            container.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = 'background:rgba(30,0,50,0.95);color:#e0d0ff;padding:10px 18px;border-radius:20px;font-size:14px;display:flex;align-items:center;gap:8px;border:1px solid rgba(138,43,226,0.4);backdrop-filter:blur(10px);opacity:0;transition:opacity 0.3s;white-space:nowrap;pointer-events:auto;';
        const toastIcon = this._icon('fas ' + icon);
        toastIcon.style.color = '#b388ff';
        toast.appendChild(toastIcon);
        toast.appendChild(this._text(' ' + message));
        container.appendChild(toast);
        requestAnimationFrame(() => toast.style.opacity = '1');
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    showFirstVisitGuide() {
        const key = 'wordeth_verses_guide_seen';
        if (!this.isGuest && localStorage.getItem(key)) return;
        if (this._walkthroughActive) return;

        setTimeout(() => this._launchGuide(key), 600);
    }

    _launchGuide(key) {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            this._showMobileTooltipWalkthrough(key);
        } else {
            const overlay = document.getElementById('welcome-guide-overlay');
            if (!overlay) {
                this._showMobileTooltipWalkthrough(key);
                return;
            }
            overlay.style.cssText = '';
            overlay.classList.add('active');
            const closeBtn = document.getElementById('welcome-guide-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    overlay.classList.remove('active');
                    overlay.style.display = 'none';
                    localStorage.setItem(key, '1');
                }, { once: true });
            }
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    overlay.style.display = 'none';
                    localStorage.setItem(key, '1');
                }
            });
            const fullGuideLink = document.getElementById('welcome-guide-full-link');
            if (fullGuideLink) {
                fullGuideLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    overlay.classList.remove('active');
                    overlay.style.display = 'none';
                    localStorage.setItem(key, '1');
                    this._showFullInlineGuide();
                });
            }
        }
    }

    _showFullInlineGuide() {
        const guideFrame = document.createElement('div');
        guideFrame.id = 'inline-guide-overlay';
        guideFrame.style.cssText = 'position:fixed;inset:0;z-index:10001;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;padding:16px 12px;';
        const closeBar = document.createElement('div');
        closeBar.style.cssText = 'width:100%;max-width:700px;display:flex;justify-content:flex-end;margin-bottom:8px;flex-shrink:0;';
        const closeGuideBtn = document.createElement('button');
        this._setBtn(closeGuideBtn, 'fas fa-times', 'Close Guide');
        closeGuideBtn.style.cssText = 'background:#7c3aed;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;';
        closeGuideBtn.onclick = () => guideFrame.remove();
        closeBar.appendChild(closeGuideBtn);
        const scrollBox = document.createElement('div');
        scrollBox.style.cssText = 'width:100%;max-width:700px;flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;border-radius:12px;background:#1a1a2e;padding:24px 20px;color:#e0e0e0;font-family:Inter,sans-serif;line-height:1.6;';
        const sectionStyle = 'margin-bottom:20px;background:rgba(85,53,85,0.25);border:1px solid rgba(124,58,237,0.3);border-radius:12px;padding:16px;';
        const h3Style = 'color:#96c5b0;margin:0 0 10px;font-size:1rem;';
        const buildSection = (iconCls, title, items, last) => {
            const h3 = this._el('h3', {cssText: h3Style});
            const ico = this._icon(iconCls);
            ico.style.marginRight = '8px';
            h3.append(ico, this._text(title));
            const children = items.map((text, i) => {
                const p = this._el('p', {cssText: 'margin:0' + (i < items.length - 1 ? ' 0 8px' : '') + ';'});
                if (text.includes(' \u2014 ')) {
                    const [bold, rest] = text.split(' \u2014 ');
                    p.append(this._el('strong', {textContent: bold}), this._text(' \u2014 ' + rest));
                } else {
                    p.textContent = text;
                }
                return p;
            });
            return this._el('div', {cssText: last ? sectionStyle.replace('margin-bottom:20px;', '') : sectionStyle}, h3, ...children);
        };
        const guideTitle = this._el('h2', {cssText: 'text-align:center;font-size:1.6rem;margin:0 0 6px;color:#96c5b0;'});
        guideTitle.append(this._icon('fas fa-headphones'), this._text(' Verses Room Guide'));
        scrollBox.append(
            guideTitle,
            this._el('p', {cssText: 'text-align:center;color:#a78bfa;margin-bottom:24px;font-size:0.95rem;', textContent: 'Everything you need to know about live audio rooms'}),
            buildSection('fas fa-play-circle', 'Getting Started', [
                'Create a Room \u2014 Tap "Create Room", give it a name, and you\'re the host.',
                'Join a Room \u2014 Tap any live room card to join as a listener.',
                'Invite Friends \u2014 Use the share or invite buttons to bring others in.'
            ]),
            buildSection('fas fa-sliders-h', 'Action Bar', [
                'MIC \u2014 Toggle your microphone on/off (speakers only).',
                'EFFECTS \u2014 Apply voice filters like Echo, Deep, Radio, and more.',
                'KARAOKE \u2014 Search and play songs with synced lyrics.',
                'CAMERA \u2014 Enable video with optional AR filters.',
                'PHOTO \u2014 Share photos in the room chat.',
                'HAND \u2014 Raise your hand to request stage access.'
            ]),
            buildSection('fas fa-crown', 'Host Controls', [
                'Stage Access \u2014 Switch between invite-only and open stage.',
                'Invite to Stage \u2014 Tap the 3-dot menu on a listener to promote them.',
                'Mute All \u2014 Mute all speakers at once.',
                'Lock / Close \u2014 Lock the room or close it entirely.'
            ]),
            buildSection('fas fa-lightbulb', 'Tips', [
                'Use headphones to avoid echo and feedback.',
                'Listeners hear everything \u2014 you don\'t need to be on stage to enjoy.',
                'If you lose connection, just rejoin \u2014 the room stays live as long as someone is in it.'
            ], true)
        );
        guideFrame.appendChild(closeBar);
        guideFrame.appendChild(scrollBox);
        document.body.appendChild(guideFrame);
        guideFrame.addEventListener('click', (ev) => {
            if (ev.target === guideFrame) guideFrame.remove();
        });
    }

    _showMobileTooltipWalkthrough(storageKey) {
        if (this._walkthroughActive) return;
        this._walkthroughActive = true;
        const isGuest = this.isGuest;
        const steps = isGuest ? [
            {
                target: '#speakers-stage',
                title: 'The Stage',
                text: 'Speakers appear here. You\'re listening live right now!',
                icon: 'fa-users',
                position: 'below'
            },
            {
                target: '#chat-input',
                title: 'Chat',
                text: 'Sign up to send messages and join the conversation.',
                icon: 'fa-comment',
                position: 'above'
            },
            {
                target: '#raise-hand',
                title: 'Get On Stage',
                text: 'Sign up to raise your hand and speak with everyone.',
                icon: 'fa-hand-paper',
                position: 'above'
            },
            {
                target: '#share-room-mobile-btn, #share-room-btn',
                title: 'Share This Room',
                text: 'Invite your friends to listen along.',
                icon: 'fa-share-alt',
                position: 'above'
            }
        ] : [
            {
                target: '#speakers-stage',
                title: 'The Stage',
                text: 'Speakers appear here. As a listener, raise your hand or wait for an invite to join.',
                icon: 'fa-users',
                position: 'below'
            },
            {
                target: '#toggle-audio',
                title: 'Microphone',
                text: 'Tap to mute or unmute yourself. Only works when you\'re on stage.',
                icon: 'fa-microphone',
                position: 'above'
            },
            {
                target: '#audio-filter-btn',
                title: 'Voice Effects',
                text: 'Add fun voice filters like Echo, Robot, Deep, and more.',
                icon: 'fa-pen-fancy',
                position: 'above'
            },
            {
                target: '#karaoke-btn',
                title: 'Karaoke',
                text: 'Search for songs and sing along with synced lyrics.',
                icon: 'fa-record-vinyl',
                position: 'above'
            },
            {
                target: '#raise-hand',
                title: 'Raise Hand',
                text: 'Request to join the stage. The host will see your request.',
                icon: 'fa-hand-paper',
                position: 'above'
            },
            {
                target: '#share-room-mobile-btn, #share-room-btn',
                title: 'Share & Invite',
                text: 'Share the room link or invite friends directly.',
                icon: 'fa-share-alt',
                position: 'above'
            },
            {
                target: '#chat-input',
                title: 'Chat',
                text: 'Send messages to everyone in the room. Share photos too!',
                icon: 'fa-comment',
                position: 'above'
            }
        ];

        if (this.isRoomHost && !isGuest) {
            steps.splice(1, 0, {
                target: '#host-panel-toggle, #host-controls-panel',
                title: 'Host Controls',
                text: 'You\'re the host! Control stage access, mute speakers, toggle video/karaoke, and manage the room.',
                icon: 'fa-crown',
                position: 'above'
            });
        }

        let currentStep = 0;
        let highlight = null;
        let tooltip = null;
        const overlay = document.createElement('div');
        overlay.className = 'mobile-walkthrough-overlay';
        document.body.appendChild(overlay);

        document.documentElement.style.overflow = 'hidden';
        const dismiss = () => {
            this._walkthroughActive = false;
            document.documentElement.style.overflow = '';
            overlay.remove();
            closeBtn.remove();
            if (highlight) highlight.remove();
            if (tooltip) tooltip.remove();
            highlight = null;
            tooltip = null;
            localStorage.setItem(storageKey, '1');
        };

        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-walkthrough-close';
        this._setBtn(closeBtn, 'fas fa-times', 'Close Tour');
        closeBtn.onclick = dismiss;
        document.body.appendChild(closeBtn);

        setTimeout(() => overlay.addEventListener('click', dismiss), 300);

        const _isVisible = (el) => {
            if (!el) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
            if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return false;
            return true;
        };

        const _findTarget = (selector) => {
            for (const sel of selector.split(',')) {
                const el = document.querySelector(sel.trim());
                if (_isVisible(el)) return el;
            }
            return null;
        };

        const _getSafeInsets = () => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);left:0;visibility:hidden;pointer-events:none;';
            document.body.appendChild(probe);
            const probeRect = probe.getBoundingClientRect();
            const sat = probeRect.top;
            const sab = window.innerHeight - probeRect.bottom;
            probe.remove();
            return {
                top: Math.max(sat, 0) + 44,
                bottom: Math.max(sab, 0) + 44
            };
        };

        const showStep = (idx) => {
            if (highlight) highlight.remove();
            if (tooltip) tooltip.remove();

            if (idx >= steps.length) {
                this._walkthroughActive = false;
                document.documentElement.style.overflow = '';
                overlay.remove();
                closeBtn.remove();
                highlight = null;
                tooltip = null;
                localStorage.setItem(storageKey, '1');
                return;
            }

            const step = steps[idx];
            const targetEl = _findTarget(step.target);

            if (!targetEl) {
                currentStep = idx + 1;
                showStep(currentStep);
                return;
            }

            const safe = _getSafeInsets();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 12;
            const gap = 12;

            tooltip = document.createElement('div');
            tooltip.className = 'mobile-walkthrough-tooltip';

            const tipHeader = this._el('div', {className: 'walk-tip-header'},
                this._el('div', {className: 'walk-tip-icon'}, this._icon('fas ' + step.icon)),
                this._el('div', {className: 'walk-tip-title', textContent: step.title}),
                this._el('button', {className: 'walk-tip-skip', textContent: 'Skip'}));
            const tipText = this._el('p', {className: 'walk-tip-text', textContent: step.text});
            const dotsDiv = this._el('div', {className: 'walk-dots'}, ...steps.map((_, i) =>
                this._el('span', {className: 'walk-dot' + (i === idx ? ' active' : '')})));
            const navDiv = this._el('div', {className: 'walk-tip-nav'});
            if (idx > 0) {
                navDiv.appendChild(this._el('button', {className: 'walk-btn-back'}, this._icon('fas fa-chevron-left')));
            }
            const nextBtn = this._el('button', {className: 'walk-btn-next'});
            if (idx === steps.length - 1) {
                nextBtn.textContent = 'Done';
            } else {
                nextBtn.append(this._text('Next '), this._icon('fas fa-chevron-right'));
            }
            navDiv.appendChild(nextBtn);
            tooltip.append(tipHeader, tipText, this._el('div', {className: 'walk-tip-footer'}, dotsDiv, navDiv));

            tooltip.style.cssText = 'position:fixed;z-index:10005;left:' + margin + 'px;right:' + margin + 'px;visibility:hidden;';
            document.body.appendChild(tooltip);

            const tipH = tooltip.getBoundingClientRect().height;

            const rect = targetEl.getBoundingClientRect();
            overlay.style.opacity = '0';

            highlight = document.createElement('div');
            highlight.className = 'mobile-walkthrough-highlight';
            const hlPad = 6;
            const hlTop = rect.top - hlPad;
            const hlLeft = Math.max(0, rect.left - hlPad);
            const hlW = Math.min(rect.width + hlPad * 2, vw - hlLeft);
            const hlH = rect.height + hlPad * 2;
            highlight.style.cssText = 'position:fixed;z-index:10004;pointer-events:none;border:2px solid var(--mint,#00E5A8);border-radius:12px;'
                + 'top:' + hlTop + 'px;left:' + hlLeft + 'px;width:' + hlW + 'px;height:' + hlH + 'px;'
                + 'box-shadow:0 0 0 9999px rgba(6,4,9,0.85),0 0 20px rgba(0,229,168,0.4);';
            document.body.appendChild(highlight);

            const hlBottom = hlTop + hlH;
            const maxH = vh - safe.top - safe.bottom;
            const effectiveTipH = Math.min(tipH, maxH);
            const spaceAbove = hlTop - gap - safe.top;
            const spaceBelow = vh - hlBottom - gap - safe.bottom;

            let finalTop;
            let arrowClass;

            const preferAbove = step.position === 'above';
            const preferBelow = step.position === 'below';

            if (preferBelow && spaceBelow >= effectiveTipH) {
                finalTop = hlBottom + gap;
                arrowClass = 'arrow-above';
            } else if (preferAbove && spaceAbove >= effectiveTipH) {
                finalTop = hlTop - gap - effectiveTipH;
                arrowClass = 'arrow-below';
            } else if (spaceBelow >= effectiveTipH) {
                finalTop = hlBottom + gap;
                arrowClass = 'arrow-above';
            } else if (spaceAbove >= effectiveTipH) {
                finalTop = hlTop - gap - effectiveTipH;
                arrowClass = 'arrow-below';
            } else if (spaceBelow >= spaceAbove) {
                finalTop = hlBottom + gap;
                arrowClass = 'arrow-above';
            } else {
                finalTop = hlTop - gap - effectiveTipH;
                arrowClass = 'arrow-below';
            }

            finalTop = Math.max(safe.top, Math.min(finalTop, vh - effectiveTipH - safe.bottom));

            tooltip.style.cssText = 'position:fixed;z-index:10005;left:' + margin + 'px;right:' + margin + 'px;'
                + 'top:' + finalTop + 'px;max-height:' + maxH + 'px;';
            tooltip.classList.add(arrowClass);

            const targetCenterX = rect.left + rect.width / 2;
            const tooltipWidth = vw - margin * 2;
            const arrowPct = ((targetCenterX - margin) / tooltipWidth) * 100;
            tooltip.style.setProperty('--arrow-left', Math.max(10, Math.min(90, arrowPct)) + '%');

            tooltip.querySelector('.walk-tip-skip').onclick = dismiss;
            tooltip.querySelector('.walk-btn-next').onclick = () => {
                currentStep++;
                showStep(currentStep);
            };
            const backBtn = tooltip.querySelector('.walk-btn-back');
            if (backBtn) backBtn.onclick = () => {
                currentStep--;
                showStep(currentStep);
            };
        };

        setTimeout(() => showStep(0), 600);
    }

    toggleHandRaise() {
        if (this._guestGate('raise hand')) return;
        if (this.isSpeaker) return;
        this.handRaised = !this.handRaised;
        this.raiseHandBtn?.classList.toggle('hand-raised', this.handRaised);
        
        const handIndicator = document.querySelector('.hand-raise-indicator');
        handIndicator?.classList.toggle('hidden', !this.handRaised);
        
        if (this.handRaised) {
            this.socket?.emit('request-stage', { roomId: this.currentRoom });
            this.addChatMessage('System', 'You raised your hand to speak', true);
        } else {
            this.notifyParticipants('hand-raise', { raised: false });
        }
    }

    requestStage() {
        if (this._guestGate('interact')) return;
        if (this.isSpeaker || !this.socket || !this.currentRoom) return;
        this.socket.emit('request-stage', { roomId: this.currentRoom });
        this.addChatMessage('System', 'You requested to join the stage.', true);
        this.showToast('Request sent to host', 'fa-hand-paper', 3000);
    }

    joinStage() {
        if (this._guestGate('interact')) return;
        if (this.isSpeaker || !this.socket || !this.currentRoom) return;
        if (this.stageAccess !== 'open') {
            this.requestStage();
            return;
        }
        this.socket.emit('self-promote-to-stage', { roomId: this.currentRoom });
    }

    toggleStageAccess() {
        if (!this.isRoomHost || !this.socket || !this.currentRoom) return;
        const newMode = this.stageAccess === 'open' ? 'invite-only' : 'open';
        this.socket.emit('set-stage-access', { roomId: this.currentRoom, mode: newMode });
        this.stageAccess = newMode;
        this.updateStageControls();
    }

    updateStageControls() {
        const joinStageBtn = document.getElementById('join-stage-btn');
        const stageAccessToggle = document.getElementById('stage-access-toggle');

        if (joinStageBtn) {
            if (this.isSpeaker || this.isRoomHost) {
                joinStageBtn.style.display = 'none';
            } else if (this.stageAccess === 'open') {
                joinStageBtn.style.display = '';
                this._setBtnWithSpan(joinStageBtn, 'fas fa-arrow-up', 'Join Stage');
                joinStageBtn.title = 'Join the stage (open)';
            } else {
                joinStageBtn.style.display = '';
                this._setBtnWithSpan(joinStageBtn, 'fas fa-hand-paper', 'Request to Speak');
                joinStageBtn.title = 'Ask the host to join the stage';
            }
        }

        if (stageAccessToggle) {
            if (this.isRoomHost) {
                stageAccessToggle.style.display = '';
                if (this.stageAccess === 'open') {
                    this._setBtn(stageAccessToggle, 'fas fa-door-open', 'Open Stage');
                    stageAccessToggle.classList.add('active');
                } else {
                    this._setBtn(stageAccessToggle, 'fas fa-lock', 'Invite Only');
                    stageAccessToggle.classList.remove('active');
                }
            } else {
                stageAccessToggle.style.display = 'none';
            }
        }

        if (this.raiseHandBtn) {
            if (this.isSpeaker) {
                this.raiseHandBtn.style.display = 'none';
            } else {
                this.raiseHandBtn.style.display = '';
            }
        }
    }

    _showStageRequestToast(socketId, userName) {
        let container = document.getElementById('room-toasts');
        if (!container) {
            container = document.createElement('div');
            container.id = 'room-toasts';
            container.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = 'background:rgba(30,0,50,0.95);color:#e0d0ff;padding:12px 18px;border-radius:16px;font-size:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid rgba(138,43,226,0.4);backdrop-filter:blur(10px);pointer-events:auto;';
        const handIcon = this._icon('fas fa-hand-paper');
        handIcon.style.color = '#98ff98';
        toast.appendChild(handIcon);
        const nameSpan = document.createElement('span');
        const nameStrong = document.createElement('strong');
        nameStrong.textContent = userName;
        nameSpan.appendChild(nameStrong);
        nameSpan.appendChild(this._text(' wants to speak'));
        toast.appendChild(nameSpan);
        const approveBtn = document.createElement('button');
        approveBtn.className = 'approve-stage-btn';
        approveBtn.style.cssText = 'background:#98ff98;color:#1a1a2e;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;font-size:0.85rem;';
        approveBtn.textContent = 'Approve';
        approveBtn.addEventListener('click', () => {
            this.socket?.emit('promote-to-speaker', { roomId: this.currentRoom, targetSocketId: socketId });
            toast.remove();
        });
        toast.appendChild(approveBtn);
        const denyBtn = document.createElement('button');
        denyBtn.className = 'deny-stage-btn';
        denyBtn.style.cssText = 'background:transparent;color:#aaa;border:1px solid #555;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.85rem;';
        denyBtn.textContent = 'Deny';
        denyBtn.addEventListener('click', () => {
            toast.remove();
        });
        toast.appendChild(denyBtn);

        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
    }

    // ═══════════════════════════════════════════════════════════════
    // Replays Browse System
    // ═══════════════════════════════════════════════════════════════

    async loadReplays() {
        await this._fetchReplays(true);
    }

    async _fetchReplays(reset) {
        if (reset) {
            this.replayPage = 1;
            this.replayData = [];
        }
        try {
            const params = new URLSearchParams({ page: this.replayPage, limit: 12, sort: this.replaySort });
            if (this.replayGenre !== 'all') params.set('genre', this.replayGenre);
            const resp = await fetch(apiUrl('/api/replays?' + params.toString()));
            if (!resp.ok) return;
            const data = await resp.json();
            if (reset) this.replayData = data.replays || [];
            else this.replayData = this.replayData.concat(data.replays || []);
            this.replayHasMore = data.hasMore || false;
            this._renderReplays();
        } catch (e) {
            console.warn('[Replays] Fetch error:', e.message);
        }
    }

    _renderReplays() {
        const grid = document.getElementById('replays-grid');
        if (!grid) return;
        grid.innerHTML = '';
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const currentUserId = user._id || null;
        const acctType = (user.accountType || 'fan').toLowerCase();
        const isCreator = ['artist', 'designer', 'label', 'creator'].includes(acctType);

        if (this.replayData.length === 0) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-play-circle"></i><p>No replays yet. Replays are saved when rooms end.</p></div>';
            return;
        }

        this.replayData.forEach(replay => {
            grid.appendChild(this._createReplayCard(replay, currentUserId, isCreator));
        });

        const loadMoreEl = document.getElementById('replay-load-more');
        if (loadMoreEl) loadMoreEl.style.display = this.replayHasMore ? '' : 'none';
    }

    _createReplayCard(replay, currentUserId, isCreator) {
        const creatorName = replay.creatorUserId?.name || 'Unknown';
        const creatorAvatar = replay.creatorUserId?.avatar || '';
        const creatorRating = replay.creatorUserId?.creatorRating || {};
        const genre = replay.genre || 'general';
        const genreIcon = this.getGenreIconClass(genre);
        const duration = this._formatDuration(replay.duration || 0);
        const tokenPrice = replay.tokenPrice || 0;
        const isBoosted = replay.boostedUntil && new Date(replay.boostedUntil) > new Date();
        const isOwn = currentUserId && replay.creatorUserId?._id === currentUserId;

        const priceBadge = tokenPrice > 0
            ? this._el('span', {className: 'room-token-badge gated'}, this._text('\uD83C\uDF9F ' + tokenPrice + ' tokens'))
            : this._el('span', {className: 'room-token-badge free'}, this._text('FREE'));

        const ratingStars = this._renderStars(replay.rating?.average || 0);
        const ratingCount = replay.rating?.count || 0;

        const statsDiv = this._el('div', {className: 'room-stats'},
            this._el('span', {className: 'stat'}, this._icon('fas fa-play'), this._text(' ' + (replay.totalPlays || 0))),
            this._el('span', {className: 'stat'}, this._icon('fas fa-clock'), this._text(' ' + duration)),
            this._el('span', {className: 'stat replay-rating-stat'}, ratingStars, this._text(' (' + ratingCount + ')')));

        const creatorDiv = this._el('div', {className: 'replay-creator'},
            creatorAvatar
                ? this._el('img', {className: 'replay-creator-avatar', src: creatorAvatar, alt: creatorName})
                : this._el('div', {className: 'replay-creator-avatar-placeholder'}, this._text(creatorName.charAt(0).toUpperCase())),
            this._el('span', {className: 'replay-creator-name', textContent: creatorName}));

        if (creatorRating.average > 0) {
            creatorDiv.appendChild(this._renderStars(creatorRating.average, true));
        }

        const roomInfo = this._el('div', {className: 'room-info'},
            this._el('div', {className: 'room-genre'}, this._icon(genreIcon), this._el('span', {textContent: this.capitalizeFirst(genre)})),
            this._el('h3', {textContent: replay.title || 'Untitled Replay'}),
            priceBadge,
            creatorDiv,
            statsDiv);

        const actionsDiv = this._el('div', {className: 'room-actions'});
        const playBtn = this._el('button', {className: 'join-room-btn primary replay-play-btn'}, this._icon('fas fa-play'), this._text(' Play'));
        playBtn.dataset.replayId = replay._id;
        playBtn.dataset.tokenPrice = tokenPrice;
        actionsDiv.appendChild(playBtn);

        if (isOwn && isCreator && !isBoosted) {
            const replayAge = Date.now() - new Date(replay.createdAt).getTime();
            const threeDays = 3 * 24 * 60 * 60 * 1000;
            if (replayAge < threeDays) {
                const boostBtn = this._el('button', {className: 'boost-replay-btn secondary-btn'}, this._icon('fas fa-rocket'), this._text(' Boost'));
                boostBtn.dataset.replayId = replay._id;
                actionsDiv.appendChild(boostBtn);
            }
        }

        const cardClass = isBoosted ? 'room-card replay-card replay-boosted' : (tokenPrice > 0 ? 'room-card replay-card room-card-gated' : 'room-card replay-card');
        const card = this._el('div', {className: cardClass},
            this._el('div', {className: 'room-preview'}, roomInfo),
            actionsDiv);

        if (isBoosted) {
            const promotedBadge = this._el('span', {className: 'promoted-badge'}, this._icon('fas fa-rocket'), this._text(' Promoted'));
            card.querySelector('.room-info').prepend(promotedBadge);
        }

        if (isOwn && replay.boostTier !== 'none' && isBoosted) {
            const timeLeft = this._boostTimeLeft(replay.boostedUntil);
            const statusEl = this._el('div', {className: 'boost-status'}, this._text(replay.boostTier.charAt(0).toUpperCase() + replay.boostTier.slice(1) + ' boost \u2022 ' + timeLeft + ' left'));
            card.querySelector('.room-actions').prepend(statusEl);
        }

        card.dataset.replayId = replay._id;
        return card;
    }

    _formatDuration(seconds) {
        if (seconds < 60) return seconds + 's';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        if (m < 60) return m + ':' + String(s).padStart(2, '0');
        const h = Math.floor(m / 60);
        return h + ':' + String(m % 60).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    _boostTimeLeft(until) {
        const diff = new Date(until) - new Date();
        if (diff <= 0) return 'expired';
        const hours = Math.floor(diff / 3600000);
        if (hours < 24) return hours + 'h';
        return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h';
    }

    _renderStars(avg, small) {
        const container = this._el('span', {className: small ? 'star-display star-display-sm' : 'star-display'});
        for (let i = 1; i <= 5; i++) {
            const cls = i <= Math.round(avg) ? 'fas fa-star' : 'far fa-star';
            container.appendChild(this._icon(cls));
        }
        return container;
    }

    async _playReplay(replayId, tokenPrice) {
        if (tokenPrice > 0) {
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                this._showReplayGate(replayId, tokenPrice, true);
                return;
            }
            const balance = await this._fetchTokenBalance();
            if (balance === 0) {
                this._showReplayGate(replayId, tokenPrice, true);
                return;
            }
            if (balance < tokenPrice) {
                this._showReplayGate(replayId, tokenPrice, false, balance);
                return;
            }
            this._showReplayConfirm(replayId, tokenPrice, balance);
            return;
        }
        this._doPlayReplay(replayId);
    }

    _showReplayGate(replayId, tokenPrice, noSub, balance) {
        const modal = document.getElementById('token-gate-modal');
        if (!modal) return;
        const actionsDiv = document.getElementById('token-gate-actions');
        const insufficientDiv = document.getElementById('token-gate-insufficient');
        const noSubDiv = document.getElementById('token-gate-no-sub');
        document.getElementById('token-gate-price').textContent = tokenPrice;
        document.getElementById('token-gate-user-balance').textContent = balance || 0;
        actionsDiv.classList.add('hidden');
        insufficientDiv.classList.add('hidden');
        noSubDiv.classList.add('hidden');
        if (noSub) noSubDiv.classList.remove('hidden');
        else {
            insufficientDiv.classList.remove('hidden');
            document.getElementById('token-gate-needed').textContent = tokenPrice;
            document.getElementById('token-gate-have').textContent = balance || 0;
        }
        modal.classList.add('active');
    }

    _showReplayConfirm(replayId, tokenPrice, balance) {
        const modal = document.getElementById('token-gate-modal');
        if (!modal) return;
        document.getElementById('token-gate-price').textContent = tokenPrice;
        document.getElementById('token-gate-user-balance').textContent = balance;
        document.getElementById('token-gate-actions').classList.remove('hidden');
        document.getElementById('token-gate-insufficient').classList.add('hidden');
        document.getElementById('token-gate-no-sub')?.classList.add('hidden');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn?.removeEventListener('click', onConfirm);
            cancelBtn?.removeEventListener('click', onCancel);
        };
        const onConfirm = () => { cleanup(); this._doPlayReplay(replayId); };
        const onCancel = () => { cleanup(); };
        const confirmBtn = document.getElementById('token-gate-confirm');
        const cancelBtn = document.getElementById('token-gate-cancel');
        confirmBtn?.addEventListener('click', onConfirm);
        cancelBtn?.addEventListener('click', onCancel);
        modal.classList.add('active');
    }

    async _doPlayReplay(replayId) {
        const token = localStorage.getItem('authToken');
        try {
            const resp = await fetch(apiUrl('/api/replays/' + replayId + '/play'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) }
            });
            const data = await resp.json();
            if (resp.ok) {
                const replay = this.replayData.find(r => r._id === replayId);
                if (replay) replay.totalPlays = (replay.totalPlays || 0) + 1;
                this._renderReplays();
                this._showToast('Playing replay', 'success');
            } else {
                this._showToast(data.message || 'Could not play replay', 'error');
            }
        } catch (e) {
            this._showToast('Error playing replay', 'error');
        }
    }

    loadReplayList() {
        const replayList = document.querySelector('.replay-list');
        if (!replayList) return;
        if (this.replayData.length === 0) {
            replayList.innerHTML = '<div class="empty-state" style="padding:1rem;text-align:center;color:var(--text-secondary);">No replays available yet.</div>';
            return;
        }
        replayList.replaceChildren(...this.replayData.slice(0, 5).map(replay => {
            const item = this._el('div', {className: 'replay-item'},
                this._el('div', {className: 'replay-thumbnail'}, this._icon('fas fa-play')),
                this._el('div', {className: 'replay-info'},
                    this._el('div', {className: 'replay-title', textContent: replay.title || 'Untitled'}),
                    this._el('div', {className: 'replay-details', textContent: (replay.genre || '') + ' \u2022 ' + this._formatDuration(replay.duration || 0) + ' \u2022 ' + (replay.participantCount || 0) + ' participants'})),
                this._el('div', {className: 'replay-duration', textContent: (replay.totalPlays || 0) + ' plays'}));
            item.dataset.replayId = replay._id;
            return item;
        }));
    }

    playReplay(replayId) {
        const replay = this.replayData.find(r => r._id === replayId);
        if (replay) {
            this._playReplay(replayId, replay.tokenPrice || 0);
            this.hideAllModals();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Room Rating System
    // ═══════════════════════════════════════════════════════════════

    _showRatingModal(roomId, replayId) {
        const token = localStorage.getItem('authToken');
        if (!token) return;
        const modal = document.getElementById('rating-modal');
        if (!modal) return;

        this._selectedRating = 0;
        this._selectedTags = [];
        document.getElementById('rating-room-id').value = roomId || '';
        document.getElementById('rating-replay-id').value = replayId || '';

        const stars = document.querySelectorAll('#star-rating-input i');
        stars.forEach(s => { s.className = 'far fa-star'; });
        document.querySelectorAll('.rating-tag').forEach(t => t.classList.remove('active'));
        document.getElementById('rating-label').textContent = '';
        document.getElementById('rating-submit').disabled = true;

        modal.classList.add('active');
    }

    _setupRatingListeners() {
        const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Amazing'];
        const starsContainer = document.getElementById('star-rating-input');
        if (starsContainer) {
            starsContainer.addEventListener('click', (e) => {
                const starEl = e.target.closest('[data-star]');
                if (!starEl) return;
                this._selectedRating = parseInt(starEl.dataset.star, 10);
                const stars = starsContainer.querySelectorAll('i');
                stars.forEach((s, idx) => {
                    s.className = idx < this._selectedRating ? 'fas fa-star' : 'far fa-star';
                });
                document.getElementById('rating-label').textContent = ratingLabels[this._selectedRating] || '';
                document.getElementById('rating-submit').disabled = false;
            });
        }

        document.querySelectorAll('.rating-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (this._selectedTags.includes(tag)) {
                    this._selectedTags = this._selectedTags.filter(t => t !== tag);
                    btn.classList.remove('active');
                } else {
                    this._selectedTags.push(tag);
                    btn.classList.add('active');
                }
            });
        });

        document.getElementById('rating-submit')?.addEventListener('click', () => this._submitRating());
    }

    async _submitRating() {
        const token = localStorage.getItem('authToken');
        if (!token || this._selectedRating === 0) return;
        const roomId = document.getElementById('rating-room-id').value;
        const replayId = document.getElementById('rating-replay-id').value;
        try {
            const resp = await fetch(apiUrl('/api/ratings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ roomId, replayId: replayId || undefined, rating: this._selectedRating, tags: this._selectedTags })
            });
            const data = await resp.json();
            if (resp.ok) {
                this._showToast('Thanks for rating!', 'success');
            } else {
                this._showToast(data.message || 'Could not submit rating', 'error');
            }
        } catch (e) {
            this._showToast('Error submitting rating', 'error');
        }
        document.getElementById('rating-modal')?.classList.remove('active');
    }

    // ═══════════════════════════════════════════════════════════════
    // Token Boost System
    // ═══════════════════════════════════════════════════════════════

    async _showBoostModal(replayId) {
        const modal = document.getElementById('boost-modal');
        if (!modal) return;
        document.getElementById('boost-replay-id').value = replayId;
        document.querySelectorAll('.boost-tier-option').forEach(o => o.classList.remove('selected'));
        document.getElementById('boost-confirm').disabled = true;
        const balance = await this._fetchTokenBalance();
        document.getElementById('boost-token-balance').textContent = balance;
        modal.classList.add('active');
    }

    _setupBoostListeners() {
        document.querySelectorAll('.boost-tier-option').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.boost-tier-option').forEach(o => o.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('boost-confirm').disabled = false;
            });
        });

        document.getElementById('boost-confirm')?.addEventListener('click', () => this._submitBoost());
    }

    async _submitBoost() {
        const token = localStorage.getItem('authToken');
        if (!token) return;
        const replayId = document.getElementById('boost-replay-id').value;
        const selectedTier = document.querySelector('.boost-tier-option.selected');
        if (!selectedTier) return;
        const tier = selectedTier.dataset.tier;

        document.getElementById('boost-confirm').disabled = true;
        try {
            const resp = await fetch(apiUrl('/api/boost'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ replayId, tier })
            });
            const data = await resp.json();
            if (resp.ok) {
                this._showToast('Replay boosted!', 'success');
                document.getElementById('boost-modal')?.classList.remove('active');
                this._fetchReplays(true);
            } else {
                this._showToast(data.message || 'Could not boost replay', 'error');
                document.getElementById('boost-confirm').disabled = false;
            }
        } catch (e) {
            this._showToast('Error boosting replay', 'error');
            document.getElementById('boost-confirm').disabled = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Room Management — sequential pipeline (create / join / leave)
    // Each step MUST succeed before the next runs. UI only appears
    // after all critical gates pass. Every failure resets state and
    // returns the user to the lobby with a clear message.
    // ═══════════════════════════════════════════════════════════════

    _getUserContext() {
        const user = this.isGuest ? {} : JSON.parse(localStorage.getItem('user') || '{}');
        return {
            user,
            userName: this.isGuest ? 'Guest' : (user.name || user.username || 'Anonymous'),
            userId: this.isGuest ? `guest_${Date.now()}` : (user._id || user.id || `anon_${Date.now()}`),
            avatar: user.avatar || null,
            isGuest: this.isGuest
        };
    }

    _resetJoinState() {
        this.currentRoom = null;
        this.roomJoinTime = null;
        this._joinConfirmed = false;
        this._agoraJoinHandled = false;
        this._firstVisitGuideShown = false;
        this._pendingJoinRoom = null;
        this._pendingJoinIsInvite = false;
        this._pendingJoinIsHost = false;
        this.isRoomHost = false;
        this.isSpeaker = false;
        this.isAudioMuted = false;
        this._welcomeShown = false;
        if (this._invite.status !== 'pending') {
            this._invite = { status: 'idle', roomId: null, retries: 0, maxRetries: 5 };
        }
        if (this._inviteHardTimeout) {
            clearTimeout(this._inviteHardTimeout);
            this._inviteHardTimeout = null;
        }
    }

    async _ensureSocket() {
        await this.connectSocket();
        if (!this.socket?.connected) {
            throw new Error('Could not establish a live connection. Check your network and try again.');
        }
        return this.socket;
    }

    async _socketJoinRoom(payload) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Room join was not confirmed by the server.')), 10000);
            this.socket.emit('join-room', payload, (ack) => {
                clearTimeout(timeout);
                if (ack && ack.success === false) {
                    reject(new Error(ack.message || 'Server rejected the room join.'));
                } else {
                    resolve(ack || {});
                }
            });
        });
    }

    async _acquireMic() {
        if (this.localStream) {
            const existing = this.localStream.getAudioTracks()[0];
            if (existing && existing.readyState === 'live' && existing.enabled) return;
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        this.localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const track = this.localStream.getAudioTracks()[0];
        if (!track || track.readyState !== 'live') {
            throw new Error('Microphone track is not active.');
        }
    }

    _applyRoomState(roomId, isHost, extra = {}) {
        this.currentRoom = roomId;
        this.roomJoinTime = Date.now();
        this._joinConfirmed = true;
        this._pendingJoinRoom = null;
        this.isRoomHost = isHost;
        this.isSpeaker = isHost;
        this.isAudioMuted = false;
        this.stageAccess = extra.stageAccess || 'invite-only';
        this.karaokeEnabled = isHost ? false : (extra.karaokeEnabled || false);
        this.videoMode = isHost ? 'off' : (extra.videoMode || 'off');
        this._welcomeShown = true;
        this._agoraJoinHandled = true;
        this._pendingJoinIsInvite = false;
        this._pendingJoinIsHost = false;
    }

    _enterRoomUI(roomId, isHost, roomName, participants) {
        this._hideKeyUnlock();
        if (this.toggleAudioBtn) {
            this._setBtnWithSpan(this.toggleAudioBtn, 'fas fa-microphone', 'Mic');
            this.toggleAudioBtn.classList.remove('muted');
        }
        this.updateKaraokeButtonState();
        this.updateVideoButtonState();
        this.updateHostControls();

        if (roomName) {
            const rnEl = document.getElementById('room-name');
            if (rnEl) rnEl.textContent = roomName;
        }

        this._showRoomUI(roomId, isHost);
        if (participants) this.updateParticipantDisplay(participants);

        this._requestWakeLock();
        this._startSilentAudioKeepAlive();
        this._startSpeakingIndicator();
        this._playSfx('enterRoom');
    }

    _playKeyUnlock() {
        const overlay = document.getElementById('key-unlock-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        if (this._keyUnlockTimer) clearTimeout(this._keyUnlockTimer);
        this._keyUnlockTimer = setTimeout(() => this._hideKeyUnlock(), 2500);
    }

    _hideKeyUnlock() {
        if (this._keyUnlockTimer) { clearTimeout(this._keyUnlockTimer); this._keyUnlockTimer = null; }
        document.getElementById('key-unlock-overlay')?.classList.remove('active');
    }

    async createRoom() {
        this._primeSfx();
        if (!this.createRoomForm) return;
        this._playKeyUnlock();

        const submitBtn = this.createRoomForm.querySelector('button[type="submit"]');
        const origText = submitBtn?.textContent;
        const setStatus = (msg) => { if (submitBtn) submitBtn.textContent = msg; };
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData(this.createRoomForm);

        // Scheduled path: save for later instead of opening now
        if (document.getElementById('schedule-room-toggle')?.checked) {
            if (submitBtn) submitBtn.disabled = false;
            await this._createScheduledRoom(formData, submitBtn, origText);
            return;
        }

        const roomName = formData.get('room-name-input') || 'Untitled Room';
        const initialSong = formData.get('initial-song') || '';
        const tokenPrice = parseInt(formData.get('room-token-price'), 10) || 0;
        const ctx = this._getUserContext();

        console.log('[Create] Pipeline start:', roomName);

        try {
            setStatus('Creating\u2026');
            const resp = await this._fetchWithTimeout(apiUrl('/api/rooms/create-and-join'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
                body: JSON.stringify({ name: roomName, userId: ctx.userId, userName: ctx.userName, avatar: ctx.avatar, tokenPrice }),
                cache: 'no-store'
            }, 15000);
            const httpData = await resp.json();
            if (!httpData.success || !httpData.id) throw new Error(httpData?.message || 'Server could not create the room.');
            const roomId = httpData.id;
            console.log('[Create] 1/5 HTTP ok, roomId:', roomId);

            setStatus('Connecting\u2026');
            const sock = await this._ensureSocket();
            console.log('[Create] 2/5 Socket ok:', sock.id);

            this._agoraJoinHandled = false;
            this._firstVisitGuideShown = true;

            setStatus('Gathering the vibes\u2026');
            await this._socketJoinRoom({ roomId, userId: ctx.userId, userName: ctx.userName, isHost: true, roomName, avatar: ctx.avatar });
            this._joinConfirmed = true;
            console.log('[Create] 3/5 Socket join confirmed');

            setStatus('Tidying things up\u2026');
            try { await this._acquireMic(); console.log('[Create] 4/5 Mic ready'); }
            catch (e) { console.warn('[Create] 4/5 Mic skipped:', e.message); }

            try {
                await this._agoraJoinGuarded(roomId, {});
                this._agoraJoinHandled = true;
                console.log('[Create] 5/5 Agora connected');
            } catch (e) {
                console.error('[Create] 5/5 Agora failed:', e.message);
                this._agoraJoinHandled = false;
                this.addChatMessage('System', 'Audio connection failed. Retrying...', true);
                setTimeout(async () => {
                    if (this._agoraJoinHandled || !this.isInRoom()) return;
                    try {
                        await this._agoraJoinGuarded(roomId, {});
                        this._agoraJoinHandled = true;
                        this.addChatMessage('System', 'Audio connected!', true);
                    } catch (retryErr) {
                        console.error('[Create] Agora retry failed:', retryErr.message);
                        this.addChatMessage('System', 'Audio connection failed. Try leaving and rejoining.', true);
                    }
                }, 3000);
            }

            this._applyRoomState(roomId, true, httpData);
            this.hideAllModals();
            const songEl = document.getElementById('current-song');
            if (songEl) songEl.textContent = initialSong ? `Currently discussing: "${initialSong}"` : '';
            this._enterRoomUI(roomId, true, roomName);
            this.addChatMessage('System', 'Welcome! You are on stage as the host.', true);
            this._firstVisitGuideShown = false;
            this.showFirstVisitGuide();

            window.history.replaceState({ room: roomId }, '', `/verses.html?room=${encodeURIComponent(roomId)}`);
            fetch(apiUrl('/api/analytics/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: 'verse_create', segment: 'community', metadata: { roomId, page: 'verses' } }) }).catch(() => {});
            console.log('[Create] Pipeline complete');
        } catch (error) {
            console.error('[Create] Failed:', error.message);
            this._resetJoinState();
            this._restoreLobbyUI();
            this.showToast?.(error.name === 'AbortError' ? 'Server took too long. Please try again.' : (error.message || 'Something went wrong.'), 'fa-exclamation-circle');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText || 'Create Room'; }
        }
    }

    _fetchWithTimeout(url, options, timeoutMs = 10000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
    }

    _restoreLobbyUI() {
        this._hideKeyUnlock();
        const inviteSpinner = document.getElementById('invite-joining-msg');
        if (inviteSpinner) inviteSpinner.remove();
        const endedScreen = document.getElementById('room-ended-screen');
        if (endedScreen) endedScreen.remove();
        if (this.roomSelection) this.roomSelection.style.display = '';
        this.audioRoom?.classList.add('hidden');
        document.body.classList.remove('in-room');
        const pageFooter = document.querySelector('footer');
        if (pageFooter) pageFooter.style.display = '';
        const mainContainer = document.querySelector('.audio-rooms-container');
        if (mainContainer) mainContainer.style.overflow = '';
        try { screen.orientation?.unlock?.(); } catch(e) {}
        this._resetJoinState();
        localStorage.removeItem('wordeth_pending_room');
        localStorage.removeItem('wordeth_pending_room_ts');
        if (window.location.search.includes('room=') || window.location.pathname.startsWith('/room/')) {
            window.history.replaceState({}, '', '/verses.html');
        }
        this.loadActiveRooms();
        setTimeout(() => this.loadActiveRooms(), 2000);
    }

    _showRoomUI(roomId, isHost) {
        const inviteJoiningMsg = document.getElementById('invite-joining-msg');
        if (inviteJoiningMsg) inviteJoiningMsg.remove();
        const endedScreen = document.getElementById('room-ended-screen');
        if (endedScreen) endedScreen.remove();
        if (this.roomSelection) this.roomSelection.style.display = 'none';
        this.audioRoom?.classList.remove('hidden');
        document.body.classList.add('in-room');
        const pageFooter = document.querySelector('footer');
        if (pageFooter) pageFooter.style.display = 'none';
        const mainContainer = document.querySelector('.audio-rooms-container');
        if (mainContainer) mainContainer.style.overflow = 'hidden';
        try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch(e) {}

        const user = this.isGuest ? {} : JSON.parse(localStorage.getItem('user') || '{}');
        const userName = this.isGuest ? 'Guest' : (user.name || user.username || 'Anonymous');
        if (isHost && !this.isGuest) {
            this._addSelfToStage(userName, user.avatar || null, true);
        } else {
            this.addRemoteListener('self', userName + ' (You)', false, user._id || user.id || null, user.avatar);
        }
        this.updateRoomInfo(roomId);
        this.updateStageControls();
        const audioRoomEl = document.getElementById('audio-room');
        if (audioRoomEl) audioRoomEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async joinRoom(roomId, isHost = false, isInvite = false) {
        this._primeSfx();
        if (!roomId) return;
        this._playKeyUnlock();

        const ctx = this._getUserContext();
        this._pendingJoinRoom = roomId;
        this._pendingJoinIsInvite = isInvite;
        this._pendingJoinIsHost = isHost;

        console.log('[Join] Pipeline start:', roomId, isHost ? 'host' : (ctx.isGuest ? 'guest' : 'listener'));

        try {
            this._updateJoiningStatus('Joining room\u2026');
            const joinPayload = { roomId, userId: ctx.userId, userName: ctx.userName, isHost: ctx.isGuest ? false : isHost, roomName: this._inviteMeta?.name || null, avatar: ctx.avatar };
            const httpResp = await this._fetchWithTimeout(apiUrl(`/api/rooms/join?_t=${Date.now()}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache' },
                body: JSON.stringify(joinPayload),
                cache: 'no-store'
            }, 15000);
            const httpData = await httpResp.json();
            if (!httpData.success) throw new Error(httpData.message || 'This room is no longer live.');
            console.log('[Join] 1/5 HTTP ok');

            this._updateJoiningStatus('Connecting\u2026');
            const sock = await this._ensureSocket();
            console.log('[Join] 2/5 Socket ok:', sock.id);

            this._agoraJoinHandled = false;
            this._firstVisitGuideShown = true;

            this._updateJoiningStatus('Almost there\u2026');
            joinPayload.userId = ctx.isGuest ? `guest_${sock.id}` : (ctx.user._id || ctx.user.id || sock.id);
            const ack = await this._socketJoinRoom(joinPayload);
            this._joinConfirmed = true;
            console.log('[Join] 3/5 Socket join confirmed');

            const effectiveHost = httpData.isHost || isHost;
            if (effectiveHost) {
                try { await this._acquireMic(); console.log('[Join] 4/5 Mic ready'); }
                catch (e) { console.warn('[Join] 4/5 Mic skipped:', e.message); }
            }

            if (!ctx.isGuest) {
                try {
                    await this._agoraJoinGuarded(roomId, { skipPublish: !effectiveHost });
                    this._agoraJoinHandled = true;
                    console.log('[Join] 5/5 Agora ok, publish:', effectiveHost);
                } catch (e) {
                    console.error('[Join] 5/5 Agora failed:', e.message);
                    this._agoraJoinHandled = false;
                    this.addChatMessage('System', 'Audio connection failed. Retrying...', true);
                    setTimeout(async () => {
                        if (this._agoraJoinHandled || !this.isInRoom()) return;
                        try {
                            await this._agoraJoinGuarded(roomId, { skipPublish: !this.isSpeaker });
                            this._agoraJoinHandled = true;
                            console.log('[Join] Agora retry succeeded');
                            this.addChatMessage('System', 'Audio connected!', true);
                        } catch (retryErr) {
                            console.error('[Join] Agora retry failed:', retryErr.message);
                            this.addChatMessage('System', 'Audio connection failed. Try leaving and rejoining the room.', true);
                        }
                    }, 3000);
                }
            }

            this._applyRoomState(roomId, effectiveHost, httpData);
            if (isInvite && this._invite.status === 'joining') this._invite.status = 'joined';
            this._enterRoomUI(httpData.roomId || roomId, effectiveHost, httpData.roomName, httpData.participants || ack.participants);

            if (ctx.isGuest) {
                this.addChatMessage('System', 'Welcome! You\'re listening as a guest. Sign up to chat and join the conversation.', true);
            } else if (effectiveHost) {
                this.addChatMessage('System', 'Welcome! You are on stage as the host.', true);
            } else {
                this.addChatMessage('System', 'Welcome! You joined as a listener. Raise your hand or wait for an invite to speak.', true);
            }
            this._firstVisitGuideShown = false;
            this.showFirstVisitGuide();

            fetch(apiUrl('/api/analytics/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: 'verse_join', segment: 'community', metadata: { roomId, page: 'verses' } }) }).catch(() => {});
            console.log('[Join] Pipeline complete');
        } catch (error) {
            console.error('[Join] Failed:', error.message);
            this._resetJoinState();
            if (isInvite) {
                // Network hiccups (timeouts, dropped connections) are transient —
                // retry instead of declaring the room dead on the first failure.
                const transient = error.name === 'AbortError' ||
                    error.name === 'TypeError' ||
                    /abort|network|failed to fetch|load failed|timed? ?out/i.test(error.message || '');
                const friendly = transient
                    ? 'We had trouble connecting. Check your signal and try again.'
                    : (error.message || 'Could not join the room.');
                this._failInvite(friendly, !transient);
            } else {
                this._restoreLobbyUI();
                this.showToast?.(error.message || 'Failed to join room. Please try again.', 'fa-exclamation-circle');
            }
        }
    }
    
    async _fetchTokenBalance() {
        const token = localStorage.getItem('authToken');
        if (!token) return 0;
        try {
            const resp = await fetch(apiUrl('/api/tokens/balance'), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (resp.ok) {
                const data = await resp.json();
                return data.tokenBalance || 0;
            }
        } catch (e) {
            console.warn('[Tokens] Failed to fetch balance:', e.message);
        }
        return 0;
    }

    async _showTokenGate(roomId, tokenPrice) {
        const modal = document.getElementById('token-gate-modal');
        if (!modal) { this.joinRoom(roomId); return; }

        const authToken = localStorage.getItem('authToken');
        const actionsDiv = document.getElementById('token-gate-actions');
        const insufficientDiv = document.getElementById('token-gate-insufficient');
        const noSubDiv = document.getElementById('token-gate-no-sub');

        document.getElementById('token-gate-price').textContent = tokenPrice;

        if (!authToken) {
            actionsDiv.classList.add('hidden');
            insufficientDiv.classList.add('hidden');
            noSubDiv.classList.remove('hidden');
            document.getElementById('token-gate-user-balance').textContent = '0';
        } else {
            const balance = await this._fetchTokenBalance();
            const sufficient = balance >= tokenPrice;
            document.getElementById('token-gate-user-balance').textContent = balance;
            noSubDiv.classList.add('hidden');

            if (sufficient) {
                actionsDiv.classList.remove('hidden');
                insufficientDiv.classList.add('hidden');
            } else if (balance === 0) {
                actionsDiv.classList.add('hidden');
                insufficientDiv.classList.add('hidden');
                noSubDiv.classList.remove('hidden');
            } else {
                actionsDiv.classList.add('hidden');
                insufficientDiv.classList.remove('hidden');
                document.getElementById('token-gate-needed').textContent = tokenPrice;
                document.getElementById('token-gate-have').textContent = balance;
            }
        }

        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn?.removeEventListener('click', onConfirm);
            cancelBtn?.removeEventListener('click', onCancel);
            cancelBtn2?.removeEventListener('click', onCancel);
            cancelBtn3?.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); this.joinRoom(roomId); };
        const onCancel = () => { cleanup(); };

        const confirmBtn = document.getElementById('token-gate-confirm');
        const cancelBtn = document.getElementById('token-gate-cancel');
        const cancelBtn2 = document.getElementById('token-gate-cancel-2');
        const cancelBtn3 = document.getElementById('token-gate-cancel-3');

        confirmBtn?.addEventListener('click', onConfirm);
        cancelBtn?.addEventListener('click', onCancel);
        cancelBtn2?.addEventListener('click', onCancel);
        cancelBtn3?.addEventListener('click', onCancel);
    }

    async checkRoomLockStatus(roomId) {
        // Check the shared room lock state
        // In a real implementation, this would query the server
        // For demo, we check the global room lock registry
        if (window.roomLockRegistry && window.roomLockRegistry[roomId]) {
            return { isLocked: true };
        }
        
        const rooms = await this.fetchActiveRooms();
        const room = rooms.find(r => r.id === roomId);
        return room || { isLocked: false };
    }

    async initializeMedia() {
        try {
            await this._acquireMic();
        } catch (error) {
            console.error('Error accessing audio device:', error);
            throw error;
        }
    }

    async initAgoraClient() {
        if (this.agoraClient) return;
        if (typeof AgoraRTC === 'undefined') {
            throw new Error('Agora SDK not loaded — check network or ad blocker');
        }
        this.agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        AgoraRTC.setLogLevel(2);

        this._showAutoplayBanner = () => {
            if (document.getElementById('agora-autoplay-banner')) return;
            console.warn('Agora: showing autoplay banner');
            const banner = document.createElement('div');
            banner.id = 'agora-autoplay-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(138,43,226,0.95);color:#fff;text-align:center;padding:14px 20px;font-size:15px;cursor:pointer;backdrop-filter:blur(8px);';
            const bannerIcon = this._icon('fas fa-volume-up');
            bannerIcon.style.marginRight = '8px';
            banner.appendChild(bannerIcon);
            banner.appendChild(this._text(' Tap here to enable audio'));
            banner.addEventListener('click', () => {
                banner.remove();
                this._autoplayConfirmed = true;
                this._resumeAllAudioContexts();
                this.agoraRemoteUsers.forEach(user => {
                    if (user.audioTrack) {
                        try { user.audioTrack.setVolume(100); user.audioTrack.play(); } catch (e) {}
                    }
                });
            });
            document.body.appendChild(banner);
        };

        AgoraRTC.onAutoplayFailed = () => {
            console.warn('Agora: autoplay blocked by browser (global callback)');
            this._showAutoplayBanner();
        };

        this.agoraClient.on('user-published', async (user, mediaType) => {
            console.log('[Agora] user-published uid:', user.uid, 'type:', mediaType);
            const key = String(user.uid);

            if (mediaType === 'audio') {
                const old = this.agoraRemoteUsers.get(key);
                if (old && old !== user && old.audioTrack) {
                    try { old.audioTrack.stop(); } catch(_) {}
                    this.agoraRemoteUsers.delete(key);
                }
            }

            try {
                await this.agoraClient.subscribe(user, mediaType);
            } catch (err) {
                console.error('[Agora] subscribe failed uid:', user.uid, mediaType, err.message);
                if (mediaType === 'audio') {
                    setTimeout(async () => {
                        try {
                            await this.agoraClient.subscribe(user, 'audio');
                            if (user.audioTrack) { user.audioTrack.setVolume(100); user.audioTrack.play(); this.agoraRemoteUsers.set(key, user); console.log('[Agora] retry subscribe ok uid:', user.uid); }
                        } catch (_) {}
                    }, 2000);
                }
                return;
            }

            if (mediaType === 'audio') {
                this._resumeAllAudioContexts();
                if (user.audioTrack) {
                    this.agoraRemoteUsers.set(key, user);
                    try {
                        user.audioTrack.setVolume(100);
                        user.audioTrack.play();
                        console.log('[Agora] playing remote audio uid:', user.uid);
                        if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) && !this._autoplayConfirmed) {
                            this._showAutoplayBanner?.();
                        }
                    } catch (e) {
                        console.warn('[Agora] autoplay blocked uid:', user.uid);
                        this._showAutoplayBanner?.();
                    }
                    setTimeout(() => {
                        if (!user.audioTrack) return;
                        const vol = user.audioTrack.getVolumeLevel?.() ?? -1;
                        if (vol === 0 || vol === -1) {
                            console.warn('[Agora] silent track uid:', user.uid, '- retrying play');
                            try { user.audioTrack.setVolume(100); user.audioTrack.play(); } catch(_) {}
                            this._showAutoplayBanner?.();
                        }
                    }, 2000);
                } else {
                    console.warn('[Agora] audioTrack null after subscribe uid:', user.uid, '— retry in 1s');
                    setTimeout(async () => {
                        try {
                            await this.agoraClient.subscribe(user, 'audio');
                            if (user.audioTrack) { user.audioTrack.setVolume(100); user.audioTrack.play(); this.agoraRemoteUsers.set(key, user); }
                        } catch (_) {}
                    }, 1000);
                }
            } else if (mediaType === 'video') {
                if (user.videoTrack) {
                    if (this.videoMode !== 'off') {
                        this._attachRemoteVideo(user.uid, user.videoTrack);
                    } else {
                        if (!this._pendingVideoTracks) this._pendingVideoTracks = new Map();
                        this._pendingVideoTracks.set(user.uid, user.videoTrack);
                        console.log('[Agora] video queued (mode off) uid:', user.uid);
                    }
                }
            }
        });

        this.agoraClient.on('user-unpublished', (user, mediaType) => {
            console.log('Agora: user unpublished', user.uid, mediaType);
            if (mediaType === 'audio') {
                this.agoraRemoteUsers.delete(String(user.uid));
            } else if (mediaType === 'video') {
                if (this._pendingVideoTracks) this._pendingVideoTracks.delete(user.uid);
                const participantId = this._findParticipantIdByAgoraUid(user.uid);
                if (participantId) {
                    this.removeVideoTile(participantId);
                }
            }
        });

        this.agoraClient.on('user-left', (user) => {
            console.log('Agora: user left', user.uid);
            this.agoraRemoteUsers.delete(String(user.uid));
            if (this._pendingVideoTracks) this._pendingVideoTracks.delete(user.uid);
        });

        this.agoraClient.on('connection-state-change', (curState, prevState) => {
            console.log(`[Agora] connection: ${prevState} -> ${curState}`);
            if (curState === 'CONNECTED' && prevState !== 'CONNECTED' && this.isInRoom()) {
                console.log('[Agora] reconnected — re-subscribing to all remote audio');
                setTimeout(() => this._subscribeToAllRemoteAudio(), 1000);
                if (this.isSpeaker && this.localStream) {
                    setTimeout(() => this.publishAgoraAudio(), 1500);
                }
            }
            if (curState === 'DISCONNECTED' && this.isInRoom()) {
                console.warn('[Agora] disconnected while in room');
                this.addChatMessage('System', 'Audio connection lost. Attempting to reconnect...', true);
            }
        });
    }

    async _agoraWithLock(fn) {
        const lockTimeout = 10000;
        if (this._agoraJoinLock) {
            console.log('[Agora] waiting for previous operation...');
            try {
                await Promise.race([
                    this._agoraJoinLock,
                    new Promise((_, rej) => setTimeout(() => rej(new Error('Agora lock timeout')), lockTimeout))
                ]);
            } catch(e) {
                console.warn('[Agora] lock wait expired, forcing release:', e.message);
                this._agoraJoinLock = null;
            }
        }
        let resolve;
        this._agoraJoinLock = new Promise(r => { resolve = r; });
        try {
            return await fn();
        } finally {
            this._agoraJoinLock = null;
            resolve();
        }
    }

    async _agoraJoinGuarded(roomId, options = {}) {
        return this._agoraWithLock(() => this.joinAgoraChannel(roomId, options));
    }

    async _agoraLeaveGuarded() {
        return this._agoraWithLock(() => this.leaveAgoraChannel());
    }

    async joinAgoraChannel(roomId, options = {}) {
        const { skipPublish } = options;
        try {
            await this.initAgoraClient();

            const connState = this.agoraClient?.connectionState;
            if (connState === 'CONNECTED' || connState === 'CONNECTING') {
                console.log('[Agora] already', connState, '— skipping join');
                return;
            }

            console.log('[Agora] joining channel (rtc mode)');

            const authToken = localStorage.getItem('authToken');
            const resp = await this._fetchWithTimeout(apiUrl('/api/agora/token'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) },
                body: JSON.stringify({ channelName: roomId, uid: 0, role: 'publisher' })
            }, 10000);
            if (!resp.ok) throw new Error(`Token request failed (${resp.status})`);
            const data = await resp.json();
            if (!data.token || !data.appId) throw new Error('Token response incomplete');

            this.agoraAppId = data.appId;
            this._resumeAllAudioContexts();
            const joinUid = data.uid ?? null;
            this.agoraUid = await this.agoraClient.join(data.appId, roomId, data.token, joinUid);
            console.log('[Agora] joined channel', roomId, 'uid:', this.agoraUid, 'remoteUsers:', this.agoraClient.remoteUsers?.length || 0);

            if (this.socket) {
                this.socket.emit('agora-uid-map', { roomId, agoraUid: this.agoraUid, socketId: this.socket.id });
            }

            if (!skipPublish) {
                await this.publishAgoraAudio();
            }

            const sweepWithRetry = async (attempts = 0) => {
                await this._subscribeToAllRemoteAudio();
                const missed = (this.agoraClient?.remoteUsers || []).some(
                    u => u.hasAudio && !this.agoraRemoteUsers.has(String(u.uid))
                );
                if (missed && attempts < 3) {
                    setTimeout(() => sweepWithRetry(attempts + 1), 2000);
                }
            };
            setTimeout(() => sweepWithRetry(), 1500);
            this._startRecurringAudioHealthCheck();
            this._setupRoomInteractionListener();
        } catch (error) {
            console.error('[Agora] join failed:', error.message);
            throw error;
        }
    }

    async _subscribeToAllRemoteAudio() {
        if (!this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') return;
        const remoteUsers = this.agoraClient.remoteUsers || [];
        console.log('[Agora] sweeping', remoteUsers.length, 'remote user(s) for unsubscribed audio');
        for (const user of remoteUsers) {
            if (!user.hasAudio) continue;
            const key = String(user.uid);
            if (this.agoraRemoteUsers.has(key) && this.agoraRemoteUsers.get(key).audioTrack) continue;
            try {
                await this.agoraClient.subscribe(user, 'audio');
                if (user.audioTrack) {
                    user.audioTrack.setVolume(100);
                    user.audioTrack.play();
                    this.agoraRemoteUsers.set(key, user);
                    console.log('[Agora] subscribed to audio uid:', user.uid);
                }
            } catch (e) {
                console.warn('[Agora] subscribe failed uid:', user.uid, e.message);
            }
        }
    }

    async publishAgoraAudio() {
        if (!this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') {
            console.warn('[Agora] cannot publish — not connected');
            return;
        }

        try {
            if (this.agoraLocalAudioTrack) {
                try { await this.agoraClient.unpublish([this.agoraLocalAudioTrack]); } catch(e) {}
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = null;
            }

            let streamToUse = this.mixedStream || this.localStream;
            let audioTrack = streamToUse?.getAudioTracks()[0];

            if (!audioTrack || audioTrack.readyState !== 'live') {
                console.log('[Agora] mic track not live, acquiring fresh mic...');
                try {
                    await this._acquireMic();
                    streamToUse = this.localStream;
                    audioTrack = streamToUse?.getAudioTracks()[0];
                } catch (e) {
                    console.error('[Agora] mic acquire failed:', e.message);
                    this.addChatMessage('System', 'Microphone access denied. Others won\'t hear you.', true);
                    return;
                }
            }

            if (!audioTrack || audioTrack.readyState !== 'live') {
                console.error('[Agora] no live audio track after acquire');
                return;
            }

            audioTrack.enabled = true;
            this.agoraLocalAudioTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: audioTrack });

            if (this.isAudioMuted) {
                await this.agoraLocalAudioTrack.setMuted(true);
            }

            await this.agoraClient.publish([this.agoraLocalAudioTrack]);
            console.log('[Agora] audio published, muted:', this.isAudioMuted);
            this.addChatMessage('System', 'Your mic is live.', true);

            setTimeout(() => this._verifyPublishedTrack(), 2000);
        } catch (error) {
            console.error('[Agora] publish error:', error.message);
            this.addChatMessage('System', 'Audio publish failed. Try toggling your mic.', true);
        }
    }

    _verifyPublishedTrack() {
        if (!this.agoraLocalAudioTrack) return;
        const mt = this.agoraLocalAudioTrack.getMediaStreamTrack?.();
        if (!mt || mt.readyState !== 'live') {
            console.error('[Agora] published track died, auto-recovering...');
            this.publishAgoraAudio();
        } else {
            console.log('[Agora] track health OK');
        }
    }

    async unpublishAgoraAudio() {
        try {
            if (this.agoraLocalAudioTrack && this.agoraClient) {
                await this.agoraClient.unpublish([this.agoraLocalAudioTrack]);
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = null;
            }
        } catch (error) {
            console.error('[Agora] unpublish error:', error.message);
        }
    }

    async leaveAgoraChannel() {
        try {
            if (this.agoraMusicAudioTrack) { try { this.agoraMusicAudioTrack.close(); } catch(e) {} this.agoraMusicAudioTrack = null; }
            if (this.agoraLocalAudioTrack) { this.agoraLocalAudioTrack.close(); this.agoraLocalAudioTrack = null; }
            if (this.agoraLocalVideoTrack) { this.agoraLocalVideoTrack.close(); this.agoraLocalVideoTrack = null; }
            if (this.agoraClient) { await this.agoraClient.leave(); this.agoraClient = null; }
            this.agoraRemoteUsers.clear();
            this.agoraUid = null;
            console.log('[Agora] left channel, all tracks released');
        } catch (error) {
            console.error('[Agora] leave error:', error.message);
            this.agoraClient = null;
        }
    }

    _findParticipantIdByAgoraUid(agoraUid) {
        if (!this._agoraUidMap) this._agoraUidMap = new Map();
        for (const [socketId, uid] of this._agoraUidMap) {
            if (uid === agoraUid) return socketId;
        }
        return null;
    }

    _getParticipantData(participantId) {
        const el = document.querySelector(`[data-participant-id="${participantId}"]`);
        if (el) {
            const nameEl = el.querySelector('.speaker-name') || el.querySelector('.listener-name');
            return { userName: nameEl?.textContent || 'User' };
        }
        return null;
    }

    _attachRemoteVideo(agoraUid, remoteTrack) {
        let participantId = this._findParticipantIdByAgoraUid(agoraUid);
        if (participantId) {
            this._placeRemoteVideo(participantId, remoteTrack);
        } else {
            console.log('Agora: video uid', agoraUid, 'has no participant mapping yet, queuing...');
            if (!this._pendingVideoTracks) this._pendingVideoTracks = new Map();
            this._pendingVideoTracks.set(agoraUid, remoteTrack);
        }
    }

    _placeRemoteVideo(participantId, remoteTrack) {
        const pData = this._getParticipantData(participantId);
        const userName = pData?.userName || 'User';
        this.activeVideoFeeds.set(participantId, { userName, stream: null, muted: false, agoraTrack: remoteTrack });
        this.refreshVideoGrid();
        const rawTrack = remoteTrack.getMediaStreamTrack();
        if (rawTrack) {
            rawTrack.onended = () => this.removeVideoTile(participantId);
        }
    }

    _resolvePendingVideos() {
        if (!this._pendingVideoTracks || this._pendingVideoTracks.size === 0) return;
        for (const [uid, track] of this._pendingVideoTracks) {
            const pid = this._findParticipantIdByAgoraUid(uid);
            if (pid) {
                console.log('Agora: resolved pending video for uid', uid, '→ participant', pid);
                this._placeRemoteVideo(pid, track);
                this._pendingVideoTracks.delete(uid);
            }
        }
    }

    async _subscribeToAllRemoteVideo() {
        if (!this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') return;
        if (this.videoMode === 'off') return;
        const remoteUsers = this.agoraClient.remoteUsers || [];
        for (const user of remoteUsers) {
            if (!user.hasVideo) continue;
            if (!user.videoTrack) {
                try {
                    await this.agoraClient.subscribe(user, 'video');
                    if (user.videoTrack) {
                        this._attachRemoteVideo(user.uid, user.videoTrack);
                        console.log('[Agora] subscribed to video uid:', user.uid);
                    }
                } catch (e) {
                    console.warn('[Agora] video subscribe failed uid:', user.uid, e.message);
                }
            } else {
                this._attachRemoteVideo(user.uid, user.videoTrack);
            }
        }
    }

    connectSocket() {
        if (this.lobbySocket?.connected) {
            this.socket = this.lobbySocket;
            if (!this._roomHandlersRegistered) this._registerRoomHandlers();
            this._emitRegisterUser();
            return Promise.resolve();
        }

        if (this.lobbySocket && !this.lobbySocket.connected) {
            this.socket = this.lobbySocket;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Socket reconnection timed out.')), 10000);
                const cleanup = () => { clearTimeout(timer); this.lobbySocket.off('connect', onConnect); this.lobbySocket.off('connect_error', onErr); };
                const onConnect = () => { cleanup(); this._emitRegisterUser(); if (!this._roomHandlersRegistered) this._registerRoomHandlers(); resolve(); };
                const onErr = (err) => { cleanup(); reject(new Error('Reconnect failed: ' + err.message)); };
                this.lobbySocket.once('connect', onConnect);
                this.lobbySocket.once('connect_error', onErr);
                if (this.lobbySocket.disconnected) this.lobbySocket.connect();
            });
        }

        if (typeof io === 'undefined') {
            return new Promise((resolve, reject) => {
                const poll = setInterval(() => { if (typeof io !== 'undefined') { clearInterval(poll); this.connectSocket().then(resolve).catch(reject); } }, 200);
                setTimeout(() => { clearInterval(poll); reject(new Error('Socket.io library did not load.')); }, 5000);
            });
        }

        const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
        this.lobbySocket = io(serverUrl, { transports: ['websocket'], reconnection: true, reconnectionAttempts: 10, reconnectionDelay: 1000, timeout: 10000 });
        this.socket = this.lobbySocket;
        this._registerRoomHandlers();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Could not connect to the server.')), 12000);
            const cleanup = () => { clearTimeout(timer); this.socket.off('connect', onConnect); this.socket.off('connect_error', onErr); };
            const onConnect = () => { cleanup(); console.log('[Socket] connected:', this.socket.id); resolve(); };
            const onErr = (err) => { cleanup(); reject(new Error('Connection failed: ' + err.message)); };
            if (this.socket.connected) { cleanup(); resolve(); }
            else { this.socket.once('connect', onConnect); this.socket.once('connect_error', onErr); }
        });
    }
    

    _registerRoomHandlers() {
        if (this._roomHandlersRegistered) return;
        this._roomHandlersRegistered = true;
        const sock = this.socket;

        sock.on('room-error', async (data) => {
            console.warn('Room error:', data.message);
            this._joinConfirmed = true;

            if (this._invite.status === 'joining') {
                this._failInvite(data.message || 'This room is no longer live.');
            } else {
                this.showToast?.(data.message || 'Could not join the room.', 'fa-exclamation-circle');
                this._restoreLobbyUI();
            }
        });

        sock.on('room-joined', async (data) => {
            console.log('[room-joined] event received');

            if (this._agoraJoinHandled && this._joinConfirmed) {
                console.log('[room-joined] already handled by pipeline — syncing state only');
                if (data.videoMode) { this.videoMode = data.videoMode; this.updateVideoButtonState(); }
                if (data.stageAccess) this.stageAccess = data.stageAccess;
                if (data.roomName) { const el = document.getElementById('room-name'); if (el) el.textContent = data.roomName; }
                this.updateParticipantDisplay(data.participants || []);
                for (const p of (data.participants || [])) {
                    if (p.socketId === this.socket?.id) continue;
                    if (p.agoraUid) { if (!this._agoraUidMap) this._agoraUidMap = new Map(); this._agoraUidMap.set(p.socketId, p.agoraUid); }
                }
                this.updateStageControls();
                if (!this._firstVisitGuideShown) { this._firstVisitGuideShown = true; this.showFirstVisitGuide(); }
                return;
            }

            this._joinConfirmed = true;
            this._pendingJoinRoom = null;
            if (this._inviteHardTimeout) { clearTimeout(this._inviteHardTimeout); this._inviteHardTimeout = null; }

            const wasInviteJoin = this._invite.status === 'joining' || this._pendingJoinIsInvite;
            if (this._invite.status === 'joining') { this._invite.status = 'joined'; }

            const confirmedRoom = data.roomId || this.currentRoom;
            if (data.roomId && data.roomId !== this.currentRoom) { this.currentRoom = data.roomId; }

            if (data.isHost && !this.isRoomHost) { this.isRoomHost = true; this.updateHostControls(); }
            if (data.isHost && !this.isSpeaker && !this.isGuest) {
                this.isSpeaker = true;
                this.isAudioMuted = false;
                const selfEl = document.querySelector('[data-participant-id="self"]');
                if (selfEl) selfEl.remove();
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                this._addSelfToStage(user.name || user.username || 'Anonymous', user.avatar || null, true);
                if (!this.localStream) { try { await this.initializeMedia(); } catch(e) {} }
            }

            if (data.videoMode) { this.videoMode = data.videoMode; this.updateVideoButtonState(); }
            if (data.stageAccess) this.stageAccess = data.stageAccess;
            this.updateParticipantDisplay(data.participants || []);
            if (data.roomName) { const el = document.getElementById('room-name'); if (el) el.textContent = data.roomName; }

            if (!document.querySelector('[data-participant-id="self"]') && (this.isSpeaker || this.isRoomHost)) {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                this._addSelfToStage(user.name || user.username || 'Anonymous', user.avatar || null, this.isRoomHost);
            }
            for (const p of (data.participants || [])) {
                if (p.socketId === this.socket?.id) continue;
                if (p.agoraUid) { if (!this._agoraUidMap) this._agoraUidMap = new Map(); this._agoraUidMap.set(p.socketId, p.agoraUid); }
                if (p.isSpeaker) { this.addRemoteSpeaker(p.socketId, p.userName, null, false, p.userId, p.avatar); }
                else { this.addRemoteListener(p.socketId, p.userName, false, p.userId, p.avatar); }
            }

            if (wasInviteJoin) {
                const isHost = this._pendingJoinIsHost || data.isHost || false;
                if (isHost) { this.isRoomHost = true; this.isSpeaker = true; }
                this._showRoomUI(confirmedRoom, isHost);
                if (!this._welcomeShown) {
                    if (this.isGuest) this.addChatMessage('System', 'Welcome! You\'re listening as a guest. Sign up to chat and join the conversation.', true);
                    else if (isHost) this.addChatMessage('System', 'Welcome! You are on stage as the host.', true);
                    else this.addChatMessage('System', 'Welcome! You joined as a listener. Raise your hand or wait for an invite to speak.', true);
                    this._welcomeShown = true;
                }
                this._requestWakeLock();
                this._startSilentAudioKeepAlive();
                this._startSpeakingIndicator();
                this._pendingJoinIsInvite = false;
                this._pendingJoinIsHost = false;
            }

            if (!this.isGuest && !this._agoraJoinHandled) {
                const connState = this.agoraClient?.connectionState;
                if (connState !== 'CONNECTED' && connState !== 'CONNECTING') {
                    try {
                        console.log('[room-joined] Agora not connected, attempting join now...');
                        await this._agoraJoinGuarded(confirmedRoom, { skipPublish: !this.isSpeaker });
                        this._agoraJoinHandled = true;
                        this.addChatMessage('System', 'Audio connected!', true);
                    } catch (e) {
                        console.error('[room-joined] Agora join failed:', e.message);
                        this.addChatMessage('System', 'Audio connection failed. Try leaving and rejoining.', true);
                    }
                } else if (connState === 'CONNECTED') {
                    this._agoraJoinHandled = true;
                }
            }

            this.updateStageControls();
            if (!this._firstVisitGuideShown) { this._firstVisitGuideShown = true; this.showFirstVisitGuide(); }
            try { window.history.replaceState({ room: confirmedRoom }, '', `/verses.html?room=${encodeURIComponent(confirmedRoom)}`); } catch (e) {}
        });

        sock.on('participant-joined', async (data) => {
            console.log('Participant joined:', data.userName, 'isSpeaker:', data.isSpeaker);
            const alreadyHere = document.querySelector(`[data-participant-id="${data.socketId}"]`);
            if (alreadyHere) return;
            this.addChatMessage('System', `${data.userName} joined the room.`, true);
            this._playJoinSound();
            this.updateParticipantDisplay(data.participants);

            if (!document.querySelector(`[data-participant-id="${data.socketId}"]`)) {
                if (data.isSpeaker) {
                    this.addRemoteSpeaker(data.socketId, data.userName, null, false, data.userId, data.avatar);
                } else {
                    this.addRemoteListener(data.socketId, data.userName, false, data.userId, data.avatar);
                }
            }
        });

        sock.on('participant-left', (data) => {
            console.log('Participant left:', data.userName);
            this.addChatMessage('System', `${data.userName} left the room.`, true);
            this.removeVideoTile(data.socketId);
            if (this._agoraUidMap) this._agoraUidMap.delete(data.socketId);
            this.removeRemoteParticipant(data.socketId);
            this.updateParticipantDisplay(data.participants);
        });

        sock.on('agora-uid-mapped', ({ socketId, agoraUid }) => {
            if (!this._agoraUidMap) this._agoraUidMap = new Map();
            this._agoraUidMap.set(socketId, agoraUid);
            console.log('Agora UID mapped:', socketId, '->', agoraUid);
            this._resolvePendingVideos();
        });

        sock.on('chat-message', ({ sender, message, timestamp }) => {
            this.addChatMessage(sender, message, false);
            if (!this.chatVisible && this.toggleChatBtn) {
                this.toggleChatBtn.classList.add('chat-glow');
            }
        });

        sock.on('room-image', ({ sender, imageData }) => {
            this.addImageChatMessage(sender, imageData);
            this.showToast(`${sender} shared a photo`, 'fa-image');
            this.showSharedImageOverlay(imageData, sender);
        });

        sock.on('music-stream-status', ({ sender, songTitle, artistName, playing }) => {
            if (playing) {
                this.addMusicStreamChatMessage(sender, songTitle, artistName);
                this.showToast(`${sender} is playing: ${songTitle}`, 'fa-music', 6000);
            } else {
                this.addChatMessage('System', `${sender} stopped sharing music.`, true);
            }
        });

        sock.on('room-event', ({ event, data }) => {
            this.handleRemoteRoomEvent(event, data);
        });

        sock.on('audio-mix-status', ({ userName, mixing, videoId }) => {
            if (mixing) {
                this.addChatMessage('System', `${userName} is sharing YouTube audio with the room.`, true);
            }
        });

        sock.on('replay-saved', (data) => {
            console.log('[Replay] Auto-saved replay:', data);
            this._showToast('Your room was saved as a replay!', 'success');
            setTimeout(() => {
                if (data.replayId) this._showBoostModal(data.replayId);
            }, 1500);
        });

        sock.on('participants-list', (data) => {
            if (data.roomId !== this.currentRoom) return;
            if (data.roomName) {
                const roomNameEl = document.getElementById('room-name');
                if (roomNameEl) roomNameEl.textContent = data.roomName;
            }
            this.karaokeEnabled = data.karaokeEnabled || false;
            this.videoMode = data.videoMode || 'off';
            this.isRoomLocked = data.isLocked || false;
            if (data.stageAccess) {
                this.stageAccess = data.stageAccess;
                this.updateStageControls();
            }
            this.updateKaraokeButtonState();
            this.updateVideoButtonState();
            this.updateParticipantDisplay(data.participants);

            data.participants.forEach(p => {
                if (p.socketId === this.socket?.id) return;
                const existing = document.querySelector(`[data-participant-id="${p.socketId}"]`);
                if (existing) existing.remove();
                if (p.isSpeaker) {
                    this.addRemoteSpeaker(p.socketId, p.userName, null, false, p.userId, p.avatar);
                } else {
                    this.addRemoteListener(p.socketId, p.userName, false, p.userId, p.avatar);
                }
            });
        });

        sock.on('kicked-from-room', ({ action, reason }) => {
            if (action === 'remove') {
                this.addChatMessage('System', reason || 'You have been removed from the room by the host.', true);
                this.showToast(reason || 'You were removed by the host.', 'fa-ban', 5000);
                setTimeout(() => this.leaveRoom(), 500);
            } else if (action === 'move-to-crowd') {
                this.isSpeaker = false;
                if (this.localStream) {
                    this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                }
                this.isAudioMuted = true;

                if (this.agoraClient) {
                    this.unpublishAgoraAudio().catch(e => console.warn('Agora unpublish error:', e));
                }

                const selfEl = document.querySelector('[data-participant-id="self"]');
                if (selfEl && this.speakersStage && this.listenersGrid) {
                    selfEl.remove();
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                    const userName = user.name || user.username || 'Anonymous';
                    this.addRemoteListener('self', userName + ' (You)', false, user._id, user.avatar);
                }
                this.updateStageControls();
                const muteIcon = this.toggleAudioBtn?.querySelector('i');
                if (muteIcon) muteIcon.className = 'fas fa-microphone-slash';
                this.addChatMessage('System', reason || 'The host has moved you to the crowd.', true);
                this.showToast('You were moved to the crowd by the host.', 'fa-users', 5000);
            }
        });

        sock.on('promoted-to-speaker', async () => {
            if (this.isGuest) {
                console.log('Guest ignoring promotion event');
                return;
            }
            this.isSpeaker = true;
            this.handRaised = false;
            this.raiseHandBtn?.classList.remove('hand-raised');
            this.isAudioMuted = false;
            this._playSfx('onStage');

            if (!this.localStream) {
                try {
                    await this._acquireMic();
                    console.log('[Promotion] mic acquired, tracks:', this.localStream?.getAudioTracks().length);
                } catch (e) {
                    console.warn('[Promotion] mic access denied:', e.message);
                }
            }

            if (this.agoraClient && this.agoraClient.connectionState === 'CONNECTED') {
                try {
                    console.log('[Promotion] publishing audio (already host role)');
                    await this.publishAgoraAudio();
                    console.log('[Promotion] audio published');
                } catch (e) {
                    console.error('[Promotion] publish failed:', e.message);
                    this.addChatMessage('System', 'Audio setup failed after promotion. Try toggling your mic.', true);
                }
            } else if (this.currentRoom) {
                try {
                    console.log('[Promotion] Agora not connected, joining as host');
                    await this._agoraJoinGuarded(this.currentRoom, {});
                } catch (e) {
                    console.error('[Promotion] Agora join failed:', e.message);
                    this.addChatMessage('System', 'Audio connection failed. Try refreshing.', true);
                }
            }

            const selfEl = document.querySelector('[data-participant-id="self"]');
            if (selfEl) selfEl.remove();
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = user.name || user.username || 'Anonymous';
            this._addSelfToStage(userName, user.avatar || null, false);
            if (this.toggleAudioBtn) {
                this._setBtnWithSpan(this.toggleAudioBtn, 'fas fa-microphone', 'Mic');
                this.toggleAudioBtn.classList.remove('muted');
            }
            this.updateStageControls();
            this.addChatMessage('System', 'You\'re on stage! Your mic is live.', true);
            this.showToast('You\'re on stage — mic is live!', 'fa-microphone', 4000);
        });

        sock.on('stage-request', ({ socketId, userId, userName, avatar }) => {
            if (!this.isRoomHost) return;
            this.addChatMessage('System', `${userName} is requesting to speak.`, true);
            this._showStageRequestToast(socketId, userName);
        });

        sock.on('participant-promoted', ({ socketId, userId, userName, avatar }) => {
            if (socketId === this.socket?.id) return;
            const existing = document.querySelector(`[data-participant-id="${socketId}"]`);
            if (existing) existing.remove();
            this.addRemoteSpeaker(socketId, userName, null, false, userId, avatar);
        });
    }

    async _reconnectRoomMedia() {
        if (!this.isInRoom() || !this.socket?.connected) return;
        const hiddenDuration = this._hiddenTimestamp ? (Date.now() - this._hiddenTimestamp) : 0;
        console.log(`Reconnecting room media (was hidden for ${Math.round(hiddenDuration / 1000)}s)...`);
        this._hiddenTimestamp = null;

        if (this.agoraClient) {
            const agoraState = this.agoraClient.connectionState;
            if (agoraState === 'DISCONNECTED' || agoraState === 'DISCONNECTING') {
                console.log('[Reconnect] Agora disconnected, rejoining channel via guard...');
                try {
                    await this._agoraWithLock(async () => {
                        await this.leaveAgoraChannel();
                        await this.joinAgoraChannel(this.currentRoom, { skipPublish: !this.isSpeaker });
                    });
                } catch (e) {
                    console.error('[Reconnect] Failed to rejoin Agora channel:', e);
                }
            } else if (agoraState === 'CONNECTED') {
                if (this.isSpeaker && !this.agoraLocalAudioTrack) {
                    console.log('[Reconnect] Agora connected but no audio track, re-publishing');
                    try { await this.publishAgoraAudio(); } catch (e) { console.error('[Reconnect] publish failed:', e.message); }
                }
                await this._subscribeToAllRemoteAudio();
            }
        }
        
        this.socket.emit('request-participants', { roomId: this.currentRoom });
    }

    async addVideoTrackToPeers(stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        if (this.agoraClient) {
            try {
                if (this.agoraLocalVideoTrack) {
                    await this.agoraClient.unpublish([this.agoraLocalVideoTrack]);
                    this.agoraLocalVideoTrack.close();
                }
                this.agoraLocalVideoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTrack });
                await this.agoraClient.publish([this.agoraLocalVideoTrack]);
                console.log('Agora: published video track via addVideoTrackToPeers');
            } catch (e) {
                console.error('Error publishing video to Agora:', e);
            }
        }
    }
    
    async removeVideoTrackFromPeers() {
        if (this.agoraLocalVideoTrack && this.agoraClient) {
            try {
                await this.agoraClient.unpublish([this.agoraLocalVideoTrack]);
                this.agoraLocalVideoTrack.close();
                this.agoraLocalVideoTrack = null;
                console.log('Agora: unpublished video track via removeVideoTrackFromPeers');
            } catch (e) {
                console.error('Error unpublishing video from Agora:', e);
            }
        }
    }
    
    handleRemoteRoomEvent(event, data) {
        switch (event) {
            case 'room-lock':
                this.isRoomLocked = data.locked;
                this.addChatMessage('System', `Room ${data.locked ? 'locked' : 'unlocked'} by host.`, true);
                break;
            case 'topic-change':
                const topicEl = document.getElementById('current-song');
                if (topicEl) topicEl.textContent = data.topic;
                this.addChatMessage('System', `Topic changed to: ${data.topic}`, true);
                break;
            case 'karaoke-permission':
                this.karaokeEnabled = data.enabled;
                this.updateKaraokeButtonState();
                this.addChatMessage('System', `Karaoke ${data.enabled ? 'enabled' : 'disabled'} by host.`, true);
                break;
            case 'video-mode':
                this.videoMode = data.mode || 'off';
                this.updateVideoButtonState();
                if (data.mode === 'off' && this.isVideoActive) {
                    this.stopLocalVideo();
                }
                if (data.mode !== 'off') {
                    this._resolvePendingVideos();
                    this._subscribeToAllRemoteVideo();
                }
                this.addChatMessage('System', `Video mode set to "${data.mode}" by host.`, true);
                break;
            case 'video-start':
                this.handleRemoteVideoStart(data);
                break;
            case 'video-stop':
                this.handleRemoteVideoStop(data);
                break;
            case 'video-request':
                this.handleVideoRequest(data);
                break;
            case 'video-approved':
                this.handleVideoApproved(data);
                break;
            case 'video-denied':
                this.showToast('Your camera request was denied by the host.', 'fa-video-slash');
                break;
            case 'mute-all':
                this.handleMuteAll(data);
                break;
            case 'close-room':
                this.handleCloseRoom(data);
                break;
            case 'permission-request':
                this.handlePermissionRequest(data);
                break;
            case 'permission-approved':
                this.handlePermissionApproved(data);
                break;
            case 'permission-denied':
                this.handlePermissionDenied(data);
                break;
            case 'hand-raise':
                this.addChatMessage('System', `${data.userName} ${data.raised ? 'raised' : 'lowered'} their hand.`, true);
                if (data.raised) {
                    this.showToast(`${data.userName} raised their hand`, 'fa-hand-paper');
                }
                break;
            case 'mute-status':
                if (data.userId) {
                    const socketId = this.findSocketByUserId(data.userId);
                    if (socketId && this.activeVideoFeeds.has(socketId)) {
                        const feed = this.activeVideoFeeds.get(socketId);
                        feed.muted = !!data.muted;
                        this.refreshVideoGrid();
                    }
                }
                break;
            case 'host-changed':
                if (data.newHostId === this.socket?.id) {
                    if (!this.isRoomHost) {
                        this.isRoomHost = true;
                        this.updateHostControls();
                        this.addChatMessage('System', 'You are now the host.', true);
                        this.showToast('You are now the host!', 'fa-crown', 5000);
                    }
                } else {
                    this.addChatMessage('System', `${data.newHostName} is now the host.`, true);
                }
                break;
            case 'participant-kicked':
                this.addChatMessage('System', `${data.userName} was removed from the room by the host.`, true);
                break;
            case 'participant-moved-to-crowd':
                if (data.socketId !== this.socket?.id) {
                    const el = document.querySelector(`[data-participant-id="${data.socketId}"]`);
                    if (el && this.speakersStage?.contains(el)) {
                        el.remove();
                        this.addRemoteListener(data.socketId, data.userName, false, data.userId, data.avatar);
                    }
                    this.addChatMessage('System', `${data.userName} was moved to the crowd by the host.`, true);
                }
                break;
            case 'stage-access-changed':
                this.stageAccess = data.stageAccess;
                this.updateStageControls();
                if (data.stageAccess === 'open') {
                    this.addChatMessage('System', 'The host opened the stage — anyone can join!', true);
                    this.showToast('Stage is now open!', 'fa-door-open', 4000);
                } else {
                    this.addChatMessage('System', 'The stage is now invite-only.', true);
                    this.showToast('Stage is now invite-only', 'fa-lock', 4000);
                }
                break;
            case 'youtube-embed':
                break;
            case 'karaoke-start':
                break;
            case 'karaoke-stop':
                this.addChatMessage('System', `${data.userName} stopped karaoke.`, true);
                break;
        }
    }
    
    findSocketByUserId(userId) {
        for (const el of document.querySelectorAll('[data-user-id]')) {
            if (el.getAttribute('data-user-id') === userId) {
                return el.getAttribute('data-participant-id');
            }
        }
        return null;
    }
    
    updateParticipantDisplay(participants) {
        if (this.participantCount) {
            const count = participants.length;
            this.participantCount.textContent = `${count} participant${count !== 1 ? 's' : ''}`;
        }
    }
    
    _addSelfToStage(userName, avatarUrl, isHost) {
        const stage = this.speakersStage || document.getElementById('speakers-stage');
        if (!stage) {
            console.warn('speakers-stage element not found, retrying in 200ms');
            setTimeout(() => this._addSelfToStage(userName, avatarUrl, isHost), 200);
            return;
        }
        this.speakersStage = stage;
        const existing = stage.querySelector('[data-participant-id="self"]');
        if (existing) existing.remove();

        const initial = (userName || 'A').charAt(0).toUpperCase();
        const selfAvatar = document.createElement('div');
        selfAvatar.className = 'speaker-avatar self-speaker';
        selfAvatar.setAttribute('data-participant-id', 'self');
        const avatarRing = this._el('div', {className: 'avatar-ring'});
        this._buildAvatar(avatarRing, avatarUrl, userName, initial, 'var(--mint,#98ff98)');
        const speakerInfo = this._el('div', {className: 'speaker-info'},
            this._el('span', {className: 'speaker-name', textContent: userName + ' (You)'}),
            this._el('span', {className: 'speaker-role', textContent: isHost ? 'Host' : 'Speaker'}));
        const speakerStatus = this._el('div', {className: 'speaker-status'},
            this._icon('fas fa-microphone' + (this.isAudioMuted ? '-slash' : '')));
        selfAvatar.append(avatarRing, speakerInfo, speakerStatus);
        stage.prepend(selfAvatar);
    }

    updateRoomInfo(roomId) {
        const roomNameEl = document.getElementById('room-name');
        const currentSong = document.getElementById('current-song');
        if (roomNameEl && !roomNameEl.textContent.trim()) {
            roomNameEl.textContent = `Room ${roomId.slice(-5)}`;
        }
        if (this.participantCount) this.participantCount.textContent = '1 participant';
    }

    toggleAudio() {
        if (this._guestGate('mic')) return;
        if (!this.isSpeaker) {
            this.showToast('You need to be on stage to use the mic', 'fa-microphone-slash', 3000);
            return;
        }
        this.isAudioMuted = !this.isAudioMuted;

        if (this.agoraLocalAudioTrack) {
            this.agoraLocalAudioTrack.setMuted(this.isAudioMuted);
        }
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !this.isAudioMuted;
            }
        }

        this.toggleAudioBtn?.classList.toggle('muted', this.isAudioMuted);
        if (this.toggleAudioBtn) {
            this._setBtnWithSpan(this.toggleAudioBtn, this.isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone', 'Mic');
        }

        if (window._verseMiniPlayer && window._verseMiniPlayer.isActive()) {
            window._verseMiniPlayer._updateMuteIcon();
        }
    }

    shareMusic() {
        if (this._guestGate('interact')) return;
        const modal = document.getElementById('music-share-modal');
        if (!modal) return;

        document.getElementById('music-file-details')?.classList.add('hidden');
        document.getElementById('music-pick-area')?.classList.remove('hidden');
        document.getElementById('music-song-title').value = '';
        document.getElementById('music-artist-name').value = '';
        document.getElementById('music-file-input').value = '';
        this.pendingMusicFile = null;

        modal.classList.add('active');
    }

    initMusicSharing() {
        const pickArea = document.getElementById('music-pick-area');
        const fileInput = document.getElementById('music-file-input');
        const submitBtn = document.getElementById('music-share-submit');
        if (pickArea && fileInput) {
            pickArea.addEventListener('click', () => fileInput.click());

            pickArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                pickArea.classList.add('dragover');
            });
            pickArea.addEventListener('dragleave', () => {
                pickArea.classList.remove('dragover');
            });
            pickArea.addEventListener('drop', (e) => {
                e.preventDefault();
                pickArea.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith('audio/')) {
                    this.handleMusicFileSelected(file);
                } else {
                    this.showToast('Please drop an audio file', 'fa-exclamation-circle');
                }
            });

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.handleMusicFileSelected(file);
            });
        }

        submitBtn?.addEventListener('click', () => this.playAndStreamMusic());

        this.initMusicPlayerControls();
    }

    handleMusicFileSelected(file) {
        if (file.size > 500 * 1024 * 1024) {
            this.showToast('File too large (max 500MB)', 'fa-exclamation-circle');
            return;
        }
        this.pendingMusicFile = file;

        document.getElementById('music-pick-area')?.classList.add('hidden');
        document.getElementById('music-file-details')?.classList.remove('hidden');

        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        document.getElementById('music-file-name').textContent = file.name;
        document.getElementById('music-file-size').textContent = this.formatFileSize(file.size);

        const parts = nameWithoutExt.split(/[-–—]/).map(s => s.trim());
        if (parts.length >= 2) {
            document.getElementById('music-artist-name').value = parts[0];
            document.getElementById('music-song-title').value = parts.slice(1).join(' - ');
        } else {
            document.getElementById('music-song-title').value = nameWithoutExt;
        }
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async playAndStreamMusic() {
        if (!this.pendingMusicFile) {
            this.showToast('No file selected', 'fa-exclamation-circle');
            return;
        }

        const songTitle = document.getElementById('music-song-title')?.value?.trim() || 'Untitled Track';
        const artistName = document.getElementById('music-artist-name')?.value?.trim() || 'Unknown Artist';

        this.stopMusicStream();

        const objectUrl = URL.createObjectURL(this.pendingMusicFile);
        this.musicAudioElement = new Audio(objectUrl);
        this.musicAudioElement.volume = 1.0;

        try {
            if (!this.audioMixEnabled) {
                await this.startAudioMix();
            }

            if (this.audioContext && this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            if (this.audioContext && this.mixDestination) {
                this.musicAudioSource = this.audioContext.createMediaElementSource(this.musicAudioElement);
                this.musicGainNode = this.audioContext.createGain();
                this.musicGainNode.gain.value = 1.0;
                this.musicAudioSource.connect(this.musicGainNode);
                this.musicGainNode.connect(this.mixDestination);
                this.musicGainNode.connect(this.audioContext.destination);

                await this._publishMusicTrack();
                console.log('Music published as separate Agora track (mic untouched), audioContext state:', this.audioContext.state);
            } else {
                console.error('Audio mix not ready — audioContext:', !!this.audioContext, 'mixDestination:', !!this.mixDestination);
                this.addChatMessage('System', 'Could not connect music to room audio. Try again.', true);
            }

            await this.musicAudioElement.play();
            console.log('Music element playing, paused:', this.musicAudioElement.paused, 'volume:', this.musicAudioElement.volume);

            this.musicAudioElement.addEventListener('ended', () => {
                this.stopAudioMix();
                this.addChatMessage('System', `Finished playing: ${songTitle}`, true);
                if (this.socket && this.socket.connected && this.currentRoom) {
                    this.socket.emit('music-stream-status', {
                        roomId: this.currentRoom,
                        songTitle,
                        artistName,
                        playing: false
                    });
                }
            });

            this.addMusicStreamChatMessage('You', songTitle, artistName);
            this.showMusicPlayerOverlay(songTitle, artistName);

            if (this.socket && this.socket.connected && this.currentRoom) {
                this.socket.emit('music-stream-status', {
                    roomId: this.currentRoom,
                    songTitle,
                    artistName,
                    playing: true
                });
            }

            this.showToast('Playing music — room can hear it live!', 'fa-check-circle');
            document.getElementById('music-share-modal')?.classList.remove('active');
            this.pendingMusicFile = null;

        } catch (err) {
            console.error('Music playback error:', err);
            this.showToast('Could not play this audio file', 'fa-exclamation-circle');
            this.stopMusicStream();
        }
    }

    stopMusicStream() {
        if (this.musicAudioElement) {
            this.musicAudioElement.pause();
            if (this.musicAudioElement.src) {
                URL.revokeObjectURL(this.musicAudioElement.src);
            }
            this.musicAudioElement = null;
        }
        if (this.musicAudioSource) {
            try { this.musicAudioSource.disconnect(); } catch(e) {}
            this.musicAudioSource = null;
        }
        if (this.musicGainNode) {
            try { this.musicGainNode.disconnect(); } catch(e) {}
            this.musicGainNode = null;
        }
        const overlay = document.getElementById('shared-audio-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    addMusicStreamChatMessage(sender, songTitle, artistName) {
        if (!this.chatMessagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender === 'You' ? 'own' : ''}`;

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const header = this._el('div', {className: 'chat-message-header'},
            this._el('span', {className: 'sender', textContent: sender}),
            this._el('span', {className: 'timestamp', textContent: timestamp}));
        const audioPlayer = this._el('div', {className: 'chat-audio-player'},
            this._el('div', {className: 'chat-audio-icon'}, this._icon('fas fa-broadcast-tower')),
            this._el('div', {className: 'chat-audio-meta'},
                this._el('span', {className: 'chat-audio-title', textContent: songTitle}),
                this._el('span', {className: 'chat-audio-artist', textContent: artistName})),
            this._el('span', {className: 'chat-audio-play-hint'}, this._icon('fas fa-volume-up'), ' Live'));
        messageElement.append(header, audioPlayer);

        this.chatMessagesContainer.appendChild(messageElement);
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }

    showMusicPlayerOverlay(songTitle, artistName) {
        const overlay = document.getElementById('shared-audio-overlay');
        if (!overlay) return;

        document.getElementById('shared-audio-title').textContent = songTitle;
        document.getElementById('shared-audio-artist').textContent = artistName;
        document.getElementById('shared-audio-sharer').textContent = 'Playing from your device';

        const playBtn = document.getElementById('audio-play-btn');
        this._setBtn(playBtn, 'fas fa-pause');
        document.getElementById('audio-progress-fill').style.width = '0%';
        document.getElementById('audio-current-time').textContent = '0:00';
        document.getElementById('audio-total-time').textContent = '0:00';

        if (this.musicAudioElement) {
            this.musicAudioElement.addEventListener('loadedmetadata', () => {
                document.getElementById('audio-total-time').textContent = this.formatAudioTime(this.musicAudioElement.duration);
            });

            this.musicAudioElement.addEventListener('timeupdate', () => {
                if (this.musicAudioElement && this.musicAudioElement.duration) {
                    const pct = (this.musicAudioElement.currentTime / this.musicAudioElement.duration) * 100;
                    document.getElementById('audio-progress-fill').style.width = pct + '%';
                    document.getElementById('audio-current-time').textContent = this.formatAudioTime(this.musicAudioElement.currentTime);
                }
            });

            this.musicAudioElement.addEventListener('ended', () => {
                this._setBtn(playBtn, 'fas fa-play');
            });

            if (this.musicAudioElement.duration) {
                document.getElementById('audio-total-time').textContent = this.formatAudioTime(this.musicAudioElement.duration);
            }
        }

        overlay.classList.remove('hidden');
    }

    formatAudioTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    initMusicPlayerControls() {
        const playBtn = document.getElementById('audio-play-btn');
        const rewindBtn = document.getElementById('audio-rewind-btn');
        const forwardBtn = document.getElementById('audio-forward-btn');
        const volumeSlider = document.getElementById('audio-volume');
        const progressBar = document.getElementById('audio-progress-bar');
        const closeBtn = document.getElementById('shared-audio-close');

        playBtn?.addEventListener('click', () => {
            if (!this.musicAudioElement) return;
            if (this.musicAudioElement.paused) {
                this.musicAudioElement.play();
                this._setBtn(playBtn, 'fas fa-pause');
            } else {
                this.musicAudioElement.pause();
                this._setBtn(playBtn, 'fas fa-play');
            }
        });

        rewindBtn?.addEventListener('click', () => {
            if (this.musicAudioElement) {
                this.musicAudioElement.currentTime = Math.max(0, this.musicAudioElement.currentTime - 10);
            }
        });

        forwardBtn?.addEventListener('click', () => {
            if (this.musicAudioElement) {
                this.musicAudioElement.currentTime = Math.min(
                    this.musicAudioElement.duration || 0,
                    this.musicAudioElement.currentTime + 10
                );
            }
        });

        volumeSlider?.addEventListener('input', (e) => {
            const vol = parseFloat(e.target.value);
            if (this.musicGainNode) {
                this.musicGainNode.gain.value = vol;
            }
            if (this.musicAudioElement) {
                this.musicAudioElement.volume = vol;
            }
        });

        progressBar?.addEventListener('click', (e) => {
            if (!this.musicAudioElement || !this.musicAudioElement.duration) return;
            const rect = progressBar.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            this.musicAudioElement.currentTime = pct * this.musicAudioElement.duration;
        });

        closeBtn?.addEventListener('click', () => {
            const songTitle = document.getElementById('shared-audio-title')?.textContent || '';
            const artistName = document.getElementById('shared-audio-artist')?.textContent || '';
            this.stopMusicStream();
            if (this.socket && this.socket.connected && this.currentRoom) {
                this.socket.emit('music-stream-status', {
                    roomId: this.currentRoom,
                    songTitle,
                    artistName,
                    playing: false
                });
            }
        });
    }

    knockOnRoom(friendRoom) {
        const friendName = friendRoom?.querySelector('.friend-info h4')?.textContent;
        alert(`Knock sent to ${friendName}! They will be notified of your interest to join.`);
    }

    notifyParticipants(event, data) {
        console.log('Notifying participants:', event, data);
        
        if (this.socket && this.socket.connected && this.currentRoom) {
            this.socket.emit('room-event', {
                roomId: this.currentRoom,
                event,
                data
            });
        }
        
        if (event === 'permission-request') {
            this.handlePermissionRequest(data);
        } else if (event === 'permission-approved') {
            this.handlePermissionApproved(data);
        } else if (event === 'permission-denied') {
            this.handlePermissionDenied(data);
        }
    }
    
    handlePermissionApproved(data) {
        const featureLabel = data.feature === 'karaoke' ? 'Karaoke' : data.feature;
        this.addChatMessage('System', `${data.userName}'s ${featureLabel} request was approved.`, true);
        
        if (this.pendingPermissionRequestId && this.pendingPermissionRequestId === data.requestId) {
            this.pendingPermissionRequestId = null;
            if (data.feature === 'karaoke') {
                this.karaokeModal?.classList.add('active');
            }
        }
    }
    
    
    handlePermissionDenied(data) {
        const featureLabel = data.feature === 'karaoke' ? 'Karaoke' : data.feature;
        this.addChatMessage('System', `${data.userName}'s ${featureLabel} request was denied.`, true);
    }

    leaveRoom() {
        if (this._guestGate('leave')) return;
        this._playSfx('leaveRoom');

        const leavingRoom = this.currentRoom;
        const duration = this.roomJoinTime ? Math.round((Date.now() - this.roomJoinTime) / 1000) : 0;

        if (this.socket && leavingRoom) {
            this.socket.emit('leave-room', { roomId: leavingRoom });
        }

        this._agoraLeaveGuarded().catch(e => console.warn('[Leave] Agora:', e.message));

        if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
        if (this.localVideoStream) { this.localVideoStream.getTracks().forEach(t => t.stop()); this.localVideoStream = null; }
        if (this.nativeScreenCapture) { this.nativeScreenCapture.stop().catch(() => {}); this.nativeScreenCapture = null; }
        this.stopMusicStream();
        this.stopAudioMix();
        this.resetAudioFilter();
        if (this.audioContext && this.audioContext.state !== 'closed') { try { this.audioContext.close(); } catch(e) {} this.audioContext = null; }

        if (window._verseMiniPlayer) window._verseMiniPlayer.deactivate();
        this._detached = false;
        this._savedRoomName = null;
        this._releaseWakeLock();
        this._stopSilentAudioKeepAlive();
        this._stopAudioHealthCheck();
        this._stopSpeakingIndicator();
        this._teardownRoomInteractionListener();
        if (this._agoraUidMap) this._agoraUidMap.clear();
        const autoplayBanner = document.getElementById('agora-autoplay-banner');
        if (autoplayBanner) autoplayBanner.remove();

        this.isVideoActive = false;
        this.activeVideoFeeds.clear();
        this.handRaised = false;
        this.chatVisible = true;
        const videoGridWrapper = document.getElementById('video-grid-wrapper');
        const videoGrid = document.getElementById('video-grid');
        if (videoGridWrapper) videoGridWrapper.classList.add('hidden');
        this._clearEl(videoGrid);
        this.updateVideoButtonState();

        this._resetJoinState();

        this.audioRoom?.classList.add('hidden');
        document.body.classList.remove('in-room');
        const pageFooter = document.querySelector('footer');
        if (pageFooter) pageFooter.style.display = '';
        const mainContainer = document.querySelector('.audio-rooms-container');
        if (mainContainer) mainContainer.style.overflow = '';
        try { screen.orientation?.unlock?.(); } catch(e) {}
        if (this.roomSelection) this.roomSelection.style.display = 'block';

        this._clearEl(this.chatMessagesContainer);
        this._clearEl(this.speakersStage);
        this._clearEl(this.listenersGrid);
        const roomNameEl = document.getElementById('room-name');
        if (roomNameEl) roomNameEl.textContent = '';
        const currentSongEl = document.getElementById('current-song');
        if (currentSongEl) currentSongEl.textContent = '';

        if (leavingRoom) {
            fetch(apiUrl('/api/analytics/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType: 'verse_leave', segment: 'community', metadata: { roomId: leavingRoom, duration, page: 'verses' } }) }).catch(() => {});
        }

        this.loadActiveRooms();
        console.log('[Leave] Room left, lobby restored');

        if (leavingRoom && duration > 60 && localStorage.getItem('authToken')) {
            this._lastLeftRoomId = leavingRoom;
            setTimeout(() => this._showRatingModal(leavingRoom), 800);
        }
    }

    _playJoinSound() {
        const ts = Date.now();
        if (this._lastJoinSoundTime && ts - this._lastJoinSoundTime < 1000) return;
        this._lastJoinSoundTime = ts;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const now = ctx.currentTime;

            const noise = ctx.createBufferSource();
            const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.15));
            }
            noise.buffer = buf;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 600;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            noise.start(now);
            noise.stop(now + 0.08);
            noise.onended = () => ctx.close().catch(() => {});
        } catch (e) {}
        try {
            if (navigator.vibrate) navigator.vibrate(40);
        } catch (e) {}
    }

    isInRoom() {
        return !!this.currentRoom;
    }

    getRoomName() {
        const el = document.getElementById('room-name');
        return el ? el.textContent : this._savedRoomName || 'Audio Room';
    }

    _rebindDOMListeners() {
        this.createRoomBtn?.addEventListener('click', () => {
            this._primeSfx();
            this.showCreateRoomModal();
        });
        this.createRoomForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });

        this.editTopicBtn?.addEventListener('click', () => this.showTopicEditModal());
        this.topicEditForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.updateTopic();
        });

        document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => this.hideAllModals());
        });

        document.querySelectorAll('.view-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const view = tab.dataset.view;
                document.getElementById('live-view').style.display = view === 'live' ? '' : 'none';
                document.getElementById('replays-view').style.display = view === 'replays' ? '' : 'none';
                if (view === 'replays') this._fetchReplays(true);
            });
        });

        document.querySelectorAll('#replay-genre-filters .filter-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('#replay-genre-filters .filter-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.replayGenre = tab.dataset.filter;
                this._fetchReplays(true);
            });
        });

        document.getElementById('replay-sort')?.addEventListener('change', (e) => {
            this.replaySort = e.target.value;
            this._fetchReplays(true);
        });

        document.getElementById('load-more-replays')?.addEventListener('click', () => {
            this.replayPage++;
            this._fetchReplays(false);
        });

        this._setupRatingListeners();
        this._setupBoostListeners();

        this.toggleAudioBtn?.addEventListener('click', () => this.toggleAudio());
        this.raiseHandBtn?.addEventListener('click', () => this.toggleHandRaise());
        this.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this._initChatSwipeToDismiss();
        this.shareMusicBtn?.addEventListener('click', () => this.shareMusic());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());
        document.getElementById('join-stage-btn')?.addEventListener('click', () => this.joinStage());
        document.getElementById('stage-access-toggle')?.addEventListener('click', () => this.toggleStageAccess());

        this.addUsersBtn?.addEventListener('click', () => this.showAddUsersModal());
        this.replayBtn?.addEventListener('click', () => this.showReplayModal());
        document.getElementById('room-guide-btn')?.addEventListener('click', () => {
            window.open('verses-guide.html', '_blank');
        });

        document.getElementById('share-room-btn')?.addEventListener('click', () => this.shareRoom());
        document.getElementById('share-room-mobile-btn')?.addEventListener('click', () => this.shareRoom());

        this.lockRoomBtn?.addEventListener('click', () => this.toggleRoomLock());
        this.audioFilterBtn?.addEventListener('click', () => this.showAudioFiltersModal());
        this.karaokeBtn?.addEventListener('click', () => this.showKaraokeModal());

        document.getElementById('karaoke-toggle-btn')?.addEventListener('click', () => this.toggleKaraokePermission());
        document.getElementById('share-photo-btn')?.addEventListener('click', () => {
            if (window.Capacitor) {
                this.showMobileShareModal();
            } else {
                document.getElementById('photo-input')?.click();
            }
        });
        document.getElementById('photo-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.shareImage(file);
            e.target.value = '';
        });

        document.getElementById('video-toggle-btn')?.addEventListener('click', () => this.cycleVideoMode());
        document.getElementById('video-btn')?.addEventListener('click', () => this.toggleLocalVideo());
        document.getElementById('mute-all-btn')?.addEventListener('click', () => this.muteAllParticipants());
        document.getElementById('close-room-btn')?.addEventListener('click', () => this.closeRoom());

        this.setupMobileShareListeners();
        this.initMusicSharing();

        document.getElementById('karaoke-slower')?.addEventListener('click', () => this.adjustScrollSpeed(-0.25));
        document.getElementById('karaoke-faster')?.addEventListener('click', () => this.adjustScrollSpeed(0.25));

        document.getElementById('karaoke-camera-toggle')?.addEventListener('click', () => this.toggleKaraokeCamera());
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.setVideoFilter(filter);
            });
        });
        document.querySelectorAll('.ar-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.arFilter;
                if (this.currentVideoFilter === filter) {
                    this.setVideoFilter('none');
                } else {
                    this.setVideoFilter(filter);
                }
            });
        });

        document.querySelectorAll('#audio-filters-modal .filter-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.applyAudioFilter(filter);
            });
        });

        document.getElementById('karaoke-search-btn')?.addEventListener('click', () => this.searchKaraokeSongs());
        document.getElementById('karaoke-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchKaraokeSongs();
        });

        document.getElementById('yt-embed-btn')?.addEventListener('click', () => this.embedYouTubeFromInput());
        document.getElementById('yt-url-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.embedYouTubeFromInput();
        });
        document.getElementById('yt-embed-close')?.addEventListener('click', () => this.closeYouTubeEmbed());

        document.getElementById('karaoke-play-pause')?.addEventListener('click', () => this.toggleKaraokePlayback());
        document.getElementById('karaoke-restart')?.addEventListener('click', () => this.restartKaraoke());
        document.getElementById('karaoke-new-song')?.addEventListener('click', () => this.newKaraokeSong());
        document.getElementById('karaoke-stop')?.addEventListener('click', () => this.stopKaraoke());
        document.getElementById('karaoke-record-btn')?.addEventListener('click', () => this.toggleRecording());

        this.sendMessageBtn?.addEventListener('click', () => this.sendMessage());
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        document.getElementById('search-users')?.addEventListener('click', () => this.searchUsers());
        document.getElementById('user-search-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.searchUsers();
            }
        });

        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.filterRooms(filter);
            });
        });

        document.querySelector('.refresh-btn')?.addEventListener('click', () => {
            this.refreshFriendsRooms();
        });
    }

    detachFromDOM() {
        if (!this.isInRoom()) return;
        this._savedRoomName = this.getRoomName();
        this._detached = true;
    }

    reattachToDOM() {
        if (!this._detached || !this.isInRoom()) return;
        this._detached = false;

        this.initializeElements();
        this._rebindDOMListeners();

        if (this.roomSelection) this.roomSelection.style.display = 'none';
        this.audioRoom?.classList.remove('hidden');

        const roomNameEl = document.getElementById('room-name');
        if (roomNameEl && this._savedRoomName) roomNameEl.textContent = this._savedRoomName;

        if (this.socket) {
            this.socket.emit('request-participants', { roomId: this.currentRoom });
        }

        this.updateHostControls();
        this.updateKaraokeButtonState();
        this.updateVideoButtonState();
        this.initHostPanel();
        this.syncHostPanel();

        this._setupRoomInteractionListener();
        this.refreshVideoGrid();

        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const userName = user.name || user.username || 'Anonymous';
        this._addSelfToStage(userName, user.avatar || null, this.isRoomHost);
    }

    addRemoteSpeaker(participantId, name, stream, isSpeaking = false, userId = null, avatarUrl = null) {
        if (document.querySelector(`[data-participant-id="${participantId}"]`)) return;
        if (userId) {
            const existing = document.querySelector(`[data-user-id="${userId}"]`);
            if (existing && existing.getAttribute('data-participant-id') !== 'self') {
                existing.remove();
            }
        }
        
        const initial = (name || '?').charAt(0).toUpperCase();
        const speakerAvatar = document.createElement('div');
        speakerAvatar.className = 'speaker-avatar';
        speakerAvatar.setAttribute('data-participant-id', participantId);
        if (userId) speakerAvatar.setAttribute('data-user-id', userId);
        speakerAvatar.style.cursor = userId ? 'pointer' : 'default';
        const avatarRingSpeaker = this._el('div', {className: 'avatar-ring' + (isSpeaking ? ' speaking' : '')});
        this._buildAvatar(avatarRingSpeaker, avatarUrl, name, initial);
        const spkInfo = this._el('div', {className: 'speaker-info'},
            this._el('span', {className: 'speaker-name', textContent: name}),
            this._el('span', {className: 'speaker-role', textContent: 'Speaker'}));
        const spkStatus = this._el('div', {className: 'speaker-status'}, this._icon('fas fa-microphone'));
        speakerAvatar.append(avatarRingSpeaker, spkInfo, spkStatus);
        
        speakerAvatar.audioStream = stream;
        
        speakerAvatar.addEventListener('click', (e) => {
            if (e.target.closest('.kick-context-menu')) return;
            const pid = speakerAvatar.getAttribute('data-participant-id');
            if (this.isRoomHost && pid) {
                this._showParticipantActionMenu(pid, speakerAvatar);
            } else if (userId && typeof viewUserProfile === 'function') {
                viewUserProfile(userId);
            }
        });
        
        this.speakersStage?.appendChild(speakerAvatar);
        return speakerAvatar;
    }

    addRemoteListener(participantId, name, handRaised = false, userId = null, avatarUrl = null) {
        if (document.querySelector(`[data-participant-id="${participantId}"]`)) return;
        if (userId) {
            const existing = document.querySelector(`[data-user-id="${userId}"]`);
            if (existing && existing.getAttribute('data-participant-id') !== 'self') existing.remove();
        }
        const initial = (name || '?').charAt(0).toUpperCase();
        const listenerAvatar = document.createElement('div');
        listenerAvatar.className = `listener-avatar ${handRaised ? 'hand-raised' : ''}`;
        listenerAvatar.setAttribute('data-participant-id', participantId);
        if (userId) listenerAvatar.setAttribute('data-user-id', userId);
        listenerAvatar.style.cursor = userId ? 'pointer' : 'default';
        this._buildListenerAvatar(listenerAvatar, avatarUrl, name, initial);
        listenerAvatar.title = name;
        
        listenerAvatar.addEventListener('click', (e) => {
            if (e.target.closest('.kick-context-menu')) return;
            const pid = listenerAvatar.getAttribute('data-participant-id');
            if (this.isRoomHost && pid) {
                this._showParticipantActionMenu(pid, listenerAvatar);
            } else if (userId && typeof viewUserProfile === 'function') {
                viewUserProfile(userId);
            }
        });
        
        this.listenersGrid?.appendChild(listenerAvatar);
        return listenerAvatar;
    }

    removeRemoteParticipant(participantId) {
        const participant = document.querySelector(`[data-participant-id="${participantId}"]`);
        if (participant) {
            participant.remove();
        }
    }

    // ==========================================
    // DOOR LOCK FEATURE
    // ==========================================
    
    toggleRoomLock() {
        this.isRoomLocked = !this.isRoomLocked;
        
        // Update the global room lock registry (shared state for demo)
        if (!window.roomLockRegistry) {
            window.roomLockRegistry = {};
        }
        window.roomLockRegistry[this.currentRoom] = this.isRoomLocked;
        
        const lockBtn = this.lockRoomBtn;
        const icon = lockBtn?.querySelector('i');
        const text = lockBtn?.querySelector('.lock-text');
        
        if (this.isRoomLocked) {
            lockBtn?.classList.add('locked');
            if (icon) icon.className = 'fas fa-lock';
            if (text) text.textContent = 'Locked';
            this.addChatMessage('System', 'Room is now locked. No new participants can join.', true);
        } else {
            lockBtn?.classList.remove('locked');
            if (icon) icon.className = 'fas fa-unlock';
            if (text) text.textContent = 'Unlocked';
            this.addChatMessage('System', 'Room is now unlocked. New participants can join.', true);
        }
        
        this.notifyParticipants('room-lock', { locked: this.isRoomLocked });
    }

    // ==========================================
    // AUDIO FILTERS FEATURE
    // ==========================================
    
    showAudioFiltersModal() {
        if (this._guestGate('interact')) return;
        this.audioFiltersModal?.classList.add('active');
    }
    
    applyAudioFilter(filterType) {
        this.currentAudioFilter = filterType;
        
        // Update UI
        document.querySelectorAll('#audio-filters-modal .filter-option').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`#audio-filters-modal [data-filter="${filterType}"]`)?.classList.add('active');
        
        const filterNameDisplay = document.getElementById('current-filter-name');
        if (filterNameDisplay) {
            filterNameDisplay.textContent = this.capitalizeFirst(filterType);
        }
        
        // Update control button to show filter is active
        if (filterType !== 'normal') {
            this.audioFilterBtn?.classList.add('filter-active');
            // Apply the actual audio filter
            this.processAudioWithFilter(filterType);
        } else {
            this.audioFilterBtn?.classList.remove('filter-active');
            // Reset to original audio when switching to normal
            this.resetAudioFilter();
        }
        
        this.addChatMessage('System', `Voice effect changed to: ${this.capitalizeFirst(filterType)}`, true);
    }
    
    async processAudioWithFilter(filterType) {
        if (!this.localStream) return;
        
        try {
            if (this._filterOscillators) {
                this._filterOscillators.forEach(osc => {
                    try { osc.stop(); } catch(e) {}
                });
            }
            this._filterOscillators = [];

            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            const audioTrack = this.originalAudioTrack || this.localStream.getAudioTracks()[0];
            if (!audioTrack) return;

            if (!this.originalAudioTrack) {
                this.originalAudioTrack = audioTrack;
            }

            const sourceStream = new MediaStream([this.originalAudioTrack]);
            const source = this.audioContext.createMediaStreamSource(sourceStream);
            const destination = this.audioContext.createMediaStreamDestination();
            
            if (this.audioFilterNodes.source) {
                try { this.audioFilterNodes.source.disconnect(); } catch(e) {}
            }
            
            // Apply filter based on type
            let outputNode = source;
            
            switch (filterType) {
                case 'helium': {
                    const highShelf = this.audioContext.createBiquadFilter();
                    highShelf.type = 'highshelf';
                    highShelf.frequency.value = 800;
                    highShelf.gain.value = 20;

                    const lowShelf = this.audioContext.createBiquadFilter();
                    lowShelf.type = 'lowshelf';
                    lowShelf.frequency.value = 250;
                    lowShelf.gain.value = -25;

                    const ringOsc = this.audioContext.createOscillator();
                    ringOsc.frequency.value = 400;
                    ringOsc.type = 'sine';
                    const ringGain = this.audioContext.createGain();
                    ringGain.gain.value = 0;
                    ringOsc.connect(ringGain.gain);
                    ringOsc.start();
                    this._filterOscillators = this._filterOscillators || [];
                    this._filterOscillators.push(ringOsc);

                    const heliumMid = this.audioContext.createBiquadFilter();
                    heliumMid.type = 'peaking';
                    heliumMid.frequency.value = 3000;
                    heliumMid.gain.value = 10;
                    heliumMid.Q.value = 1;

                    source.connect(ringGain);
                    ringGain.connect(highShelf);
                    highShelf.connect(lowShelf);
                    lowShelf.connect(heliumMid);

                    const heliumBoost = this.audioContext.createGain();
                    heliumBoost.gain.value = 2.5;
                    heliumMid.connect(heliumBoost);
                    outputNode = heliumBoost;
                    break;
                }

                case 'alien': {
                    const modGain = this.audioContext.createGain();
                    modGain.gain.value = 0;

                    const alienOsc = this.audioContext.createOscillator();
                    alienOsc.frequency.value = 20;
                    alienOsc.type = 'sawtooth';
                    alienOsc.connect(modGain.gain);
                    alienOsc.start();
                    this._filterOscillators = this._filterOscillators || [];
                    this._filterOscillators.push(alienOsc);

                    const alienOsc2 = this.audioContext.createOscillator();
                    alienOsc2.frequency.value = 7;
                    alienOsc2.type = 'sine';
                    const lfoGain = this.audioContext.createGain();
                    lfoGain.gain.value = 0.3;
                    alienOsc2.connect(lfoGain);
                    alienOsc2.start();
                    this._filterOscillators.push(alienOsc2);

                    source.connect(modGain);

                    const alienHighpass = this.audioContext.createBiquadFilter();
                    alienHighpass.type = 'highpass';
                    alienHighpass.frequency.value = 300;
                    alienHighpass.Q.value = 3;

                    const alienDistortion = this.audioContext.createWaveShaper();
                    alienDistortion.curve = this.makeDistortionCurve(60);
                    alienDistortion.oversample = '4x';

                    modGain.connect(alienHighpass);
                    alienHighpass.connect(alienDistortion);

                    const alienOut = this.audioContext.createGain();
                    alienOut.gain.value = 2.0;
                    alienDistortion.connect(alienOut);
                    outputNode = alienOut;
                    break;
                }

                case 'deep': {
                    const lowpass = this.audioContext.createBiquadFilter();
                    lowpass.type = 'lowpass';
                    lowpass.frequency.value = 350;
                    lowpass.Q.value = 3;

                    const lowBoost = this.audioContext.createBiquadFilter();
                    lowBoost.type = 'lowshelf';
                    lowBoost.frequency.value = 150;
                    lowBoost.gain.value = 22;

                    const subBass = this.audioContext.createBiquadFilter();
                    subBass.type = 'peaking';
                    subBass.frequency.value = 80;
                    subBass.gain.value = 12;
                    subBass.Q.value = 1;

                    const deepGain = this.audioContext.createGain();
                    deepGain.gain.value = 2.5;

                    source.connect(lowpass);
                    lowpass.connect(lowBoost);
                    lowBoost.connect(subBass);
                    subBass.connect(deepGain);
                    outputNode = deepGain;
                    break;
                }

                case 'echo': {
                    const merger = this.audioContext.createGain();
                    merger.gain.value = 0.6;
                    source.connect(merger);

                    const delay1 = this.audioContext.createDelay(2.0);
                    delay1.delayTime.value = 0.3;
                    const fb1 = this.audioContext.createGain();
                    fb1.gain.value = 0.55;

                    const delay2 = this.audioContext.createDelay(2.0);
                    delay2.delayTime.value = 0.65;
                    const fb2 = this.audioContext.createGain();
                    fb2.gain.value = 0.35;

                    const delay3 = this.audioContext.createDelay(2.0);
                    delay3.delayTime.value = 1.0;
                    const fb3 = this.audioContext.createGain();
                    fb3.gain.value = 0.2;

                    source.connect(delay1);
                    delay1.connect(fb1);
                    fb1.connect(delay1);
                    delay1.connect(merger);

                    source.connect(delay2);
                    delay2.connect(fb2);
                    fb2.connect(delay2);
                    delay2.connect(merger);

                    source.connect(delay3);
                    delay3.connect(fb3);
                    fb3.connect(delay3);
                    delay3.connect(merger);

                    outputNode = merger;
                    break;
                }

                case 'radio': {
                    const bandpass = this.audioContext.createBiquadFilter();
                    bandpass.type = 'bandpass';
                    bandpass.frequency.value = 2000;
                    bandpass.Q.value = 4.0;

                    const radioHigh = this.audioContext.createBiquadFilter();
                    radioHigh.type = 'highpass';
                    radioHigh.frequency.value = 500;
                    radioHigh.Q.value = 1;

                    const distortion = this.audioContext.createWaveShaper();
                    distortion.curve = this.makeDistortionCurve(150);
                    distortion.oversample = '4x';

                    const radioComp = this.audioContext.createDynamicsCompressor();
                    radioComp.threshold.value = -30;
                    radioComp.knee.value = 10;
                    radioComp.ratio.value = 12;
                    radioComp.attack.value = 0.003;
                    radioComp.release.value = 0.1;

                    const radioGain = this.audioContext.createGain();
                    radioGain.gain.value = 1.5;

                    source.connect(bandpass);
                    bandpass.connect(radioHigh);
                    radioHigh.connect(distortion);
                    distortion.connect(radioComp);
                    radioComp.connect(radioGain);
                    outputNode = radioGain;
                    break;
                }

                case 'normal':
                default:
                    console.log('Normal voice - no filter');
                    break;
            }
            
            outputNode.connect(destination);
            
            // Store for cleanup
            this.audioFilterNodes = {
                source: source,
                output: outputNode,
                destination: destination
            };
            
            // Replace the audio track in the local stream with the filtered one
            const processedTrack = destination.stream.getAudioTracks()[0];
            if (processedTrack && this.localStream) {
                const originalTrack = this.localStream.getAudioTracks()[0];
                
                // Store original track for switching back to normal
                if (!this.originalAudioTrack) {
                    this.originalAudioTrack = originalTrack;
                }
                
                // Replace track in local stream
                this.localStream.removeTrack(originalTrack);
                this.localStream.addTrack(processedTrack);
                
                if (this.agoraLocalAudioTrack && this.agoraClient) {
                    try {
                        const newAgoraTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: processedTrack });
                        await this.agoraClient.unpublish([this.agoraLocalAudioTrack]);
                        this.agoraLocalAudioTrack.close();
                        this.agoraLocalAudioTrack = newAgoraTrack;
                        if (this.isAudioMuted) await this.agoraLocalAudioTrack.setMuted(true);
                        await this.agoraClient.publish([this.agoraLocalAudioTrack]);
                    } catch (e) {
                        console.error('Error updating Agora audio track with filter:', e);
                    }
                }

                console.log(`Audio filter "${filterType}" applied and routed to stream`);
            }
            
        } catch (error) {
            console.error('Error applying audio filter:', error);
        }
    }
    
    resetAudioFilter() {
        if (this._filterOscillators) {
            this._filterOscillators.forEach(osc => {
                try { osc.stop(); } catch(e) {}
            });
            this._filterOscillators = [];
        }

        if (this.originalAudioTrack && this.localStream) {
            const currentTrack = this.localStream.getAudioTracks()[0];
            if (currentTrack) {
                this.localStream.removeTrack(currentTrack);
            }
            this.localStream.addTrack(this.originalAudioTrack);

            if (this.agoraLocalAudioTrack && this.agoraClient) {
                try {
                    const newAgoraTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: this.originalAudioTrack });
                    this.agoraClient.unpublish([this.agoraLocalAudioTrack]).then(() => {
                        this.agoraLocalAudioTrack.close();
                        this.agoraLocalAudioTrack = newAgoraTrack;
                        if (this.isAudioMuted) this.agoraLocalAudioTrack.setMuted(true);
                        this.agoraClient.publish([this.agoraLocalAudioTrack]);
                    }).catch(e => console.warn('Agora track reset error:', e));
                } catch (e) {
                    console.warn('Agora track reset error:', e);
                }
            }

            if (this.audioFilterNodes.source) {
                try { this.audioFilterNodes.source.disconnect(); } catch(e) {}
            }
            if (this.audioContext && !this.audioMixEnabled) {
                this.audioContext.close();
                this.audioContext = null;
            }
            this.audioFilterNodes = {};
        }
    }
    
    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        
        return curve;
    }

    // ==========================================
    // KARAOKE MODE FEATURE
    // ==========================================
    
    showKaraokeModal() {
        if (this._guestGate('interact')) return;
        if (!this.isRoomHost) {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = user.name || user.username || 'A participant';
            this.requestPermission('karaoke', userName);
            return;
        }
        if (!this.karaokeEnabled) {
            this.karaokeEnabled = true;
            this.updateKaraokeButtonState();
            const btn = document.getElementById('karaoke-toggle-btn');
            const text = btn?.querySelector('.karaoke-toggle-text');
            btn?.classList.add('active');
            if (text) text.textContent = 'Karaoke: On';
            this.addChatMessage('System', 'Karaoke mode enabled!', true);
        }
        this.karaokeModal?.classList.add('active');
    }
    
    stopKaraokeCamera() {
        // Clean up camera when modal closes or room changes
        if (this.karaokeVideoStream) {
            this.karaokeVideoStream.getTracks().forEach(track => track.stop());
            this.karaokeVideoStream = null;
        }
        
        const videoEl = document.getElementById('karaoke-video');
        const placeholder = document.getElementById('video-placeholder');
        const cameraBtn = document.getElementById('karaoke-camera-toggle');
        
        if (videoEl) videoEl.srcObject = null;
        placeholder?.classList.remove('hidden');
        cameraBtn?.classList.remove('active');
        this.karaokeVideoActive = false;
    }
    
    toggleKaraokePermission() {
        // Only room host/creator can toggle karaoke permission
        if (!this.isRoomHost) {
            this.addChatMessage('System', 'Only the room host can enable/disable karaoke.', true);
            return;
        }
        
        this.karaokeEnabled = !this.karaokeEnabled;
        
        // Update button UI
        const btn = document.getElementById('karaoke-toggle-btn');
        const icon = btn?.querySelector('i');
        const text = btn?.querySelector('.karaoke-toggle-text');
        
        if (this.karaokeEnabled) {
            btn?.classList.add('active');
            if (text) text.textContent = 'Karaoke: On';
            this.addChatMessage('System', 'Karaoke mode enabled! Participants can now start karaoke sessions.', true);
        } else {
            btn?.classList.remove('active');
            if (text) text.textContent = 'Karaoke: Off';
            this.addChatMessage('System', 'Karaoke mode disabled.', true);
        }
        
        // Notify other participants
        this.notifyParticipants('karaoke-permission', { enabled: this.karaokeEnabled });
        
        // Update karaoke button visibility/state for all users
        this.updateKaraokeButtonState();
    }
    
    updateKaraokeButtonState() {
        const karaokeBtn = document.getElementById('karaoke-btn');
        if (karaokeBtn) {
            if (this.karaokeEnabled) {
                karaokeBtn.classList.remove('disabled');
                karaokeBtn.title = 'Karaoke mode';
            } else {
                karaokeBtn.classList.add('disabled');
                karaokeBtn.title = 'Karaoke disabled by host';
            }
        }
    }
    
    updateHostControls() {
        const hostOnlyControls = [
            document.getElementById('karaoke-toggle-btn'),
            document.getElementById('video-toggle-btn'),
            document.getElementById('mute-all-btn'),
            document.getElementById('close-room-btn'),
            document.getElementById('lock-room-btn'),
            document.getElementById('edit-topic')
        ];
        
        hostOnlyControls.forEach(control => {
            if (control) {
                if (this.isRoomHost) {
                    control.style.display = '';
                    control.classList.remove('hidden');
                } else {
                    control.style.display = 'none';
                }
            }
        });

        const toggleBtn = document.getElementById('host-panel-toggle');
        const panel = document.getElementById('host-controls-panel');
        if (toggleBtn) {
            toggleBtn.style.display = this.isRoomHost ? '' : 'none';
        }
        if (panel && !this.isRoomHost) {
            panel.classList.add('hidden');
            panel.classList.remove('visible');
            toggleBtn?.classList.remove('open');
        }
    }

    initHostPanel() {
        const toggleBtn = document.getElementById('host-panel-toggle');
        const panel = document.getElementById('host-controls-panel');
        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', () => {
            const isOpen = panel.classList.contains('visible');
            if (isOpen) {
                panel.classList.remove('visible');
                panel.classList.add('hidden');
                toggleBtn.classList.remove('open');
            } else {
                panel.classList.remove('hidden');
                panel.classList.add('visible');
                toggleBtn.classList.add('open');
                this.syncHostPanel();
            }
        });

        panel.querySelectorAll('.host-panel-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mirrorId = btn.dataset.mirrors;
                const original = document.getElementById(mirrorId);
                if (original) original.click();
                setTimeout(() => this.syncHostPanel(), 50);
            });
        });
    }

    syncHostPanel() {
        const panel = document.getElementById('host-controls-panel');
        if (!panel) return;

        panel.querySelectorAll('.host-panel-btn').forEach(btn => {
            const mirrorId = btn.dataset.mirrors;
            const original = document.getElementById(mirrorId);
            if (!original) return;

            const origIcon = original.querySelector('i');
            const panelIcon = btn.querySelector('i');
            if (origIcon && panelIcon) {
                panelIcon.className = origIcon.className;
            }

            const origText = original.querySelector('span')?.textContent
                || original.textContent.replace(origIcon?.textContent || '', '').trim();
            const panelSpan = btn.querySelector('span');
            if (panelSpan && origText) {
                panelSpan.textContent = origText;
            }

            const isActive = original.classList.contains('active') ||
                original.classList.contains('locked') ||
                (origText && !origText.toLowerCase().includes('off') && !origText.toLowerCase().includes('unlock'));
            btn.classList.toggle('active-feature', isActive);
        });
    }

    _showParticipantActionMenu(participantId, avatarEl) {
        document.querySelectorAll('.kick-context-menu').forEach(el => el.remove());
        document.querySelectorAll('.kick-overlay').forEach(el => el.remove());

        const name = avatarEl.querySelector('.speaker-name')?.textContent || avatarEl.title || 'this user';
        const isSpeaker = this.speakersStage?.contains(avatarEl);
        const isMobile = window.innerWidth <= 768;

        const menu = document.createElement('div');
        menu.className = 'kick-context-menu' + (isMobile ? ' kick-context-menu--mobile' : '');
        menu.appendChild(this._el('div', {className: 'kick-menu-header', textContent: name}));
        if (isSpeaker) {
            const moveBtn = this._el('button', {className: 'kick-menu-item move-to-crowd'}, this._icon('fas fa-arrow-down'), this._text(' Move to Crowd'));
            moveBtn.dataset.action = 'move-to-crowd';
            menu.appendChild(moveBtn);
        } else {
            const inviteBtn = this._el('button', {className: 'kick-menu-item invite-to-stage'}, this._icon('fas fa-arrow-up'), this._text(' Invite to Stage'));
            inviteBtn.dataset.action = 'invite-to-stage';
            menu.appendChild(inviteBtn);
        }
        const removeBtn = this._el('button', {className: 'kick-menu-item remove-from-room'}, this._icon('fas fa-ban'), this._text(' Remove from Room'));
        removeBtn.dataset.action = 'remove';
        menu.appendChild(removeBtn);
        if (isMobile) {
            menu.appendChild(this._el('button', {className: 'kick-menu-item kick-menu-cancel'}, this._icon('fas fa-times'), this._text(' Cancel')));
        }

        const removeMenu = () => {
            menu.remove();
            overlay?.remove();
            document.removeEventListener('click', closeMenu);
        };

        menu.querySelector('.move-to-crowd')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.kickParticipant(participantId, 'move-to-crowd');
            removeMenu();
        });
        menu.querySelector('.invite-to-stage')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.promoteToSpeaker(participantId);
            removeMenu();
        });
        menu.querySelector('.remove-from-room')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.kickParticipant(participantId, 'remove');
            removeMenu();
        });
        menu.querySelector('.kick-menu-cancel')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removeMenu();
        });

        let overlay = null;
        if (isMobile) {
            overlay = document.createElement('div');
            overlay.className = 'kick-overlay';
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                removeMenu();
            });
            document.body.appendChild(overlay);
            document.body.appendChild(menu);
            requestAnimationFrame(() => {
                overlay.classList.add('active');
                menu.classList.add('active');
            });
        } else {
            avatarEl.style.position = 'relative';
            avatarEl.appendChild(menu);
        }

        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !avatarEl.contains(e.target)) {
                removeMenu();
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 10);
    }

    kickParticipant(targetSocketId, action) {
        if (!this.isRoomHost || !this.socket || !this.currentRoom) return;
        this.socket.emit('kick-participant', {
            roomId: this.currentRoom,
            targetSocketId,
            action
        });
    }

    promoteToSpeaker(targetSocketId) {
        if (!this.isRoomHost || !this.socket || !this.currentRoom) return;
        this.socket.emit('promote-to-speaker', {
            roomId: this.currentRoom,
            targetSocketId
        });
    }

    // ==========================================
    // VIDEO GRID FEATURE
    // ==========================================
    
    cycleVideoMode() {
        if (!this.isRoomHost) return;
        const modes = ['off', 'ask', 'open'];
        const idx = modes.indexOf(this.videoMode);
        this.videoMode = modes[(idx + 1) % modes.length];
        
        this.notifyParticipants('video-mode', { mode: this.videoMode });
        this.updateVideoButtonState();
        
        const labels = { off: 'Video disabled.', ask: 'Video set to Ask mode — participants must request permission.', open: 'Video open — anyone can turn on their camera.' };
        this.addChatMessage('System', labels[this.videoMode], true);
        
        if (this.videoMode === 'off' && this.isVideoActive) {
            this.stopLocalVideo();
        }
        if (this.videoMode !== 'off') {
            this._resolvePendingVideos();
            this._subscribeToAllRemoteVideo();
        }
    }
    
    updateVideoModeHostUI() {
        const btn = document.getElementById('video-toggle-btn');
        const text = btn?.querySelector('.video-toggle-text');
        const icon = btn?.querySelector('i');
        btn?.classList.remove('video-ask', 'video-open', 'active');
        if (this.videoMode === 'ask') {
            btn?.classList.add('video-ask');
            if (text) text.textContent = 'Video: Ask';
            if (icon) { icon.className = 'fas fa-video'; }
        } else if (this.videoMode === 'open') {
            btn?.classList.add('video-open', 'active');
            if (text) text.textContent = 'Video: Open';
            if (icon) { icon.className = 'fas fa-video'; }
        } else {
            if (text) text.textContent = 'Video: Off';
            if (icon) { icon.className = 'fas fa-video-slash'; }
        }
    }
    
    updateVideoButtonState() {
        const videoBtn = document.getElementById('video-btn');
        if (!videoBtn) return;
        const icon = videoBtn.querySelector('i');
        const label = videoBtn.querySelector('.ctrl-label');
        if (this.videoMode === 'off') {
            videoBtn.classList.add('disabled');
            videoBtn.classList.remove('active');
            videoBtn.title = 'Camera disabled by host';
            icon.className = 'fas fa-video-slash';
            if (label) label.textContent = 'Camera';
        } else if (this.isVideoActive) {
            videoBtn.classList.remove('disabled');
            videoBtn.classList.add('active');
            videoBtn.title = 'Turn off camera';
            icon.className = 'fas fa-video';
            if (label) label.textContent = 'Camera';
        } else {
            videoBtn.classList.remove('disabled');
            videoBtn.classList.remove('active');
            videoBtn.title = 'Turn on camera';
            icon.className = 'fas fa-video';
            if (label) label.textContent = 'Camera';
        }
        if (this.isRoomHost) {
            this.updateVideoModeHostUI();
        }
    }
    
    async toggleLocalVideo() {
        if (this.videoMode === 'off') {
            this.showToast('Video is disabled by the host.', 'fa-video-slash');
            return;
        }

        if (!this.isSpeaker) {
            this.showToast('You need to be on stage to use the camera', 'fa-video-slash', 3000);
            return;
        }
        
        if (this.isVideoActive) {
            this.stopLocalVideo();
            return;
        }
        
        if (this.videoMode === 'ask' && !this.isRoomHost) {
            this.addChatMessage('System', 'Camera request sent to host...', true);
            this.notifyParticipants('video-request', { userName: this.socket?.userName || 'A participant' });
            return;
        }
        
        await this.startLocalVideo();
    }
    
    async startLocalVideo() {
        if (this.activeVideoFeeds.size >= this.MAX_VIDEO_TILES && !this.activeVideoFeeds.has('self')) {
            this.showToast('Video grid is full (max 6 feeds).', 'fa-video-slash');
            return;
        }
        
        try {
            this.localVideoStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15 } },
                audio: false
            });
            this.isVideoActive = true;
            this.updateVideoButtonState();
            
            this.addVideoTile('self', this.socket?.userName || 'You', this.localVideoStream, true);
            
            this.notifyParticipants('video-start', {});
            
            if (this.agoraClient) {
                try {
                    const videoTrack = this.localVideoStream.getVideoTracks()[0];
                    this.agoraLocalVideoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTrack });
                    await this.agoraClient.publish([this.agoraLocalVideoTrack]);
                    console.log('Agora: published video track');
                } catch (e) {
                    console.error('Error publishing video to Agora:', e);
                }
            }
        } catch (e) {
            console.error('Error starting video:', e);
            this.showToast('Could not access camera.', 'fa-exclamation-circle');
        }
    }
    
    stopLocalVideo() {
        if (this.localVideoStream) {
            this.localVideoStream.getTracks().forEach(t => t.stop());
            this.localVideoStream = null;
        }
        this.isVideoActive = false;
        this.removeVideoTile('self');
        this.updateVideoButtonState();
        
        this.notifyParticipants('video-stop', {});
        
        if (this.agoraLocalVideoTrack && this.agoraClient) {
            try {
                this.agoraClient.unpublish([this.agoraLocalVideoTrack]);
                this.agoraLocalVideoTrack.close();
                this.agoraLocalVideoTrack = null;
                console.log('Agora: unpublished video track');
            } catch (e) {
                console.error('Error unpublishing video from Agora:', e);
            }
        }
    }
    
    handleRemoteVideoStart(data) {
        const { socketId, userName } = data;
        if (!socketId || socketId === this.socket?.id) return;
        
        const existing = this.activeVideoFeeds.get(socketId);
        if (existing && existing.stream) return;
        
        if (!existing) {
            this.activeVideoFeeds.set(socketId, { userName, stream: null, muted: false });
            this.refreshVideoGrid();
        }
    }
    
    handleRemoteVideoStop(data) {
        const { socketId } = data;
        if (!socketId) return;
        this.removeVideoTile(socketId);
    }
    
    handleVideoRequest(data) {
        if (!this.isRoomHost) return;
        const container = document.getElementById('host-notifications');
        if (!container) return;
        
        const reqId = Date.now().toString();
        const notification = document.createElement('div');
        notification.className = 'host-notification';
        notification.dataset.requestId = reqId;
        const notifIcon = this._el('div', {className: 'host-notif-icon'}, this._icon('fas fa-video'));
        const notifContent = this._el('div', {className: 'host-notif-content'});
        const strongName = this._el('strong', {textContent: data.userName});
        const strongCam = this._el('strong', {textContent: 'camera'});
        notifContent.append(strongName, this._text(' wants to enable their '), strongCam);
        const approveBtn = this._el('button', {className: 'notif-approve-btn'}, this._icon('fas fa-check'), this._text(' Allow'));
        approveBtn.addEventListener('click', () => this.approveVideoRequest(reqId, data.requesterId, data.userName));
        const denyBtn = this._el('button', {className: 'notif-deny-btn'}, this._icon('fas fa-times'), this._text(' Deny'));
        denyBtn.addEventListener('click', () => this.denyVideoRequest(reqId, data.requesterId, data.userName));
        const notifActions = this._el('div', {className: 'host-notif-actions'}, approveBtn, denyBtn);
        notification.append(notifIcon, notifContent, notifActions);
        container.appendChild(notification);
        setTimeout(() => notification.classList.add('visible'), 10);
        setTimeout(() => this.dismissNotification(reqId), 30000);
    }
    
    approveVideoRequest(requestId, targetSocketId, userName) {
        this.notifyParticipants('video-approved', { targetSocketId, userName });
        this.dismissNotification(requestId);
        this.addChatMessage('System', `Allowed ${userName} to use camera.`, true);
    }
    
    denyVideoRequest(requestId, targetSocketId, userName) {
        this.notifyParticipants('video-denied', { targetSocketId, userName });
        this.dismissNotification(requestId);
    }
    
    handleVideoApproved(data) {
        this.showToast('Host approved your camera request!', 'fa-video');
        this.startLocalVideo();
    }
    
    addVideoTile(id, userName, stream, isSelf = false) {
        this.activeVideoFeeds.set(id, { userName, stream, muted: false });
        this.refreshVideoGrid();
    }
    
    removeVideoTile(id) {
        const feed = this.activeVideoFeeds.get(id);
        if (feed && feed.agoraTrack && id !== 'self') {
            try { feed.agoraTrack.stop(); } catch (e) {}
        }
        this.activeVideoFeeds.delete(id);
        this.refreshVideoGrid();
    }
    
    refreshVideoGrid() {
        const wrapper = document.getElementById('video-grid-wrapper');
        const grid = document.getElementById('video-grid');
        if (!wrapper || !grid) return;
        
        if (this.activeVideoFeeds.size === 0) {
            wrapper.classList.add('hidden');
            grid.replaceChildren();
            return;
        }
        
        wrapper.classList.remove('hidden');
        
        const sorted = this.getSpeakerPrioritizedFeeds();
        const displayed = sorted.slice(0, this.MAX_VIDEO_TILES);
        
        grid.dataset.count = String(Math.min(displayed.length, 6));
        
        const existingTiles = new Map();
        grid.querySelectorAll('.video-tile').forEach(tile => {
            existingTiles.set(tile.dataset.feedId, tile);
        });
        
        const newIds = new Set(displayed.map(d => d.id));
        existingTiles.forEach((tile, id) => {
            if (!newIds.has(id)) tile.remove();
        });
        
        displayed.forEach(feed => {
            let tile = existingTiles.get(feed.id);
            if (!tile) {
                tile = document.createElement('div');
                tile.className = 'video-tile' + (feed.id === 'self' ? ' self' : '');
                tile.dataset.feedId = feed.id;
                
                const videoContainer = document.createElement('div');
                videoContainer.className = 'video-tile-container';
                videoContainer.style.cssText = 'width:100%;height:100%;position:relative;';
                
                const nameLabel = document.createElement('span');
                nameLabel.className = 'video-tile-name';
                nameLabel.textContent = feed.id === 'self' ? 'You' : feed.userName;
                
                tile.appendChild(videoContainer);
                tile.appendChild(nameLabel);
                grid.appendChild(tile);
            }
            
            const container = tile.querySelector('.video-tile-container');
            if (container) {
                if (feed.agoraTrack && !container.dataset.agoraPlaying) {
                    container.replaceChildren();
                    try {
                        feed.agoraTrack.play(container);
                        container.dataset.agoraPlaying = 'true';
                        const agoraVideo = container.querySelector('video');
                        if (agoraVideo) {
                            agoraVideo.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                        }
                    } catch (e) {
                        console.warn('Agora video play error:', e);
                    }
                } else if (feed.stream && !feed.agoraTrack) {
                    let videoEl = container.querySelector('video');
                    if (!videoEl) {
                        videoEl = document.createElement('video');
                        videoEl.autoplay = true;
                        videoEl.playsInline = true;
                        videoEl.muted = feed.id === 'self';
                        videoEl.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                        container.replaceChildren();
                        container.appendChild(videoEl);
                    }
                    if (videoEl.srcObject !== feed.stream) {
                        videoEl.srcObject = feed.stream;
                    }
                }
            }
            
            const existingMuteTag = tile.querySelector('.video-tile-muted');
            if (feed.muted && !existingMuteTag) {
                const muteTag = document.createElement('span');
                muteTag.className = 'video-tile-muted';
                muteTag.appendChild(this._icon('fas fa-microphone-slash'));
                tile.appendChild(muteTag);
            } else if (!feed.muted && existingMuteTag) {
                existingMuteTag.remove();
            }
        });
    }
    
    getSpeakerPrioritizedFeeds() {
        const feeds = Array.from(this.activeVideoFeeds.entries()).map(([id, data]) => ({
            id,
            userName: data.userName,
            stream: data.stream,
            muted: data.muted,
            agoraTrack: data.agoraTrack || null
        }));
        
        feeds.sort((a, b) => {
            if (a.id === 'self') return -1;
            if (b.id === 'self') return 1;
            if (a.muted !== b.muted) return a.muted ? 1 : -1;
            return 0;
        });
        
        return feeds;
    }
    
    // ==========================================
    // MUTE ALL & CLOSE ROOM
    // ==========================================
    
    muteAllParticipants() {
        if (!this.isRoomHost) return;
        if (!confirm('Mute all participants in this room?')) return;
        this.notifyParticipants('mute-all', {});
        this.addChatMessage('System', 'You muted all participants.', true);
    }
    
    handleMuteAll(data) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
        }
        this.isAudioMuted = true;
        if (this.agoraLocalAudioTrack) {
            this.agoraLocalAudioTrack.setMuted(true);
        }
        const toggleBtn = document.getElementById('toggle-audio');
        if (toggleBtn) {
            toggleBtn.querySelector('i').className = 'fas fa-microphone-slash';
            toggleBtn.classList.add('muted');
        }
        this.notifyParticipants('mute-status', { muted: true });
        this.showToast(`${data.hostName || 'Host'} muted everyone.`, 'fa-volume-mute');
        this.addChatMessage('System', `${data.hostName || 'Host'} muted all participants.`, true);
    }
    
    closeRoom() {
        if (!this.isRoomHost) return;
        if (!confirm('Close this room? Everyone will be removed.')) return;
        this.notifyParticipants('close-room', {});
        this.addChatMessage('System', 'Room closed.', true);
        setTimeout(() => this.leaveRoom(), 300);
    }
    
    handleCloseRoom(data) {
        this.showToast(`${data.hostName || 'Host'} closed the room.`, 'fa-door-closed', 5000);
        this.addChatMessage('System', `${data.hostName || 'Host'} closed the room.`, true);
        setTimeout(() => this.leaveRoom(), 500);
    }

    requestPermission(feature, userName) {
        const requestId = Date.now().toString();
        this.pendingPermissionRequestId = requestId;
        const featureLabel = feature === 'karaoke' ? 'Karaoke' : 'Screen Share';
        
        this.addChatMessage('System', `Your ${featureLabel} request has been sent to the host.`, true);
        
        this.notifyParticipants('permission-request', {
            requestId,
            feature,
            userName: userName || 'A participant',
            userId: 'currentUser'
        });
    }
    
    handlePermissionRequest(data) {
        if (!this.isRoomHost) return;
        this.showHostApprovalNotification(data.requestId, data.feature, data.userName);
    }
    
    showHostApprovalNotification(requestId, feature, userName) {
        const container = document.getElementById('host-notifications');
        if (!container) return;
        
        const featureLabels = { karaoke: 'Karaoke', video: 'Camera' };
        const featureIcons = { karaoke: 'fa-compact-disc', video: 'fa-video' };
        const featureLabel = featureLabels[feature] || feature;
        const featureIcon = featureIcons[feature] || 'fa-question';
        
        const notification = document.createElement('div');
        notification.className = 'host-notification';
        notification.dataset.requestId = requestId;
        const nIcon = this._el('div', {className: 'host-notif-icon'}, this._icon('fas ' + featureIcon));
        const nContent = this._el('div', {className: 'host-notif-content'});
        nContent.append(this._el('strong', {textContent: userName}), this._text(' wants to use '), this._el('strong', {textContent: featureLabel}));
        const nApprove = this._el('button', {className: 'notif-approve-btn'}, this._icon('fas fa-check'), this._text(' Allow'));
        nApprove.addEventListener('click', () => this.approveRequest(requestId, feature, userName));
        const nDeny = this._el('button', {className: 'notif-deny-btn'}, this._icon('fas fa-times'), this._text(' Deny'));
        nDeny.addEventListener('click', () => this.denyRequest(requestId, feature, userName));
        const nActions = this._el('div', {className: 'host-notif-actions'}, nApprove, nDeny);
        notification.append(nIcon, nContent, nActions);
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('visible');
        }, 10);
        
        setTimeout(() => {
            this.dismissNotification(requestId);
        }, 30000);
    }
    
    approveRequest(requestId, feature, userName) {
        this.notifyParticipants('permission-approved', {
            requestId,
            feature,
            userName
        });
        
        if (feature === 'karaoke') {
            if (!this.karaokeEnabled) {
                this.karaokeEnabled = true;
                const btn = document.getElementById('karaoke-toggle-btn');
                const text = btn?.querySelector('.karaoke-toggle-text');
                btn?.classList.add('active');
                if (text) text.textContent = 'Karaoke: On';
                this.updateKaraokeButtonState();
            }
        }
        
        this.dismissNotification(requestId);
    }
    
    denyRequest(requestId, feature, userName) {
        this.notifyParticipants('permission-denied', {
            requestId,
            feature,
            userName
        });
        
        this.dismissNotification(requestId);
    }
    
    dismissNotification(requestId) {
        const notification = document.querySelector(`.host-notification[data-request-id="${requestId}"]`);
        if (notification) {
            notification.classList.remove('visible');
            notification.classList.add('dismissing');
            setTimeout(() => notification.remove(), 300);
        }
    }

    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) 
            || (window.innerWidth <= 768);
    }
    
    showMobileShareModal() {
        const modal = document.getElementById('mobile-share-modal');
        modal?.classList.add('active');
    }

    setupMobileShareListeners() {
        if (window.Capacitor && window.NativeScreenCapture && NativeScreenCapture.isAvailable()) {
            const screenBtn = document.getElementById('mobile-screen-share-btn');
            if (screenBtn) screenBtn.style.display = 'flex';
        }

        document.getElementById('mobile-screen-share-btn')?.addEventListener('click', () => {
            document.getElementById('mobile-share-modal')?.classList.remove('active');
            this.startNativeScreenShare();
        });

        document.getElementById('mobile-image-share-btn')?.addEventListener('click', () => {
            document.getElementById('mobile-share-modal')?.classList.remove('active');
            document.getElementById('mobile-image-input')?.click();
        });

        document.getElementById('mobile-image-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.shareImage(file);
            e.target.value = '';
        });

        document.getElementById('shared-image-close')?.addEventListener('click', () => {
            document.getElementById('shared-image-overlay')?.classList.add('hidden');
        });
    }

    async startNativeScreenShare() {
        if (this._guestGate('interact')) return;
        if (!window.NativeScreenCapture || !NativeScreenCapture.isAvailable()) {
            this.showToast('Screen sharing not available on this device', 'fa-exclamation-circle');
            return;
        }

        try {
            this.nativeScreenCapture = new NativeScreenCapture();
            const stream = await this.nativeScreenCapture.start({
                fps: 10,
                quality: 40,
                scale: 0.5
            });

            if (stream) {
                this.addChatMessage('System', 'You started sharing your screen.', true);
                this.notifyParticipants('screenshare-start', { userId: 'currentUser', type: 'screen' });
                await this.addVideoTrackToPeers(stream);

                stream.getVideoTracks()[0].onended = () => {
                    this.stopNativeScreenShare();
                };
            }
        } catch (error) {
            console.error('Native screen share error:', error);
            if (this.nativeScreenCapture) {
                this.nativeScreenCapture.cleanup();
                this.nativeScreenCapture = null;
            }
            if (error.message?.includes('denied') || error.message?.includes('permission')) {
                this.showToast('Screen capture permission denied', 'fa-exclamation-circle');
            } else {
                this.showToast('Could not start screen sharing', 'fa-exclamation-circle');
            }
        }
    }

    async stopNativeScreenShare() {
        await this.removeVideoTrackFromPeers();

        if (this.nativeScreenCapture) {
            await this.nativeScreenCapture.stop();
            this.nativeScreenCapture = null;
        }

        this.addChatMessage('System', 'Screen sharing stopped.', true);
        this.notifyParticipants('screenshare-stop', { userId: 'currentUser' });
    }

    async shareImage(file) {
        if (this._guestGate('interact')) return;
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('Image too large (max 10MB)', 'fa-exclamation-circle');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            
            this.addImageChatMessage('You', dataUrl);
            
            if (this.socket && this.socket.connected && this.currentRoom) {
                this.socket.emit('room-image', {
                    roomId: this.currentRoom,
                    imageData: dataUrl
                });
            }
            
            this.showToast('Photo shared with the room', 'fa-check-circle');
            this.showSharedImageOverlay(dataUrl, 'You');
        };
        reader.readAsDataURL(file);
    }

    addImageChatMessage(sender, imageDataUrl) {
        if (!this.chatMessagesContainer) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender === 'You' ? 'own' : ''}`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const header = this._el('div', {className: 'chat-message-header'},
            this._el('span', {className: 'sender', textContent: sender}),
            this._el('span', {className: 'timestamp', textContent: timestamp}));
        const thumb = this._el('img', {className: 'shared-image-thumb', src: imageDataUrl, alt: 'Shared photo'});
        thumb.addEventListener('click', () => {
            this.showSharedImageOverlay(imageDataUrl, sender);
        });
        messageElement.append(header, thumb);
        
        this.chatMessagesContainer.appendChild(messageElement);
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }

    showSharedImageOverlay(imageDataUrl, sender) {
        const overlay = document.getElementById('shared-image-overlay');
        const display = document.getElementById('shared-image-display');
        const senderEl = document.getElementById('shared-image-sender');
        
        if (display) display.src = imageDataUrl;
        if (senderEl) {
            senderEl.replaceChildren(this._icon('fas fa-image'), this._text(' Photo from ' + sender));
        }
        overlay?.classList.remove('hidden');
    }
    
    // ==========================================
    // KARAOKE VIDEO FEATURE
    // ==========================================
    
    async toggleKaraokeCamera() {
        if (!this.karaokeEnabled) {
            this.addChatMessage('System', 'Karaoke must be enabled by the host to use the camera.', true);
            return;
        }
        
        const cameraBtn = document.getElementById('karaoke-camera-toggle');
        const videoEl = document.getElementById('karaoke-video');
        const placeholder = document.getElementById('video-placeholder');
        
        if (this.karaokeVideoActive) {
            if (this.canvasFilterRAF) {
                cancelAnimationFrame(this.canvasFilterRAF);
                this.canvasFilterRAF = null;
            }
            if (this.canvasStream) {
                this.canvasStream.getTracks().forEach(t => t.stop());
                this.canvasStream = null;
            }
            const canvas = document.getElementById('karaoke-canvas');
            if (canvas) canvas.style.display = 'none';
            if (videoEl) {
                videoEl.style.visibility = '';
                videoEl.style.position = '';
                videoEl.style.pointerEvents = '';
            }

            this.karaokeVideoActive = false;
            this.previewMode = false;
            await this.removeVideoTrackFromPeers();
            
            if (this.karaokeVideoStream) {
                this.karaokeVideoStream.getTracks().forEach(track => track.stop());
                this.karaokeVideoStream = null;
            }
            if (videoEl) videoEl.srcObject = null;
            placeholder?.classList.remove('hidden');
            cameraBtn?.classList.remove('active');

            this.notifyParticipants('karaoke-stop', {});
            this.karaokeStartNotified = false;
            this.addChatMessage('System', 'Camera off — no longer broadcasting.', true);
        } else {
            try {
                this.karaokeVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });
                
                if (videoEl && this.karaokeVideoStream) {
                    videoEl.srcObject = this.karaokeVideoStream;
                    placeholder?.classList.add('hidden');
                    cameraBtn?.classList.add('active');
                    this.karaokeVideoActive = true;
                    this.previewMode = false;
                    
                    await new Promise(resolve => {
                        if (videoEl.readyState >= 2) { resolve(); return; }
                        videoEl.addEventListener('canplay', resolve, { once: true });
                        setTimeout(resolve, 3000);
                    });
                    
                    const activeFilter = this.currentVideoFilter || 'none';
                    
                    if (activeFilter === 'none') {
                        await this.addVideoTrackToPeers(this.karaokeVideoStream);
                    }
                    
                    this.setVideoFilter(activeFilter);
                    
                    if (!this.karaokeStartNotified) {
                        this.karaokeStartNotified = true;
                        this.notifyParticipants('karaoke-start', {});
                    }
                    
                    this.addChatMessage('System', 'Camera on — you are LIVE!', true);
                }
            } catch (error) {
                console.error('Camera error:', error);
                this.addChatMessage('System', 'Could not access camera. Please check permissions.', true);
            }
        }
    }
    
    setVideoFilter(filter) {
        const videoEl = document.getElementById('karaoke-video');
        
        const allFilters = ['none', 'grayscale', 'sepia', 'saturate', 'hue-rotate', 'blur', 'beautify', 'bg-blur'];
        allFilters.forEach(f => {
            videoEl?.classList.remove(`filter-${f}`);
        });
        
        if (this.canvasFilterRAF) {
            cancelAnimationFrame(this.canvasFilterRAF);
            this.canvasFilterRAF = null;
        }

        if (this.canvasStream) {
            this.canvasStream.getTracks().forEach(t => t.stop());
            this.canvasStream = null;
        }

        this.currentVideoFilter = filter;

        const isAR = filter && filter.startsWith('ar-');

        if (isAR) {
            this.addChatMessage('System', 'Activating AR filter: ' + filter, true);
            this._activateARFilter(filter).catch(err => {
                console.error('[AR] _activateARFilter error:', err);
                this.addChatMessage('System', 'AR filter error: ' + err.message, true);
            });
            return;
        }

        if (this.arFilterEngine) {
            this.arFilterEngine.setFilter(null);
        }

        this._activeCanvasFilter = null;

        if (filter === 'none') {
            const canvas = document.getElementById('karaoke-canvas');
            if (canvas) canvas.style.display = 'none';
            if (videoEl) {
                videoEl.style.visibility = '';
                videoEl.style.position = '';
                videoEl.style.pointerEvents = '';
            }
            if (this.karaokeVideoActive) {
                this.broadcastVideoTrack();
            }
        } else {
            this.startCanvasFilter(filter);
        }
        
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
        document.querySelectorAll('.ar-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }

    async _activateARFilter(filter) {
        this.addChatMessage('System', '[AR Debug] Camera active: ' + this.karaokeVideoActive, true);
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.classList.toggle('active', false);
        });
        document.querySelectorAll('.ar-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.arFilter === filter);
        });

        if (!this.karaokeVideoActive) {
            this.addChatMessage('System', 'Starting camera for AR filter...', true);
            const videoEl = document.getElementById('karaoke-video');
            const placeholder = document.getElementById('video-placeholder');
            const cameraBtn = document.getElementById('karaoke-camera-toggle');
            try {
                this.karaokeVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });
                if (videoEl && this.karaokeVideoStream) {
                    videoEl.srcObject = this.karaokeVideoStream;
                    placeholder?.classList.add('hidden');
                    cameraBtn?.classList.add('active');
                    this.karaokeVideoActive = true;
                    this.previewMode = false;
                    await new Promise(resolve => {
                        if (videoEl.readyState >= 2) { resolve(); return; }
                        videoEl.addEventListener('canplay', resolve, { once: true });
                        setTimeout(resolve, 3000);
                    });
                }
            } catch (err) {
                console.error('Camera start failed for AR:', err);
                this.addChatMessage('System', 'Could not access camera for AR filter.', true);
                return;
            }
        }

        const arEngineAvailable = typeof ARFilterEngine !== 'undefined';
        this.addChatMessage('System', '[AR Debug] ARFilterEngine class available: ' + arEngineAvailable, true);
        if (!arEngineAvailable) {
            this.addChatMessage('System', 'AR filters not available — script failed to load.', true);
            return;
        }

        if (!this.arFilterEngine) {
            this.arFilterEngine = new ARFilterEngine();
        }

        this.addChatMessage('System', '[AR Debug] Engine ready: ' + this.arFilterEngine.ready + ', loading: ' + this.arFilterEngine.loading, true);

        if (!this.arFilterEngine.ready) {
            if (!this.arFilterEngine.loading) {
                this.addChatMessage('System', 'Loading AR face filter... (first time may take a moment)', true);
            } else {
                this.addChatMessage('System', 'AR filter still loading, please wait...', true);
            }
            const ok = await this.arFilterEngine.init();
            this.addChatMessage('System', '[AR Debug] Init result: ' + ok, true);
            if (!ok) {
                this.addChatMessage('System', 'AR filter failed to load. Try again.', true);
                return;
            }
            if (this.currentVideoFilter !== filter) {
                this.addChatMessage('System', '[AR Debug] Filter changed during load, aborting', true);
                return;
            }
            this.addChatMessage('System', 'AR face filter ready!', true);
        }

        this.arFilterEngine.setFilter(filter);

        if (this.canvasFilterRAF && this._activeCanvasFilter) {
            this._activeCanvasFilter = filter;
            if (this.karaokeVideoActive) {
                this.broadcastCanvasStream(document.getElementById('karaoke-canvas'));
            }
        } else {
            this.startCanvasFilter(filter);
        }
    }

    getCanvasFilterString(filter) {
        switch (filter) {
            case 'grayscale': return 'grayscale(100%)';
            case 'sepia': return 'sepia(100%)';
            case 'saturate': return 'saturate(2.5)';
            case 'hue-rotate': return 'hue-rotate(90deg)';
            case 'blur': return 'blur(2px)';
            default: return 'none';
        }
    }

    startCanvasFilter(filter) {
        const videoEl = document.getElementById('karaoke-video');
        let canvas = document.getElementById('karaoke-canvas');
        const container = document.getElementById('karaoke-video-container');

        const vw = videoEl?.videoWidth || 320;
        const vh = videoEl?.videoHeight || 240;

        if (!canvas && container) {
            canvas = document.createElement('canvas');
            canvas.id = 'karaoke-canvas';
            canvas.width = vw;
            canvas.height = vh;
            canvas.className = 'karaoke-canvas-overlay';
            container.appendChild(canvas);
        } else if (canvas) {
            canvas.width = vw;
            canvas.height = vh;
        }

        if (!canvas || !videoEl) return;

        canvas.style.display = 'block';
        videoEl.style.visibility = 'hidden';
        videoEl.style.position = 'absolute';
        videoEl.style.pointerEvents = 'none';

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.karaokeCanvas = canvas;
        this.karaokeCanvasCtx = ctx;

        this._activeCanvasFilter = filter;

        const renderFrame = () => {
            if (!this.karaokeVideoActive) return;
            const currentFilter = this._activeCanvasFilter;

            if (currentFilter && currentFilter.startsWith('ar-')) {
                ctx.filter = 'none';
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                if (this.arFilterEngine && this.arFilterEngine.isActive()) {
                    this.arFilterEngine.drawFilter(ctx, canvas, videoEl, performance.now());
                }
            } else if (currentFilter === 'beautify') {
                ctx.filter = 'blur(1px) brightness(1.08) contrast(0.95) saturate(1.1)';
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.filter = 'none';
                ctx.globalAlpha = 0.5;
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1.0;
            } else if (currentFilter === 'bg-blur') {
                const cx = canvas.width / 2;
                const cy = canvas.height * 0.4;
                const rx = canvas.width * 0.3;
                const ry = canvas.height * 0.45;

                ctx.save();
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.clip();
                ctx.filter = 'none';
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                ctx.rect(canvas.width, 0, -canvas.width, canvas.height);
                ctx.clip('evenodd');
                ctx.filter = 'blur(8px)';
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.restore();
                ctx.filter = 'none';
            } else {
                ctx.filter = this.getCanvasFilterString(currentFilter);
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.filter = 'none';
            }

            this.canvasFilterRAF = requestAnimationFrame(renderFrame);
        };

        this.canvasFilterRAF = requestAnimationFrame(renderFrame);

        if (this.karaokeVideoActive) {
            this.broadcastCanvasStream(canvas);
        }
    }

    async broadcastCanvasStream(canvas) {
        if (!canvas || !this.karaokeVideoActive) return;

        try {
            if (!this.canvasStream) {
                this.canvasStream = canvas.captureStream(15);
            }
            const canvasTrack = this.canvasStream.getVideoTracks()[0];
            if (!canvasTrack) {
                console.warn('broadcastCanvasStream: no video track from canvas');
                return;
            }

            console.log('Broadcasting canvas stream, track state:', canvasTrack.readyState);
            if (this.agoraClient) {
                try {
                    if (this.agoraLocalVideoTrack) {
                        await this.agoraClient.unpublish([this.agoraLocalVideoTrack]);
                        this.agoraLocalVideoTrack.close();
                    }
                    this.agoraLocalVideoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: canvasTrack });
                    await this.agoraClient.publish([this.agoraLocalVideoTrack]);
                    console.log('Agora: published canvas video track');
                } catch (e) {
                    console.error('Error publishing canvas to Agora:', e);
                }
            }
        } catch (e) {
            console.error('Error broadcasting canvas stream:', e);
        }
    }

    async broadcastVideoTrack() {
        if (!this.karaokeVideoStream || !this.karaokeVideoActive) return;
        const videoTrack = this.karaokeVideoStream.getVideoTracks()[0];
        if (!videoTrack) return;

        if (this.agoraClient) {
            try {
                if (this.agoraLocalVideoTrack) {
                    await this.agoraClient.unpublish([this.agoraLocalVideoTrack]);
                    this.agoraLocalVideoTrack.close();
                }
                this.agoraLocalVideoTrack = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: videoTrack });
                await this.agoraClient.publish([this.agoraLocalVideoTrack]);
                console.log('Agora: published karaoke video track');
            } catch (e) {
                console.error('Error publishing karaoke video to Agora:', e);
            }
        }
    }



    
    
    async searchKaraokeSongs() {
        const searchInput = document.getElementById('karaoke-search-input');
        const query = searchInput?.value?.trim();
        
        if (!query) return;
        
        const resultsContainer = document.getElementById('karaoke-results');
        if (resultsContainer) {
            resultsContainer.replaceChildren(this._el('p', {className: 'karaoke-hint', textContent: 'Searching...'}));
        }
        
        try {
            const response = await fetch(apiUrl(`/api/lyrics/search?q=${encodeURIComponent(query)}`));
            const data = await response.json();
            
            if (data.hits && data.hits.length > 0) {
                this.renderKaraokeResults(data.hits.slice(0, 5));
            } else {
                resultsContainer.replaceChildren(this._el('p', {className: 'karaoke-hint', textContent: 'No songs found. Try another search.'}));
            }
        } catch (error) {
            console.error('Error searching songs:', error);
            resultsContainer.replaceChildren(this._el('p', {className: 'karaoke-hint', textContent: 'Error searching. Please try again.'}));
        }
    }
    
    renderKaraokeResults(songs) {
        const resultsContainer = document.getElementById('karaoke-results');
        if (!resultsContainer) return;
        
        resultsContainer.replaceChildren();
        
        songs.forEach(song => {
            const item = document.createElement('div');
            item.className = 'karaoke-result-item';
            item.dataset.songId = song.id;
            
            const img = document.createElement('img');
            img.src = song.image || 'https://via.placeholder.com/50?text=Song';
            img.alt = this.sanitizeText(song.title);
            img.onerror = () => { img.src = 'https://via.placeholder.com/50?text=Song'; };
            
            const info = document.createElement('div');
            info.className = 'karaoke-result-info';
            
            const title = document.createElement('h5');
            title.textContent = this.sanitizeText(song.title);
            
            const artist = document.createElement('p');
            artist.textContent = this.sanitizeText(song.artist);
            
            info.appendChild(title);
            info.appendChild(artist);
            
            const btn = document.createElement('button');
            btn.className = 'karaoke-start-btn';
            this._setBtn(btn, 'fas fa-microphone', 'Sing');
            btn.addEventListener('click', () => {
                this.startKaraoke(
                    song.id,
                    this.sanitizeText(song.title),
                    this.sanitizeText(song.artist),
                    song.image || ''
                );
            });
            
            item.appendChild(img);
            item.appendChild(info);
            item.appendChild(btn);
            resultsContainer.appendChild(item);
        });
    }
    
    sanitizeText(text) {
        return escapeHtml(text);
    }
    
    escapeQuotes(str) {
        return str ? str.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
    }
    
    async startKaraoke(songId, title, artist, image) {
        // Show the player
        document.getElementById('karaoke-results')?.classList.add('hidden');
        const player = document.getElementById('karaoke-player');
        player?.classList.remove('hidden');
        
        // Update song info
        document.getElementById('karaoke-song-title').textContent = title;
        document.getElementById('karaoke-song-artist').textContent = artist;
        const albumArt = document.getElementById('karaoke-album-art');
        if (albumArt) {
            albumArt.src = image || '/images/logo.png';
            albumArt.onerror = () => { albumArt.src = '/images/logo.png'; };
        }
        
        // Load YouTube audio in parallel with lyrics
        this.loadYouTubeAudio(artist, title);
        
        // Show loading state for lyrics
        const lyricsContainer = document.getElementById('lyrics-scroll');
        if (lyricsContainer) {
            lyricsContainer.replaceChildren(this._el('div', {className: 'lyrics-line active', textContent: 'Loading lyrics...'}));
        }
        
        // Load lyrics - try API first, then LRCLIB fallback
        try {
            const response = await fetch(apiUrl(`/api/lyrics/lyrics/${songId}`));
            const data = await response.json();
            
            if (data.lyrics && data.lyrics.length > 50) {
                this.parseLyricsForKaraoke(data.lyrics);
                this.addChatMessage('System', `Starting karaoke: "${title}" by ${artist}`, true);
            } else {
                // Try LRCLIB as direct fallback
                await this.tryLrclibLyrics(title, artist);
            }
        } catch (error) {
            console.error('Error loading lyrics:', error);
            await this.tryLrclibLyrics(title, artist);
        }
    }
    
    async tryLrclibLyrics(title, artist) {
        try {
            const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').trim();
            const cleanArtist = artist.replace(/\s*feat\..*$/i, '').replace(/\s*ft\..*$/i, '').trim();
            const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                if (data.plainLyrics && data.plainLyrics.length > 50) {
                    this.parseLyricsForKaraoke(data.plainLyrics);
                    this.addChatMessage('System', `Starting karaoke: "${title}" by ${artist}`, true);
                    return;
                }
            }
        } catch (error) {
            console.log('LRCLIB fallback failed:', error);
        }
        
        // Final fallback to demo lyrics
        this.useDemoLyrics(title, artist);
    }
    
    useDemoLyrics(title, artist) {
        // Generate demo placeholder lyrics for karaoke practice
        const demoLines = [
            `[Intro]`,
            ``,
            `[Verse 1]`,
            `This is a demo karaoke session`,
            `For "${title}" by ${artist}`,
            `The actual lyrics couldn't be loaded`,
            `But you can still practice your performance!`,
            ``,
            `[Chorus]`,
            `Sing along to your favorite song`,
            `Let your voice be heard tonight`,
            `Music brings us all together`,
            `Everything will be alright`,
            ``,
            `[Verse 2]`,
            `Keep on singing, don't stop now`,
            `The rhythm flows through your veins`,
            `Every note tells a story`,
            `Every melody remains`,
            ``,
            `[Bridge]`,
            `Take a breath and feel the beat`,
            `Let the music set you free`,
            ``,
            `[Outro]`,
            `Thank you for singing with us!`,
            `Great performance!`
        ];
        
        this.parseLyricsForKaraoke(demoLines.join('\n'));
        this.addChatMessage('System', `Starting demo karaoke mode for "${title}"`, true);
    }
    
    parseLyricsForKaraoke(lyricsText) {
        // Split lyrics into lines and filter out empty lines
        const lines = lyricsText.split('\n').filter(line => line.trim());
        this.karaokeLyrics = lines;
        this.currentLyricIndex = 0;
        
        const lyricsContainer = document.getElementById('lyrics-scroll');
        if (lyricsContainer) {
            lyricsContainer.replaceChildren(...lines.map((line, index) => {
                const lineEl = this._el('div', {className: 'lyrics-line' + (index === 0 ? ' active' : ''), textContent: line});
                lineEl.dataset.index = index;
                return lineEl;
            }));

            lyricsContainer.addEventListener('dblclick', (e) => {
                const lineEl = e.target.closest('.lyrics-line');
                if (!lineEl) return;
                const idx = parseInt(lineEl.dataset.index, 10);
                if (!isNaN(idx)) this.skipToLyricLine(idx);
            });
        }
    }

    skipToLyricLine(index) {
        if (index < 0 || index >= this.karaokeLyrics.length) return;
        this.currentLyricIndex = index;
        this.updateLyricHighlight();
        this.updateProgress();
    }
    
    toggleKaraokePlayback() {
        const playPauseBtn = document.getElementById('karaoke-play-pause');
        const icon = playPauseBtn?.querySelector('i');
        
        if (this.karaokeActive) {
            this.karaokeActive = false;
            clearInterval(this.karaokeInterval);
            if (icon) icon.className = 'fas fa-play';
            this.stopMicTempo();
        } else {
            this.karaokeActive = true;
            if (icon) icon.className = 'fas fa-pause';
            this.startLyricScrolling();
            this.startMicTempo();
        }
    }
    
    adjustScrollSpeed(delta) {
        this.scrollSpeed = Math.max(0.25, Math.min(3.0, this.scrollSpeed + delta));
        const speedEl = document.getElementById('speed-value');
        if (speedEl) speedEl.textContent = `${this.scrollSpeed.toFixed(2)}x`;

        if (this.micTempoEnabled) {
            this.manualSpeedOverride = true;
            clearTimeout(this.manualOverrideTimeout);
            this.manualOverrideTimeout = setTimeout(() => {
                this.manualSpeedOverride = false;
            }, 5000);
        }

        if (this.karaokeActive) {
            clearInterval(this.karaokeInterval);
            this.startLyricScrolling();
        }
    }

    startLyricScrolling() {
        const interval = Math.round(this.baseScrollInterval / this.scrollSpeed);
        this.karaokeInterval = setInterval(() => {
            if (this.currentLyricIndex < this.karaokeLyrics.length - 1) {
                this.currentLyricIndex++;
                this.updateLyricHighlight();
                this.updateProgress();
            } else {
                this.stopKaraoke();
            }
        }, interval);
    }
    
    updateLyricHighlight() {
        const lyricsScroll = document.getElementById('lyrics-scroll');
        const container = document.getElementById('karaoke-lyrics-container');
        const lines = lyricsScroll?.querySelectorAll('.lyrics-line');
        
        lines?.forEach((line, index) => {
            line.classList.remove('active', 'past');
            if (index === this.currentLyricIndex) {
                line.classList.add('active');
            } else if (index < this.currentLyricIndex) {
                line.classList.add('past');
            }
        });
        
        // Scroll the active line into view
        const activeLine = lyricsScroll?.querySelector('.lyrics-line.active');
        if (activeLine && container) {
            activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    updateProgress() {
        const progressFill = document.getElementById('karaoke-progress-fill');
        if (progressFill && this.karaokeLyrics.length > 0) {
            const progress = ((this.currentLyricIndex + 1) / this.karaokeLyrics.length) * 100;
            progressFill.style.width = `${progress}%`;
        }
    }
    
    restartKaraoke() {
        this.currentLyricIndex = 0;
        this.updateLyricHighlight();
        this.updateProgress();
        
        const container = document.getElementById('karaoke-lyrics-container');
        if (container) {
            container.scrollTop = 0;
        }
        
        if (!this.karaokeActive) {
            this.toggleKaraokePlayback();
        }
    }

    newKaraokeSong() {
        this.stopKaraoke();
        const player = document.getElementById('karaoke-player');
        const results = document.getElementById('karaoke-results');
        player?.classList.add('hidden');
        results?.classList.remove('hidden');
        if (results) results.replaceChildren(this._el('p', {className: 'karaoke-hint', textContent: 'Search for a different song!'}));
        const searchInput = document.getElementById('karaoke-search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
    }
    
    stopKaraoke() {
        if (this.isRecording) this.stopRecording();
        this.stopMicTempo();

        this.karaokeActive = false;
        this.karaokeStartNotified = false;
        clearInterval(this.karaokeInterval);
        
        const playPauseBtn = document.getElementById('karaoke-play-pause');
        const icon = playPauseBtn?.querySelector('i');
        if (icon) icon.className = 'fas fa-play';

        // Reset scroll speed
        this.scrollSpeed = 1.0;
        const speedEl = document.getElementById('speed-value');
        if (speedEl) speedEl.textContent = '1.0x';

        // Stop canvas filter
        if (this.canvasFilterRAF) {
            cancelAnimationFrame(this.canvasFilterRAF);
            this.canvasFilterRAF = null;
        }
        
        this.closeYouTubeEmbed();

        
        // Reset to beginning
        this.currentLyricIndex = 0;
        this.updateLyricHighlight();
        this.updateProgress();
        
        const container = document.getElementById('karaoke-lyrics-container');
        if (container) {
            container.scrollTop = 0;
        }
    }
    
    // ─── Mic Tempo Sync ───
    startMicTempo() {
        if (!this.localStream) {
            this.addChatMessage('System', 'Microphone not available. Join a room first.', true);
            return;
        }

        this.micTempoEnabled = true;
        this.micEnergySmoothed = 0;
        this.silenceStartTime = 0;

        try {
            const ctx = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
            if (!this.audioContext) this.audioContext = ctx;

            this.micAnalyser = ctx.createAnalyser();
            this.micAnalyser.fftSize = 2048;
            this.micAnalyser.smoothingTimeConstant = 0.8;

            const source = ctx.createMediaStreamSource(this.localStream);
            source.connect(this.micAnalyser);
            this.micTempoSource = source;

            const dataArray = new Float32Array(this.micAnalyser.fftSize);

            const detectEnergy = () => {
                if (!this.micTempoEnabled) return;

                this.micAnalyser.getFloatTimeDomainData(dataArray);

                let sumSq = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sumSq += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sumSq / dataArray.length);

                const alpha = 0.15;
                this.micEnergySmoothed = alpha * rms + (1 - alpha) * this.micEnergySmoothed;

                if (!this.manualSpeedOverride && this.karaokeActive) {
                    const silenceThreshold = 0.01;
                    const now = Date.now();

                    if (this.micEnergySmoothed < silenceThreshold) {
                        if (this.silenceStartTime === 0) this.silenceStartTime = now;
                        const silenceDuration = now - this.silenceStartTime;

                        if (silenceDuration > 1500) {
                            this.setMicScrollSpeed(0.3);
                        } else if (silenceDuration > 800) {
                            this.setMicScrollSpeed(0.5);
                        }
                    } else {
                        this.silenceStartTime = 0;
                        const energy = Math.min(this.micEnergySmoothed, 0.15);
                        const normalizedEnergy = energy / 0.15;
                        const targetSpeed = 0.6 + normalizedEnergy * 1.4;
                        this.setMicScrollSpeed(targetSpeed);
                    }
                }

                const indicator = document.getElementById('mic-energy-indicator');
                if (indicator) {
                    const level = Math.min(this.micEnergySmoothed * 500, 100);
                    indicator.style.width = `${level}%`;
                }

                this.micTempoRAF = requestAnimationFrame(detectEnergy);
            };

            detectEnergy();
        } catch (e) {
            console.error('Mic tempo sync error:', e);
            this.micTempoEnabled = false;
        }
    }

    setMicScrollSpeed(targetSpeed) {
        const clamped = Math.max(0.25, Math.min(3.0, targetSpeed));
        const blendAlpha = 0.08;
        this.scrollSpeed = this.scrollSpeed + blendAlpha * (clamped - this.scrollSpeed);

        const speedEl = document.getElementById('speed-value');
        if (speedEl) speedEl.textContent = `${this.scrollSpeed.toFixed(2)}x`;

        if (this.karaokeActive) {
            clearInterval(this.karaokeInterval);
            this.startLyricScrolling();
        }
    }

    stopMicTempo() {
        this.micTempoEnabled = false;
        if (this.micTempoRAF) {
            cancelAnimationFrame(this.micTempoRAF);
            this.micTempoRAF = null;
        }
        if (this.micTempoSource) {
            try { this.micTempoSource.disconnect(); } catch (e) {}
            this.micTempoSource = null;
        }
        this.micAnalyser = null;
        this.manualSpeedOverride = false;
        clearTimeout(this.manualOverrideTimeout);
    }

    // ─── Performance Recording ───
    async toggleRecording() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        if (!this.karaokeActive && !this.karaokeLyrics.length) {
            this.addChatMessage('System', 'Start a karaoke session first before recording.', true);
            return;
        }

        if (!this.localStream || this.localStream.getAudioTracks().length === 0) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                this.addChatMessage('System', 'Microphone enabled for recording.', true);
            } catch (e) {
                console.warn('Could not get microphone for recording:', e);
                this.addChatMessage('System', 'Recording without microphone — grant mic access for audio.', true);
            }
        }

        try {
            const logoImg = new Image();
            logoImg.crossOrigin = 'anonymous';
            logoImg.src = '/images/logo.png';
            await new Promise((resolve) => {
                logoImg.onload = resolve;
                logoImg.onerror = resolve;
            });
            this.recordingLogo = logoImg.complete && logoImg.naturalWidth > 0 ? logoImg : null;

            const canvas = document.createElement('canvas');
            canvas.width = 720;
            canvas.height = 1280;
            this.recordingCanvas = canvas;
            this.recordingCtx = canvas.getContext('2d');

            const canvasStream = canvas.captureStream(30);

            const recAudioCtx = this.audioContext || new (window.AudioContext || window.webkitAudioContext)();
            if (!this.audioContext) this.audioContext = recAudioCtx;
            const recDest = recAudioCtx.createMediaStreamDestination();

            if (this.localStream) {
                const audioTracks = this.localStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    const micSource = recAudioCtx.createMediaStreamSource(
                        new MediaStream([audioTracks[0]])
                    );
                    const micGain = recAudioCtx.createGain();
                    micGain.gain.value = 1.0;
                    micSource.connect(micGain);
                    micGain.connect(recDest);
                    this.recordingMicSource = micSource;
                    this.recordingMicGain = micGain;
                }
            }

            this.recordingStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...recDest.stream.getAudioTracks()
            ]);

            const mimeTypes = [
                'video/webm;codecs=vp9,opus',
                'video/webm;codecs=vp8,opus',
                'video/webm;codecs=vp8',
                'video/webm'
            ];
            let selectedMime = '';
            for (const mime of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mime)) {
                    selectedMime = mime;
                    break;
                }
            }

            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.recordingStream, {
                mimeType: selectedMime || undefined,
                videoBitsPerSecond: 2500000,
                audioBitsPerSecond: 128000
            });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.onRecordingComplete().catch(e => {
                    console.error('Recording complete error:', e);
                    if (this.recordedChunks.length > 0) {
                        this.showRecordingDownload(new Blob(this.recordedChunks, { type: 'video/webm' }), 'webm');
                        this.recordedChunks = [];
                    }
                });
            };

            this.recordingStartTime = Date.now();
            this.mediaRecorder.start(1000);
            this.isRecording = true;
            this.startRecordingCompositor();
            this.updateRecordingUI(true);
            this.addChatMessage('System', 'Recording started! Your performance is being captured.', true);
        } catch (e) {
            console.error('Recording start error:', e);
            this.addChatMessage('System', 'Could not start recording. Please check permissions.', true);
        }
    }

    startRecordingCompositor() {
        const ctx = this.recordingCtx;
        const canvas = this.recordingCanvas;
        if (!ctx || !canvas) return;

        const renderFrame = () => {
            if (!this.isRecording) return;

            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const videoEl = document.getElementById('karaoke-video');
            const karaokeCanvasEl = document.getElementById('karaoke-canvas');
            const videoSource = (this.karaokeVideoActive && karaokeCanvasEl && karaokeCanvasEl.width > 0)
                ? karaokeCanvasEl
                : (this.karaokeVideoActive && videoEl && videoEl.videoWidth > 0)
                    ? videoEl
                    : null;

            if (videoSource) {
                const vw = canvas.width;
                const vh = canvas.width * 0.75;
                ctx.save();
                ctx.translate(vw, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoSource, 0, 40, vw, vh);
                ctx.restore();
            } else {
                ctx.fillStyle = '#1a1a2e';
                ctx.fillRect(0, 40, canvas.width, canvas.width * 0.75);
                ctx.fillStyle = '#3EB489';
                ctx.font = 'bold 48px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('W', canvas.width / 2, 40 + (canvas.width * 0.75) / 2 + 16);
            }

            const lyricsY = videoSource ? (40 + canvas.width * 0.75 + 30) : 600;
            this.drawLyricsOnCanvas(ctx, canvas.width, lyricsY, canvas.height - lyricsY - 120);

            const songTitle = document.getElementById('karaoke-song-title')?.textContent || '';
            const songArtist = document.getElementById('karaoke-song-artist')?.textContent || '';
            if (songTitle) {
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 28px Poppins, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(songTitle, canvas.width / 2, lyricsY - 50);
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '22px Inter, sans-serif';
                ctx.fillText(songArtist, canvas.width / 2, lyricsY - 20);
            }

            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const bobOffset = Math.sin(elapsed * 0.8) * 4;

            if (this.recordingLogo) {
                const logoSize = 70;
                const logoX = canvas.width - logoSize - 20;
                const logoY = 16 + bobOffset;
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.drawImage(this.recordingLogo, logoX, logoY, logoSize, logoSize);
                ctx.restore();
            }

            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Poppins, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('@wordeth', canvas.width - 20, 110 + bobOffset);
            ctx.restore();

            ctx.fillStyle = 'rgba(10, 10, 15, 0.6)';
            ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
            ctx.save();
            ctx.globalAlpha = 0.8;
            if (this.recordingLogo) {
                ctx.drawImage(this.recordingLogo, 16, canvas.height - 42, 34, 34);
            }
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Poppins, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('Wordeth', 58, canvas.height - 20);
            ctx.fillStyle = '#3EB489';
            ctx.font = '13px Inter, sans-serif';
            ctx.fillText('wordeth.com', 58, canvas.height - 6);
            ctx.restore();

            if (songTitle) {
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = '#ffffff';
                ctx.font = '14px Inter, sans-serif';
                ctx.textAlign = 'right';
                const displayTitle = songTitle.length > 30 ? songTitle.substring(0, 30) + '...' : songTitle;
                ctx.fillText(`♫ ${displayTitle}`, canvas.width - 16, canvas.height - 18);
                ctx.restore();
            }

            this.recordingRAF = requestAnimationFrame(renderFrame);
        };

        renderFrame();
    }

    drawLyricsOnCanvas(ctx, width, startY, maxHeight) {
        if (!this.karaokeLyrics.length) return;

        const lineHeight = 44;
        const visibleLines = Math.floor(maxHeight / lineHeight);
        const halfVisible = Math.floor(visibleLines / 2);

        let startIdx = Math.max(0, this.currentLyricIndex - halfVisible);
        let endIdx = Math.min(this.karaokeLyrics.length, startIdx + visibleLines);

        ctx.textAlign = 'center';

        for (let i = startIdx; i < endIdx; i++) {
            const relIdx = i - startIdx;
            const y = startY + relIdx * lineHeight + lineHeight / 2;

            if (i === this.currentLyricIndex) {
                ctx.fillStyle = '#3EB489';
                ctx.font = 'bold 26px Inter, sans-serif';
                ctx.shadowColor = 'rgba(62, 180, 137, 0.5)';
                ctx.shadowBlur = 12;
            } else if (i < this.currentLyricIndex) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.font = '22px Inter, sans-serif';
                ctx.shadowBlur = 0;
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                ctx.font = '22px Inter, sans-serif';
                ctx.shadowBlur = 0;
            }

            const line = this.karaokeLyrics[i];
            const maxChars = Math.floor(width / 14);
            if (line.length > maxChars) {
                ctx.fillText(line.substring(0, maxChars) + '...', width / 2, y);
            } else {
                ctx.fillText(line, width / 2, y);
            }
            ctx.shadowBlur = 0;
        }
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;
        if (this.recordingRAF) {
            cancelAnimationFrame(this.recordingRAF);
            this.recordingRAF = null;
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.recordingMicSource) {
            this.recordingMicSource.disconnect();
            this.recordingMicSource = null;
        }
        if (this.recordingMicGain) {
            this.recordingMicGain.disconnect();
            this.recordingMicGain = null;
        }
        if (this.recordingStream) {
            this.recordingStream.getTracks().forEach(t => t.stop());
            this.recordingStream = null;
        }
        this.recordingCanvas = null;
        this.recordingCtx = null;
        this.updateRecordingUI(false);
    }

    async onRecordingComplete() {
        if (this.recordedChunks.length === 0) return;

        const webmBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
        this.recordedChunks = [];

        let convertOverlay = null;
        let finalBlob = webmBlob;
        let fileExt = 'webm';

        try {
            if (typeof FFmpeg !== 'undefined' && FFmpeg.FFmpeg) {
                convertOverlay = this.showConvertingOverlay();
                finalBlob = await this.convertToMp4(webmBlob, convertOverlay.progressFill, convertOverlay.statusText);
                fileExt = 'mp4';
            }
        } catch (e) {
            console.warn('MP4 conversion failed, using webm:', e);
            finalBlob = webmBlob;
            fileExt = 'webm';
        }

        if (convertOverlay?.overlay) {
            convertOverlay.overlay.remove();
        }

        this.showRecordingDownload(finalBlob, fileExt);
    }

    showConvertingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'recording-download-overlay';
        const card = document.createElement('div');
        card.className = 'recording-download-card';

        const logoDiv = document.createElement('div');
        logoDiv.className = 'recording-download-logo';
        const logoImg = document.createElement('img');
        logoImg.src = '/images/logo.png';
        logoImg.alt = 'Wordeth';
        logoDiv.appendChild(logoImg);
        card.appendChild(logoDiv);

        const statusH3 = document.createElement('h3');
        statusH3.textContent = 'Converting to MP4...';
        card.appendChild(statusH3);

        const statusText = document.createElement('p');
        statusText.textContent = 'Preparing your video for sharing. This may take a moment.';
        card.appendChild(statusText);

        const progressBar = document.createElement('div');
        progressBar.style.cssText = 'width:100%; height:6px; background:rgba(255,255,255,0.1); border-radius:3px; margin:1rem 0; overflow:hidden;';
        const progressFill = document.createElement('div');
        progressFill.style.cssText = 'height:100%; width:5%; background:linear-gradient(90deg,#3EB489,#7c6aef); border-radius:3px; transition:width 0.3s;';
        progressBar.appendChild(progressFill);
        card.appendChild(progressBar);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        return { overlay, progressFill, statusText };
    }

    async convertToMp4(webmBlob, progressFill, statusText) {
        const ffmpeg = new FFmpeg.FFmpeg();
        const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-st@0.12.6/dist/umd';

        try {
            ffmpeg.on('progress', ({ progress }) => {
                const pct = Math.max(5, Math.min(95, Math.round(progress * 100)));
                if (progressFill) progressFill.style.width = pct + '%';
            });

            if (statusText) statusText.textContent = 'Loading converter...';
            await ffmpeg.load({
                coreURL: `${baseURL}/ffmpeg-core.js`,
                wasmURL: `${baseURL}/ffmpeg-core.wasm`,
            });

            if (statusText) statusText.textContent = 'Converting video...';
            if (progressFill) progressFill.style.width = '10%';

            const webmData = new Uint8Array(await webmBlob.arrayBuffer());
            await ffmpeg.writeFile('input.webm', webmData);
            await ffmpeg.exec([
                '-i', 'input.webm',
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', 'faststart',
                '-pix_fmt', 'yuv420p',
                'output.mp4'
            ]);

            const mp4Data = await ffmpeg.readFile('output.mp4');
            const mp4Blob = new Blob([mp4Data.buffer], { type: 'video/mp4' });

            try {
                await ffmpeg.deleteFile('input.webm');
                await ffmpeg.deleteFile('output.mp4');
            } catch (_) {}

            ffmpeg.terminate();
            return mp4Blob;
        } catch (e) {
            try { ffmpeg.terminate(); } catch (_) {}
            throw e;
        }
    }

    showRecordingDownload(blob, fileExt) {
        const songTitle = document.getElementById('karaoke-song-title')?.textContent || 'karaoke';
        const artist = document.getElementById('karaoke-song-artist')?.textContent || '';
        const safeName = `wordeth-${songTitle}-${artist}`.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 60);

        const url = URL.createObjectURL(blob);

        const overlay = document.createElement('div');
        overlay.className = 'recording-download-overlay';

        const card = document.createElement('div');
        card.className = 'recording-download-card';

        const logoDiv = document.createElement('div');
        logoDiv.className = 'recording-download-logo';
        const logoImg = document.createElement('img');
        logoImg.src = '/images/logo.png';
        logoImg.alt = 'Wordeth';
        logoDiv.appendChild(logoImg);
        card.appendChild(logoDiv);

        const h3 = document.createElement('h3');
        h3.textContent = 'Performance Recorded!';
        card.appendChild(h3);

        const desc = document.createElement('p');
        desc.textContent = 'Your karaoke performance is ready. Download it and share it on your social platforms!';
        card.appendChild(desc);

        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'auto';
        video.playsInline = true;
        video.style.cssText = 'width:100%; max-height:300px; border-radius:12px; margin:1rem 0; background:#000;';
        card.appendChild(video);

        const actions = document.createElement('div');
        actions.className = 'recording-download-actions';

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `${safeName}.${fileExt}`;
        downloadLink.className = 'btn-primary';
        downloadLink.style.cssText = 'text-decoration:none; display:inline-flex; align-items:center; gap:8px;';
        this._setBtn(downloadLink, 'fas fa-download', 'Download Video');
        actions.appendChild(downloadLink);

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-secondary';
        closeBtn.textContent = 'Close';
        closeBtn.addEventListener('click', () => {
            URL.revokeObjectURL(url);
            overlay.remove();
        });
        actions.appendChild(closeBtn);
        card.appendChild(actions);

        const formatBadge = document.createElement('p');
        formatBadge.style.cssText = 'color:#3EB489; font-size:0.8rem; margin-top:0.5rem;';
        formatBadge.textContent = fileExt === 'mp4' ? 'MP4 format — ready for all platforms' : 'WebM format — compatible with most platforms';
        card.appendChild(formatBadge);

        const tip = document.createElement('p');
        tip.style.cssText = 'color:#888; font-size:0.75rem; margin-top:0.25rem;';
        tip.textContent = 'Tip: Upload to TikTok, Instagram Reels, or YouTube Shorts to share your talent!';
        card.appendChild(tip);

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        this.addChatMessage('System', 'Recording saved! Download your performance to share it.', true);
    }

    updateRecordingUI(recording) {
        const btn = document.getElementById('karaoke-record-btn');
        const timerEl = document.getElementById('recording-timer');
        if (btn) {
            if (recording) {
                btn.classList.add('recording');
                btn.title = 'Stop Recording';
                btn.querySelector('i').className = 'fas fa-stop';
            } else {
                btn.classList.remove('recording');
                btn.title = 'Record Performance';
                btn.querySelector('i').className = 'fas fa-circle';
            }
        }
        if (timerEl) {
            timerEl.style.display = recording ? 'inline' : 'none';
            if (recording) this.startRecordingTimer();
            else timerEl.textContent = '';
        }
    }

    startRecordingTimer() {
        const timerEl = document.getElementById('recording-timer');
        if (!timerEl) return;

        const tick = () => {
            if (!this.isRecording) return;
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const secs = String(elapsed % 60).padStart(2, '0');
            timerEl.textContent = `${mins}:${secs}`;
            requestAnimationFrame(tick);
        };
        tick();
    }

    initYouTubePlayer() {
        if (window.YT && window.YT.Player) {
            this.youtubeReady = true;
            console.log('YouTube IFrame API ready');
        } else {
            window.onYouTubeIframeAPIReady = () => {
                this.youtubeReady = true;
                console.log('YouTube IFrame API loaded');
            };
        }
    }
    
    updateAudioStatus(state, message) {
        const statusEl = document.getElementById('audio-status');
        if (statusEl) {
            statusEl.className = `audio-status ${state}`;
            statusEl.querySelector('span').textContent = message;
            let retryBtn = statusEl.querySelector('.yt-retry-btn');
            if (state === 'error') {
                if (!retryBtn) {
                    retryBtn = document.createElement('button');
                    retryBtn.className = 'yt-retry-btn';
                    this._setBtn(retryBtn, 'fas fa-redo', 'Try Another');
                    retryBtn.addEventListener('click', () => this.resetYouTubePlayer());
                    statusEl.appendChild(retryBtn);
                }
                retryBtn.style.display = '';
            } else if (retryBtn) {
                retryBtn.style.display = 'none';
            }
        }
    }

    resetYouTubePlayer() {
        if (this.ytPlayer) {
            try { this.ytPlayer.destroy(); } catch(e) {}
            this.ytPlayer = null;
        }
        const wrapper = document.getElementById('yt-embed-wrapper');
        const container = document.getElementById('yt-player-container');
        this._clearEl(container);
        if (wrapper) wrapper.style.display = 'none';
        this.currentVideoId = null;
        const urlInput = document.getElementById('yt-url-input');
        if (urlInput) {
            urlInput.value = '';
            urlInput.focus();
        }
        const inputRow = document.getElementById('yt-embed-input-row');
        if (inputRow) inputRow.style.display = '';
        this.updateAudioStatus('ready', 'Paste a new YouTube link or search another song');
    }
    
    async searchYouTubeAudio(artist, title) {
        try {
            const query = `${artist} ${title}`;
            const response = await fetch(apiUrl(`/api/lyrics/youtube-search?q=${encodeURIComponent(query)}`));
            const data = await response.json();
            
            if (data.videoIds && data.videoIds.length > 0) {
                return { videoId: data.videoIds[0], title: data.titles ? data.titles[0] : '' };
            }
            if (data.videoId) {
                return { videoId: data.videoId, title: '' };
            }
            return null;
        } catch (error) {
            console.error('YouTube search error:', error);
            return null;
        }
    }
    
    extractYouTubeVideoId(url) {
        if (!url) return null;
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/
        ];
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
    }
    
    embedYouTubeVideo(videoId) {
        const wrapper = document.getElementById('yt-embed-wrapper');
        const container = document.getElementById('yt-player-container');
        if (!wrapper || !container) return;

        if (this.ytPlayer) {
            try { this.ytPlayer.destroy(); } catch(e) {}
            this.ytPlayer = null;
        }
        container.replaceChildren();

        const playerDiv = document.createElement('div');
        playerDiv.id = 'yt-api-player';
        container.appendChild(playerDiv);

        wrapper.style.display = '';
        this.currentVideoId = videoId;
        this.updateAudioStatus('loading', 'Loading video...');

        const createPlayer = () => {
            this.ytPlayer = new YT.Player('yt-api-player', {
                videoId: videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    playsinline: 1,
                    rel: 0,
                    modestbranding: 1,
                    origin: window.location.origin,
                    enablejsapi: 1,
                    fs: 0
                },
                events: {
                    onReady: () => {
                        this.updateAudioStatus('playing', 'Playing');
                        this.showShareAudioButton();
                    },
                    onError: (event) => {
                        const errorMessages = {
                            2: 'Invalid video ID',
                            5: 'Video cannot be played in HTML5',
                            100: 'Video not found or removed',
                            101: 'Video owner does not allow embedded playback',
                            150: 'Video owner does not allow embedded playback',
                            153: 'Playback blocked — try disabling ad blockers or try a different video'
                        };
                        const msg = errorMessages[event.data] || `Playback error (code ${event.data})`;
                        console.error('YouTube player error:', event.data, msg);
                        this.updateAudioStatus('error', msg);
                        this.addChatMessage('System', `YouTube error: ${msg}. Try a different video.`, true);
                    },
                    onStateChange: (event) => {
                        if (event.data === YT.PlayerState.PLAYING) {
                            this.updateAudioStatus('playing', 'Playing');
                        } else if (event.data === YT.PlayerState.PAUSED) {
                            this.updateAudioStatus('ready', 'Paused');
                        } else if (event.data === YT.PlayerState.ENDED) {
                            this.updateAudioStatus('ready', 'Video ended');
                        }
                    }
                }
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            window.onYouTubeIframeAPIReady = () => {
                this.youtubeReady = true;
                createPlayer();
            };
        }

        if (this.socket && this.currentRoom) {
            this.notifyParticipants('youtube-embed', { videoId });
        }
    }
    
    showShareAudioButton() {
        let shareBtn = document.getElementById('yt-share-audio-btn');
        if (!shareBtn) {
            const wrapper = document.getElementById('yt-embed-wrapper');
            if (!wrapper) return;
            
            shareBtn = document.createElement('button');
            shareBtn.id = 'yt-share-audio-btn';
            shareBtn.className = 'yt-share-audio-btn';
            this._setBtn(shareBtn, 'fas fa-broadcast-tower', 'Share Audio with Room');
            shareBtn.addEventListener('click', () => this.captureYouTubeAudio());
            wrapper.appendChild(shareBtn);
        }
        shareBtn.style.display = '';
    }
    
    embedYouTubeFromInput() {
        const input = document.getElementById('yt-url-input');
        const url = input?.value?.trim();
        if (!url) {
            this.updateAudioStatus('error', 'Please paste a YouTube link');
            return;
        }
        
        const videoId = this.extractYouTubeVideoId(url);
        if (!videoId) {
            this.updateAudioStatus('error', 'Invalid YouTube link. Try again.');
            return;
        }
        
        this.embedYouTubeVideo(videoId);
    }
    
    closeYouTubeEmbed() {
        if (this.ytPlayer) {
            try { this.ytPlayer.destroy(); } catch(e) {}
            this.ytPlayer = null;
        }
        const wrapper = document.getElementById('yt-embed-wrapper');
        const container = document.getElementById('yt-player-container');
        this._clearEl(container);
        if (wrapper) wrapper.style.display = 'none';
        const shareBtn = document.getElementById('yt-share-audio-btn');
        if (shareBtn) shareBtn.style.display = 'none';
        this.currentVideoId = null;
        this.stopAudioMix();
        this.updateAudioStatus('ready', 'Video closed');
    }
    
    async startAudioMix() {
        if (this.audioMixEnabled) return;
        
        try {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.mixDestination = this.audioContext.createMediaStreamDestination();
            this.mixedStream = this.mixDestination.stream;
            this.audioMixEnabled = true;
            
            console.log('Audio mix initialized (music-only track, mic stays independent), audioContext state:', this.audioContext.state);
            
        } catch (error) {
            console.error('Error starting audio mix:', error);
            this.addChatMessage('System', 'Could not start audio mixing.', true);
        }
    }
    
    captureYouTubeAudio() {
        if (!this.audioMixEnabled || !this.audioContext || !this.mixDestination) {
            this.startAudioMix().then(() => this.captureYouTubeAudio());
            return;
        }
        
        try {
            if (this.youtubeAudioSource) {
                try { this.youtubeAudioSource.disconnect(); } catch(e) {}
                this.youtubeAudioSource = null;
            }
            
            if (!this.ytPlayer) {
                console.warn('No YouTube player instance for audio capture');
                return;
            }
            
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                this.captureTabAudio();
            } else {
                this.addChatMessage('System', 'YouTube audio sharing requires tab audio capture. Other participants will hear the music through your microphone.', true);
            }
        } catch (error) {
            console.error('Error capturing YouTube audio:', error);
        }
    }
    
    async captureTabAudio() {
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: { width: 1, height: 1 },
                audio: true,
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                systemAudio: 'include'
            });
            
            const audioTracks = displayStream.getAudioTracks();
            if (audioTracks.length === 0) {
                this.addChatMessage('System', 'No audio was shared. Please select "Share tab audio" when prompted.', true);
                displayStream.getTracks().forEach(t => t.stop());
                return;
            }
            
            displayStream.getVideoTracks().forEach(t => t.stop());
            
            this.youtubeAudioSource = this.audioContext.createMediaStreamSource(
                new MediaStream(audioTracks)
            );
            
            const ytGain = this.audioContext.createGain();
            ytGain.gain.value = 1.0;
            this.youtubeAudioSource.connect(ytGain);
            ytGain.connect(this.mixDestination);
            this.ytGainNode = ytGain;
            
            audioTracks[0].onended = () => {
                this.removeYouTubeFromMix();
                this.addChatMessage('System', 'YouTube audio sharing stopped.', true);
            };
            
            await this._publishMusicTrack();
            this.addChatMessage('System', 'YouTube audio is now being shared with the room!', true);
            
            if (this.socket && this.currentRoom) {
                this.socket.emit('audio-mix-status', {
                    roomId: this.currentRoom,
                    mixing: true,
                    videoId: this.currentVideoId
                });
            }
            
            console.log('YouTube audio captured and mixed into outgoing stream');
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                this.addChatMessage('System', 'Audio capture was cancelled. Other participants will hear music through your mic.', true);
            } else {
                console.error('Error capturing tab audio:', error);
                this.addChatMessage('System', 'Could not capture audio. Others will hear music through your mic.', true);
            }
        }
    }
    
    removeYouTubeFromMix() {
        if (this.youtubeAudioSource) {
            try { this.youtubeAudioSource.disconnect(); } catch(e) {}
            this.youtubeAudioSource = null;
        }
        if (this.ytGainNode) {
            try { this.ytGainNode.disconnect(); } catch(e) {}
            this.ytGainNode = null;
        }
        
        if (this.socket && this.currentRoom) {
            this.socket.emit('audio-mix-status', {
                roomId: this.currentRoom,
                mixing: false,
                videoId: null
            });
        }
    }
    
    stopAudioMix() {
        this.removeYouTubeFromMix();
        this.stopMusicStream();
        
        this._unpublishMusicTrack();

        if (this.mixDestination) {
            this.mixDestination = null;
        }
        
        this.audioMixEnabled = false;
        this.mixedStream = null;
    }

    async _publishMusicTrack() {
        if (!this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') return;
        if (!this.mixedStream) return;
        
        this._unpublishMusicTrack();
        
        const musicTrack = this.mixedStream.getAudioTracks()[0];
        if (!musicTrack) {
            console.warn('_publishMusicTrack: no audio track in mixedStream');
            return;
        }
        
        try {
            this.agoraMusicAudioTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: musicTrack });
            await this.agoraClient.publish([this.agoraMusicAudioTrack]);
            console.log('Agora: music track published as separate stream (mic independent)');
        } catch (e) {
            console.error('Error publishing music track:', e);
        }
    }

    async _unpublishMusicTrack() {
        if (this.agoraMusicAudioTrack && this.agoraClient) {
            try {
                await this.agoraClient.unpublish([this.agoraMusicAudioTrack]);
                this.agoraMusicAudioTrack.close();
                console.log('Agora: music track unpublished');
            } catch (e) {
                console.warn('Error unpublishing music track:', e);
            }
            this.agoraMusicAudioTrack = null;
        }
    }
    
    async replaceOutgoingAudioTrack(newTrack) {
        if (!newTrack) {
            console.warn('replaceOutgoingAudioTrack: no track provided');
            return;
        }
        if (this.agoraLocalAudioTrack && this.agoraClient) {
            try {
                const newAgoraTrack = AgoraRTC.createCustomAudioTrack({ mediaStreamTrack: newTrack });
                await this.agoraClient.unpublish([this.agoraLocalAudioTrack]);
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = newAgoraTrack;
                if (this.isAudioMuted) await this.agoraLocalAudioTrack.setMuted(true);
                await this.agoraClient.publish([this.agoraLocalAudioTrack]);
                console.log('Agora: replaced outgoing audio track');
            } catch (e) {
                console.error('Error replacing Agora audio track:', e);
            }
        }
    }
    
    async loadYouTubeAudio(artist, title) {
        this.updateAudioStatus('playing', 'Finding song...');
        
        const result = await this.searchYouTubeAudio(artist, title);
        
        if (result && result.videoId) {
            this.currentVideoId = result.videoId;
            this.embedYouTubeVideo(result.videoId);
            
            const input = document.getElementById('yt-url-input');
            if (input) input.value = `https://youtu.be/${result.videoId}`;
            
            return true;
        } else {
            const input = document.getElementById('yt-url-input');
            if (input) input.placeholder = `Paste a YouTube link for "${title}"...`;
            this.updateAudioStatus('ready', 'Paste a YouTube link to play along');
            return false;
        }
    }
    

    waitForYouTubeReady(timeout = 10000) {
        return new Promise((resolve) => {
            if (this.youtubeReady) {
                resolve(true);
                return;
            }
            
            const startTime = Date.now();
            const checkReady = setInterval(() => {
                if (this.youtubeReady) {
                    clearInterval(checkReady);
                    resolve(true);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(checkReady);
                    resolve(false);
                }
            }, 100);
        });
    }

    async loadTokenBalance() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            const res = await fetch(apiUrl('/api/tokens/balance'), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) return;
            const data = await res.json();
            this._updateTokenDisplay(data);
        } catch (e) {
            console.error('Error loading token balance:', e);
        }
    }

    _updateTokenDisplay(data) {
        const display = document.getElementById('token-balance-display');
        const amountEl = document.getElementById('token-balance-amount');
        const modalBalanceEl = document.getElementById('modal-token-balance');
        if (!display) return;

        display.style.display = 'flex';
        if (amountEl) amountEl.textContent = (data.tokenBalance || 0).toLocaleString();
        if (modalBalanceEl) modalBalanceEl.textContent = (data.tokenBalance || 0).toLocaleString();

        this._cachedTokenBalance = data.tokenBalance || 0;

        const earningsDisplay = document.getElementById('token-earnings-display');
        if (earningsDisplay && typeof data.tokenEarnings !== 'undefined') {
            earningsDisplay.style.display = 'flex';
            const earningsAmountEl = document.getElementById('token-earnings-amount');
            const earningsValueEl = document.getElementById('token-earnings-value');
            if (earningsAmountEl) earningsAmountEl.textContent = (data.tokenEarnings || 0).toLocaleString();
            if (earningsValueEl) earningsValueEl.textContent = '($' + (data.earningsValue || 0).toFixed(2) + ')';
        }
    }

    showBuyTokensModal() {
        const modal = document.getElementById('buy-tokens-modal');
        if (modal) modal.classList.add('active');
        this.loadTokenBalance();
    }

    async purchaseTokenPack(packId) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            this._showAuthPrompt();
            return;
        }

        const packBtn = document.querySelector('[data-pack-id="' + packId + '"]');
        if (packBtn) packBtn.classList.add('purchasing');

        try {
            const res = await fetch(apiUrl('/api/tokens/purchase-pack'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ packId })
            });
            const data = await res.json();
            if (!res.ok) {
                this.showToast?.(data.message || 'Purchase failed', 'fa-exclamation-circle');
                return;
            }

            this._cachedTokenBalance = data.newBalance;
            const amountEl = document.getElementById('token-balance-amount');
            const modalBalanceEl = document.getElementById('modal-token-balance');
            if (amountEl) amountEl.textContent = data.newBalance.toLocaleString();
            if (modalBalanceEl) modalBalanceEl.textContent = data.newBalance.toLocaleString();

            this.showToast?.('Purchased ' + data.pack.tokens + ' tokens!', 'fa-check-circle');
        } catch (e) {
            console.error('Token purchase error:', e);
            this.showToast?.('Purchase failed. Please try again.', 'fa-exclamation-circle');
        } finally {
            if (packBtn) packBtn.classList.remove('purchasing');
        }
    }

    _setupTokenListeners() {
        document.getElementById('token-gate-buy')?.addEventListener('click', () => {
            const gateModal = document.getElementById('token-gate-modal');
            if (gateModal) gateModal.classList.remove('active');
            this.showBuyTokensModal();
        });
        document.querySelectorAll('.token-pack-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const packId = btn.dataset.packId;
                if (packId) this.purchaseTokenPack(packId);
            });
        });
    }
}

// Initialize audio rooms manager when DOM is loaded
function _initAudioRoomsManager() {
    if (window.audioRoomsManager && window.audioRoomsManager._detached) {
        window.audioRoomsManager.reattachToDOM();
        return;
    }
    if (window.audioRoomsManager) return;
    try {
        const audioRoomsManager = new AudioRoomsManager();
        window.audioRoomsManager = audioRoomsManager;
    } catch (e) {
        console.error('[Verses] Failed to create AudioRoomsManager:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initAudioRoomsManager);
} else {
    _initAudioRoomsManager();
}

