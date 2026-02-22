// Audio Rooms JavaScript - Twitter Spaces / Clubhouse style functionality

class AudioRoomsManager {
    constructor() {
        this.currentRoom = null;
        this.localStream = null;
        this.agoraClient = null;
        this.agoraLocalAudioTrack = null;
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
        
        
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.recordingCanvas = null;
        this.recordingCtx = null;
        this.recordingRAF = null;
        this.recordingStartTime = 0;
        this.currentVideoFilter = 'none';
        
        this.initYouTubePlayer();
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupVisibilityHandler();
        this.connectToServer();
        this.loadActiveRooms();
        this.loadReplays();
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
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }
        }, 3000);
    }

    _stopSilentAudioKeepAlive() {
        if (this._silentAudioTimer) {
            clearInterval(this._silentAudioTimer);
            this._silentAudioTimer = null;
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
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
        }
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
            this.showCreateRoomModal();
        });

        // Create room form submission
        this.createRoomForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.createRoom();
        });

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
            if (this._joiningFromInvite) return;

            const joinBtn = e.target.closest('.join-room-btn');
            if (joinBtn) {
                const roomCard = joinBtn.closest('.room-card');
                if (roomCard) {
                    const roomId = roomCard.dataset.roomId;
                    this.joinRoom(roomId);
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

    connectToServer() {
        console.log('Connecting to signaling server...');
        const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
        this.lobbySocket = io(serverUrl, {
            transports: ['polling', 'websocket'],
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        this.lobbySocket.on('connect', () => {
            console.log('Connected to signaling server');
            try {
                const user = JSON.parse(localStorage.getItem('user'));
                if (user && user._id) {
                    this.lobbySocket.emit('register-user', { userId: user._id, userName: user.name || 'User' });
                }
            } catch(e) {}
        });

        this.lobbySocket.on('rooms-updated', (rooms) => {
            console.log('Rooms updated in real-time:', rooms.length, 'rooms');
            this.renderRooms(rooms);
        });

        this.lobbySocket.on('room-invite', (data) => {
            this.showRoomInviteNotification(data);
        });

        this.lobbySocket.on('disconnect', () => {
            console.log('Lobby socket disconnected');
        });
    }

    async loadActiveRooms() {
        try {
            const rooms = await this.fetchActiveRooms();
            this.renderRooms(rooms);
        } catch (error) {
            console.error('Error loading rooms:', error);
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
        const roomsGrid = document.querySelector('.rooms-grid');
        if (!roomsGrid) return;

        if (rooms.length === 0) {
            roomsGrid.innerHTML = `
                <div class="empty-rooms-state">
                    <i class="fas fa-headphones"></i>
                    <h3>No live rooms right now</h3>
                    <p>Be the first to start a conversation — create a room and invite friends!</p>
                </div>`;
            const friendsList = document.getElementById('friends-list');
            if (friendsList && !friendsList.innerHTML.trim()) {
                friendsList.innerHTML = `
                    <div class="empty-rooms-state" style="padding: 1.5rem;">
                        <p style="color: rgba(255,255,255,0.5); text-align: center;">No friends are in rooms right now</p>
                    </div>`;
            }
            return;
        }

        roomsGrid.innerHTML = rooms.map(room => this.createRoomCard(room)).join('');

        const statUsers = document.getElementById('stat-active-users');
        const statRooms = document.getElementById('stat-live-rooms');
        if (statUsers) {
            const total = rooms.reduce((sum, r) => sum + (r.participantCount || 0), 0);
            statUsers.textContent = total.toLocaleString();
        }
        if (statRooms) statRooms.textContent = rooms.length;
    }

    createRoomCard(room) {
        const participants = room.participants || [];
        const participantAvatars = participants.slice(0, 3).map(p => {
            const name = p.userName || p.name || 'User';
            const initial = name.charAt(0).toUpperCase();
            return `<div class="participant-avatar">
                <div class="avatar-initial" style="width:40px;height:40px;border-radius:50%;background:var(--purple);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">${initial}</div>
            </div>`;
        }).join('');

        const count = room.participantCount || participants.length || 0;
        const moreParticipants = count > 3 ? 
            `<div class="more-participants">+${count - 3}</div>` : '';

        const genre = room.genre || 'general';
        const genreIcon = this.getGenreIcon(genre);
        const roomName = room.name || `Room ${room.id.replace('room_', '').slice(-4)}`;
        const host = participants.find(p => p.isHost);
        const hostName = host ? (host.userName || host.name || 'Unknown') : 'Unknown';

        const elapsed = room.createdAt ? Math.round((Date.now() - room.createdAt) / 60000) : 0;
        const duration = elapsed < 60 ? `${elapsed}m` : `${Math.round(elapsed / 60)}h`;

        return `
            <div class="room-card" data-room-id="${room.id}" data-genre="${genre}">
                <div class="room-preview">
                    <div class="participants-preview">
                        ${participantAvatars}
                        ${moreParticipants}
                    </div>
                    <div class="room-info">
                        <div class="room-genre">
                            ${genreIcon}
                            <span>${this.capitalizeFirst(genre)}</span>
                        </div>
                        <h3>${this.sanitizeText(roomName)}</h3>
                        <p class="room-topic">Hosted by ${this.sanitizeText(hostName)}</p>
                        <div class="room-stats">
                            <span class="stat">
                                <i class="fas fa-users"></i>
                                ${count}
                            </span>
                            <span class="stat">
                                <i class="fas fa-clock"></i>
                                ${duration}
                            </span>
                            ${room.isLocked ? '<span class="stat"><i class="fas fa-lock"></i></span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="room-actions">
                    <button class="join-room-btn primary" ${room.isLocked ? 'disabled' : ''}>
                        <i class="fas fa-play"></i>
                        ${room.isLocked ? 'Locked' : 'Join Room'}
                    </button>
                </div>
            </div>
        `;
    }

    getGenreIcon(genre) {
        const icons = {
            'hip-hop': '<i class="fas fa-music"></i>',
            'rock': '<i class="fas fa-guitar"></i>',
            'pop': '<i class="fas fa-headphones"></i>',
            'jazz': '<i class="fas fa-saxophone"></i>',
            'electronic': '<i class="fas fa-synth"></i>',
            'r&b': '<i class="fas fa-microphone"></i>'
        };
        return icons[genre] || '<i class="fas fa-music"></i>';
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
        toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    showRoomInviteNotification(data) {
        if (this.currentRoom === data.roomId) return;

        const existing = document.getElementById('wordeth-invite-notification');
        if (existing) existing.remove();

        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str || '';
            return div.innerHTML;
        };

        const inviterInitial = (data.inviterName || 'U').charAt(0).toUpperCase();
        const roomName = data.roomName || 'a Verse';

        const notification = document.createElement('div');
        notification.id = 'wordeth-invite-notification';
        notification.className = 'invite-notification';
        notification.innerHTML = `
            <div class="invite-card">
                <div class="invite-card-glow"></div>
                <div class="invite-card-top">
                    <div class="invite-live-badge">
                        <span class="invite-live-dot"></span>
                        LIVE NOW
                    </div>
                    <img src="/images/logo.png" alt="Wordeth" class="invite-logo">
                </div>
                <div class="invite-card-body">
                    <div class="invite-room-name">${escapeHtml(roomName)}</div>
                    <div class="invite-from">
                        <div class="invite-from-avatar">${inviterInitial}</div>
                        <div class="invite-from-text"><strong>${escapeHtml(data.inviterName)}</strong> invited you</div>
                    </div>
                </div>
                <div class="invite-card-actions">
                    <button class="invite-action-btn dismiss" id="invite-dismiss-btn">Not now</button>
                    <button class="invite-action-btn join" id="invite-join-btn">
                        <i class="fas fa-headphones"></i> Join
                    </button>
                </div>
                <div class="invite-timer-bar"></div>
            </div>
        `;
        document.body.appendChild(notification);
        requestAnimationFrame(() => notification.classList.add('visible'));

        document.getElementById('invite-join-btn').addEventListener('click', () => {
            notification.remove();
            if (this.currentRoom) {
                this.leaveRoom();
            }
            this.joinRoom(data.roomId);
        });

        document.getElementById('invite-dismiss-btn').addEventListener('click', () => {
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
        
        // Update active tab
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        
        // Filter room cards
        const roomCards = document.querySelectorAll('.room-card');
        roomCards.forEach(card => {
            if (filter === 'all' || card.dataset.genre === filter) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
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
        if (!token) {
            localStorage.setItem('wordeth_return_url', '/verses.html');
            window.location.href = '/signin.html';
            return;
        }
        this.createRoomModal?.classList.add('active');
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
        if (searchResults) searchResults.innerHTML = '';
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
            resultsContainer.innerHTML = '<div class="no-results"><p>Searching...</p></div>';
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
                resultsContainer.innerHTML = '<div class="no-results"><p>Search failed. Please try again.</p></div>';
            }
        }
    }

    async loadFriendsForInvite() {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        const token = localStorage.getItem('authToken');
        if (!token) {
            resultsContainer.innerHTML = '<div class="no-results"><p>Sign in to see your friends</p></div>';
            return;
        }

        resultsContainer.innerHTML = '<div class="no-results"><p>Loading friends...</p></div>';

        try {
            const res = await fetch('/api/user/friends', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const friends = await res.json();

            if (!friends || friends.length === 0) {
                resultsContainer.innerHTML = '<div class="no-results"><p>No friends yet. Search for users above to invite them!</p></div>';
                return;
            }

            this.renderSearchResults(friends, null, true);
        } catch (error) {
            console.error('Load friends error:', error);
            resultsContainer.innerHTML = '<div class="no-results"><p>Could not load friends. Try searching instead.</p></div>';
        }
    }

    renderSearchResults(users, searchQuery, isFriendsList = false) {
        const resultsContainer = document.getElementById('search-results');
        if (!resultsContainer) return;

        if (!users || users.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <p>${searchQuery ? `No users found matching "${searchQuery}"` : 'No results found'}</p>
                </div>
            `;
            return;
        }

        const currentUserId = (() => {
            try { return JSON.parse(localStorage.getItem('user'))?._id; } catch(e) { return null; }
        })();

        const roomParticipants = this.currentRoom && this.socket ? 
            Array.from(document.querySelectorAll('.participant-item')).map(el => el.dataset?.userId).filter(Boolean) : [];

        if (isFriendsList) {
            resultsContainer.innerHTML = '<div class="search-section-label">Your Friends</div>' + 
                users.filter(u => (u._id || u.id) !== currentUserId).map(user => this.renderUserCard(user, roomParticipants)).join('');
        } else {
            resultsContainer.innerHTML = users.filter(u => (u._id || u.id) !== currentUserId).map(user => this.renderUserCard(user, roomParticipants)).join('');
        }
    }

    renderUserCard(user, roomParticipants = []) {
        const userId = user._id || user.id;
        const displayName = user.name || user.displayName || 'User';
        const avatar = user.avatar || '';
        const avatarHtml = avatar 
            ? `<img src="${avatar}" alt="${displayName}" onerror="this.style.display='none'; this.parentElement.innerHTML='<i class=\\'fas fa-user\\'></i>'">`
            : `<i class="fas fa-user"></i>`;
        const isInRoom = roomParticipants.includes(userId);
        const buttonHtml = isInRoom 
            ? `<span class="in-room-badge">In Room</span>`
            : `<button class="invite-btn" data-user-id="${userId}">Invite</button>`;

        return `
            <div class="search-result-item">
                <div class="search-result-avatar">${avatarHtml}</div>
                <div class="search-result-info">
                    <div class="search-result-name">${displayName}</div>
                    ${user.bio ? `<div class="search-result-id">${user.bio.substring(0, 50)}</div>` : ''}
                </div>
                ${buttonHtml}
            </div>
        `;
    }

    inviteUser(userId) {
        const userElement = document.querySelector(`[data-user-id="${userId}"]`)?.closest('.search-result-item');
        const userName = userElement?.querySelector('.search-result-name')?.textContent || 'User';

        let currentUserName = 'Someone';
        try {
            currentUserName = JSON.parse(localStorage.getItem('user'))?.name || 'Someone';
        } catch(e) {}

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

    sendMessage() {
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

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender === 'You' ? 'own' : ''} ${isSystem ? 'system' : ''}`;
        
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="chat-message-header">
                <span class="sender">${sender}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="chat-message-content">${this.escapeHtml(message)}</div>
        `;
        
        this.chatMessagesContainer.appendChild(messageElement);
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
        toast.innerHTML = `<i class="fas ${icon}" style="color:#b388ff;"></i> ${this.escapeHtml(message)}`;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.style.opacity = '1');
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    showFirstVisitGuide() {
        const key = 'wordeth_verses_guide_seen';
        if (localStorage.getItem(key)) return;
        const overlay = document.getElementById('welcome-guide-overlay');
        if (!overlay) return;
        overlay.classList.add('active');
        const closeBtn = document.getElementById('welcome-guide-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                overlay.classList.remove('active');
                localStorage.setItem(key, '1');
            }, { once: true });
        }
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
                localStorage.setItem(key, '1');
            }
        });
    }

    toggleHandRaise() {
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
        if (this.isSpeaker || !this.socket || !this.currentRoom) return;
        this.socket.emit('request-stage', { roomId: this.currentRoom });
        this.addChatMessage('System', 'You requested to join the stage.', true);
        this.showToast('Request sent to host', 'fa-hand-paper', 3000);
    }

    joinStage() {
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
                joinStageBtn.innerHTML = '<i class="fas fa-arrow-up"></i> Join Stage';
                joinStageBtn.title = 'Join the stage (open)';
            } else {
                joinStageBtn.style.display = '';
                joinStageBtn.innerHTML = '<i class="fas fa-hand-paper"></i> Request to Speak';
                joinStageBtn.title = 'Ask the host to join the stage';
            }
        }

        if (stageAccessToggle) {
            if (this.isRoomHost) {
                stageAccessToggle.style.display = '';
                if (this.stageAccess === 'open') {
                    stageAccessToggle.innerHTML = '<i class="fas fa-door-open"></i> Open Stage';
                    stageAccessToggle.classList.add('active');
                } else {
                    stageAccessToggle.innerHTML = '<i class="fas fa-lock"></i> Invite Only';
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
        toast.innerHTML = `
            <i class="fas fa-hand-paper" style="color:#98ff98;"></i>
            <span><strong>${this.escapeHtml(userName)}</strong> wants to speak</span>
            <button class="approve-stage-btn" style="background:#98ff98;color:#1a1a2e;border:none;border-radius:6px;padding:4px 12px;cursor:pointer;font-weight:600;font-size:0.85rem;">Approve</button>
            <button class="deny-stage-btn" style="background:transparent;color:#aaa;border:1px solid #555;border-radius:6px;padding:4px 12px;cursor:pointer;font-size:0.85rem;">Deny</button>
        `;

        toast.querySelector('.approve-stage-btn').addEventListener('click', () => {
            this.socket?.emit('promote-to-speaker', { roomId: this.currentRoom, targetSocketId: socketId });
            toast.remove();
        });
        toast.querySelector('.deny-stage-btn').addEventListener('click', () => {
            toast.remove();
        });

        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 15000);
    }

    // Replay Management
    async loadReplays() {
        this.replays = [
            {
                id: 'replay1',
                title: 'Hip-Hop Discussion Session',
                topic: 'Analyzing Kendrick Lamar lyrics',
                date: '2024-01-15',
                duration: '45:30',
                participants: 4
            },
            {
                id: 'replay2',
                title: 'Rock Legends Deep Dive',
                topic: 'Queen\'s songwriting process',
                date: '2024-01-14',
                duration: '62:15',
                participants: 6
            }
        ];
    }

    loadReplayList() {
        const replayList = document.querySelector('.replay-list');
        if (replayList) {
            replayList.innerHTML = this.replays.map(replay => `
                <div class="replay-item" data-replay-id="${replay.id}">
                    <div class="replay-thumbnail">
                        <i class="fas fa-play"></i>
                    </div>
                    <div class="replay-info">
                        <div class="replay-title">${replay.title}</div>
                        <div class="replay-details">${replay.topic} • ${replay.date} • ${replay.participants} participants</div>
                    </div>
                    <div class="replay-duration">${replay.duration}</div>
                </div>
            `).join('');
        }
    }

    playReplay(replayId) {
        const replay = this.replays.find(r => r.id === replayId);
        if (replay) {
            alert(`Playing replay: ${replay.title}`);
            this.hideAllModals();
        }
    }

    // Room Management
    async createRoom() {
        if (!this.createRoomForm) return;

        const formData = new FormData(this.createRoomForm);
        const roomData = {
            name: formData.get('room-name-input'),
            genre: formData.get('room-genre'),
            initialSong: formData.get('initial-song'),
            isPrivate: formData.get('private-room') === 'on'
        };

        try {
            const newRoom = await this.createRoomOnServer(roomData);
            this.hideAllModals();
            this.isRoomHost = true; // Mark as host since we created the room
            
            const roomNameEl = document.getElementById('room-name');
            const currentSongEl = document.getElementById('current-song');
            if (roomNameEl) roomNameEl.textContent = roomData.name || 'Untitled Room';
            if (currentSongEl) currentSongEl.textContent = roomData.initialSong ? `Currently discussing: "${roomData.initialSong}"` : '';
            
            this.joinRoom(newRoom.id, true); // Pass isHost flag
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Failed to create room. Please try again.');
        }
    }

    async createRoomOnServer(roomData) {
        return {
            id: `room_${Date.now()}`,
            ...roomData
        };
    }

    async joinRoom(roomId, isHost = false) {
        if (!roomId) {
            console.warn('joinRoom called with empty roomId');
            return;
        }
        try {
            const roomData = await this.checkRoomLockStatus(roomId);
            if (roomData && roomData.isLocked) {
                alert('This room is currently locked. The host has prevented new participants from joining.');
                return;
            }
            
            this.isRoomHost = isHost;
            this.isSpeaker = isHost;
            this.isAudioMuted = false;
            this.stageAccess = 'invite-only';
            if (this.toggleAudioBtn) {
                this.toggleAudioBtn.innerHTML = '<i class="fas fa-microphone"></i><span class="ctrl-label">Mic</span>';
                this.toggleAudioBtn.classList.remove('muted');
            }
            this.karaokeEnabled = isHost ? false : (roomData?.karaokeEnabled || false);
            this.videoMode = isHost ? 'off' : (roomData?.videoMode || 'off');
            this.updateKaraokeButtonState();
            this.updateVideoButtonState();
            this.updateHostControls();

            try {
                const unlockCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (unlockCtx.state === 'suspended') await unlockCtx.resume();
                const buf = unlockCtx.createBuffer(1, 1, 22050);
                const src = unlockCtx.createBufferSource();
                src.buffer = buf;
                src.connect(unlockCtx.destination);
                src.start(0);
                setTimeout(() => unlockCtx.close().catch(() => {}), 500);
            } catch (e) {
                console.warn('Audio unlock gesture failed:', e.message);
            }
            
            if (isHost) {
                try {
                    await this.initializeMedia();
                    console.log('Host mic initialized, localStream tracks:', this.localStream?.getAudioTracks().length);
                } catch (e) {
                    console.warn('Mic access denied, hosting without mic:', e.message);
                }
            }
            
            if (this.roomSelection) this.roomSelection.style.display = 'none';
            this.audioRoom?.classList.remove('hidden');
            document.body.classList.add('in-room');
            const pageFooter = document.querySelector('footer');
            if (pageFooter) pageFooter.style.display = 'none';
            const mainContainer = document.querySelector('.audio-rooms-container');
            if (mainContainer) mainContainer.style.overflow = 'hidden';
            try { screen.orientation?.lock?.('portrait').catch(() => {}); } catch(e) {}
            
            this.currentRoom = roomId;
            this.roomJoinTime = Date.now();

            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = user.name || user.username || 'Anonymous';

            if (isHost) {
                this._addSelfToStage(userName, user.avatar || null, true);
            } else {
                this.addRemoteListener('self', userName + ' (You)', false, user._id || user.id, user.avatar);
            }
            this.updateRoomInfo(roomId);
            this.updateStageControls();

            const audioRoomEl = document.getElementById('audio-room');
            if (audioRoomEl) audioRoomEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

            await this.connectSocket();
            
            const roomNameEl = document.getElementById('room-name');
            const currentRoomName = roomNameEl?.textContent || '';
            
            this.socket.emit('join-room', {
                roomId,
                userId: user._id || user.id || this.socket.id,
                userName,
                isHost,
                roomName: currentRoomName || null,
                avatar: user.avatar || null
            });
            
            if (isHost) {
                this.addChatMessage('System', 'Welcome! You are on stage as the host.', true);
            } else {
                this.addChatMessage('System', 'Welcome! You joined as a listener. Raise your hand or wait for an invite to speak.', true);
            }

            this._requestWakeLock();
            this._startSilentAudioKeepAlive();

            try {
                await this.joinAgoraChannel(roomId);
                console.log('Agora: successfully joined, connectionState:', this.agoraClient?.connectionState);
            } catch (e) {
                console.error('Agora join failed:', e);
                this.addChatMessage('System', 'Audio connection failed. Try refreshing the page.', true);
            }

            fetch(apiUrl('/api/analytics/track'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType: 'verse_join',
                    segment: 'community',
                    metadata: { roomId, page: 'verses' }
                })
            }).catch(() => {});
            
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room. Please try again.');
        }
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
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
        } catch (error) {
            console.error('Error accessing audio device:', error);
            throw error;
        }
    }

    async initAgoraClient() {
        if (this.agoraClient) return;
        this.agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
        AgoraRTC.setLogLevel(2);

        AgoraRTC.onAutoplayFailed = () => {
            console.warn('Agora: autoplay blocked by browser');
            const banner = document.createElement('div');
            banner.id = 'agora-autoplay-banner';
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(138,43,226,0.95);color:#fff;text-align:center;padding:14px 20px;font-size:15px;cursor:pointer;backdrop-filter:blur(8px);';
            banner.innerHTML = '<i class="fas fa-volume-up" style="margin-right:8px;"></i> Tap here to enable audio';
            banner.addEventListener('click', () => {
                banner.remove();
                this.agoraRemoteUsers.forEach(user => {
                    if (user.audioTrack) user.audioTrack.play();
                });
            });
            if (!document.getElementById('agora-autoplay-banner')) {
                document.body.appendChild(banner);
            }
        };

        this.agoraClient.on('user-published', async (user, mediaType) => {
            console.log('Agora: user-published event - uid:', user.uid, 'mediaType:', mediaType, 'connectionState:', this.agoraClient.connectionState, 'localRole:', this.agoraClient.role);
            try {
                await this.agoraClient.subscribe(user, mediaType);
                console.log('Agora: subscribed to', user.uid, mediaType, 'successfully');
            } catch (subErr) {
                console.error('Agora: subscribe failed for', user.uid, mediaType, subErr.message || subErr);
                return;
            }
            if (mediaType === 'audio') {
                const remoteTrack = user.audioTrack;
                if (remoteTrack) {
                    try {
                        remoteTrack.play();
                        console.log('Agora: playing remote audio from uid', user.uid, 'volume:', remoteTrack.getVolumeLevel?.() ?? 'N/A');
                    } catch (e) {
                        console.warn('Agora: audio autoplay blocked for uid', user.uid, '- user interaction needed:', e.message);
                        this._showAutoplayBanner?.();
                    }
                    this.agoraRemoteUsers.set(String(user.uid), user);
                } else {
                    console.warn('Agora: subscribed to audio but audioTrack is null for uid', user.uid);
                    try {
                        await this.agoraClient.subscribe(user, 'audio');
                        if (user.audioTrack) {
                            user.audioTrack.play();
                            this.agoraRemoteUsers.set(String(user.uid), user);
                            console.log('Agora: retry subscribe succeeded for uid', user.uid);
                        }
                    } catch (retryErr) {
                        console.error('Agora: retry subscribe also failed for uid', user.uid);
                    }
                }
            } else if (mediaType === 'video') {
                const remoteTrack = user.videoTrack;
                if (remoteTrack && this.videoMode !== 'off') {
                    const participantId = this._findParticipantIdByAgoraUid(user.uid);
                    if (participantId) {
                        const pData = this._getParticipantData(participantId);
                        const userName = pData?.userName || 'User';
                        const stream = new MediaStream([remoteTrack.getMediaStreamTrack()]);
                        this.activeVideoFeeds.set(participantId, { userName, stream, muted: false });
                        this.refreshVideoGrid();
                        remoteTrack.getMediaStreamTrack().onended = () => {
                            this.removeVideoTile(participantId);
                        };
                    }
                }
            }
        });

        this.agoraClient.on('user-unpublished', (user, mediaType) => {
            console.log('Agora: user unpublished', user.uid, mediaType);
            if (mediaType === 'audio') {
                this.agoraRemoteUsers.delete(String(user.uid));
            } else if (mediaType === 'video') {
                const participantId = this._findParticipantIdByAgoraUid(user.uid);
                if (participantId) {
                    this.removeVideoTile(participantId);
                }
            }
        });

        this.agoraClient.on('user-left', (user) => {
            console.log('Agora: user left', user.uid);
            this.agoraRemoteUsers.delete(String(user.uid));
        });

        this.agoraClient.on('connection-state-change', (curState, prevState) => {
            console.log(`Agora connection: ${prevState} -> ${curState}`);
            if (curState === 'DISCONNECTED' && this.isInRoom()) {
                console.log('Agora disconnected while in room, will reconnect via Socket.io rejoin');
            }
        });
    }

    async joinAgoraChannel(roomId) {
        try {
            await this.initAgoraClient();

            const agoraRole = this.isSpeaker ? 'host' : 'audience';
            console.log('Agora: setting client role to', agoraRole, 'isSpeaker:', this.isSpeaker);
            if (agoraRole === 'audience') {
                await this.agoraClient.setClientRole('audience', { level: 1 });
            } else {
                await this.agoraClient.setClientRole('host');
            }

            console.log('Agora: requesting token for channel', roomId);
            const resp = await fetch(apiUrl('/api/agora/token'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channelName: roomId,
                    uid: 0,
                    role: 'publisher'
                })
            });

            if (!resp.ok) {
                const errText = await resp.text();
                throw new Error(`Token request failed (${resp.status}): ${errText}`);
            }

            const data = await resp.json();
            if (!data.token || !data.appId) {
                throw new Error('Token response missing token or appId: ' + JSON.stringify(data));
            }
            console.log('Agora: token received, appId present:', !!data.appId);

            this.agoraAppId = data.appId;
            this.agoraUid = await this.agoraClient.join(data.appId, roomId, data.token, data.uid || null);
            console.log('Agora: joined channel', roomId, 'as uid', this.agoraUid, 'role:', agoraRole, 'connectionState:', this.agoraClient.connectionState);
            const remoteUsersOnJoin = this.agoraClient.remoteUsers;
            console.log('Agora: remote users already in channel:', remoteUsersOnJoin.length, remoteUsersOnJoin.map(u => ({ uid: u.uid, hasAudio: u.hasAudio, hasVideo: u.hasVideo })));

            if (this.socket) {
                this.socket.emit('agora-uid-map', {
                    roomId,
                    agoraUid: this.agoraUid,
                    socketId: this.socket.id
                });
            }

            if (this.isSpeaker) {
                if (this.localStream) {
                    console.log('Agora: speaker with localStream, publishing audio...');
                    await this.publishAgoraAudio();
                } else {
                    console.warn('Agora: speaker but no localStream available, requesting mic...');
                    try {
                        await this.initializeMedia();
                        if (this.localStream) {
                            await this.publishAgoraAudio();
                        }
                    } catch (micErr) {
                        console.warn('Agora: mic request failed:', micErr.message);
                    }
                }
            } else {
                console.log('Agora: joined as audience (listener), will subscribe to remote tracks');
                setTimeout(() => {
                    const remoteUsers = this.agoraClient?.remoteUsers || [];
                    console.log('Agora: post-join check - remote users:', remoteUsers.length);
                    remoteUsers.forEach(async (user) => {
                        if (user.hasAudio && !this.agoraRemoteUsers.has(String(user.uid))) {
                            console.log('Agora: found unsubscribed remote audio from uid', user.uid, '- subscribing now');
                            try {
                                await this.agoraClient.subscribe(user, 'audio');
                                if (user.audioTrack) {
                                    user.audioTrack.play();
                                    this.agoraRemoteUsers.set(String(user.uid), user);
                                    console.log('Agora: fallback subscribe+play succeeded for uid', user.uid);
                                }
                            } catch (e) {
                                console.warn('Agora: fallback subscribe failed for uid', user.uid, e.message);
                            }
                        }
                    });
                }, 2000);
            }
        } catch (error) {
            console.error('Agora join failed:', error);
            this.addChatMessage('System', 'Audio connection issue - audio may not work. Try refreshing the page.', true);
            throw error;
        }
    }

    async publishAgoraAudio() {
        try {
            if (!this.agoraClient || this.agoraClient.connectionState !== 'CONNECTED') {
                console.warn('Agora: cannot publish - client not connected, state:', this.agoraClient?.connectionState);
                return;
            }

            if (this.agoraLocalAudioTrack) {
                try { await this.agoraClient.unpublish([this.agoraLocalAudioTrack]); } catch(e) {}
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = null;
            }

            const streamToUse = this.mixedStream || this.localStream;
            const audioTrack = streamToUse?.getAudioTracks()[0];
            if (!audioTrack) {
                console.warn('Agora: no audio track available to publish');
                console.warn('  mixedStream:', !!this.mixedStream, 'localStream:', !!this.localStream);
                if (this.localStream) {
                    console.warn('  localStream tracks:', this.localStream.getTracks().map(t => `${t.kind}:${t.readyState}:enabled=${t.enabled}`));
                }
                return;
            }

            audioTrack.enabled = true;
            console.log('Agora: creating custom audio track from', audioTrack.kind, 'readyState:', audioTrack.readyState, 'enabled:', audioTrack.enabled);

            this.agoraLocalAudioTrack = AgoraRTC.createCustomAudioTrack({
                mediaStreamTrack: audioTrack
            });

            if (this.isAudioMuted) {
                await this.agoraLocalAudioTrack.setMuted(true);
            }

            await this.agoraClient.publish([this.agoraLocalAudioTrack]);
            console.log('Agora: audio track published successfully, muted:', this.isAudioMuted);
        } catch (error) {
            console.error('Agora: error publishing audio:', error);
        }
    }

    async unpublishAgoraAudio() {
        try {
            if (this.agoraLocalAudioTrack) {
                await this.agoraClient.unpublish([this.agoraLocalAudioTrack]);
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = null;
                console.log('Agora: unpublished audio track');
            }
        } catch (error) {
            console.error('Error unpublishing Agora audio:', error);
        }
    }

    async leaveAgoraChannel() {
        try {
            if (this.agoraLocalAudioTrack) {
                this.agoraLocalAudioTrack.close();
                this.agoraLocalAudioTrack = null;
            }
            if (this.agoraLocalVideoTrack) {
                this.agoraLocalVideoTrack.close();
                this.agoraLocalVideoTrack = null;
            }
            if (this.agoraClient) {
                await this.agoraClient.leave();
                this.agoraClient = null;
                console.log('Agora: left channel and released client');
            }
            this.agoraRemoteUsers.clear();
            this.agoraUid = null;
        } catch (error) {
            console.error('Error leaving Agora channel:', error);
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

    connectSocket() {
        if (this.lobbySocket && this.lobbySocket.connected) {
            if (!this._roomHandlersRegistered) {
                this.socket = this.lobbySocket;
                this._registerRoomHandlers();
            } else {
                this.socket = this.lobbySocket;
            }
            return Promise.resolve();
        }

        if (this.lobbySocket && !this.lobbySocket.connected) {
            this.socket = this.lobbySocket;
            return new Promise((resolve) => {
                this.lobbySocket.once('connect', () => {
                    console.log('Socket.io reconnected:', this.lobbySocket.id);
                    if (!this._roomHandlersRegistered) {
                        this._registerRoomHandlers();
                    }
                    resolve();
                });
                if (this.lobbySocket.disconnected) {
                    this.lobbySocket.connect();
                }
            });
        }

        const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
        this.lobbySocket = io(serverUrl, {
            transports: ['polling', 'websocket'],
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 20000
        });
        this.socket = this.lobbySocket;
        
        this._registerRoomHandlers();

        return new Promise((resolve) => {
            if (this.socket.connected) {
                resolve();
            } else {
                this.socket.once('connect', () => {
                    console.log('Socket.io connected:', this.socket.id);
                    resolve();
                });
            }
        });
    }
    

    _registerRoomHandlers() {
        if (this._roomHandlersRegistered) return;
        this._roomHandlersRegistered = true;
        const sock = this.socket;

        sock.on('room-error', (data) => {
            console.warn('Room error:', data.message);
            this.showToast?.(data.message || 'Could not join the room.', 'fa-exclamation-circle');
            if (this.roomSelection) this.roomSelection.style.display = '';
            this.audioRoom?.classList.add('hidden');
            this.currentRoom = null;
            this.loadActiveRooms();
        });

        sock.on('room-joined', async (data) => {
            console.log('Room joined via signaling:', data);
            this.showFirstVisitGuide();

            if (data.isHost && !this.isRoomHost) {
                this.isRoomHost = true;
                this.updateHostControls();
                console.log('Host privileges restored by server');
            }

            if (data.videoMode) {
                this.videoMode = data.videoMode;
                this.updateVideoButtonState();
            }

            this.updateParticipantDisplay(data.participants);

            if (data.roomName) {
                const roomNameEl = document.getElementById('room-name');
                if (roomNameEl) roomNameEl.textContent = data.roomName;
            }

            if (!document.querySelector('[data-participant-id="self"]')) {
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                const userName = user.name || user.username || 'Anonymous';
                this._addSelfToStage(userName, user.avatar || null, this.isRoomHost);
            }

            for (const p of data.participants) {
                if (p.socketId !== this.socket?.id) {
                    if (p.agoraUid) {
                        if (!this._agoraUidMap) this._agoraUidMap = new Map();
                        this._agoraUidMap.set(p.socketId, p.agoraUid);
                    }
                    if (p.isSpeaker) {
                        this.addRemoteSpeaker(p.socketId, p.userName, null, false, p.userId, p.avatar);
                    } else {
                        this.addRemoteListener(p.socketId, p.userName, false, p.userId, p.avatar);
                    }
                }
            }
        });

        sock.on('participant-joined', async (data) => {
            console.log('Participant joined:', data.userName, 'isSpeaker:', data.isSpeaker);
            this.addChatMessage('System', `${data.userName} joined the room.`, true);
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
        });

        sock.on('chat-message', ({ sender, message, timestamp }) => {
            this.addChatMessage(sender, message, false);
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
                    this.unpublishAgoraAudio().then(() => {
                        this.agoraClient.setClientRole('audience').catch(e => console.warn('Agora role switch error:', e));
                    }).catch(e => console.warn('Agora unpublish error:', e));
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
            this.isSpeaker = true;
            this.handRaised = false;
            this.raiseHandBtn?.classList.remove('hand-raised');
            this.isAudioMuted = true;

            if (!this.localStream) {
                try {
                    await this.initializeMedia();
                    console.log('Promotion: mic initialized, tracks:', this.localStream?.getAudioTracks().length);
                } catch (e) {
                    console.warn('Mic access denied on promotion:', e.message);
                }
            }

            if (this.agoraClient && this.currentRoom) {
                try {
                    console.log('Promotion: rejoining Agora with publisher token...');
                    const prevRemoteUsers = new Map(this.agoraRemoteUsers);

                    if (this.agoraLocalAudioTrack) {
                        try { this.agoraLocalAudioTrack.close(); } catch(e) {}
                        this.agoraLocalAudioTrack = null;
                    }
                    await this.agoraClient.leave();
                    console.log('Promotion: left Agora channel for rejoin');

                    const resp = await fetch(apiUrl('/api/agora/token'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            channelName: this.currentRoom,
                            uid: 0,
                            role: 'publisher'
                        })
                    });
                    const data = await resp.json();
                    if (!data.token || !data.appId) {
                        throw new Error('Failed to get publisher token for promotion');
                    }

                    await this.agoraClient.setClientRole('host');
                    this.agoraUid = await this.agoraClient.join(data.appId, this.currentRoom, data.token, data.uid || null);
                    console.log('Promotion: rejoined Agora as host, uid:', this.agoraUid, 'connectionState:', this.agoraClient.connectionState);

                    if (this.socket) {
                        this.socket.emit('agora-uid-map', {
                            roomId: this.currentRoom,
                            agoraUid: this.agoraUid,
                            socketId: this.socket.id
                        });
                    }

                    if (this.localStream) {
                        await this.publishAgoraAudio();
                    }
                    console.log('Promotion: audio published, promoted to host/publisher role');
                } catch (e) {
                    console.error('Agora promotion error:', e);
                    this.addChatMessage('System', 'Audio setup failed after promotion. Try refreshing.', true);
                }
            }

            const selfEl = document.querySelector('[data-participant-id="self"]');
            if (selfEl) selfEl.remove();
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = user.name || user.username || 'Anonymous';
            this._addSelfToStage(userName, user.avatar || null, false);
            const muteIcon = this.toggleAudioBtn?.querySelector('i');
            if (muteIcon) muteIcon.className = 'fas fa-microphone-slash';
            this.updateStageControls();
            this.addChatMessage('System', 'You were invited to the stage! Unmute when ready.', true);
            this.showToast('You were invited to the stage!', 'fa-arrow-up', 4000);
        });

        sock.on('stage-request', ({ socketId, userId, userName, avatar }) => {
            if (!this.isRoomHost) return;
            this.addChatMessage('System', `${userName} is requesting to speak.`, true);
            this._showStageRequestToast(socketId, userName);
        });

        sock.on('participant-promoted', ({ socketId, userId, userName, avatar }) => {
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
                console.log('Agora disconnected, rejoining channel...');
                try {
                    await this.leaveAgoraChannel();
                    await this.joinAgoraChannel(this.currentRoom);
                } catch (e) {
                    console.error('Failed to rejoin Agora channel:', e);
                }
            } else if (agoraState === 'CONNECTED' && this.isSpeaker && !this.agoraLocalAudioTrack) {
                console.log('Agora connected but no audio track, re-publishing...');
                try {
                    await this.publishAgoraAudio();
                } catch (e) {
                    console.error('Failed to re-publish Agora audio:', e);
                }
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
                this.addChatMessage('System', `${data.newHostName} is now the host.`, true);
                if (data.newHostId === this.socket?.id) {
                    this.isRoomHost = true;
                    this.updateHostControls();
                    this.showToast('You are now the host!', 'fa-crown', 5000);
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
        const avatarContent = avatarUrl
            ? `<img src="${avatarUrl}" alt="${userName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=\\'avatar-initial\\' style=\\'width:100%;height:100%;border-radius:50%;background:var(--mint,#98ff98);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:#1a1a2e;\\'>${initial}</div>'">`
            : `<div class="avatar-initial" style="width:100%;height:100%;border-radius:50%;background:var(--mint,#98ff98);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:#1a1a2e;">${initial}</div>`;
        const selfAvatar = document.createElement('div');
        selfAvatar.className = 'speaker-avatar self-speaker';
        selfAvatar.setAttribute('data-participant-id', 'self');
        selfAvatar.innerHTML = `
            <div class="avatar-ring">
                ${avatarContent}
            </div>
            <div class="speaker-info">
                <span class="speaker-name">${userName} (You)</span>
                <span class="speaker-role">${isHost ? 'Host' : 'Speaker'}</span>
            </div>
            <div class="speaker-status">
                <i class="fas fa-microphone${this.isAudioMuted ? '-slash' : ''}"></i>
            </div>
        `;
        stage.prepend(selfAvatar);
    }

    updateRoomInfo(roomId) {
        const roomNameEl = document.getElementById('room-name');
        const currentSong = document.getElementById('current-song');
        if (roomNameEl && !roomNameEl.textContent.trim()) {
            roomNameEl.textContent = `Room ${roomId.replace('room_', '').slice(-4)}`;
        }
        if (this.participantCount) this.participantCount.textContent = '1 participant';
    }

    toggleAudio() {
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
            this.toggleAudioBtn.innerHTML = this.isAudioMuted ? 
                '<i class="fas fa-microphone-slash"></i>' : 
                '<i class="fas fa-microphone"></i>';
        }

        if (window._verseMiniPlayer && window._verseMiniPlayer.isActive()) {
            window._verseMiniPlayer._updateMuteIcon();
        }
    }

    shareMusic() {
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

                const mixedTrack = this.mixedStream?.getAudioTracks()[0];
                if (mixedTrack) {
                    console.log('Replacing outgoing audio with mixed track, track state:', mixedTrack.readyState, 'enabled:', mixedTrack.enabled);
                    await this.replaceOutgoingAudioTrack(mixedTrack);
                }
                console.log('Music connected to audio mix, audioContext state:', this.audioContext.state);
            } else {
                console.error('Audio mix not ready — audioContext:', !!this.audioContext, 'mixDestination:', !!this.mixDestination);
                this.addChatMessage('System', 'Could not connect music to room audio. Try again.', true);
            }

            await this.musicAudioElement.play();
            console.log('Music element playing, paused:', this.musicAudioElement.paused, 'volume:', this.musicAudioElement.volume);

            this.musicAudioElement.addEventListener('ended', () => {
                this.stopMusicStream();
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

        messageElement.innerHTML = `
            <div class="chat-message-header">
                <span class="sender">${this.escapeHtml(sender)}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="chat-audio-player">
                <div class="chat-audio-icon"><i class="fas fa-broadcast-tower"></i></div>
                <div class="chat-audio-meta">
                    <span class="chat-audio-title">${this.escapeHtml(songTitle)}</span>
                    <span class="chat-audio-artist">${this.escapeHtml(artistName)}</span>
                </div>
                <span class="chat-audio-play-hint"><i class="fas fa-volume-up"></i> Live</span>
            </div>
        `;

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
        if (playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
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
                if (playBtn) playBtn.innerHTML = '<i class="fas fa-play"></i>';
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
                playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            } else {
                this.musicAudioElement.pause();
                playBtn.innerHTML = '<i class="fas fa-play"></i>';
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
        if (window._verseMiniPlayer) {
            window._verseMiniPlayer.deactivate();
        }
        this._detached = false;
        this._savedRoomName = null;
        this._releaseWakeLock();
        this._stopSilentAudioKeepAlive();
        this.resetAudioFilter();

        this.leaveAgoraChannel().catch(e => console.warn('Agora leave error:', e));
        if (this._agoraUidMap) this._agoraUidMap.clear();
        const autoplayBanner = document.getElementById('agora-autoplay-banner');
        if (autoplayBanner) autoplayBanner.remove();

        if (this.audioContext && this.audioContext.state !== 'closed') {
            try { this.audioContext.close(); } catch(e) {}
            this.audioContext = null;
        }

        const duration = this.roomJoinTime ? Math.round((Date.now() - this.roomJoinTime) / 1000) : 0;
        if (this.currentRoom) {
            fetch(apiUrl('/api/analytics/track'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType: 'verse_leave',
                    segment: 'community',
                    metadata: { roomId: this.currentRoom, duration, page: 'verses' }
                })
            }).catch(() => {});
        }

        this.stopMusicStream();
        this.stopAudioMix();
        
        if (this.nativeScreenCapture) {
            this.nativeScreenCapture.stop().catch(() => {});
            this.nativeScreenCapture = null;
        }
        
        if (this.localVideoStream) {
            this.localVideoStream.getTracks().forEach(track => track.stop());
            this.localVideoStream = null;
        }
        this.isVideoActive = false;
        this.activeVideoFeeds.clear();
        this.videoMode = 'off';
        const videoGridWrapper = document.getElementById('video-grid-wrapper');
        const videoGrid = document.getElementById('video-grid');
        if (videoGridWrapper) videoGridWrapper.classList.add('hidden');
        if (videoGrid) videoGrid.innerHTML = '';
        this.updateVideoButtonState();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.socket && this.currentRoom) {
            this.socket.emit('leave-room', { roomId: this.currentRoom });
        }
        
        this.isSpeaker = false;
        this.handRaised = false;
        this.chatVisible = true;
        
        this.audioRoom?.classList.add('hidden');
        document.body.classList.remove('in-room');
        const pageFooter = document.querySelector('footer');
        if (pageFooter) pageFooter.style.display = '';
        const mainContainer = document.querySelector('.audio-rooms-container');
        if (mainContainer) mainContainer.style.overflow = '';
        try { screen.orientation?.unlock?.(); } catch(e) {}
        if (this.roomSelection) this.roomSelection.style.display = 'block';
        this.currentRoom = null;
        this.roomJoinTime = null;
        
        if (this.chatMessagesContainer) this.chatMessagesContainer.innerHTML = '';
        if (this.speakersStage) this.speakersStage.innerHTML = '';
        if (this.listenersGrid) this.listenersGrid.innerHTML = '';
        const roomNameEl = document.getElementById('room-name');
        if (roomNameEl) roomNameEl.textContent = '';
        const currentSongEl = document.getElementById('current-song');
        if (currentSongEl) currentSongEl.textContent = '';
        
        this.loadActiveRooms();
    }

    isInRoom() {
        return !!this.currentRoom;
    }

    getRoomName() {
        const el = document.getElementById('room-name');
        return el ? el.textContent : this._savedRoomName || 'Audio Room';
    }

    _rebindDOMListeners() {
        this.toggleAudioBtn?.addEventListener('click', () => this.toggleAudio());
        this.raiseHandBtn?.addEventListener('click', () => this.toggleHandRaise());
        this.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this.shareMusicBtn?.addEventListener('click', () => this.shareMusic());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());
        this.addUsersBtn?.addEventListener('click', () => this.showAddUsersModal());
        this.replayBtn?.addEventListener('click', () => this.showReplayModal());
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

        this.sendMessageBtn?.addEventListener('click', () => {
            const msg = this.chatInput?.value?.trim();
            if (msg) {
                this.sendChatMessage(msg);
                this.chatInput.value = '';
            }
        });
        this.chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const msg = this.chatInput.value.trim();
                if (msg) {
                    this.sendChatMessage(msg);
                    this.chatInput.value = '';
                }
            }
        });

        document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
            btn.addEventListener('click', () => this.hideAllModals());
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
        this.initHostPanel();
        this.syncHostPanel();

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
        const avatarContent = avatarUrl 
            ? `<img src="${avatarUrl}" alt="${name}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=\\'avatar-initial\\' style=\\'width:100%;height:100%;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:white;\\'>${initial}</div>'">`
            : `<div class="avatar-initial" style="width:100%;height:100%;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:bold;color:white;">${initial}</div>`;
        speakerAvatar.innerHTML = `
            <div class="avatar-ring ${isSpeaking ? 'speaking' : ''}">
                ${avatarContent}
            </div>
            <div class="speaker-info">
                <span class="speaker-name">${name}</span>
                <span class="speaker-role">Speaker</span>
            </div>
            <div class="speaker-status">
                <i class="fas fa-microphone"></i>
            </div>
        `;
        
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
        const initial = (name || '?').charAt(0).toUpperCase();
        const listenerAvatar = document.createElement('div');
        listenerAvatar.className = `listener-avatar ${handRaised ? 'hand-raised' : ''}`;
        listenerAvatar.setAttribute('data-participant-id', participantId);
        if (userId) listenerAvatar.setAttribute('data-user-id', userId);
        listenerAvatar.style.cursor = userId ? 'pointer' : 'default';
        const avatarContent = avatarUrl
            ? `<img src="${avatarUrl}" alt="${name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.outerHTML='<div class=\\'avatar-initial\\' style=\\'width:40px;height:40px;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;\\'>${initial}</div>'">`
            : `<div class="avatar-initial" style="width:40px;height:40px;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">${initial}</div>`;
        listenerAvatar.innerHTML = avatarContent;
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
        menu.innerHTML = `
            <div class="kick-menu-header">${name}</div>
            ${isSpeaker ? `<button class="kick-menu-item move-to-crowd" data-action="move-to-crowd">
                <i class="fas fa-arrow-down"></i> Move to Crowd
            </button>` : `<button class="kick-menu-item invite-to-stage" data-action="invite-to-stage">
                <i class="fas fa-arrow-up"></i> Invite to Stage
            </button>`}
            <button class="kick-menu-item remove-from-room" data-action="remove">
                <i class="fas fa-ban"></i> Remove from Room
            </button>
            ${isMobile ? `<button class="kick-menu-item kick-menu-cancel">
                <i class="fas fa-times"></i> Cancel
            </button>` : ''}
        `;

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
        notification.innerHTML = `
            <div class="host-notif-icon"><i class="fas fa-video"></i></div>
            <div class="host-notif-content">
                <strong>${data.userName}</strong> wants to enable their <strong>camera</strong>
            </div>
            <div class="host-notif-actions">
                <button class="notif-approve-btn" onclick="window.audioRoomsManager?.approveVideoRequest('${reqId}', '${data.requesterId}', '${data.userName}')">
                    <i class="fas fa-check"></i> Allow
                </button>
                <button class="notif-deny-btn" onclick="window.audioRoomsManager?.denyVideoRequest('${reqId}', '${data.requesterId}', '${data.userName}')">
                    <i class="fas fa-times"></i> Deny
                </button>
            </div>
        `;
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
        if (feed && feed.stream && id !== 'self') {
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
            grid.innerHTML = '';
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
                
                const video = document.createElement('video');
                video.autoplay = true;
                video.playsInline = true;
                video.muted = feed.id === 'self';
                
                const nameLabel = document.createElement('span');
                nameLabel.className = 'video-tile-name';
                nameLabel.textContent = feed.id === 'self' ? 'You' : feed.userName;
                
                tile.appendChild(video);
                tile.appendChild(nameLabel);
                grid.appendChild(tile);
            }
            
            const videoEl = tile.querySelector('video');
            if (videoEl && feed.stream && videoEl.srcObject !== feed.stream) {
                videoEl.srcObject = feed.stream;
            }
            
            const existingMuteTag = tile.querySelector('.video-tile-muted');
            if (feed.muted && !existingMuteTag) {
                const muteTag = document.createElement('span');
                muteTag.className = 'video-tile-muted';
                muteTag.innerHTML = '<i class="fas fa-microphone-slash"></i>';
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
            muted: data.muted
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
        notification.innerHTML = `
            <div class="host-notif-icon"><i class="fas ${featureIcon}"></i></div>
            <div class="host-notif-content">
                <strong>${userName}</strong> wants to use <strong>${featureLabel}</strong>
            </div>
            <div class="host-notif-actions">
                <button class="notif-approve-btn" onclick="window.audioRoomsManager?.approveRequest('${requestId}', '${feature}', '${userName}')">
                    <i class="fas fa-check"></i> Allow
                </button>
                <button class="notif-deny-btn" onclick="window.audioRoomsManager?.denyRequest('${requestId}', '${feature}', '${userName}')">
                    <i class="fas fa-times"></i> Deny
                </button>
            </div>
        `;
        
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
        
        messageElement.innerHTML = `
            <div class="chat-message-header">
                <span class="sender">${this.escapeHtml(sender)}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <img class="shared-image-thumb" src="${imageDataUrl}" alt="Shared photo">
        `;
        
        const thumb = messageElement.querySelector('.shared-image-thumb');
        thumb?.addEventListener('click', () => {
            this.showSharedImageOverlay(imageDataUrl, sender);
        });
        
        this.chatMessagesContainer.appendChild(messageElement);
        this.chatMessagesContainer.scrollTop = this.chatMessagesContainer.scrollHeight;
    }

    showSharedImageOverlay(imageDataUrl, sender) {
        const overlay = document.getElementById('shared-image-overlay');
        const display = document.getElementById('shared-image-display');
        const senderEl = document.getElementById('shared-image-sender');
        
        if (display) display.src = imageDataUrl;
        if (senderEl) senderEl.innerHTML = `<i class="fas fa-image"></i> Photo from ${this.escapeHtml(sender)}`;
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
            resultsContainer.innerHTML = '<p class="karaoke-hint">Searching...</p>';
        }
        
        try {
            const response = await fetch(apiUrl(`/api/lyrics/search?q=${encodeURIComponent(query)}`));
            const data = await response.json();
            
            if (data.hits && data.hits.length > 0) {
                this.renderKaraokeResults(data.hits.slice(0, 5));
            } else {
                resultsContainer.innerHTML = '<p class="karaoke-hint">No songs found. Try another search.</p>';
            }
        } catch (error) {
            console.error('Error searching songs:', error);
            resultsContainer.innerHTML = '<p class="karaoke-hint">Error searching. Please try again.</p>';
        }
    }
    
    renderKaraokeResults(songs) {
        const resultsContainer = document.getElementById('karaoke-results');
        if (!resultsContainer) return;
        
        // Clear container
        resultsContainer.innerHTML = '';
        
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
            btn.innerHTML = '<i class="fas fa-microphone"></i> Sing';
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
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.textContent;
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
            lyricsContainer.innerHTML = '<div class="lyrics-line active">Loading lyrics...</div>';
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
            lyricsContainer.innerHTML = lines.map((line, index) => 
                `<div class="lyrics-line ${index === 0 ? 'active' : ''}" data-index="${index}">${line}</div>`
            ).join('');

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
        if (results) results.innerHTML = '<p class="karaoke-hint">Search for a different song!</p>';
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
        downloadLink.innerHTML = '<i class="fas fa-download"></i> Download Video';
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
                    retryBtn.innerHTML = '<i class="fas fa-redo"></i> Try Another';
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
        if (container) container.innerHTML = '';
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
        container.innerHTML = '';

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
            shareBtn.innerHTML = '<i class="fas fa-broadcast-tower"></i> Share Audio with Room';
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
        if (container) container.innerHTML = '';
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
            
            if (this.localStream) {
                const micTrack = this.localStream.getAudioTracks()[0];
                if (micTrack) {
                    const micStream = new MediaStream([micTrack]);
                    this.micAudioSource = this.audioContext.createMediaStreamSource(micStream);
                    
                    const micGain = this.audioContext.createGain();
                    micGain.gain.value = 1.0;
                    this.micAudioSource.connect(micGain);
                    micGain.connect(this.mixDestination);
                    this.micGainNode = micGain;
                }
            } else {
                console.warn('No local stream — audio mix will only contain music/media');
            }
            
            this.mixedStream = this.mixDestination.stream;
            this.audioMixEnabled = true;
            
            const mixedTrack = this.mixedStream.getAudioTracks()[0];
            if (mixedTrack) {
                console.log('startAudioMix: replacing outgoing track, track readyState:', mixedTrack.readyState, 'enabled:', mixedTrack.enabled);
                await this.replaceOutgoingAudioTrack(mixedTrack);
            } else {
                console.warn('startAudioMix: no audio track in mixedStream');
            }
            
            console.log('Audio mixing initialized, audioContext state:', this.audioContext.state, 'hasMic:', !!this.localStream);
            
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
        
        if (this.micAudioSource) {
            try { this.micAudioSource.disconnect(); } catch(e) {}
            this.micAudioSource = null;
        }
        if (this.micGainNode) {
            try { this.micGainNode.disconnect(); } catch(e) {}
            this.micGainNode = null;
        }
        if (this.mixDestination) {
            this.mixDestination = null;
        }
        
        this.audioMixEnabled = false;
        this.mixedStream = null;
        
        if (this.localStream && this.localStream.getAudioTracks().length > 0) {
            this.replaceOutgoingAudioTrack(this.localStream.getAudioTracks()[0]);
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
}

// Initialize audio rooms manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.audioRoomsManager && window.audioRoomsManager._detached) {
        window.audioRoomsManager.reattachToDOM();
        return;
    }
    if (window.audioRoomsManager) return;
    const audioRoomsManager = new AudioRoomsManager();
    window.audioRoomsManager = audioRoomsManager;
});

// Handle page parameters (if joining via direct link)
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomToJoin = urlParams.get('room');
    if (!roomToJoin) return;

    window.history.replaceState({}, '', '/verses.html');

    document.addEventListener('DOMContentLoaded', () => {
        const token = localStorage.getItem('authToken');
        if (!token) {
            const returnUrl = `/verses.html?room=${encodeURIComponent(roomToJoin)}`;
            localStorage.setItem('wordeth_return_url', returnUrl);

            const joinBanner = document.createElement('div');
            joinBanner.className = 'join-invite-banner';
            joinBanner.innerHTML = `
                <div class="invite-content">
                    <i class="fas fa-headphones"></i>
                    <p>You've been invited to a live room! Sign up or sign in to join.</p>
                    <div class="invite-actions">
                        <a href="/signup.html" class="invite-btn primary">Sign Up Free</a>
                        <a href="/signin.html" class="invite-btn secondary">Sign In</a>
                    </div>
                </div>
            `;
            document.body.appendChild(joinBanner);
            return;
        }

        const lobby = document.getElementById('room-selection') || document.querySelector('.room-selection');
        if (lobby) lobby.style.display = 'none';

        const tryJoinRoom = async (attempt = 0) => {
            const mgr = window.audioRoomsManager;
            if (!mgr) {
                if (attempt < 20) {
                    setTimeout(() => tryJoinRoom(attempt + 1), 300);
                }
                return;
            }

            if (!mgr.lobbySocket || !mgr.lobbySocket.connected) {
                if (attempt < 15) {
                    setTimeout(() => tryJoinRoom(attempt + 1), 400);
                    return;
                }
            }

            mgr._joiningFromInvite = true;

            try {
                let targetRoom = null;

                try {
                    const directRes = await fetch(apiUrl(`/api/rooms/${encodeURIComponent(roomToJoin)}`));
                    if (directRes.ok) {
                        targetRoom = await directRes.json();
                    }
                } catch (_) {}

                if (!targetRoom) {
                    let rooms = [];
                    const maxRetries = 3;
                    for (let i = 0; i < maxRetries; i++) {
                        try { rooms = await mgr.fetchActiveRooms() || []; } catch (_) {}
                        targetRoom = rooms.find(r => r.id === roomToJoin);
                        if (targetRoom) break;
                        if (rooms.length > 0) {
                            if (lobby) lobby.style.display = '';
                            mgr.loadActiveRooms();
                            mgr.showToast?.('This room is no longer live. Check out other active rooms below.', 'fa-exclamation-circle');
                            mgr._joiningFromInvite = false;
                            return;
                        }
                        if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 800));
                    }
                }

                if (targetRoom) {
                    const roomNameEl = document.getElementById('room-name');
                    if (roomNameEl && targetRoom.name) {
                        roomNameEl.textContent = targetRoom.name;
                    }
                }
                await mgr.joinRoom(roomToJoin);
            } catch(e) {
                console.error('Error joining room from link:', e);
                if (lobby) lobby.style.display = '';
                mgr.loadActiveRooms();
                mgr.showToast?.('Could not join the room. It may no longer be active.', 'fa-exclamation-circle');
            } finally {
                if (mgr) mgr._joiningFromInvite = false;
            }
        };
        setTimeout(() => tryJoinRoom(0), 500);
    });
})();