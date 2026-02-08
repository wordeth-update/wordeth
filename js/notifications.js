(function() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    let user;
    try {
        user = JSON.parse(localStorage.getItem('user'));
    } catch(e) { return; }
    if (!user || !user._id) return;

    const isVersesPage = window.location.pathname.includes('verses.html');
    if (isVersesPage) return;

    const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;

    const notifSocket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    });

    notifSocket.on('connect', () => {
        notifSocket.emit('register-user', {
            userId: user._id,
            userName: user.name || 'User'
        });
    });

    notifSocket.on('room-invite', (data) => {
        showInviteNotification(data);
    });

    function showInviteNotification(data) {
        const existing = document.getElementById('wordeth-invite-notification');
        if (existing) existing.remove();

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
                </div>
                <div class="invite-card-body">
                    <div class="invite-room-name">${escapeHtml(roomName)}</div>
                    <div class="invite-from">
                        <div class="invite-from-avatar">${inviterInitial}</div>
                        <div class="invite-from-text"><strong>${escapeHtml(data.inviterName)}</strong> invited you</div>
                    </div>
                </div>
                <div class="invite-card-actions">
                    <button class="invite-action-btn dismiss" onclick="this.closest('.invite-notification').remove()">Not now</button>
                    <button class="invite-action-btn join" onclick="window.location.href='/verses.html?room=${encodeURIComponent(data.roomId)}'">
                        <i class="fas fa-headphones"></i> Join
                    </button>
                </div>
                <div class="invite-timer-bar"></div>
            </div>
        `;

        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('visible');
        });

        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 500);
        }, 15000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
})();
