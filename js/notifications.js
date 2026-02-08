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

        const notification = document.createElement('div');
        notification.id = 'wordeth-invite-notification';
        notification.className = 'invite-notification';
        notification.innerHTML = `
            <div class="invite-notif-content">
                <div class="invite-notif-icon">
                    <i class="fas fa-headphones"></i>
                </div>
                <div class="invite-notif-text">
                    <strong>${escapeHtml(data.inviterName)}</strong> invited you to join
                    <strong>"${escapeHtml(data.roomName)}"</strong>
                </div>
                <div class="invite-notif-actions">
                    <button class="invite-notif-btn join" onclick="window.location.href='/verses.html?room=${encodeURIComponent(data.roomId)}'">Join</button>
                    <button class="invite-notif-btn dismiss" onclick="this.closest('.invite-notification').remove()">Dismiss</button>
                </div>
            </div>
            <div class="invite-notif-timer"></div>
        `;

        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.add('visible');
        });

        setTimeout(() => {
            notification.classList.remove('visible');
            setTimeout(() => notification.remove(), 400);
        }, 15000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
})();
