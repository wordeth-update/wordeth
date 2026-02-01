// Video Rooms JavaScript - Enhanced Houseparty-style functionality with Phone Number Support

class VideoRoomsManager {
    constructor() {
        this.currentRoom = null;
        this.localStream = null;
        this.peerConnections = new Map();
        this.socket = null;
        this.isAudioMuted = false;
        this.isVideoMuted = false;
        this.isViewerMode = false;
        this.handRaised = false;
        this.chatVisible = true;
        this.currentFilter = 'none';
        this.chatMessages = [];
        this.replays = [];
        this.currentFilterTab = 'all';
        
        this.initializeElements();
        this.setupEventListeners();
        this.connectToServer();
        this.loadActiveRooms();
        this.loadReplays();
    }

    initializeElements() {
        // Main containers
        this.roomSelection = document.getElementById('room-selection');
        this.videoRoom = document.getElementById('video-room');
        
        // Modals
        this.createRoomModal = document.getElementById('create-room-modal');
        this.createRoomForm = document.getElementById('create-room-form');
        this.addUsersModal = document.getElementById('add-users-modal');
        this.filtersModal = document.getElementById('filters-modal');
        this.replayModal = document.getElementById('replay-modal');
        this.topicEditModal = document.getElementById('topic-edit-modal');
        this.topicEditForm = document.getElementById('topic-edit-form');
        
        // Video elements
        this.localVideo = document.getElementById('local-video');
        this.videoGrid = document.getElementById('video-grid');
        
        // Chat elements
        this.chatSection = document.getElementById('chat-section');
        this.chatMessagesContainer = document.getElementById('chat-messages');
        this.chatInput = document.getElementById('chat-input');
        this.sendMessageBtn = document.getElementById('send-message');
        this.participantCount = document.getElementById('participant-count');
        
        // Control buttons
        this.createRoomBtn = document.getElementById('create-room');
        this.toggleAudioBtn = document.getElementById('toggle-audio');
        this.toggleVideoBtn = document.getElementById('toggle-video');
        this.viewerModeBtn = document.getElementById('viewer-mode');
        this.raiseHandBtn = document.getElementById('raise-hand');
        this.shareScreenBtn = document.getElementById('share-screen');
        this.toggleChatBtn = document.getElementById('toggle-chat');
        this.endCallBtn = document.getElementById('end-call');
        this.leaveRoomBtn = document.getElementById('leave-room');
        
        // Action buttons
        this.addUsersBtn = document.getElementById('add-users');
        this.filtersBtn = document.getElementById('filters-btn');
        this.replayBtn = document.getElementById('replay-btn');
        this.editTopicBtn = document.getElementById('edit-topic');
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
        this.toggleVideoBtn?.addEventListener('click', () => this.toggleVideo());
        this.viewerModeBtn?.addEventListener('click', () => this.toggleViewerMode());
        this.raiseHandBtn?.addEventListener('click', () => this.toggleHandRaise());
        this.shareScreenBtn?.addEventListener('click', () => this.shareScreen());
        this.toggleChatBtn?.addEventListener('click', () => this.toggleChat());
        this.endCallBtn?.addEventListener('click', () => this.leaveRoom());
        this.leaveRoomBtn?.addEventListener('click', () => this.leaveRoom());

        // Action buttons
        this.addUsersBtn?.addEventListener('click', () => this.showAddUsersModal());
        this.filtersBtn?.addEventListener('click', () => this.showFiltersModal());
        this.replayBtn?.addEventListener('click', () => this.showReplayModal());

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

        // Filter selection and other delegated events
        document.addEventListener('click', (e) => {
            if (e.target.closest('.filter-option')) {
                const filterOption = e.target.closest('.filter-option');
                const filter = filterOption.dataset.filter;
                this.selectFilter(filter);
            }

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
                isFeatured: true
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
                isFeatured: false
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
                isFeatured: false
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

    showFiltersModal() {
        this.filtersModal?.classList.add('active');
    }

    showReplayModal() {
        this.loadReplayList();
        this.replayModal?.classList.add('active');
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        
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

    // Filter Management
    selectFilter(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-option').forEach(option => {
            option.classList.remove('active');
        });
        const filterOption = document.querySelector(`[data-filter="${filter}"]`);
        filterOption?.classList.add('active');
        
        this.applyVideoFilter(this.localVideo, filter);
        this.hideAllModals();
    }

    applyVideoFilter(video, filter) {
        if (!video) return;
        
        video.classList.remove('filter-blur', 'filter-sepia', 'filter-grayscale', 'filter-vintage', 'filter-neon');
        
        if (filter !== 'none') {
            video.classList.add(`filter-${filter}`);
        }
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

    // Viewer Mode Management
    toggleViewerMode() {
        this.isViewerMode = !this.isViewerMode;
        this.videoRoom?.classList.toggle('viewer-mode', this.isViewerMode);
        this.viewerModeBtn?.classList.toggle('viewer-mode', this.isViewerMode);
        
        if (this.isViewerMode) {
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => track.stop());
            }
            this.addChatMessage('System', 'You are now in viewer mode', true);
        } else {
            this.initializeMedia();
            this.addChatMessage('System', 'You are now participating', true);
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
            this.joinRoom(newRoom.id);
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

    async joinRoom(roomId) {
        try {
            if (!this.isViewerMode) {
                await this.initializeMedia();
            }
            
            if (this.roomSelection) this.roomSelection.style.display = 'none';
            this.videoRoom?.classList.remove('hidden');
            
            this.currentRoom = roomId;
            this.updateRoomInfo(roomId);
            this.initializeWebRTC();
            this.addChatMessage('System', 'Welcome to the room!', true);
            
        } catch (error) {
            console.error('Error joining room:', error);
            alert('Failed to join room. Please check your camera and microphone permissions.');
        }
    }

    async initializeMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            if (this.localVideo) {
                this.localVideo.srcObject = this.localStream;
                this.applyVideoFilter(this.localVideo, this.currentFilter);
            }
            
        } catch (error) {
            console.error('Error accessing media devices:', error);
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

    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.isVideoMuted = !videoTrack.enabled;
                
                this.toggleVideoBtn?.classList.toggle('muted', this.isVideoMuted);
                if (this.toggleVideoBtn) {
                    this.toggleVideoBtn.innerHTML = this.isVideoMuted ? 
                        '<i class="fas fa-video-slash"></i>' : 
                        '<i class="fas fa-video"></i>';
                }
            }
        }
    }

