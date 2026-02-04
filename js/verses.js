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
        this.youtubePlayer = null;
        this.youtubeReady = false;
        this.currentVideoId = null;
        this.karaokeEnabled = false; // Host/moderator permission for karaoke
        this.isRoomHost = false; // Track if current user created the room
        
        // Screen share state
        this.screenshareEnabled = false;
        this.screenshareStream = null;
        this.isScreenSharing = false;
        
        // Karaoke video state
        this.karaokeVideoStream = null;
        this.karaokeVideoActive = false;
        this.currentVideoFilter = 'none';
        
        this.initYouTubePlayer();
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectToServer();
        this.loadActiveRooms();
        this.loadReplays();
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
        this.shareMusicBtn?.addEventListener('click', () => this.shareMusic());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());

        // Action buttons
        this.addUsersBtn?.addEventListener('click', () => this.showAddUsersModal());
        this.replayBtn?.addEventListener('click', () => this.showReplayModal());
        
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
        
        // Karaoke video controls
        document.getElementById('karaoke-camera-toggle')?.addEventListener('click', () => this.toggleKaraokeCamera());
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
        
        // Karaoke controls
        document.getElementById('karaoke-play-pause')?.addEventListener('click', () => this.toggleKaraokePlayback());
        document.getElementById('karaoke-restart')?.addEventListener('click', () => this.restartKaraoke());
        document.getElementById('karaoke-stop')?.addEventListener('click', () => this.stopKaraoke());

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
        setTimeout(() => {
            console.log('Connected to signaling server');
        }, 1000);
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
        return [
            {
                id: 'room1',
                name: 'Hip-Hop Classics Deep Dive',
                topic: 'Analyzing "Lose Yourself" by Eminem - The psychology behind the lyrics',
                genre: 'hip-hop',
                participants: [
                    { name: 'Alex', avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face' },
                    { name: 'Sam', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face' },
                    { name: 'Jamie', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face' }
                ],
                participantCount: 5,
                maxParticipants: 8,
                duration: '23 min',
                messageCount: 47,
                isFeatured: true,
                isLocked: false
            },
            {
                id: 'room2',
                name: 'Rock Legends Unplugged',
                topic: 'Queen\'s "Bohemian Rhapsody" - Breaking down the masterpiece',
                genre: 'rock',
                participants: [
                    { name: 'Mike', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face' },
                    { name: 'Sarah', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face' },
                    { name: 'David', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face' }
                ],
                participantCount: 3,
                maxParticipants: 6,
                duration: '15 min',
                messageCount: 23,
                isFeatured: false,
                isLocked: false
            },
            {
                id: 'room3',
                name: 'Pop Culture & Music',
                topic: 'Taylor Swift\'s evolution as a songwriter',
                genre: 'pop',
                participants: [
                    { name: 'Emma', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face' },
                    { name: 'Chris', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face' }
                ],
                participantCount: 2,
                maxParticipants: 4,
                duration: '8 min',
                messageCount: 12,
                isFeatured: false,
                isLocked: false
            }
        ];
    }

    renderRooms(rooms) {
        const roomsGrid = document.querySelector('.rooms-grid');
        if (roomsGrid) {
            roomsGrid.innerHTML = rooms.map(room => this.createRoomCard(room)).join('');
        }
    }

    createRoomCard(room) {
        const participantAvatars = room.participants.slice(0, 3).map(p => 
            `<div class="participant-avatar">
                <img src="${p.avatar}" alt="${p.name}">
                ${p.name === 'Alex' ? '<div class="speaking-indicator"></div>' : ''}
            </div>`
        ).join('');

        const moreParticipants = room.participantCount > 3 ? 
            `<div class="more-participants">+${room.participantCount - 3}</div>` : '';

        const genreIcon = this.getGenreIcon(room.genre);
        const featuredBadge = room.isFeatured ? 
            `<div class="room-badge">
                <i class="fas fa-fire"></i>
                <span>Trending</span>
            </div>` : '';

        return `
            <div class="room-card ${room.isFeatured ? 'featured' : ''}" data-room-id="${room.id}" data-genre="${room.genre}">
                ${featuredBadge}
                <div class="room-preview">
                    <div class="participants-preview">
                        ${participantAvatars}
                        ${moreParticipants}
                    </div>
                    <div class="room-info">
                        <div class="room-genre">
                            ${genreIcon}
                            <span>${this.capitalizeFirst(room.genre)}</span>
                        </div>
                        <h3>${room.name}</h3>
                        <p class="room-topic">${room.topic}</p>
                        <div class="room-stats">
                            <span class="stat">
                                <i class="fas fa-users"></i>
                                ${room.participantCount}/${room.maxParticipants}
                            </span>
                            <span class="stat">
                                <i class="fas fa-clock"></i>
                                ${room.duration}
                            </span>
                            <span class="stat">
                                <i class="fas fa-comments"></i>
                                ${room.messageCount}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="room-actions">
                    <button class="join-room-btn primary">
                        <i class="fas fa-play"></i>
                        Join Room
                    </button>
                    <button class="preview-btn">
                        <i class="fas fa-eye"></i>
                        Preview
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

        const users = await this.mockUserSearch(query);
        this.renderSearchResults(users);
    }

    async mockUserSearch(query) {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const mockUsers = [
            { 
                id: 'user1', 
                username: 'musiclover123', 
                displayName: 'Alex Johnson', 
                phoneNumber: '+1 (555) 123-4567',
                avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face' 
            },
            { 
                id: 'user2', 
                username: 'hiphopfan', 
                displayName: 'Sam Wilson', 
                phoneNumber: '+1 (555) 234-5678',
                avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face' 
            },
            { 
                id: 'user3', 
                username: 'rockstar', 
                displayName: 'Jamie Brown', 
                phoneNumber: '+1 (555) 345-6789',
                avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face' 
            },
            { 
                id: 'user4', 
                username: 'jazzcat', 
                displayName: 'Mia Davis', 
                phoneNumber: '+1 (555) 456-7890',
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face' 
            }
        ];

        const searchTerm = query.toLowerCase();
        return mockUsers.filter(user => 
            user.username.toLowerCase().includes(searchTerm) ||
            user.displayName.toLowerCase().includes(searchTerm) ||
            user.id.includes(searchTerm) ||
            user.phoneNumber.includes(searchTerm)
        );
    }

    renderSearchResults(users) {
        const resultsContainer = document.getElementById('search-results');
        if (resultsContainer) {
            if (users.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="no-results">
                        <p>No users found matching "${document.getElementById('user-search-input').value}"</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = users.map(user => `
                <div class="search-result-item">
                    <div class="search-result-avatar">
                        <img src="${user.avatar}" alt="${user.displayName}">
                    </div>
                    <div class="search-result-info">
                        <div class="search-result-name">${user.displayName}</div>
                        <div class="search-result-id">@${user.username}</div>
                        <div class="search-result-phone">📞 ${user.phoneNumber}</div>
                    </div>
                    <button class="invite-btn" data-user-id="${user.id}">Invite</button>
                </div>
            `).join('');
        }
    }

    inviteUser(userId) {
        console.log('Inviting user:', userId);
        
        // Get user details for the invitation
        const userElement = document.querySelector(`[data-user-id="${userId}"]`).closest('.search-result-item');
        const userName = userElement.querySelector('.search-result-name').textContent;
        const userPhone = userElement.querySelector('.search-result-phone').textContent.replace('📞 ', '');
        
        // Show invitation confirmation
        const confirmed = confirm(`Send invitation to ${userName}?\n\nPhone: ${userPhone}\n\nThis will send an SMS invitation to join the room.`);
        
        if (confirmed) {
            // Simulate sending SMS invitation
            this.sendSMSInvitation(userPhone, userName);
            alert('Invitation sent successfully! 📱');
        }
    }

    sendSMSInvitation(phoneNumber, userName) {
        // This would integrate with an SMS service like Twilio
        console.log(`Sending SMS invitation to ${phoneNumber} for user ${userName}`);
        
        // Mock SMS content
        const message = `🎵 You're invited to join a music discussion room on Wordeth!\n\nClick here to join: https://wordeth.com/join/${this.currentRoom}\n\nFrom: Wordeth Team`;
        
        // In a real implementation, this would call an SMS API
        console.log('SMS Content:', message);
    }

    // Chat Management
    toggleChat() {
        this.chatVisible = !this.chatVisible;
        this.chatSection?.classList.toggle('hidden', !this.chatVisible);
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
        
        this.notifyParticipants('chat-message', { message, sender: 'currentUser' });
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
            // Check if room is locked (door lock feature)
            const roomData = await this.checkRoomLockStatus(roomId);
            if (roomData && roomData.isLocked) {
                alert('This room is currently locked. The host has prevented new participants from joining.');
                return;
            }
            
            // Set host status
            this.isRoomHost = isHost;
            
            // Reset karaoke and screen share state for new room
            this.karaokeEnabled = isHost ? false : (roomData?.karaokeEnabled || false);
            this.screenshareEnabled = isHost ? false : (roomData?.screenshareEnabled || false);
            this.updateKaraokeButtonState();
            this.updateScreenshareButtonState();
            this.updateHostControls();
            
            if (this.isSpeaker) {
                await this.initializeMedia();
            }
            
            if (this.roomSelection) this.roomSelection.style.display = 'none';
            this.audioRoom?.classList.remove('hidden');
            
            this.currentRoom = roomId;
            this.updateRoomInfo(roomId);
            this.initializeWebRTC();
            this.addChatMessage('System', 'Welcome to the room!', true);
            
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
                audio: true
            });
            
        } catch (error) {
            console.error('Error accessing audio device:', error);
            throw error;
        }
    }

    initializeWebRTC() {
        console.log('Initializing WebRTC connections...');
    }

    updateRoomInfo(roomId) {
        const roomName = document.getElementById('room-name');
        const currentSong = document.getElementById('current-song');
        
        if (roomName) roomName.textContent = 'Hip-Hop Classics Deep Dive';
        if (currentSong) currentSong.textContent = 'Currently discussing: "Lose Yourself" by Eminem';
        if (this.participantCount) this.participantCount.textContent = '3 participants';
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
    }

    leaveRoom() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        this.peerConnections.forEach(pc => pc.close());
        this.peerConnections.clear();
        
        this.isSpeaker = false;
        this.handRaised = false;
        this.chatVisible = true;
        
        this.audioRoom?.classList.add('hidden');
        if (this.roomSelection) this.roomSelection.style.display = 'block';
        this.currentRoom = null;
        
        if (this.chatMessagesContainer) this.chatMessagesContainer.innerHTML = '';
        
        this.loadActiveRooms();
    }

    addRemoteSpeaker(participantId, name, stream, isSpeaking = false) {
        const speakerAvatar = document.createElement('div');
        speakerAvatar.className = 'speaker-avatar';
        speakerAvatar.setAttribute('data-participant-id', participantId);
        speakerAvatar.innerHTML = `
            <div class="avatar-ring ${isSpeaking ? 'speaking' : ''}">
                <img src="https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face" alt="${name}">
            </div>
            <div class="speaker-info">
                <span class="speaker-name">${name}</span>
                <span class="speaker-role">Speaker</span>
            </div>
            <div class="speaker-status">
                <i class="fas fa-microphone"></i>
            </div>
        `;
        
        // Store audio stream for audio processing
        speakerAvatar.audioStream = stream;
        
        this.speakersStage?.appendChild(speakerAvatar);
        
        return speakerAvatar;
    }

    addRemoteListener(participantId, name, handRaised = false) {
        const listenerAvatar = document.createElement('div');
        listenerAvatar.className = `listener-avatar ${handRaised ? 'hand-raised' : ''}`;
        listenerAvatar.setAttribute('data-participant-id', participantId);
        listenerAvatar.innerHTML = `
            <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face" alt="${name}">
        `;
        listenerAvatar.title = name;
        
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
        // Check if karaoke is enabled by host/moderator
        if (!this.karaokeEnabled) {
            this.addChatMessage('System', 'Karaoke is currently disabled. Ask the host to enable it.', true);
            return;
        }
        this.karaokeModal?.classList.add('active');
        
        // Retry YouTube player creation if not ready
        if (!this.youtubeReady && window.YT && window.YT.Player) {
            this.createYouTubePlayer();
        }
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
    
    async startScreenShare() {
        if (!this.screenshareEnabled) {
            this.addChatMessage('System', 'Screen sharing is disabled. Ask the host to enable it.', true);
            return;
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
                
                // Handle when user stops sharing via browser UI
                this.screenshareStream.getVideoTracks()[0].onended = () => {
                    this.stopScreenShare();
                };
            }
        } catch (error) {
            console.error('Screen share error:', error);
            if (error.name !== 'NotAllowedError') {
                this.addChatMessage('System', 'Failed to start screen sharing.', true);
            }
        }
    }
    
    stopScreenShare() {
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
            // Stop camera
            if (this.karaokeVideoStream) {
                this.karaokeVideoStream.getTracks().forEach(track => track.stop());
                this.karaokeVideoStream = null;
            }
            if (videoEl) videoEl.srcObject = null;
            placeholder?.classList.remove('hidden');
            cameraBtn?.classList.remove('active');
            this.karaokeVideoActive = false;
        } else {
            // Start camera
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
                    
                    // Apply current filter
                    this.setVideoFilter(this.currentVideoFilter);
                }
            } catch (error) {
                console.error('Camera error:', error);
                this.addChatMessage('System', 'Could not access camera. Please check permissions.', true);
            }
        }
    }
    
    setVideoFilter(filter) {
        const videoEl = document.getElementById('karaoke-video');
        
        // Remove all filter classes
        const filters = ['none', 'grayscale', 'sepia', 'saturate', 'hue-rotate', 'blur'];
        filters.forEach(f => {
            videoEl?.classList.remove(`filter-${f}`);
        });
        
        // Add new filter class
        videoEl?.classList.add(`filter-${filter}`);
        this.currentVideoFilter = filter;
        
        // Update button states
        document.querySelectorAll('.video-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });
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
            const response = await fetch(`/api/lyrics/search?q=${encodeURIComponent(query)}`);
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
            albumArt.src = image || 'https://via.placeholder.com/70';
            albumArt.onerror = () => { albumArt.src = 'https://via.placeholder.com/70?text=Album'; };
        }
        
        // Load YouTube audio in parallel with lyrics
        this.loadYouTubeAudio(artist, title);
        
        // Load lyrics
        try {
            const response = await fetch(`/api/lyrics/lyrics/${songId}`);
            const data = await response.json();
            
            if (data.lyrics && data.lyrics.length > 50) {
                this.parseLyricsForKaraoke(data.lyrics);
                this.addChatMessage('System', `Starting karaoke: "${title}" by ${artist}`, true);
            } else {
                // Use demo lyrics when real lyrics can't be fetched
                this.useDemoLyrics(title, artist);
            }
        } catch (error) {
            console.error('Error loading lyrics:', error);
            // Use demo lyrics as fallback
            this.useDemoLyrics(title, artist);
        }
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
        }
    }
    
    toggleKaraokePlayback() {
        const playPauseBtn = document.getElementById('karaoke-play-pause');
        const icon = playPauseBtn?.querySelector('i');
        
        if (this.karaokeActive) {
            // Pause
            this.karaokeActive = false;
            clearInterval(this.karaokeInterval);
            if (icon) icon.className = 'fas fa-play';
            // Pause YouTube
            if (this.youtubePlayer && this.youtubeReady) {
                this.youtubePlayer.pauseVideo();
            }
        } else {
            // Play
            this.karaokeActive = true;
            if (icon) icon.className = 'fas fa-pause';
            // Play YouTube
            if (this.youtubePlayer && this.youtubeReady && this.currentVideoId) {
                this.youtubePlayer.playVideo();
            }
            this.startLyricScrolling();
        }
    }
    
    startLyricScrolling() {
        // Scroll through lyrics every 3 seconds (approximate line duration)
        this.karaokeInterval = setInterval(() => {
            if (this.currentLyricIndex < this.karaokeLyrics.length - 1) {
                this.currentLyricIndex++;
                this.updateLyricHighlight();
                this.updateProgress();
            } else {
                // End of song
                this.stopKaraoke();
            }
        }, 3000);
    }
    
    updateLyricHighlight() {
        const lyricsContainer = document.getElementById('lyrics-scroll');
        const lines = lyricsContainer?.querySelectorAll('.lyrics-line');
        
        lines?.forEach((line, index) => {
            line.classList.remove('active', 'past');
            if (index === this.currentLyricIndex) {
                line.classList.add('active');
            } else if (index < this.currentLyricIndex) {
                line.classList.add('past');
            }
        });
        
        // Scroll to center the active line
        const activeLine = lyricsContainer?.querySelector('.lyrics-line.active');
        if (activeLine && lyricsContainer) {
            const containerHeight = lyricsContainer.parentElement?.clientHeight || 250;
            const lineTop = activeLine.offsetTop;
            const scrollPos = lineTop - containerHeight / 2 + activeLine.clientHeight / 2;
            lyricsContainer.style.transform = `translateY(-${Math.max(0, scrollPos)}px)`;
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
        
        const lyricsContainer = document.getElementById('lyrics-scroll');
        if (lyricsContainer) {
            lyricsContainer.style.transform = 'translateY(0)';
        }
        
        if (!this.karaokeActive) {
            this.toggleKaraokePlayback();
        }
    }
    
    stopKaraoke() {
        this.karaokeActive = false;
        clearInterval(this.karaokeInterval);
        
        const playPauseBtn = document.getElementById('karaoke-play-pause');
        const icon = playPauseBtn?.querySelector('i');
        if (icon) icon.className = 'fas fa-play';
        
        // Stop YouTube playback
        if (this.youtubePlayer && this.youtubeReady) {
            this.youtubePlayer.stopVideo();
        }
        
        // Reset to beginning
        this.currentLyricIndex = 0;
        this.updateLyricHighlight();
        this.updateProgress();
        
        const lyricsContainer = document.getElementById('lyrics-scroll');
        if (lyricsContainer) {
            lyricsContainer.style.transform = 'translateY(0)';
        }
    }
    
    // YouTube Player Integration
    initYouTubePlayer() {
        // YouTube API will call onYouTubeIframeAPIReady when ready
        window.onYouTubeIframeAPIReady = () => {
            this.createYouTubePlayer();
        };
        
        // If API already loaded
        if (window.YT && window.YT.Player) {
            this.createYouTubePlayer();
        }
    }
    
    createYouTubePlayer() {
        const playerContainer = document.getElementById('youtube-player');
        if (!playerContainer) {
            console.log('YouTube player container not found, will retry when modal opens');
            return;
        }
        
        try {
            this.youtubePlayer = new YT.Player('youtube-player', {
                height: '113',
                width: '200',
                playerVars: {
                    'autoplay': 0,
                    'controls': 1, // Enable controls for better UX
                    'disablekb': 0,
                    'modestbranding': 1,
                    'rel': 0,
                    'showinfo': 0,
                    'fs': 0
                },
                events: {
                    'onReady': () => {
                        console.log('YouTube player ready');
                        this.youtubeReady = true;
                        this.updateAudioStatus('ready', 'Ready to play');
                    },
                    'onStateChange': (event) => this.onYouTubeStateChange(event),
                    'onError': (event) => this.onYouTubeError(event)
                }
            });
        } catch (error) {
            console.error('Error creating YouTube player:', error);
            this.updateAudioStatus('error', 'Player failed to load');
        }
    }
    
    onYouTubeStateChange(event) {
        const statusEl = document.getElementById('audio-status');
        
        switch (event.data) {
            case YT.PlayerState.PLAYING:
                this.updateAudioStatus('playing', 'Playing');
                // Start lyrics sync if not already running
                if (!this.karaokeActive) {
                    this.karaokeActive = true;
                    const playPauseBtn = document.getElementById('karaoke-play-pause');
                    const icon = playPauseBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-pause';
                    this.startLyricScrolling();
                }
                break;
            case YT.PlayerState.PAUSED:
                this.updateAudioStatus('ready', 'Paused');
                if (this.karaokeActive) {
                    this.karaokeActive = false;
                    clearInterval(this.karaokeInterval);
                    const playPauseBtn = document.getElementById('karaoke-play-pause');
                    const icon = playPauseBtn?.querySelector('i');
                    if (icon) icon.className = 'fas fa-play';
                }
                break;
            case YT.PlayerState.ENDED:
                this.updateAudioStatus('ready', 'Finished');
                this.stopKaraoke();
                break;
            case YT.PlayerState.BUFFERING:
                this.updateAudioStatus('playing', 'Buffering...');
                break;
        }
    }
    
    onYouTubeError(event) {
        console.error('YouTube error:', event.data);
        this.updateAudioStatus('error', 'Audio unavailable');
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
            const query = `${artist} ${title} official audio`;
            const response = await fetch(`/api/lyrics/youtube-search?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            
            if (data.videoId) {
                return data.videoId;
            }
            return null;
        } catch (error) {
            console.error('YouTube search error:', error);
            return null;
        }
    }
    
    async loadYouTubeAudio(artist, title) {
        this.updateAudioStatus('playing', 'Finding audio...');
        
        // Wait for YouTube API to be ready (with timeout)
        if (!this.youtubeReady) {
            this.updateAudioStatus('playing', 'Loading player...');
            const ready = await this.waitForYouTubeReady(10000); // 10 second timeout
            if (!ready) {
                this.updateAudioStatus('error', 'Player not ready');
                return false;
            }
        }
        
        const videoId = await this.searchYouTubeAudio(artist, title);
        
        if (videoId && this.youtubePlayer && this.youtubeReady) {
            this.currentVideoId = videoId;
            this.youtubePlayer.loadVideoById(videoId);
            this.youtubePlayer.pauseVideo(); // Load but don't auto-play
            this.updateAudioStatus('ready', 'Audio loaded - Press play');
            return true;
        } else {
            this.updateAudioStatus('error', 'No audio found');
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
        setTimeout(() => {
            window.audioRoomsManager?.joinRoom(roomToJoin);
        }, 1000);
    });
} 