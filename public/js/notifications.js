(function() {
    if (window._wordethNotifSocket && window._wordethNotifSocket.connected) return;

    const token = localStorage.getItem('authToken');
    if (!token) return;

    let user;
    try {
        user = JSON.parse(localStorage.getItem('user'));
    } catch(e) { return; }
    if (!user || !user._id) return;

    const isVersesPage = window.location.pathname.includes('verses.html') || window.location.pathname.startsWith('/room/');
    if (isVersesPage) return;

    const serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;

    const notifSocket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000
    });

    window._wordethNotifSocket = notifSocket;

    notifSocket.on('connect', () => {
        notifSocket.emit('register-user', {
            userId: user._id,
            userName: user.name || 'User'
        });
    });

    window.addEventListener('beforeunload', () => {
        if (notifSocket) notifSocket.disconnect();
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
                    <button class="invite-action-btn dismiss" id="notif-invite-dismiss">Not now</button>
                    <button class="invite-action-btn join" id="notif-invite-join">
                        <i class="fas fa-headphones"></i> Join
                    </button>
                </div>
                <div class="invite-timer-bar"></div>
            </div>
        `;

        document.body.appendChild(notification);

        document.getElementById('notif-invite-join').addEventListener('click', function() {
            notification.remove();
            localStorage.setItem('wordeth_pending_room', data.roomId);
            localStorage.setItem('wordeth_pending_room_ts', String(Date.now()));
            window.location.href = '/room/' + encodeURIComponent(data.roomId);
        });

        document.getElementById('notif-invite-dismiss').addEventListener('click', function() {
            notification.classList.remove('visible');
            setTimeout(function() { notification.remove(); }, 400);
        });

        requestAnimationFrame(function() {
            notification.classList.add('visible');
        });

        setTimeout(function() {
            notification.classList.remove('visible');
            setTimeout(function() { notification.remove(); }, 500);
        }, 15000);
    }

})();
