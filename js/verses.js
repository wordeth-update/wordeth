// Audio Rooms JavaScript - Twitter Spaces / Clubhouse style functionality

class AudioRoomsManager {
    constructor() {
        this.currentRoom = null;
        this.localStream = null;
        this.peerConnections = new Map();
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
        this.currentVideoId = null;
        this.videoQueue = [];
        this.videoQueueIndex = 0;
        this.scrollSpeed = 1.0;
        this.baseScrollInterval = 3000;
        this.previewMode = true;
        this.karaokeCanvas = null;
        this.karaokeCanvasCtx = null;
        this.karaokeEnabled = false;
        this.isRoomHost = false;
        this.pendingRequests = [];
        
        // Screen share state
        this.screenshareEnabled = false;
        this.screenshareStream = null;
        this.isScreenSharing = false;
        
        // Karaoke video state
        this.karaokeVideoStream = null;
        this.karaokeVideoActive = false;
        
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
        this.micAudioSource = null;
        this.mixDestination = null;
        this.remoteAudioElements = new Map();
        
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
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
            if (!document.hidden) {
                this.handleAppVisible();
            }
        });
    }
    
    handleAppVisible() {
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
        
        if (this.isMobileDevice() || !this.isScreenShareSupported()) {
            const screenshareBtn = document.getElementById('screenshare-btn');
            const screenshareToggleBtn = document.getElementById('screenshare-toggle-btn');
            if (screenshareBtn) {
                screenshareBtn.style.opacity = '0.4';
                screenshareBtn.title = 'Screen sharing is only available on desktop';
            }
            if (screenshareToggleBtn) {
                screenshareToggleBtn.style.opacity = '0.4';
                screenshareToggleBtn.title = 'Screen sharing is only available on desktop';
            }
        }
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
        this.shareMusicBtn?.addEventListener('click', () => this.shareMusic());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());

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
        
        // Screen share controls
        document.getElementById('screenshare-toggle-btn')?.addEventListener('click', () => this.toggleScreensharePermission());
        document.getElementById('screenshare-btn')?.addEventListener('click', () => this.startScreenShare());
        document.getElementById('screenshare-stop')?.addEventListener('click', () => this.stopScreenShare());
        
        // Karaoke scroll speed controls
        document.getElementById('karaoke-slower')?.addEventListener('click', () => this.adjustScrollSpeed(-0.25));
        document.getElementById('karaoke-faster')?.addEventListener('click', () => this.adjustScrollSpeed(0.25));

        // Karaoke video controls
        document.getElementById('karaoke-camera-toggle')?.addEventListener('click', () => this.toggleKaraokeCamera());
        document.getElementById('karaoke-preview-toggle')?.addEventListener('click', () => this.togglePreviewMode());
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.setVideoFilter(filter);
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

        // Delegated click events for room actions
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('join-room-btn')) {
                const roomId = e.target.closest('.room-card').dataset.roomId;
                this.joinRoom(roomId);
            }
            
            if (e.target.classList.contains('preview-btn')) {
                const roomCard = e.target.closest('.room-card');
                this.previewRoom(roomCard);
            }
            
            if (e.target.classList.contains('knock-btn')) {
                const friendRoom = e.target.closest('.friend-room');
                this.knockOnRoom(friendRoom);
            }

            if (e.target.classList.contains('join-friend-btn')) {
                const friendRoom = e.target.closest('.friend-room');
                this.joinFriendRoom(friendRoom);
            }

            if (e.target.classList.contains('invite-btn')) {
                const userId = e.target.dataset.userId;
                this.inviteUser(userId);
            }

            if (e.target.classList.contains('replay-item')) {
                const replayId = e.target.dataset.replayId;
                this.playReplay(replayId);
            }
        });
    }

    connectToServer() {
        console.log('Connecting to signaling server...');
        const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
        this.lobbySocket = io(serverUrl, {
            transports: ['websocket', 'polling'],
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
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/verses.html?room=${encodeURIComponent(this.currentRoom)}`;
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

        const notification = document.createElement('div');
        notification.id = 'wordeth-invite-notification';
        notification.className = 'invite-notification';
        notification.innerHTML = `
            <div class="invite-notif-content">
                <div class="invite-notif-icon"><i class="fas fa-headphones"></i></div>
                <div class="invite-notif-text">
                    <strong>${escapeHtml(data.inviterName)}</strong> invited you to join
                    <strong>"${escapeHtml(data.roomName)}"</strong>
                </div>
                <div class="invite-notif-actions">
                    <button class="invite-notif-btn join" id="invite-join-btn">Join</button>
                    <button class="invite-notif-btn dismiss" id="invite-dismiss-btn">Dismiss</button>
                </div>
            </div>
            <div class="invite-notif-timer"></div>
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

        const activeSocket = this.socket || this.lobbySocket;
        if (activeSocket && activeSocket.connected) {
            activeSocket.emit('room-invite', {
                targetUserId: userId,
                roomId: this.currentRoom,
                roomName: this.currentRoom,
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
        const shareUrl = `${window.location.origin}/verses.html?room=${encodeURIComponent(this.currentRoom)}`;
        const shareText = `Join me in "${this.currentRoom}" on Wordeth!`;

        if (navigator.share) {
            navigator.share({
                title: `Wordeth - ${this.currentRoom}`,
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
        this.chatVisible = !this.chatVisible;
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            this.chatSection?.classList.toggle('mobile-visible');
        } else {
            this.chatSection?.classList.toggle('hidden', !this.chatVisible);
        }
        this.toggleChatBtn?.classList.toggle('active', this.chatVisible);
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

    // Hand Raise Management
    toggleHandRaise() {
        this.handRaised = !this.handRaised;
        this.raiseHandBtn?.classList.toggle('hand-raised', this.handRaised);
        
        const handIndicator = document.querySelector('.hand-raise-indicator');
        handIndicator?.classList.toggle('hidden', !this.handRaised);
        
        this.notifyParticipants('hand-raise', { raised: this.handRaised });
        
        if (this.handRaised) {
            this.addChatMessage('System', 'You raised your hand to speak', true);
        }
    }

    // Listener Mode Management (for audio rooms - listener vs speaker)
    toggleListenerMode() {
        this.isSpeaker = !this.isSpeaker;
        this.audioRoom?.classList.toggle('speaker-mode', this.isSpeaker);
        
        if (!this.isSpeaker) {
            // Mute audio when becoming listener
            if (this.localStream) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) audioTrack.enabled = false;
            }
            this.addChatMessage('System', 'You are now listening', true);
        } else {
            // Enable audio when becoming speaker
            if (this.localStream) {
                const audioTrack = this.localStream.getAudioTracks()[0];
                if (audioTrack) audioTrack.enabled = true;
            }
            this.addChatMessage('System', 'You are now a speaker', true);
        }
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
        try {
            const roomData = await this.checkRoomLockStatus(roomId);
            if (roomData && roomData.isLocked) {
                alert('This room is currently locked. The host has prevented new participants from joining.');
                return;
            }
            
            this.isRoomHost = isHost;
            this.isSpeaker = isHost;
            this.karaokeEnabled = isHost ? false : (roomData?.karaokeEnabled || false);
            this.screenshareEnabled = isHost ? false : (roomData?.screenshareEnabled || false);
            this.updateKaraokeButtonState();
            this.updateScreenshareButtonState();
            this.updateHostControls();
            
            try {
                await this.initializeMedia();
                if (!isHost) this.isSpeaker = true;
            } catch (e) {
                console.warn('Mic access denied, joining as listener:', e.message);
                this.isSpeaker = false;
            }
            
            if (this.roomSelection) this.roomSelection.style.display = 'none';
            this.audioRoom?.classList.remove('hidden');
            
            this.currentRoom = roomId;
            this.roomJoinTime = Date.now();
            
            this.connectSocket();
            
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const userName = user.name || user.username || 'Anonymous';
            
            const roomNameEl = document.getElementById('room-name');
            const currentRoomName = roomNameEl?.textContent || '';
            
            this.socket.emit('join-room', {
                roomId,
                userId: user._id || user.id || this.socket.id,
                userName,
                isHost,
                roomName: currentRoomName || null
            });
            
            this.updateRoomInfo(roomId);
            
            const selfInitial = userName.charAt(0).toUpperCase();
            if (this.speakersStage) {
                const selfAvatar = document.createElement('div');
                selfAvatar.className = 'speaker-avatar self-speaker';
                selfAvatar.setAttribute('data-participant-id', 'self');
                selfAvatar.innerHTML = `
                    <div class="avatar-ring">
                        <div class="avatar-initial" style="width:80px;height:80px;border-radius:50%;background:var(--mint,#98ff98);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;color:#1a1a2e;">${selfInitial}</div>
                    </div>
                    <div class="speaker-info">
                        <span class="speaker-name">${userName} (You)</span>
                        <span class="speaker-role">${isHost ? 'Host' : 'Speaker'}</span>
                    </div>
                    <div class="speaker-status">
                        <i class="fas fa-microphone"></i>
                    </div>
                `;
                this.speakersStage.appendChild(selfAvatar);
            }
            
            this.addChatMessage('System', 'Welcome to the room!', true);

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
            alert('Failed to join room. Please check your microphone permissions.');
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
            // Audio-only for audio rooms (Twitter Spaces style)
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

    connectSocket() {
        if (this.socket && this.socket.connected) return;
        
        const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });
        
        this.socket.on('connect', () => {
            console.log('Socket.io connected:', this.socket.id);
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('Socket.io disconnected:', reason);
            if (reason === 'io server disconnect') {
                this.socket.connect();
            }
        });
        
        this.socket.on('room-joined', async (data) => {
            console.log('Room joined via signaling:', data);
            this.updateParticipantDisplay(data.participants);
            
            if (data.roomName) {
                const roomNameEl = document.getElementById('room-name');
                if (roomNameEl) roomNameEl.textContent = data.roomName;
            }
            
            for (const p of data.participants) {
                if (p.socketId !== this.socket.id) {
                    await this.createPeerConnection(p.socketId, p.userName, true);
                    this.addRemoteSpeaker(p.socketId, p.userName, null, false, p.userId);
                }
            }
        });
        
        this.socket.on('participant-joined', async (data) => {
            console.log('Participant joined:', data.userName);
            this.addChatMessage('System', `${data.userName} joined the room.`, true);
            this.updateParticipantDisplay(data.participants);
            
            if (!document.querySelector(`[data-participant-id="${data.socketId}"]`)) {
                this.addRemoteSpeaker(data.socketId, data.userName, null, false, data.userId);
            }
        });
        
        this.socket.on('participant-left', (data) => {
            console.log('Participant left:', data.userName);
            this.addChatMessage('System', `${data.userName} left the room.`, true);
            this.closePeerConnection(data.socketId);
            this.removeRemoteParticipant(data.socketId);
            this.updateParticipantDisplay(data.participants);
        });
        
        this.socket.on('webrtc-offer', async ({ senderId, senderName, offer }) => {
            console.log('Received WebRTC offer from:', senderName);
            let pc = this.peerConnections.get(senderId);
            if (pc && pc.signalingState !== 'closed') {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    this.socket.emit('webrtc-answer', { targetId: senderId, answer });
                } catch (e) {
                    console.warn('Renegotiation failed, recreating connection:', e);
                    pc = await this.createPeerConnection(senderId, senderName, false);
                    if (pc) {
                        await pc.setRemoteDescription(new RTCSessionDescription(offer));
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        this.socket.emit('webrtc-answer', { targetId: senderId, answer });
                    }
                }
            } else {
                pc = await this.createPeerConnection(senderId, senderName, false);
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(offer));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    this.socket.emit('webrtc-answer', { targetId: senderId, answer });
                }
            }
        });
        
        this.socket.on('webrtc-answer', async ({ senderId, answer }) => {
            const pc = this.peerConnections.get(senderId);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });
        
        this.socket.on('webrtc-ice-candidate', async ({ senderId, candidate }) => {
            const pc = this.peerConnections.get(senderId);
            if (pc && candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.error('Error adding ICE candidate:', e);
                }
            }
        });
        
        this.socket.on('chat-message', ({ sender, message, timestamp }) => {
            this.addChatMessage(sender, message, false);
        });
        
        this.socket.on('room-event', ({ event, data }) => {
            this.handleRemoteRoomEvent(event, data);
        });
        
        this.socket.on('audio-mix-status', ({ userName, mixing, videoId }) => {
            if (mixing) {
                this.addChatMessage('System', `${userName} is sharing YouTube audio with the room.`, true);
            }
        });
    }
    
    async createPeerConnection(remoteId, remoteName, isInitiator) {
        if (this.peerConnections.has(remoteId)) {
            this.closePeerConnection(remoteId);
        }
        
        const pc = new RTCPeerConnection(this.rtcConfig);
        this.peerConnections.set(remoteId, pc);
        
        const streamToSend = this.mixedStream || this.localStream;
        if (streamToSend) {
            streamToSend.getTracks().forEach(track => {
                pc.addTrack(track, streamToSend);
            });
        }
        
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('webrtc-ice-candidate', {
                    targetId: remoteId,
                    candidate: event.candidate
                });
            }
        };
        
        pc.ontrack = (event) => {
            console.log('Received remote track from:', remoteName, 'kind:', event.track.kind);
            if (event.track.kind === 'video') {
                this.handleRemoteVideoTrack(remoteId, remoteName, event.streams[0]);
            } else {
                this.handleRemoteStream(remoteId, remoteName, event.streams[0]);
            }
        };
        
        pc.onconnectionstatechange = () => {
            console.log(`Peer ${remoteName} connection state: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.closePeerConnection(remoteId);
            }
        };
        
        if (isInitiator) {
            try {
                const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
                await pc.setLocalDescription(offer);
                this.socket.emit('webrtc-offer', { targetId: remoteId, offer });
            } catch (e) {
                console.error('Error creating offer:', e);
            }
        }
        
        return pc;
    }
    
    closePeerConnection(remoteId) {
        const pc = this.peerConnections.get(remoteId);
        if (pc) {
            pc.close();
            this.peerConnections.delete(remoteId);
        }
        const audioEl = this.remoteAudioElements.get(remoteId);
        if (audioEl) {
            audioEl.srcObject = null;
            audioEl.remove();
            this.remoteAudioElements.delete(remoteId);
        }
    }
    
    handleRemoteStream(remoteId, remoteName, stream) {
        let audioEl = this.remoteAudioElements.get(remoteId);
        if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.autoplay = true;
            audioEl.playsInline = true;
            audioEl.id = `remote-audio-${remoteId}`;
            document.body.appendChild(audioEl);
            this.remoteAudioElements.set(remoteId, audioEl);
        }
        audioEl.srcObject = stream;
        
        this.addRemoteSpeaker(remoteId, remoteName, stream, true);
    }
    
    handleRemoteVideoTrack(remoteId, remoteName, stream) {
        console.log('Received remote video from:', remoteName);
        if (this.isScreenSharing) return;
        
        const container = document.getElementById('screenshare-container');
        const videoEl = document.getElementById('screenshare-video');
        const stopBtn = document.getElementById('screenshare-stop');
        const headerSpan = container?.querySelector('.screenshare-header span');
        
        if (videoEl && stream) {
            videoEl.srcObject = stream;
            container?.classList.remove('hidden');
            if (stopBtn) stopBtn.style.display = 'none';
            if (headerSpan) headerSpan.innerHTML = `<i class="fas fa-desktop"></i> ${remoteName} is sharing`;
            this._remoteVideoActive = true;
            this._remoteVideoSenderId = remoteId;
            
            stream.getVideoTracks()[0].onended = () => {
                this.hideRemoteVideo();
            };
        }
    }
    
    hideRemoteVideo() {
        if (this.isScreenSharing) return;
        
        const container = document.getElementById('screenshare-container');
        const videoEl = document.getElementById('screenshare-video');
        const stopBtn = document.getElementById('screenshare-stop');
        const headerSpan = container?.querySelector('.screenshare-header span');
        
        if (videoEl) videoEl.srcObject = null;
        container?.classList.add('hidden');
        if (stopBtn) stopBtn.style.display = '';
        if (headerSpan) headerSpan.innerHTML = '<i class="fas fa-desktop"></i> Screen Share';
        this._remoteVideoActive = false;
        this._remoteVideoSenderId = null;
    }
    
    async renegotiatePeer(peerId, pc) {
        if (pc.signalingState !== 'stable') {
            await new Promise(resolve => {
                const check = () => {
                    if (pc.signalingState === 'stable') resolve();
                    else setTimeout(check, 100);
                };
                check();
                setTimeout(resolve, 3000);
            });
        }
        if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.socket.emit('webrtc-offer', { targetId: peerId, offer });
        }
    }
    
    async addVideoTrackToPeers(stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        for (const [peerId, pc] of this.peerConnections) {
            try {
                if (pc._videoSender) {
                    pc._videoSender.replaceTrack(videoTrack);
                } else {
                    pc._videoSender = pc.addTrack(videoTrack, stream);
                }
            } catch (e) {
                console.error('Error adding video track to peer:', peerId, e);
            }
        }
        
        for (const [peerId, pc] of this.peerConnections) {
            try {
                await this.renegotiatePeer(peerId, pc);
            } catch (e) {
                console.error('Error renegotiating with peer:', peerId, e);
            }
        }
    }
    
    async removeVideoTrackFromPeers() {
        let needsRenegotiation = false;
        for (const [peerId, pc] of this.peerConnections) {
            try {
                if (pc._videoSender) {
                    pc.removeTrack(pc._videoSender);
                    pc._videoSender = null;
                    needsRenegotiation = true;
                }
            } catch (e) {
                console.error('Error removing video track from peer:', peerId, e);
            }
        }
        
        if (needsRenegotiation) {
            for (const [peerId, pc] of this.peerConnections) {
                try {
                    await this.renegotiatePeer(peerId, pc);
                } catch (e) {
                    console.error('Error renegotiating with peer:', peerId, e);
                }
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
            case 'screenshare-permission':
                this.screenshareEnabled = data.enabled;
                this.updateScreenshareButtonState();
                this.addChatMessage('System', `Screen share ${data.enabled ? 'enabled' : 'disabled'} by host.`, true);
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
                break;
            case 'mute-status':
                break;
            case 'host-changed':
                this.addChatMessage('System', `${data.newHostName} is now the host.`, true);
                break;
            case 'youtube-embed':
                this.addChatMessage('System', `${data.userName} is playing a YouTube video for karaoke.`, true);
                break;
            case 'karaoke-start':
                this.addChatMessage('System', `${data.userName} started karaoke!`, true);
                break;
            case 'karaoke-stop':
                this.addChatMessage('System', `${data.userName} stopped karaoke.`, true);
                if (this._remoteVideoSenderId && data.userId) {
                    const senderSocketId = this.findSocketByUserId(data.userId);
                    if (!senderSocketId || senderSocketId === this._remoteVideoSenderId) {
                        this.hideRemoteVideo();
                    }
                }
                break;
            case 'screenshare-start':
                this.addChatMessage('System', `${data.userName || 'A participant'} started sharing their screen.`, true);
                break;
            case 'screenshare-stop':
                this.addChatMessage('System', `${data.userName || 'A participant'} stopped sharing their screen.`, true);
                if (this._remoteVideoSenderId && data.userId) {
                    const senderSocketId = this.findSocketByUserId(data.userId);
                    if (!senderSocketId || senderSocketId === this._remoteVideoSenderId) {
                        this.hideRemoteVideo();
                    }
                } else {
                    this.hideRemoteVideo();
                }
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
    
    initializeWebRTC() {
        console.log('Initializing WebRTC connections...');
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
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.isAudioMuted = !audioTrack.enabled;
                
                this.toggleAudioBtn?.classList.toggle('muted', this.isAudioMuted);
                if (this.toggleAudioBtn) {
                    this.toggleAudioBtn.innerHTML = this.isAudioMuted ? 
                        '<i class="fas fa-microphone-slash"></i>' : 
                        '<i class="fas fa-microphone"></i>';
                }
            }
        }
    }

    shareMusic() {
        // Open a song search modal or share current song being discussed
        console.log('Share music functionality - search for a song to share');
        // This could integrate with the lyrics search API
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
        const featureLabel = data.feature === 'karaoke' ? 'Karaoke' : 'Screen Share';
        this.addChatMessage('System', `${data.userName}'s ${featureLabel} request was approved.`, true);
        
        if (data.feature === 'karaoke') {
            this.karaokeModal?.classList.add('active');
        } else if (data.feature === 'screenshare') {
            this.startScreenShareAfterApproval().catch(e => console.error('Screen share after approval error:', e));
        }
    }
    
    async startScreenShareAfterApproval() {
        if (!this.isScreenShareSupported() || this.isMobileDevice()) {
            this.addChatMessage('System', 'Screen sharing is only available on desktop browsers.', true);
            return;
        }
        
        try {
            this.screenshareStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            
            const screenshareVideo = document.getElementById('screenshare-video');
            const screenshareContainer = document.getElementById('screenshare-container');
            const screenshareBtn = document.getElementById('screenshare-btn');
            
            if (screenshareVideo && this.screenshareStream) {
                screenshareVideo.srcObject = this.screenshareStream;
                screenshareContainer?.classList.remove('hidden');
                screenshareBtn?.classList.add('sharing');
                this.isScreenSharing = true;
                
                this.addChatMessage('System', 'You started sharing your screen.', true);
                this.notifyParticipants('screenshare-start', { userId: 'currentUser' });
                
                await this.addVideoTrackToPeers(this.screenshareStream);
                
                this.screenshareStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenShare();
                };
            }
        } catch (error) {
            console.error('Screen share error:', error);
            if (error.name === 'NotAllowedError') {
                this.addChatMessage('System', 'Screen sharing was cancelled.', true);
            } else {
                this.addChatMessage('System', 'Failed to start screen sharing. Try using a desktop browser.', true);
            }
        }
    }
    
    handlePermissionDenied(data) {
        const featureLabel = data.feature === 'karaoke' ? 'Karaoke' : 'Screen Share';
        this.addChatMessage('System', `${data.userName}'s ${featureLabel} request was denied.`, true);
    }

    leaveRoom() {
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

        this.stopAudioMix();
        
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        this.remoteAudioElements.forEach(el => {
            el.srcObject = null;
            el.remove();
        });
        this.remoteAudioElements.clear();
        
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        
        this.isSpeaker = false;
        this.handRaised = false;
        this.chatVisible = true;
        
        this.audioRoom?.classList.add('hidden');
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

    addRemoteSpeaker(participantId, name, stream, isSpeaking = false, userId = null) {
        if (document.querySelector(`[data-participant-id="${participantId}"]`)) return;
        
        const initial = (name || '?').charAt(0).toUpperCase();
        const speakerAvatar = document.createElement('div');
        speakerAvatar.className = 'speaker-avatar';
        speakerAvatar.setAttribute('data-participant-id', participantId);
        if (userId) speakerAvatar.setAttribute('data-user-id', userId);
        speakerAvatar.style.cursor = userId ? 'pointer' : 'default';
        speakerAvatar.innerHTML = `
            <div class="avatar-ring ${isSpeaking ? 'speaking' : ''}">
                <div class="avatar-initial" style="width:80px;height:80px;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;color:white;">${initial}</div>
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
        
        if (userId && typeof viewUserProfile === 'function') {
            speakerAvatar.addEventListener('click', () => viewUserProfile(userId));
        }
        
        this.speakersStage?.appendChild(speakerAvatar);
        
        return speakerAvatar;
    }

    addRemoteListener(participantId, name, handRaised = false, userId = null) {
        const initial = (name || '?').charAt(0).toUpperCase();
        const listenerAvatar = document.createElement('div');
        listenerAvatar.className = `listener-avatar ${handRaised ? 'hand-raised' : ''}`;
        listenerAvatar.setAttribute('data-participant-id', participantId);
        if (userId) listenerAvatar.setAttribute('data-user-id', userId);
        listenerAvatar.style.cursor = userId ? 'pointer' : 'default';
        listenerAvatar.innerHTML = `
            <div class="avatar-initial" style="width:40px;height:40px;border-radius:50%;background:var(--purple,#8a2be2);display:flex;align-items:center;justify-content:center;font-weight:bold;color:white;">${initial}</div>
        `;
        listenerAvatar.title = name;
        
        if (userId && typeof viewUserProfile === 'function') {
            listenerAvatar.addEventListener('click', () => viewUserProfile(userId));
        }
        
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
            // Create audio context if it doesn't exist
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Get the audio track
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (!audioTrack) return;
            
            // Create media stream source
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            
            // Create destination
            const destination = this.audioContext.createMediaStreamDestination();
            
            // Clear previous filter chain
            if (this.audioFilterNodes.source) {
                this.audioFilterNodes.source.disconnect();
            }
            
            // Apply filter based on type
            let outputNode = source;
            
            switch (filterType) {
                case 'helium':
                    // Pitch shift up (high-pitched voice)
                    // Using a simple gain and playback rate simulation
                    const heliumGain = this.audioContext.createGain();
                    heliumGain.gain.value = 1.2;
                    source.connect(heliumGain);
                    outputNode = heliumGain;
                    console.log('Helium filter applied - voice pitched up');
                    break;
                    
                case 'alien':
                    // Ring modulator effect for robotic sound
                    const oscillator = this.audioContext.createOscillator();
                    const alienGain = this.audioContext.createGain();
                    oscillator.frequency.value = 30; // Low frequency modulation
                    oscillator.type = 'sine';
                    alienGain.gain.value = 0.5;
                    oscillator.connect(alienGain);
                    oscillator.start();
                    source.connect(alienGain);
                    outputNode = alienGain;
                    console.log('Alien filter applied - robotic modulation');
                    break;
                    
                case 'deep':
                    // Low-pass filter for deeper voice
                    const lowpass = this.audioContext.createBiquadFilter();
                    lowpass.type = 'lowpass';
                    lowpass.frequency.value = 800;
                    lowpass.Q.value = 1;
                    const deepGain = this.audioContext.createGain();
                    deepGain.gain.value = 1.5;
                    source.connect(lowpass);
                    lowpass.connect(deepGain);
                    outputNode = deepGain;
                    console.log('Deep filter applied - lower frequencies emphasized');
                    break;
                    
                case 'echo':
                    // Delay/reverb effect
                    const delay = this.audioContext.createDelay();
                    delay.delayTime.value = 0.3;
                    const feedback = this.audioContext.createGain();
                    feedback.gain.value = 0.4;
                    const echoGain = this.audioContext.createGain();
                    echoGain.gain.value = 0.8;
                    source.connect(echoGain);
                    source.connect(delay);
                    delay.connect(feedback);
                    feedback.connect(delay);
                    delay.connect(echoGain);
                    outputNode = echoGain;
                    console.log('Echo filter applied - reverb effect');
                    break;
                    
                case 'radio':
                    // Bandpass filter for old radio sound
                    const bandpass = this.audioContext.createBiquadFilter();
                    bandpass.type = 'bandpass';
                    bandpass.frequency.value = 2000;
                    bandpass.Q.value = 0.5;
                    const distortion = this.audioContext.createWaveShaper();
                    distortion.curve = this.makeDistortionCurve(50);
                    source.connect(bandpass);
                    bandpass.connect(distortion);
                    outputNode = distortion;
                    console.log('Radio filter applied - vintage broadcast effect');
                    break;
                    
                case 'normal':
                default:
                    // No filter - direct connection
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
                
                // Replace track in stream (for WebRTC)
                this.localStream.removeTrack(originalTrack);
                this.localStream.addTrack(processedTrack);
                
                // Update any peer connections with the new track
                this.peerConnections.forEach((pc) => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) {
                        sender.replaceTrack(processedTrack);
                    }
                });
                
                console.log(`Audio filter "${filterType}" applied and routed to stream`);
            }
            
        } catch (error) {
            console.error('Error applying audio filter:', error);
        }
    }
    
    resetAudioFilter() {
        // Reset to original unfiltered audio
        if (this.originalAudioTrack && this.localStream) {
            const currentTrack = this.localStream.getAudioTracks()[0];
            if (currentTrack) {
                this.localStream.removeTrack(currentTrack);
            }
            this.localStream.addTrack(this.originalAudioTrack);
            
            // Update peer connections
            this.peerConnections.forEach((pc) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                if (sender) {
                    sender.replaceTrack(this.originalAudioTrack);
                }
            });
            
            // Clear audio context
            if (this.audioContext) {
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
            this.requestPermission('karaoke', 'A participant');
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
        // Show/hide host-only controls based on isRoomHost status
        const hostOnlyControls = [
            document.getElementById('karaoke-toggle-btn'),
            document.getElementById('screenshare-toggle-btn'),
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
    }
    
    // ==========================================
    // SCREEN SHARE FEATURE
    // ==========================================
    
    toggleScreensharePermission() {
        if (!this.isRoomHost) {
            this.addChatMessage('System', 'Only the room host can enable/disable screen sharing.', true);
            return;
        }
        
        this.screenshareEnabled = !this.screenshareEnabled;
        
        const btn = document.getElementById('screenshare-toggle-btn');
        const text = btn?.querySelector('.screenshare-toggle-text');
        
        if (this.screenshareEnabled) {
            btn?.classList.add('active');
            if (text) text.textContent = 'Share: On';
            this.addChatMessage('System', 'Screen sharing enabled! Participants can now share their screen.', true);
        } else {
            btn?.classList.remove('active');
            if (text) text.textContent = 'Share: Off';
            this.addChatMessage('System', 'Screen sharing disabled.', true);
            // Stop any active screen share
            if (this.isScreenSharing) {
                this.stopScreenShare();
            }
        }
        
        this.notifyParticipants('screenshare-permission', { enabled: this.screenshareEnabled });
        this.updateScreenshareButtonState();
    }
    
    updateScreenshareButtonState() {
        const screenshareBtn = document.getElementById('screenshare-btn');
        if (screenshareBtn) {
            if (this.screenshareEnabled) {
                screenshareBtn.classList.remove('disabled');
                screenshareBtn.title = 'Share your screen';
            } else {
                screenshareBtn.classList.add('disabled');
                screenshareBtn.title = 'Screen sharing disabled by host';
            }
        }
    }
    
    requestPermission(feature, userName) {
        const requestId = Date.now().toString();
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
        
        const featureLabel = feature === 'karaoke' ? 'Karaoke' : 'Screen Share';
        const featureIcon = feature === 'karaoke' ? 'fa-compact-disc' : 'fa-desktop';
        
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
        } else if (feature === 'screenshare') {
            if (!this.screenshareEnabled) {
                this.screenshareEnabled = true;
                const btn = document.getElementById('screenshare-toggle-btn');
                const text = btn?.querySelector('.screenshare-toggle-text');
                btn?.classList.add('active');
                if (text) text.textContent = 'Share: On';
                this.updateScreenshareButtonState();
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
    
    isScreenShareSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
    }
    
    async startScreenShare() {
        if (!this.isRoomHost) {
            if (!this.isScreenShareSupported() || this.isMobileDevice()) {
                this.addChatMessage('System', 'Screen sharing is only available on desktop browsers.', true);
                return;
            }
            this.requestPermission('screenshare', 'A participant');
            return;
        }
        
        if (!this.isScreenShareSupported() || this.isMobileDevice()) {
            this.addChatMessage('System', 'Screen sharing is only available on desktop browsers. Mobile devices do not support this feature.', true);
            return;
        }
        
        if (!this.screenshareEnabled) {
            this.screenshareEnabled = true;
            this.updateScreenshareButtonState();
            const btn = document.getElementById('screenshare-toggle-btn');
            const text = btn?.querySelector('.screenshare-toggle-text');
            btn?.classList.add('active');
            if (text) text.textContent = 'Share: On';
            this.addChatMessage('System', 'Screen sharing enabled!', true);
        }
        
        if (this.isScreenSharing) {
            this.stopScreenShare();
            return;
        }
        
        try {
            this.screenshareStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: false
            });
            
            const screenshareVideo = document.getElementById('screenshare-video');
            const screenshareContainer = document.getElementById('screenshare-container');
            const screenshareBtn = document.getElementById('screenshare-btn');
            
            if (screenshareVideo && this.screenshareStream) {
                screenshareVideo.srcObject = this.screenshareStream;
                screenshareContainer?.classList.remove('hidden');
                screenshareBtn?.classList.add('sharing');
                this.isScreenSharing = true;
                
                this.addChatMessage('System', 'You started sharing your screen.', true);
                this.notifyParticipants('screenshare-start', { userId: 'currentUser' });
                
                await this.addVideoTrackToPeers(this.screenshareStream);
                
                this.screenshareStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenShare();
                };
            }
        } catch (error) {
            console.error('Screen share error:', error);
            if (error.name === 'NotAllowedError') {
                this.addChatMessage('System', 'Screen sharing was cancelled.', true);
            } else if (error.name === 'NotSupportedError') {
                this.addChatMessage('System', 'Screen sharing is not supported in this browser.', true);
            } else {
                this.addChatMessage('System', 'Failed to start screen sharing. Try using a desktop browser.', true);
            }
        }
    }
    
    async stopScreenShare() {
        await this.removeVideoTrackFromPeers();
        
        if (this.screenshareStream) {
            this.screenshareStream.getTracks().forEach(track => track.stop());
            this.screenshareStream = null;
        }
        
        const screenshareVideo = document.getElementById('screenshare-video');
        const screenshareContainer = document.getElementById('screenshare-container');
        const screenshareBtn = document.getElementById('screenshare-btn');
        
        if (screenshareVideo) {
            screenshareVideo.srcObject = null;
        }
        screenshareContainer?.classList.add('hidden');
        screenshareBtn?.classList.remove('sharing');
        this.isScreenSharing = false;
        
        this.addChatMessage('System', 'Screen sharing stopped.', true);
        this.notifyParticipants('screenshare-stop', { userId: 'currentUser' });
    }
    
    // ==========================================
    // KARAOKE VIDEO FEATURE
    // ==========================================
    
    async toggleKaraokeCamera() {
        // Check if karaoke is enabled
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
            if (videoEl) videoEl.style.display = '';

            await this.removeVideoTrackFromPeers();
            
            if (this.karaokeVideoStream) {
                this.karaokeVideoStream.getTracks().forEach(track => track.stop());
                this.karaokeVideoStream = null;
            }
            if (videoEl) videoEl.srcObject = null;
            placeholder?.classList.remove('hidden');
            cameraBtn?.classList.remove('active');
            this.karaokeVideoActive = false;
            this.restoreOriginalVideoTrack();
            this.notifyParticipants('karaoke-stop', {});
        } else {
            try {
                this.karaokeVideoStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'user', width: 320, height: 240 },
                    audio: false
                });
                
                if (videoEl && this.karaokeVideoStream) {
                    videoEl.srcObject = this.karaokeVideoStream;
                    placeholder?.classList.add('hidden');
                    cameraBtn?.classList.add('active');
                    this.karaokeVideoActive = true;
                    
                    this.setVideoFilter(this.currentVideoFilter);
                    
                    await this.addVideoTrackToPeers(this.karaokeVideoStream);
                    this.notifyParticipants('karaoke-start', {});
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

        const canvas = document.getElementById('karaoke-canvas');

        if (filter === 'beautify' || filter === 'bg-blur') {
            this.startCanvasFilter(filter);
            if (canvas) canvas.style.display = 'block';
            if (videoEl) videoEl.style.display = 'none';
        } else {
            if (canvas) canvas.style.display = 'none';
            if (videoEl) videoEl.style.display = '';
            videoEl?.classList.add(`filter-${filter}`);
            this.restoreOriginalVideoTrack();
        }

        this.currentVideoFilter = filter;
        
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
    }

    startCanvasFilter(filter) {
        const videoEl = document.getElementById('karaoke-video');
        let canvas = document.getElementById('karaoke-canvas');
        const container = document.getElementById('karaoke-video-container');

        if (!canvas && container) {
            canvas = document.createElement('canvas');
            canvas.id = 'karaoke-canvas';
            canvas.width = 320;
            canvas.height = 240;
            canvas.className = 'karaoke-canvas-overlay';
            container.appendChild(canvas);
        }

        if (!canvas || !videoEl) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.karaokeCanvas = canvas;
        this.karaokeCanvasCtx = ctx;

        const renderFrame = () => {
            if (!this.karaokeVideoActive) return;

            if (filter === 'beautify') {
                ctx.filter = 'blur(1px) brightness(1.08) contrast(0.95) saturate(1.1)';
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.filter = 'none';
                ctx.globalAlpha = 0.5;
                ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1.0;
            } else if (filter === 'bg-blur') {
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
            }

            this.canvasFilterRAF = requestAnimationFrame(renderFrame);
        };

        this.canvasFilterRAF = requestAnimationFrame(renderFrame);

        this.updateBroadcastStream();
    }

    updateBroadcastStream() {
        if (this.previewMode) return;

        const canvas = document.getElementById('karaoke-canvas');
        if (!canvas || !this.karaokeVideoActive) return;

        try {
            if (!this.canvasStream) {
                this.canvasStream = canvas.captureStream(15);
            }
            const canvasTrack = this.canvasStream.getVideoTracks()[0];
            if (!canvasTrack) return;

            this.peerConnections.forEach((pc) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) {
                    sender.replaceTrack(canvasTrack);
                }
            });
        } catch (e) {
            console.error('Error updating broadcast stream:', e);
        }
    }

    restoreOriginalVideoTrack() {
        if (!this.karaokeVideoStream) return;
        const originalTrack = this.karaokeVideoStream.getVideoTracks()[0];
        if (!originalTrack) return;

        this.peerConnections.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (sender) {
                sender.replaceTrack(originalTrack);
            }
        });
    }

    togglePreviewMode() {
        this.previewMode = !this.previewMode;
        const btn = document.getElementById('karaoke-preview-toggle');
        const icon = btn?.querySelector('i');
        const label = btn?.querySelector('.btn-label');

        if (this.previewMode) {
            if (icon) icon.className = 'fas fa-eye';
            if (label) label.textContent = 'Preview';
            btn?.classList.add('active');
            this.peerConnections.forEach((pc) => {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(null);
            });
            this.addChatMessage('System', 'Preview mode ON — camera visible only to you.', true);
        } else {
            if (icon) icon.className = 'fas fa-broadcast-tower';
            if (label) label.textContent = 'Live';
            btn?.classList.remove('active');
            if (this.currentVideoFilter === 'beautify' || this.currentVideoFilter === 'bg-blur') {
                this.updateBroadcastStream();
            } else {
                this.restoreOriginalVideoTrack();
            }
            this.addChatMessage('System', 'You are now LIVE — camera visible to the room.', true);
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
    
    stopKaraoke() {
        if (this.isRecording) this.stopRecording();
        this.stopMicTempo();

        this.karaokeActive = false;
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

    // YouTube Player Integration
    initYouTubePlayer() {
        console.log('YouTube embed mode ready');
        this.youtubeReady = true;
    }
    
    onYouTubeApiReady() {
        this.youtubeReady = true;
    }
    
    createYouTubePlayer() {
    }
    
    updateAudioStatus(state, message) {
        const statusEl = document.getElementById('audio-status');
        if (statusEl) {
            statusEl.className = `audio-status ${state}`;
            statusEl.querySelector('span').textContent = message;
        }
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
        const iframe = document.getElementById('yt-embed-iframe');
        if (!wrapper || !iframe) return;
        
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
        wrapper.style.display = '';
        this.currentVideoId = videoId;
        this.updateAudioStatus('playing', 'Playing');
        
        this.showShareAudioButton();
        
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
        const wrapper = document.getElementById('yt-embed-wrapper');
        const iframe = document.getElementById('yt-embed-iframe');
        if (iframe) iframe.src = '';
        if (wrapper) wrapper.style.display = 'none';
        const shareBtn = document.getElementById('yt-share-audio-btn');
        if (shareBtn) shareBtn.style.display = 'none';
        this.currentVideoId = null;
        this.stopAudioMix();
        this.updateAudioStatus('ready', 'Video closed');
    }
    
    async startAudioMix() {
        if (this.audioMixEnabled) return;
        if (!this.localStream) {
            console.warn('No local stream for audio mixing');
            return;
        }
        
        try {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.mixDestination = this.audioContext.createMediaStreamDestination();
            
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
            
            this.mixedStream = this.mixDestination.stream;
            this.audioMixEnabled = true;
            
            this.replaceOutgoingAudioTrack(this.mixedStream.getAudioTracks()[0]);
            
            this.addChatMessage('System', 'Audio mixing enabled — your mic is ready for YouTube audio.', true);
            console.log('Audio mixing initialized (mic only, waiting for YouTube audio)');
            
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
            
            const iframe = document.getElementById('yt-embed-iframe');
            if (!iframe) {
                console.warn('No YouTube iframe found for audio capture');
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
            ytGain.gain.value = 0.8;
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
    
    replaceOutgoingAudioTrack(newTrack) {
        if (!newTrack) return;
        this.peerConnections.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
            if (sender) {
                sender.replaceTrack(newTrack);
            }
        });
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
    const audioRoomsManager = new AudioRoomsManager();
    window.audioRoomsManager = audioRoomsManager;
});

// Handle page parameters (if joining via direct link)
const urlParams = new URLSearchParams(window.location.search);
const roomToJoin = urlParams.get('room');
if (roomToJoin) {
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
        } else {
            setTimeout(() => {
                window.audioRoomsManager?.joinRoom(roomToJoin);
            }, 1500);
        }
    });
}