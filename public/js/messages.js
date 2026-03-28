(function() {
    var token = localStorage.getItem('authToken');
    if (!token) { window.location.href = '/signin.html'; return; }
    var user;
    try { user = JSON.parse(localStorage.getItem('user')); } catch(e) {}
    if (!user || !user._id) { window.location.href = '/signin.html'; return; }

    var serverUrl = typeof apiUrl === 'function' ? apiUrl('') .replace(/\/$/, '') : window.location.origin;
    var currentChatUserId = null;
    var mediaRecorder = null;
    var audioChunks = [];
    var isRecording = false;

    var sidebar = document.getElementById('msg-sidebar');
    var chatPanel = document.getElementById('msg-chat');
    var convoList = document.getElementById('msg-conversations');
    var chatMessages = document.getElementById('msg-chat-messages');
    var chatName = document.getElementById('msg-chat-name');
    var chatAvatar = document.getElementById('msg-chat-avatar');
    var inputArea = document.getElementById('msg-input-area');
    var textInput = document.getElementById('msg-text-input');
    var sendBtn = document.getElementById('msg-send-btn');
    var audioBtn = document.getElementById('msg-audio-btn');
    var backBtn = document.getElementById('msg-chat-back');

    function esc(str) {
        var d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    function timeAgo(dateStr) {
        var s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (s < 60) return 'now';
        var m = Math.floor(s / 60); if (m < 60) return m + 'm';
        var h = Math.floor(m / 60); if (h < 24) return h + 'h';
        var dy = Math.floor(h / 24); if (dy < 7) return dy + 'd';
        return new Date(dateStr).toLocaleDateString();
    }

    function timeStamp(dateStr) {
        return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function loadConversations() {
        fetch(serverUrl + '/api/messages/conversations', {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var convos = data.conversations || [];
            if (convos.length === 0) {
                convoList.innerHTML = '<div class="msg-empty"><i class="fas fa-comments"></i><p>No conversations yet</p></div>';
                return;
            }
            var html = '';
            for (var i = 0; i < convos.length; i++) {
                var c = convos[i];
                var safeSrc = (c.avatar && (c.avatar.startsWith('data:') || c.avatar.startsWith('http') || c.avatar.startsWith('assets/'))) ? c.avatar : 'assets/default-avatar.png';
                var badge = c.unreadCount > 0 ? '<span class="msg-convo-badge">' + c.unreadCount + '</span>' : '';
                var preview = c.lastMessage.isAudio ? '<i class="fas fa-microphone"></i> Audio' : esc(c.lastMessage.text).substring(0, 40);
                var active = currentChatUserId === c.userId.toString() ? ' active' : '';
                html += '<div class="msg-convo-item' + active + '" data-uid="' + c.userId + '">'
                    + '<img class="msg-convo-avatar" src="' + esc(safeSrc) + '" onerror="this.src=\'assets/default-avatar.png\'">'
                    + '<div class="msg-convo-info">'
                    + '<div class="msg-convo-name">' + esc(c.userName) + badge + '</div>'
                    + '<div class="msg-convo-preview">' + (c.lastMessage.fromMe ? 'You: ' : '') + preview + '</div>'
                    + '</div>'
                    + '<span class="msg-convo-time">' + timeAgo(c.lastMessage.createdAt) + '</span>'
                    + '</div>';
            }
            convoList.innerHTML = html;
            var items = convoList.querySelectorAll('.msg-convo-item');
            for (var j = 0; j < items.length; j++) {
                (function(item) {
                    item.addEventListener('click', function() {
                        openChat(item.getAttribute('data-uid'));
                    });
                })(items[j]);
            }
        })
        .catch(function() {});
    }

    function openChat(userId) {
        currentChatUserId = userId;
        sidebar.classList.add('hidden');
        chatPanel.classList.remove('hidden');
        inputArea.style.display = 'flex';
        chatMessages.innerHTML = '<div class="msg-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>';

        fetch(serverUrl + '/api/messages/' + userId, {
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var ou = data.otherUser || {};
            chatName.textContent = ou.name || 'Unknown';
            var safeSrc = (ou.avatar && (ou.avatar.startsWith('data:') || ou.avatar.startsWith('http') || ou.avatar.startsWith('assets/'))) ? ou.avatar : 'assets/default-avatar.png';
            chatAvatar.src = safeSrc;
            chatAvatar.onerror = function() { this.src = 'assets/default-avatar.png'; };

            var msgs = data.messages || [];
            if (msgs.length === 0) {
                chatMessages.innerHTML = '<div class="msg-empty"><i class="fas fa-envelope-open"></i><p>Start a conversation</p></div>';
            } else {
                chatMessages.innerHTML = '';
                for (var i = 0; i < msgs.length; i++) {
                    appendMessage(msgs[i]);
                }
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            loadConversations();
        })
        .catch(function() {
            chatMessages.innerHTML = '<div class="msg-empty"><p>Could not load messages</p></div>';
        });
    }

    function appendMessage(msg) {
        var isMine = msg.senderId === user._id || msg.senderId.toString() === user._id;
        var cls = isMine ? 'msg-bubble sent' : 'msg-bubble received';
        var div = document.createElement('div');
        div.className = cls;

        var content = '';
        if (msg.audioUrl) {
            content += '<div class="msg-audio-player">'
                + '<button class="msg-audio-play" data-src="' + esc(msg.audioUrl) + '"><i class="fas fa-play"></i></button>'
                + '<span class="msg-audio-label">Audio message</span></div>';
        }
        if (msg.text) {
            content += '<div>' + esc(msg.text) + '</div>';
        }
        content += '<div class="msg-bubble-time">' + timeStamp(msg.createdAt) + '</div>';
        div.innerHTML = content;

        var playBtn = div.querySelector('.msg-audio-play');
        if (playBtn) {
            playBtn.addEventListener('click', function() {
                var src = this.getAttribute('data-src');
                var a = new Audio(src);
                var btn = this;
                btn.innerHTML = '<i class="fas fa-pause"></i>';
                a.play();
                a.onended = function() { btn.innerHTML = '<i class="fas fa-play"></i>'; };
            });
        }

        chatMessages.appendChild(div);
    }

    function sendMessage(text, audioBlob) {
        var formData = new FormData();
        if (text) formData.append('text', text);
        if (audioBlob) formData.append('audio', audioBlob, 'audio.webm');

        fetch(serverUrl + '/api/messages/' + currentChatUserId, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        })
        .then(function(r) { return r.json(); })
        .then(function(msg) {
            if (msg._id) {
                appendMessage(msg);
                chatMessages.scrollTop = chatMessages.scrollHeight;
                var emptyEl = chatMessages.querySelector('.msg-empty');
                if (emptyEl) emptyEl.remove();
            }
            loadConversations();
        })
        .catch(function() {});
    }

    textInput.addEventListener('input', function() {
        sendBtn.disabled = !textInput.value.trim();
    });

    textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey && textInput.value.trim()) {
            e.preventDefault();
            sendMessage(textInput.value.trim());
            textInput.value = '';
            sendBtn.disabled = true;
        }
    });

    sendBtn.addEventListener('click', function() {
        if (textInput.value.trim()) {
            sendMessage(textInput.value.trim());
            textInput.value = '';
            sendBtn.disabled = true;
        }
    });

    audioBtn.addEventListener('click', function() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunks = [];
            mediaRecorder.ondataavailable = function(e) { audioChunks.push(e.data); };
            mediaRecorder.onstop = function() {
                stream.getTracks().forEach(function(t) { t.stop(); });
                if (audioChunks.length > 0) {
                    var blob = new Blob(audioChunks, { type: 'audio/webm' });
                    sendMessage(null, blob);
                }
                audioBtn.classList.remove('recording');
                audioBtn.innerHTML = '<i class="fas fa-microphone"></i>';
                isRecording = false;
            };
            mediaRecorder.start();
            isRecording = true;
            audioBtn.classList.add('recording');
            audioBtn.innerHTML = '<i class="fas fa-stop"></i>';
            setTimeout(function() {
                if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
                    stopRecording();
                }
            }, 30000);
        }).catch(function() {
            alert('Microphone access is required to send audio messages.');
        });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    backBtn.addEventListener('click', function() {
        currentChatUserId = null;
        sidebar.classList.remove('hidden');
        chatPanel.classList.add('hidden');
    });

    var notifSocket = window._wordethNotifSocket;
    if (!notifSocket) {
        notifSocket = io(serverUrl, {
            transports: ['websocket'],
            reconnection: true
        });
        notifSocket.on('connect', function() {
            notifSocket.emit('register-user', { userId: user._id, userName: user.name || 'User' });
        });
        window._wordethNotifSocket = notifSocket;
    }
    notifSocket.on('new-message', function(msg) {
        if (currentChatUserId && msg.senderId === currentChatUserId) {
            appendMessage(msg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            var emptyEl = chatMessages.querySelector('.msg-empty');
            if (emptyEl) emptyEl.remove();
        }
        loadConversations();
    });

    var urlParams = new URLSearchParams(window.location.search);
    var openWith = urlParams.get('user');
    if (openWith) {
        openChat(openWith);
    }

    loadConversations();
    setInterval(loadConversations, 30000);

    window.openChatWith = openChat;
})();
