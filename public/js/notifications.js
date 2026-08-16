(function() {
    if (window._wordethNotifInit) return;
    window._wordethNotifInit = true;

    var token = localStorage.getItem('authToken');
    if (!token) return;

    var user;
    try { user = JSON.parse(localStorage.getItem('user')); } catch(e) { return; }
    if (!user || !user._id) return;

    var bellWrap = document.getElementById('notif-bell-wrap');
    if (!bellWrap) {
        var navAuth = document.querySelector('.nav-auth');
        if (navAuth) {
            bellWrap = document.createElement('div');
            bellWrap.className = 'notif-bell-wrap';
            bellWrap.id = 'notif-bell-wrap';
            bellWrap.innerHTML = '<button class="notif-bell-btn" id="notif-bell-btn" title="Notifications">'
                + '<i class="fas fa-bell"></i>'
                + '<span class="notif-bell-badge" id="notif-bell-badge" style="display:none;">0</span>'
                + '</button>'
                + '<div class="notif-dropdown" id="notif-dropdown" style="display:none;">'
                + '<div class="notif-dropdown-header"><span>Notifications</span>'
                + '<button class="notif-mark-all" id="notif-mark-all">Mark all read</button></div>'
                + '<div class="notif-dropdown-list" id="notif-dropdown-list">'
                + '<p class="notif-empty">No notifications yet</p></div></div>';
            navAuth.parentNode.insertBefore(bellWrap, navAuth);
        }
    }
    if (bellWrap) bellWrap.style.display = 'block';

    var bellBtn = document.getElementById('notif-bell-btn');
    var badge = document.getElementById('notif-bell-badge');
    var dropdown = document.getElementById('notif-dropdown');
    var listEl = document.getElementById('notif-dropdown-list');
    var markAllBtn = document.getElementById('notif-mark-all');

    var notifications = [];
    var unreadCount = 0;
    var dropdownOpen = false;

    var serverUrl = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : window.location.origin;

    function fetchNotifications() {
        fetch(serverUrl + '/api/user/notifications', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            notifications = data.notifications || [];
            unreadCount = data.unreadCount || 0;
            updateBadge();
            if (dropdownOpen) renderList();
        })
        .catch(function() {});
    }

    function updateBadge() {
        if (!badge) return;
        if (unreadCount > 0) {
            badge.style.display = 'flex';
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        } else {
            badge.style.display = 'none';
        }
    }

    function escHtml(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function timeAgo(dateStr) {
        var s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (s < 60) return 'just now';
        var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
        var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
        var dy = Math.floor(h / 24); if (dy < 30) return dy + 'd ago';
        return new Date(dateStr).toLocaleDateString();
    }

    function notifText(n) {
        var name = '<strong>' + escHtml(n.fromUserName || 'Someone') + '</strong>';
        switch(n.type) {
            case 'new_follower': return name + ' started following you';
            case 'follower_created_room': return name + ' started a room: ' + escHtml(n.roomName || 'a Verse');
            case 'follower_joined_room': return name + ' joined a room: ' + escHtml(n.roomName || 'a Verse');
            case 'collab_invite': return name + ' invited you to collaborate on "' + escHtml(n.roomName || 'a room') + '"';
            case 'collab_response': return name + ' responded to your collab invite for "' + escHtml(n.roomName || 'a room') + '"';
            case 'room_nudge_5min': return '"' + escHtml(n.roomName || 'Your room') + '" starts in 5 minutes';
            case 'room_nudge_start': return '"' + escHtml(n.roomName || 'Your room') + '" is starting now';
            case 'room_live': return name + ' is live now: "' + escHtml(n.roomName || 'a room') + '"';
            default: return name + ' sent you a notification';
        }
    }

    function renderList() {
        if (!listEl) return;
        if (notifications.length === 0) {
            listEl.innerHTML = '<p class="notif-empty">No notifications yet</p>';
            return;
        }
        var html = '';
        for (var i = 0; i < notifications.length; i++) {
            var n = notifications[i];
            var initial = (n.fromUserName || 'U').charAt(0).toUpperCase();
            var cls = n.read ? 'notif-item' : 'notif-item unread';
            html += '<div class="' + cls + '" data-nid="' + n._id + '" data-type="' + escHtml(n.type || '') + '"' + (n.roomId ? ' data-room="' + escHtml(n.roomId) + '"' : '') + '>'
                + '<div class="notif-item-avatar">' + initial + '</div>'
                + '<div class="notif-item-body">'
                + '<div class="notif-item-text">' + notifText(n) + '</div>'
                + '<div class="notif-item-time">' + timeAgo(n.createdAt) + '</div>'
                + '</div>'
                + (!n.read ? '<div class="notif-item-dot"></div>' : '')
                + '</div>';
        }
        listEl.innerHTML = html;

        var items = listEl.querySelectorAll('.notif-item');
        for (var j = 0; j < items.length; j++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var nid = item.getAttribute('data-nid');
                    var roomId = item.getAttribute('data-room');
                    var type = item.getAttribute('data-type') || '';
                    markRead(nid);
                    // Scheduled-room notifications point at a schedule, not a
                    // live room — send those to the Verses lobby instead.
                    var scheduledTypes = ['collab_invite', 'collab_response', 'room_nudge_5min', 'room_nudge_start'];
                    if (scheduledTypes.indexOf(type) !== -1) {
                        window.location.href = '/verses.html';
                        return;
                    }
                    if (roomId) {
                        localStorage.setItem('wordeth_pending_room', roomId);
                        localStorage.setItem('wordeth_pending_room_ts', String(Date.now()));
                        window.location.href = '/room/' + encodeURIComponent(roomId);
                    }
                });
            })(items[j]);
        }
    }

    function markRead(nid) {
        fetch(serverUrl + '/api/user/notifications/' + nid + '/read', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function() {
            for (var i = 0; i < notifications.length; i++) {
                if (notifications[i]._id === nid && !notifications[i].read) {
                    notifications[i].read = true;
                    unreadCount = Math.max(0, unreadCount - 1);
                    break;
                }
            }
            updateBadge();
            if (dropdownOpen) renderList();
        }).catch(function() {});
    }

    function markAllRead() {
        fetch(serverUrl + '/api/user/notifications/read-all', {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function() {
            for (var i = 0; i < notifications.length; i++) {
                notifications[i].read = true;
            }
            unreadCount = 0;
            updateBadge();
            if (dropdownOpen) renderList();
        }).catch(function() {});
    }

    if (bellBtn) {
        bellBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            dropdownOpen = !dropdownOpen;
            if (dropdown) dropdown.style.display = dropdownOpen ? 'block' : 'none';
            if (dropdownOpen) renderList();
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            markAllRead();
        });
    }

    document.addEventListener('click', function(e) {
        if (dropdownOpen && dropdown && !dropdown.contains(e.target) && e.target !== bellBtn) {
            dropdownOpen = false;
            dropdown.style.display = 'none';
        }
    });

    fetchNotifications();
    setInterval(fetchNotifications, 30000);

    var isVersesPage = window.location.pathname.includes('verses') || window.location.pathname.startsWith('/room/');

    if (!isVersesPage) {
        if (!window._wordethNotifSocket || !window._wordethNotifSocket.connected) {
            var notifSocket = io(serverUrl, {
                transports: ['websocket'],
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 2000
            });
            window._wordethNotifSocket = notifSocket;

            notifSocket.on('connect', function() {
                notifSocket.emit('register-user', {
                    userId: user._id,
                    userName: user.name || 'User'
                });
            });

            window.addEventListener('beforeunload', function() {
                if (notifSocket) notifSocket.disconnect();
            });

            notifSocket.on('room-invite', function(data) {
                showInviteNotification(data);
            });
        }
    }

    function handleRealtimeNotif(data) {
        notifications.unshift(data);
        unreadCount++;
        updateBadge();
        if (dropdownOpen) renderList();
    }

    if (window._wordethNotifSocket) {
        window._wordethNotifSocket.on('notification', handleRealtimeNotif);
    }

    var versesSocket = window.audioRoomsManager && window.audioRoomsManager.lobbySocket;
    if (versesSocket) {
        versesSocket.on('notification', handleRealtimeNotif);
    } else {
        var checkInterval = setInterval(function() {
            var mgr = window.audioRoomsManager;
            if (mgr && mgr.lobbySocket) {
                mgr.lobbySocket.on('notification', handleRealtimeNotif);
                clearInterval(checkInterval);
            }
        }, 1000);
        setTimeout(function() { clearInterval(checkInterval); }, 15000);
    }

    function showInviteNotification(data) {
        var existing = document.getElementById('wordeth-invite-notification');
        if (existing) existing.remove();

        var inviterInitial = (data.inviterName || 'U').charAt(0).toUpperCase();
        var roomName = data.roomName || 'a Verse';

        var notification = document.createElement('div');
        notification.id = 'wordeth-invite-notification';
        notification.className = 'invite-notification';
        notification.innerHTML = '<div class="invite-card">'
            + '<div class="invite-card-glow"></div>'
            + '<div class="invite-card-top">'
            + '<div class="invite-live-badge"><span class="invite-live-dot"></span>LIVE NOW</div>'
            + '<img src="/images/logo.png" alt="Wordeth" class="invite-logo">'
            + '</div>'
            + '<div class="invite-card-body">'
            + '<div class="invite-room-name">' + escHtml(roomName) + '</div>'
            + '<div class="invite-from">'
            + '<div class="invite-from-avatar">' + inviterInitial + '</div>'
            + '<div class="invite-from-text"><strong>' + escHtml(data.inviterName) + '</strong> invited you</div>'
            + '</div></div>'
            + '<div class="invite-card-actions">'
            + '<button class="invite-action-btn dismiss" id="notif-invite-dismiss">Not now</button>'
            + '<button class="invite-action-btn join" id="notif-invite-join"><i class="fas fa-headphones"></i> Join</button>'
            + '</div>'
            + '<div class="invite-timer-bar"></div>'
            + '</div>';

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