    async shareScreen() {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });
            
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = this.peerConnections.values().next().value?.getSenders().find(
                s => s.track && s.track.kind === 'video'
            );
            
            if (sender) {
                await sender.replaceTrack(videoTrack);
            }
            
            videoTrack.onended = () => {
                this.stopScreenShare();
            };
            
        } catch (error) {
            console.error('Error sharing screen:', error);
        }
    }

    stopScreenShare() {
        const videoTrack = this.localStream?.getVideoTracks()[0];
        const sender = this.peerConnections.values().next().value?.getSenders().find(
            s => s.track && s.track.kind === 'video'
        );
        
        if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
        }
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
        
        this.isViewerMode = false;
        this.handRaised = false;
        this.currentFilter = 'none';
        this.chatVisible = true;
        
        this.videoRoom?.classList.add('hidden');
        if (this.roomSelection) this.roomSelection.style.display = 'block';
        this.currentRoom = null;
        
        if (this.chatMessagesContainer) this.chatMessagesContainer.innerHTML = '';
        
        this.loadActiveRooms();
    }

    addRemoteParticipant(participantId, name, stream) {
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        videoWrapper.setAttribute('data-participant-id', participantId);
        videoWrapper.innerHTML = `
            <video autoplay playsinline></video>
            <div class="participant-info">
                <span class="participant-name">${name}</span>
                <div class="participant-status">
                    <span class="status-indicator" title="Listening"></span>
                    <button class="hand-raise-indicator hidden" title="Hand Raised">
                        <i class="fas fa-hand-paper"></i>
                    </button>
                </div>
            </div>
            <div class="video-controls">
                <button class="filter-btn" data-filter="none">
                    <i class="fas fa-magic"></i>
                </button>
            </div>
        `;
        
        const video = videoWrapper.querySelector('video');
        if (video) video.srcObject = stream;
        
        this.videoGrid?.appendChild(videoWrapper);
        
        return videoWrapper;
    }

    removeRemoteParticipant(participantId) {
        const videoWrapper = document.querySelector(`[data-participant-id="${participantId}"]`);
        if (videoWrapper) {
            videoWrapper.remove();
        }
    }
}

// Initialize video rooms manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const videoRoomsManager = new VideoRoomsManager();
    window.videoRoomsManager = videoRoomsManager;
});

// Handle page parameters (if joining via direct link)
const urlParams = new URLSearchParams(window.location.search);
const roomToJoin = urlParams.get('room');
if (roomToJoin) {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            window.videoRoomsManager?.joinRoom(roomToJoin);
        }, 1000);
    });
} 