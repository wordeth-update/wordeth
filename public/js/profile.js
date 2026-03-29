function _initProfile() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/signin.html';
        return;
    }

    let currentUser = null;

    const els = {
        loading: document.getElementById('profile-loading'),
        content: document.getElementById('profile-content'),
        picture: document.getElementById('profile-picture'),
        name: document.getElementById('user-name'),
        email: document.getElementById('user-email'),
        bio: document.getElementById('user-bio'),
        joined: document.getElementById('user-joined'),
        statFollowing: document.getElementById('stat-following'),
        statFollowers: document.getElementById('stat-followers'),
        statSearches: document.getElementById('stat-searches'),
        editName: document.getElementById('edit-name'),
        editBio: document.getElementById('edit-bio'),
        editSave: document.getElementById('edit-save'),
        bioCharCount: document.getElementById('bio-char-count'),
        avatarBtn: document.getElementById('edit-avatar-btn'),
        settingsEmail: document.getElementById('settings-email'),
        settingsJoined: document.getElementById('settings-joined'),
        deleteBtn: document.getElementById('delete-account-btn'),
        roomHistoryToggle: document.getElementById('room-history-toggle'),
    };

    async function apiFetch(url, options = {}) {
        const headers = { 'Authorization': `Bearer ${token}`, ...options.headers };
        const res = await fetch(apiUrl(url), { ...options, headers });
        if (res.status === 401) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('user');
            window.location.href = '/signin.html';
            return null;
        }
        return res;
    }

    async function loadProfile() {
        try {
            const res = await apiFetch('/api/user/profile');
            if (!res) return;
            if (!res.ok) throw new Error('Failed to load profile');
            currentUser = await res.json();
            renderProfile(currentUser);
            els.loading.style.display = 'none';
            els.content.style.display = 'block';
        } catch (e) {
            els.loading.innerHTML = '<p style="color:#ff6b7a;">Could not load your profile. Please try again.</p>';
        }
    }

    function renderProfile(user) {
        els.name.textContent = user.name || '-';
        els.email.textContent = user.email || '-';
        els.bio.textContent = user.bio || 'No bio yet';
        if (user.avatar && user.avatar !== 'assets/default-avatar.png') {
            els.picture.src = user.avatar;
        }
        els.statFollowing.textContent = user.following?.length || 0;
        els.statFollowers.textContent = user.followers?.length || 0;
        els.statSearches.textContent = user.searchHistory?.length || 0;
        if (user.createdAt) {
            const d = new Date(user.createdAt);
            els.joined.textContent = 'Joined ' + d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            if (els.settingsJoined) els.settingsJoined.textContent = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        }
        if (els.settingsEmail) els.settingsEmail.textContent = user.email || '-';
        if (els.roomHistoryToggle) {
            els.roomHistoryToggle.checked = user.showRoomHistory || false;
        }

        localStorage.setItem('user', JSON.stringify({ _id: user._id, name: user.name, email: user.email, avatar: user.avatar }));
    }

    els.editBio.addEventListener('input', () => {
        els.bioCharCount.textContent = els.editBio.value.length;
    });

    els.editSave.addEventListener('click', async () => {
        els.editSave.disabled = true;
        els.editSave.textContent = 'Saving...';

        try {
            const res = await apiFetch('/api/user/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: els.editName.value,
                    bio: els.editBio.value
                })
            });

            if (!res) return;
            const data = await res.json();
            if (res.ok) {
                currentUser = data;
                renderProfile(data);
                showToast('Profile updated!');
            } else {
                showToast(data.message || 'Update failed', true);
            }
        } catch (err) {
            showToast('Something went wrong', true);
        }

        els.editSave.disabled = false;
        els.editSave.textContent = 'Save';
    });

    let nameCheckTimeout;
    const editNameStatus = document.getElementById('edit-name-status');
    els.editName.addEventListener('input', () => {
        clearTimeout(nameCheckTimeout);
        const val = els.editName.value.trim();
        if (val.length < 2 || (currentUser && val.toLowerCase() === currentUser.name.toLowerCase())) {
            if (editNameStatus) { editNameStatus.textContent = ''; editNameStatus.className = 'name-status'; }
            return;
        }
        if (editNameStatus) { editNameStatus.textContent = 'Checking...'; editNameStatus.className = 'name-status checking'; }
        nameCheckTimeout = setTimeout(async () => {
            try {
                const res = await fetch(apiUrl(`/api/user/check-name?name=${encodeURIComponent(val)}`));
                const data = await res.json();
                if (els.editName.value.trim() !== val) return;
                if (editNameStatus) {
                    if (data.available) {
                        editNameStatus.textContent = 'Name is available';
                        editNameStatus.className = 'name-status available';
                    } else {
                        editNameStatus.textContent = 'Name is already taken';
                        editNameStatus.className = 'name-status taken';
                    }
                }
            } catch (e) {
                if (editNameStatus) { editNameStatus.textContent = ''; editNameStatus.className = 'name-status'; }
            }
        }, 400);
    });

    els.avatarBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/gif,image/webp';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image must be under 5MB', true);
                return;
            }
            const formData = new FormData();
            formData.append('avatar', file);
            try {
                const res = await fetch(apiUrl('/api/user/avatar'), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                if (res.status === 401) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('user');
                    window.location.href = '/signin.html';
                    return;
                }
                const data = await res.json();
                if (res.ok) {
                    els.picture.src = data.avatarUrl;
                    currentUser.avatar = data.avatarUrl;
                    localStorage.setItem('user', JSON.stringify({ _id: currentUser._id, name: currentUser.name, email: currentUser.email, avatar: data.avatarUrl }));
                    showToast('Photo updated!');
                } else {
                    showToast(data.message || 'Upload failed', true);
                }
            } catch (err) {
                showToast('Upload failed', true);
            }
        };
        input.click();
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tab).classList.add('active');
            loadTabContent(tab);
        });
    });

    function timeAgo(dateStr) {
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        return new Date(dateStr).toLocaleDateString();
    }

    async function loadTabContent(tab) {
        if (tab === 'settings') return;
        if (tab === 'customize') { loadCustomizeTab(); return; }

        const endpoint = tab === 'rooms' ? '/api/user/room-history' : `/api/user/${tab}`;

        try {
            const res = await apiFetch(endpoint);
            if (!res) return;
            const data = await res.json();
            if (!res.ok) return;

            const emptyEl = document.getElementById(`${tab}-empty`);
            const listEl = document.getElementById(`${tab}-list`) || document.getElementById(`${tab}-grid`);

            if (!data || data.length === 0) {
                if (emptyEl) emptyEl.style.display = 'flex';
                if (listEl) listEl.innerHTML = '';
                return;
            }

            if (emptyEl) emptyEl.style.display = 'none';

            switch (tab) {
                case 'history':
                    listEl.innerHTML = data.map(item => `
                        <div class="history-item">
                            <div>
                                <h3>${escHtml(item.songTitle || '')}</h3>
                                <p>${escHtml(item.artist || '')}</p>
                            </div>
                            <span class="timestamp">${new Date(item.timestamp).toLocaleDateString()}</span>
                        </div>
                    `).join('');
                    break;
                case 'rooms':
                    listEl.innerHTML = data.map(item => `
                        <div class="room-history-item">
                            <div class="room-history-info">
                                <h3>${escHtml(item.roomName || 'Unnamed Room')}</h3>
                                <p><i class="fas fa-user"></i> ${escHtml(item.hostName || 'Unknown host')}</p>
                            </div>
                            <div class="room-history-meta">
                                ${item.tokenPrice > 0 ? `<span class="token-badge"><i class="fas fa-coins"></i> ${item.tokenPrice}</span>` : ''}
                                <span class="timestamp">${timeAgo(item.joinedAt)}</span>
                            </div>
                        </div>
                    `).join('');
                    break;
                case 'friends':
                    listEl.innerHTML = data.map(f => {
                        const fid = String(f._id || '');
                        return `
                        <div class="friend-card" data-user-id="${escHtml(fid)}" style="cursor:pointer;">
                            <div class="friend-avatar">
                                <img src="${escHtml(f.avatar || 'assets/default-avatar.png')}" alt="${escHtml(f.name || '')}">
                            </div>
                            <h3>${escHtml(f.name || '')}</h3>
                            <p>${f.mutualSongs || 0} mutual songs</p>
                        </div>
                    `;}).join('');
                    listEl.querySelectorAll('.friend-card').forEach(card => {
                        card.addEventListener('click', () => {
                            const uid = card.getAttribute('data-user-id');
                            if (uid) viewUserProfile(uid);
                        });
                    });
                    break;
                case 'merch':
                    listEl.innerHTML = data.map(item => `
                        <div class="merch-item">
                            <img src="${escHtml(item.image || '')}" alt="${escHtml(item.name || '')}">
                            <div class="merch-info">
                                <h3>${escHtml(item.name || '')}</h3>
                                <p>${escHtml(item.type || '')}</p>
                                <span class="timestamp">${new Date(item.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    `).join('');
                    break;
            }
        } catch (e) {
            console.error('Tab load error:', e);
        }
    }

    if (els.deleteBtn) {
        els.deleteBtn.addEventListener('click', async () => {
            const confirmed = confirm('Are you sure you want to permanently delete your account? This cannot be undone.');
            if (!confirmed) return;
            const doubleCheck = confirm('This will delete all your data including search history and connections. Continue?');
            if (!doubleCheck) return;

            els.deleteBtn.disabled = true;
            els.deleteBtn.textContent = 'Deleting...';

            try {
                const res = await apiFetch('/api/user/account', { method: 'DELETE' });
                if (!res) return;
                if (res.ok) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('user');
                    window.location.href = '/?deleted=1';
                } else {
                    const data = await res.json();
                    showToast(data.message || 'Delete failed', true);
                    els.deleteBtn.disabled = false;
                    els.deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Account';
                }
            } catch (e) {
                showToast('Something went wrong', true);
                els.deleteBtn.disabled = false;
                els.deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete Account';
            }
        });
    }

    if (els.roomHistoryToggle) {
        els.roomHistoryToggle.addEventListener('change', async () => {
            const visible = els.roomHistoryToggle.checked;
            try {
                const res = await apiFetch('/api/user/room-history-visibility', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ visible })
                });
                if (!res || !res.ok) {
                    els.roomHistoryToggle.checked = !visible;
                    showToast('Failed to update setting', true);
                    return;
                }
                showToast(visible ? 'Room history is now public' : 'Room history is now private');
            } catch (e) {
                els.roomHistoryToggle.checked = !visible;
                showToast('Failed to update setting', true);
            }
        });
    }

    const inviteBtn = document.getElementById('invite-qr-btn');
    const inviteModal = document.getElementById('invite-qr-modal');
    const inviteClose = document.getElementById('invite-qr-close');
    const inviteCanvas = document.getElementById('invite-qr-canvas');
    const inviteCopyBtn = document.getElementById('invite-copy-link-btn');
    const inviteSaveBtn = document.getElementById('invite-save-qr-btn');

    function getInviteUrl() {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const refName = user.name || '';
        const base = window.location.origin;
        return refName
            ? `${base}/?ref=${encodeURIComponent(refName)}`
            : base;
    }

    function drawInviteQR() {
        if (!inviteCanvas || typeof qrcode === 'undefined') return;
        const url = getInviteUrl();
        const size = 240;
        inviteCanvas.width = size;
        inviteCanvas.height = size;
        const ctx = inviteCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();

        const modCount = qr.getModuleCount();
        const quietZone = 4;
        const totalMods = modCount + quietZone * 2;
        const cellSize = size / totalMods;

        ctx.fillStyle = '#1a1a2e';
        for (let r = 0; r < modCount; r++) {
            for (let c = 0; c < modCount; c++) {
                if (qr.isDark(r, c)) {
                    ctx.fillRect(
                        (c + quietZone) * cellSize,
                        (r + quietZone) * cellSize,
                        cellSize + 0.5,
                        cellSize + 0.5
                    );
                }
            }
        }
    }

    if (inviteBtn) {
        inviteBtn.addEventListener('click', () => {
            drawInviteQR();
            if (inviteModal) inviteModal.style.display = 'flex';
        });
    }

    if (inviteClose) {
        inviteClose.addEventListener('click', () => {
            if (inviteModal) inviteModal.style.display = 'none';
        });
    }

    if (inviteModal) {
        inviteModal.addEventListener('click', (e) => {
            if (e.target === inviteModal) inviteModal.style.display = 'none';
        });
    }

    if (inviteCopyBtn) {
        inviteCopyBtn.addEventListener('click', () => {
            const url = getInviteUrl();
            navigator.clipboard.writeText(url).then(() => {
                showToast('Invite link copied!');
            }).catch(() => {
                const input = document.createElement('input');
                input.value = url;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                showToast('Invite link copied!');
            });
        });
    }

    if (inviteSaveBtn) {
        inviteSaveBtn.addEventListener('click', () => {
            if (!inviteCanvas) return;
            const link = document.createElement('a');
            link.download = 'wordeth-invite.png';
            link.href = inviteCanvas.toDataURL('image/png');
            link.click();
        });
    }

    function escHtml(str) {
        return window.escapeHtml(str);
    }

    function showToast(message, isError = false) {
        const existing = document.querySelector('.profile-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'profile-toast';
        if (isError) {
            toast.style.background = '#dc3545';
            toast.style.color = '#fff';
        }
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    const searchInput = document.getElementById('user-search-input');
    const searchResults = document.getElementById('user-search-results');
    let searchTimeout;

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchResults.style.display = 'none';
                searchResults.innerHTML = '';
                return;
            }
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(apiUrl(`/api/user/search?q=${encodeURIComponent(query)}`));
                    if (!res.ok) return;
                    const users = await res.json();
                    if (users.length === 0) {
                        searchResults.innerHTML = '<p class="search-no-results">No users found</p>';
                        searchResults.style.display = 'block';
                        return;
                    }
                    searchResults.innerHTML = users
                        .filter(u => !currentUser || u._id !== currentUser._id)
                        .map(u => `
                            <div class="search-result-card" data-user-id="${u._id}">
                                <div class="search-result-avatar">
                                    <img src="${escHtml(u.avatar)}" alt="${escHtml(u.name)}" onerror="this.src='assets/default-avatar.png'">
                                </div>
                                <div class="search-result-info">
                                    <h4>${escHtml(u.name)}</h4>
                                    <p>${escHtml(u.bio || 'No bio')}</p>
                                </div>
                                <button class="follow-btn" data-user-id="${u._id}">
                                    <i class="fas fa-user-plus"></i> Follow
                                </button>
                            </div>
                        `).join('');
                    searchResults.style.display = 'block';

                    searchResults.querySelectorAll('.follow-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            const userId = e.currentTarget.dataset.userId;
                            const btn = e.currentTarget;
                            btn.disabled = true;
                            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                            try {
                                const res = await apiFetch(`/api/user/friends/${userId}`, { method: 'POST' });
                                if (!res) return;
                                const data = await res.json();
                                if (res.ok) {
                                    btn.innerHTML = '<i class="fas fa-check"></i> Following';
                                    btn.classList.add('following');
                                    showToast('Following!');
                                    const profileRes = await apiFetch('/api/user/profile');
                                    if (profileRes && profileRes.ok) {
                                        currentUser = await profileRes.json();
                                        renderProfile(currentUser);
                                    }
                                } else {
                                    showToast(data.message || 'Could not follow', true);
                                    btn.disabled = false;
                                    btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                                }
                            } catch (err) {
                                console.error('Follow error:', err);
                                showToast('Network error. Please check your connection.', true);
                                btn.disabled = false;
                                btn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                            }
                        });
                    });
                } catch (err) {
                    console.error('Search error:', err);
                }
            }, 400);
        });
    }

    searchResults?.addEventListener('click', (e) => {
        const card = e.target.closest('.search-result-card');
        if (card && !e.target.closest('.follow-btn')) {
            viewUserProfile(card.dataset.userId);
        }
    });

    loadProfile();
    loadTabContent('history');
}

var _customizeInitialized = false;

function loadCustomizeTab() {
    var token = localStorage.getItem('authToken');
    if (!token) return;
    var base = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : '';

    fetch(base + '/api/user/profile', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { if (!r.ok) throw new Error('Failed'); return r.json(); })
        .then(function(profile) {
            var editNameEl = document.getElementById('edit-name');
            var editBioEl = document.getElementById('edit-bio');
            var bioCharCount = document.getElementById('bio-char-count');
            if (editNameEl) editNameEl.value = profile.name || '';
            if (editBioEl) editBioEl.value = profile.bio || '';
            if (bioCharCount) bioCharCount.textContent = (profile.bio || '').length;
            var bioInput = document.getElementById('extended-bio-input');
            var bioCount = document.getElementById('extended-bio-count');
            if (bioInput && profile.extendedBio) bioInput.value = profile.extendedBio;
            if (bioInput && bioCount) bioCount.textContent = (bioInput.value || '').length + '/2000';
            renderPhotoGallery(profile.profilePhotos || []);
            renderSnippet(profile.musicSnippet);
        })
        .catch(function() {});

    if (_customizeInitialized) return;
    _customizeInitialized = true;

    var bioInput = document.getElementById('extended-bio-input');
    var bioCount = document.getElementById('extended-bio-count');
    if (bioInput && bioCount) {
        bioInput.addEventListener('input', function() {
            bioCount.textContent = bioInput.value.length + '/2000';
        });
    }

    var saveBtn = document.getElementById('save-extended-bio');
    if (saveBtn && bioInput) {
        saveBtn.addEventListener('click', function() {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            fetch(base + '/api/user/profile-customize', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ extendedBio: bioInput.value })
            }).then(function(r) {
                if (!r.ok) throw new Error('Save failed');
                return r.json();
            }).then(function() {
                saveBtn.textContent = 'Saved!';
                setTimeout(function() { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
            }).catch(function() {
                saveBtn.textContent = 'Error';
                setTimeout(function() { saveBtn.textContent = 'Save'; saveBtn.disabled = false; }, 1500);
            });
        });
    }

    var addPhotoBtn = document.getElementById('add-photo-btn');
    var photoInput = document.getElementById('photo-upload-input');
    if (addPhotoBtn && photoInput) {
        addPhotoBtn.addEventListener('click', function() { photoInput.click(); });
        photoInput.addEventListener('change', function() {
            if (!photoInput.files[0]) return;
            var fd = new FormData();
            fd.append('photo', photoInput.files[0]);
            addPhotoBtn.disabled = true;
            addPhotoBtn.textContent = 'Uploading...';
            fetch(base + '/api/user/profile-photo', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            }).then(function(r) {
                if (!r.ok) throw new Error('Upload failed');
                return r.json();
            }).then(function(data) {
                if (data.profilePhotos) renderPhotoGallery(data.profilePhotos);
                addPhotoBtn.innerHTML = '<i class="fas fa-plus"></i> Add Photo';
                addPhotoBtn.disabled = false;
                photoInput.value = '';
            }).catch(function() {
                addPhotoBtn.innerHTML = '<i class="fas fa-plus"></i> Add Photo';
                addPhotoBtn.disabled = false;
            });
        });
    }

    var snippetUploadBtn = document.getElementById('snippet-upload-btn');
    var snippetInput = document.getElementById('snippet-upload-input');
    if (snippetUploadBtn && snippetInput) {
        snippetUploadBtn.addEventListener('click', function() { snippetInput.click(); });
        snippetInput.addEventListener('change', function() {
            if (!snippetInput.files[0]) return;
            var fd = new FormData();
            fd.append('audio', snippetInput.files[0]);
            fd.append('title', document.getElementById('snippet-title-input').value || '');
            fd.append('artist', document.getElementById('snippet-artist-input').value || '');
            snippetUploadBtn.disabled = true;
            snippetUploadBtn.textContent = 'Uploading...';
            fetch(base + '/api/user/music-snippet', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: fd
            }).then(function(r) {
                if (!r.ok) throw new Error('Upload failed');
                return r.json();
            }).then(function(data) {
                if (data.musicSnippet) renderSnippet(data.musicSnippet);
                snippetUploadBtn.innerHTML = '<i class="fas fa-upload"></i> Choose Audio File';
                snippetUploadBtn.disabled = false;
            }).catch(function() {
                snippetUploadBtn.innerHTML = '<i class="fas fa-upload"></i> Choose Audio File';
                snippetUploadBtn.disabled = false;
            });
        });
    }

    var removeSnippetBtn = document.getElementById('remove-snippet-btn');
    if (removeSnippetBtn) {
        removeSnippetBtn.addEventListener('click', function() {
            fetch(base + '/api/user/music-snippet', {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(function(r) {
                if (!r.ok) throw new Error('Delete failed');
                renderSnippet(null);
            }).catch(function() {});
        });
    }

    var browseBtn = document.getElementById('browse-audio-bank-btn');
    var bankModal = document.getElementById('audio-bank-modal');
    var bankClose = document.getElementById('audio-bank-close');
    if (browseBtn && bankModal) {
        browseBtn.addEventListener('click', function() {
            bankModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            _abLoadTracks(base, token, bankModal);
        });
    }
    if (bankClose && bankModal) {
        bankClose.addEventListener('click', function() {
            bankModal.style.display = 'none';
            document.body.style.overflow = '';
            _abStopPreview();
        });
    }
    bankModal && bankModal.addEventListener('click', function(e) {
        if (e.target === bankModal) {
            bankModal.style.display = 'none';
            document.body.style.overflow = '';
            _abStopPreview();
        }
    });

    var abSearchInput = document.getElementById('ab-search-input');
    var abGenre = document.getElementById('ab-genre-filter');
    var abMood = document.getElementById('ab-mood-filter');
    var abSort = document.getElementById('ab-sort-filter');
    var _abDebounce = null;
    function _abOnFilter() {
        clearTimeout(_abDebounce);
        _abDebounce = setTimeout(function() { _abLoadTracks(base, token, bankModal); }, 300);
    }
    if (abSearchInput) abSearchInput.addEventListener('input', _abOnFilter);
    if (abGenre) abGenre.addEventListener('change', function() { _abLoadTracks(base, token, bankModal); });
    if (abMood) abMood.addEventListener('change', function() { _abLoadTracks(base, token, bankModal); });
    if (abSort) abSort.addEventListener('change', function() { _abLoadTracks(base, token, bankModal); });
}

var _abCurrentAudio = null;
var _abCurrentTrackId = null;
var _abAnimFrame = null;
var _abTrackMap = {};

function _abStopPreview() {
    if (_abCurrentAudio) {
        _abCurrentAudio.pause();
        _abCurrentAudio.src = '';
        _abCurrentAudio = null;
    }
    _abCurrentTrackId = null;
    if (_abAnimFrame) cancelAnimationFrame(_abAnimFrame);
    var np = document.getElementById('ab-now-playing');
    if (np) np.style.display = 'none';
    document.querySelectorAll('.bank-track').forEach(function(t) { t.classList.remove('ab-playing'); });
    document.querySelectorAll('.bank-play-btn i').forEach(function(i) { i.className = 'fas fa-play'; });
}

function _abPlayPreview(track) {
    var audio = document.getElementById('ab-audio-player');
    if (!audio) return;
    var url = track.previewUrl || track.audioUrl;
    if (!url) return;

    function _abUpdateProgress() {
        if (!audio || audio.paused) return;
        var pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
        var bar = document.getElementById('ab-np-progress-bar');
        var timeEl = document.getElementById('ab-np-time');
        if (bar) bar.style.width = pct + '%';
        if (timeEl) {
            var sec = Math.floor(audio.currentTime);
            timeEl.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
        }
        _abAnimFrame = requestAnimationFrame(_abUpdateProgress);
    }

    if (_abCurrentTrackId === track._id) {
        var trackEl = document.querySelector('.bank-track[data-id="' + track._id + '"]');
        if (audio.paused) {
            audio.play();
            document.getElementById('ab-np-play-btn').innerHTML = '<i class="fas fa-pause"></i>';
            if (trackEl) {
                trackEl.classList.add('ab-playing');
                var pi = trackEl.querySelector('.bank-play-btn i');
                if (pi) pi.className = 'fas fa-pause';
            }
            _abUpdateProgress();
        } else {
            audio.pause();
            document.getElementById('ab-np-play-btn').innerHTML = '<i class="fas fa-play"></i>';
            if (trackEl) {
                trackEl.classList.remove('ab-playing');
                var pi2 = trackEl.querySelector('.bank-play-btn i');
                if (pi2) pi2.className = 'fas fa-play';
            }
        }
        return;
    }

    _abStopPreview();
    _abCurrentTrackId = track._id;
    _abCurrentAudio = audio;
    audio.src = url;
    audio.play().catch(function() {});

    var np = document.getElementById('ab-now-playing');
    var npArt = document.getElementById('ab-np-art');
    var npTitle = document.getElementById('ab-np-title');
    var npArtist = document.getElementById('ab-np-artist');
    if (np) np.style.display = 'flex';
    if (npArt) { npArt.src = track.coverArt || 'assets/default-cover.svg'; npArt.alt = track.title; }
    if (npTitle) npTitle.textContent = track.title;
    if (npArtist) npArtist.textContent = track.artist;
    document.getElementById('ab-np-play-btn').innerHTML = '<i class="fas fa-pause"></i>';

    var newTrackEl = document.querySelector('.bank-track[data-id="' + track._id + '"]');
    if (newTrackEl) newTrackEl.classList.add('ab-playing');
    var playIcon = newTrackEl && newTrackEl.querySelector('.bank-play-btn i');
    if (playIcon) playIcon.className = 'fas fa-pause';

    _abUpdateProgress();

    audio.onended = function() { _abStopPreview(); };

    var npPlayBtn = document.getElementById('ab-np-play-btn');
    npPlayBtn.onclick = function() { _abPlayPreview(track); };
}

function _abLoadTracks(base, token, bankModal) {
    var list = document.getElementById('audio-bank-list');
    var countEl = document.getElementById('ab-results-count');
    var search = (document.getElementById('ab-search-input') || {}).value || '';
    var genre = (document.getElementById('ab-genre-filter') || {}).value || 'all';
    var mood = (document.getElementById('ab-mood-filter') || {}).value || 'all';
    var sort = (document.getElementById('ab-sort-filter') || {}).value || 'popular';

    var params = '?sort=' + sort;
    if (genre !== 'all') params += '&genre=' + encodeURIComponent(genre);
    if (mood !== 'all') params += '&mood=' + encodeURIComponent(mood);
    if (search.trim().length >= 2) params += '&search=' + encodeURIComponent(search.trim());

    list.innerHTML = '<div class="ab-loading"><div class="loading-spinner"></div><p>Loading tracks...</p></div>';

    fetch(base + '/api/user/audio-bank' + params)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var tracks = data.tracks || [];
            var genres = data.genres || [];
            var moods = data.moods || [];

            var genreSelect = document.getElementById('ab-genre-filter');
            if (genreSelect && genreSelect.options.length <= 1) {
                genres.forEach(function(g) {
                    var opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g.charAt(0).toUpperCase() + g.slice(1);
                    genreSelect.appendChild(opt);
                });
            }
            var moodSelect = document.getElementById('ab-mood-filter');
            if (moodSelect && moodSelect.options.length <= 1) {
                moods.forEach(function(m) {
                    var opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
                    moodSelect.appendChild(opt);
                });
            }

            if (countEl) countEl.textContent = tracks.length + ' track' + (tracks.length !== 1 ? 's' : '') + ' found';

            if (tracks.length === 0) {
                list.innerHTML = '<div class="ab-empty"><i class="fas fa-music"></i><p>No tracks match your filters</p></div>';
                return;
            }

            _abTrackMap = {};
            tracks.forEach(function(t) {
                _abTrackMap[t._id] = { _id: t._id, title: t.title, artist: t.artist, coverArt: t.coverArt || '', audioUrl: t.audioUrl, previewUrl: t.previewUrl || '' };
            });

            list.innerHTML = tracks.map(function(t) {
                var coverSrc = t.coverArt || 'assets/default-cover.svg';
                var durationStr = t.duration ? Math.floor(t.duration / 60) + ':' + String(t.duration % 60).padStart(2, '0') : '0:30';
                var moodTag = t.mood ? '<span class="ab-mood-tag">' + escHtml(t.mood) + '</span>' : '';
                var featuredBadge = t.featured ? '<span class="ab-featured-badge"><i class="fas fa-star"></i></span>' : '';
                var rentals = t.totalRentals > 0 ? '<span class="ab-rentals"><i class="fas fa-users"></i> ' + t.totalRentals + '</span>' : '';
                return '<div class="bank-track" data-id="' + t._id + '">'
                    + '<div class="bt-cover">'
                    + '<img src="' + escHtml(coverSrc) + '" alt="' + escHtml(t.title) + '" onerror="this.src=\'assets/default-cover.svg\'">'
                    + '<button class="bank-play-btn"><i class="fas fa-play"></i></button>'
                    + featuredBadge
                    + '</div>'
                    + '<div class="bt-details">'
                    + '<div class="bt-title">' + escHtml(t.title) + '</div>'
                    + '<div class="bt-artist">' + escHtml(t.artist) + '</div>'
                    + '<div class="bt-meta">'
                    + '<span class="ab-genre-tag">' + escHtml(t.genre) + '</span>'
                    + moodTag
                    + '<span class="ab-duration"><i class="fas fa-clock"></i> ' + durationStr + '</span>'
                    + (t.bpm ? '<span class="ab-bpm">' + t.bpm + ' BPM</span>' : '')
                    + rentals
                    + '</div>'
                    + '</div>'
                    + '<div class="bt-action">'
                    + '<div class="bt-price"><i class="fas fa-coins"></i> ' + t.tokenPrice + '</div>'
                    + '<div class="bt-rental-period">' + t.rentalDays + ' days</div>'
                    + '<button class="btn-primary-sm bank-rent-btn">Rent</button>'
                    + '</div>'
                    + '</div>';
            }).join('');

            list.querySelectorAll('.bank-play-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackEl = btn.closest('.bank-track');
                    var trackData = _abTrackMap[trackEl.dataset.id];
                    if (trackData) _abPlayPreview(trackData);
                });
            });

            list.querySelectorAll('.bank-rent-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var trackId = btn.closest('.bank-track').dataset.id;
                    btn.disabled = true;
                    btn.textContent = 'Renting...';
                    fetch(base + '/api/user/rent-snippet', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trackId: trackId })
                    }).then(function(r) {
                        if (!r.ok) return r.json().then(function(d) { throw new Error(d.message || 'Rent failed'); });
                        return r.json();
                    }).then(function(data) {
                        if (data.musicSnippet) {
                            _abStopPreview();
                            renderSnippet(data.musicSnippet);
                            bankModal.style.display = 'none';
                            document.body.style.overflow = '';
                        }
                    }).catch(function(err) {
                        btn.textContent = err.message || 'Error';
                        setTimeout(function() { btn.textContent = 'Rent'; btn.disabled = false; }, 2500);
                    });
                });
            });
        })
        .catch(function() { list.innerHTML = '<div class="ab-empty"><i class="fas fa-exclamation-circle"></i><p>Could not load tracks</p></div>'; });
}

var escHtml = window.escapeHtml || function(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

function renderPhotoGallery(photos) {
    var gallery = document.getElementById('photo-gallery');
    if (!gallery) return;
    var token = localStorage.getItem('authToken');
    var base = typeof apiUrl === 'function' ? apiUrl('').replace(/\/$/, '') : '';
    if (!photos || photos.length === 0) {
        gallery.innerHTML = '<p class="customize-hint" style="margin:0;">No photos yet</p>';
        return;
    }
    gallery.innerHTML = photos.map(function(p, i) {
        return '<div class="photo-gallery-item">'
            + '<img src="' + escHtml(p.url) + '" alt="' + escHtml(p.caption || '') + '" onerror="this.style.display=\'none\'">'
            + '<button class="photo-delete-btn" data-idx="' + i + '"><i class="fas fa-times"></i></button>'
            + '</div>';
    }).join('');
    gallery.querySelectorAll('.photo-delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = btn.dataset.idx;
            fetch(base + '/api/user/profile-photo/' + idx, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            }).then(function(r) { return r.json(); }).then(function(data) {
                if (data.profilePhotos) renderPhotoGallery(data.profilePhotos);
            });
        });
    });
}

function renderSnippet(snippet) {
    var current = document.getElementById('snippet-current');
    var options = document.getElementById('snippet-options');
    var titleEl = document.getElementById('snippet-title');
    var artistEl = document.getElementById('snippet-artist');
    if (snippet && snippet.url) {
        if (current) current.style.display = 'flex';
        if (options) options.style.display = 'none';
        if (titleEl) titleEl.textContent = snippet.title || 'Untitled';
        if (artistEl) artistEl.textContent = snippet.artist || '';
    } else {
        if (current) current.style.display = 'none';
        if (options) options.style.display = 'block';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initProfile);
} else {
    _initProfile();
}

function viewUserProfile(userId) {
    if (!userId) return;
    const modal = document.getElementById('user-profile-modal');
    const loading = document.getElementById('user-profile-modal-loading');
    const body = document.getElementById('user-profile-modal-body');
    if (!modal) return;

    modal.style.display = 'flex';
    loading.style.display = 'flex';
    body.style.display = 'none';

    const token = localStorage.getItem('authToken');
    const currentUserId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')._id; } catch(e) { return null; } })();

    fetch(apiUrl(`/api/user/profile/${userId}`))
        .then(res => {
            if (!res.ok) throw new Error('Not found');
            return res.json();
        })
        .then(user => {
            loading.style.display = 'none';
            body.style.display = 'block';
            const joined = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : '';

            const esc = (str) => { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; };
            const safeAvatar = (user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('assets/') || user.avatar.startsWith('http') || user.avatar.startsWith('/api/'))) ? user.avatar : 'assets/default-avatar.png';

            const isSelf = currentUserId && currentUserId === user._id;
            const followBtnHtml = (!isSelf && token) ? `<button class="vpv-follow-btn" id="vpv-follow-btn" data-uid="${esc(user._id)}"><i class="fas fa-user-plus"></i> Follow</button>` : '';

            let roomHistoryHtml = '';
            if (user.showRoomHistory && user.roomHistory && user.roomHistory.length > 0) {
                const roomItems = user.roomHistory.slice(0, 10).map(r => {
                    const ago = _vpvTimeAgo(r.joinedAt);
                    const tokenBadge = r.tokenPrice > 0 ? `<span class="vpv-token-badge"><i class="fas fa-coins"></i> ${r.tokenPrice}</span>` : '';
                    return `<div class="vpv-room-item"><div class="vpv-room-info"><strong>${esc(r.roomName || 'Unnamed Room')}</strong><span>${esc(r.hostName || '')}</span></div><div class="vpv-room-meta">${tokenBadge}<span class="vpv-room-time">${ago}</span></div></div>`;
                }).join('');
                roomHistoryHtml = `<div class="vpv-rooms-section"><h4><i class="fas fa-headphones"></i> Recent Rooms</h4>${roomItems}</div>`;
            }

            body.innerHTML = `
                <div class="user-profile-view">
                    <div class="user-profile-view-avatar">
                        <img id="user-profile-view-img" src="assets/default-avatar.png" alt="Profile">
                    </div>
                    <h2 id="user-profile-view-name"></h2>
                    <p class="user-profile-view-bio" id="user-profile-view-bio"></p>
                    ${followBtnHtml}
                    <div class="user-profile-view-stats">
                        <div class="stat"><span class="stat-value">${parseInt(user.followingCount) || 0}</span><span class="stat-label">Following</span></div>
                        <div class="stat"><span class="stat-value">${parseInt(user.followersCount) || 0}</span><span class="stat-label">Followers</span></div>
                        <div class="stat"><span class="stat-value">${parseInt(user.searchCount) || 0}</span><span class="stat-label">Searches</span></div>
                    </div>
                    ${joined ? `<p class="user-profile-view-joined">Joined ${esc(joined)}</p>` : ''}
                    ${roomHistoryHtml}
                </div>
            `;

            const nameEl = document.getElementById('user-profile-view-name');
            const bioEl = document.getElementById('user-profile-view-bio');
            const imgEl = document.getElementById('user-profile-view-img');
            if (nameEl) nameEl.textContent = user.name || 'Unknown';
            if (bioEl) bioEl.textContent = user.bio || 'No bio yet';
            if (imgEl) { imgEl.src = safeAvatar; imgEl.onerror = function() { this.src = 'assets/default-avatar.png'; }; }

            const followBtn = document.getElementById('vpv-follow-btn');
            if (followBtn) {
                followBtn.addEventListener('click', async () => {
                    followBtn.disabled = true;
                    followBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    try {
                        const res = await fetch(apiUrl(`/api/user/friends/${userId}`), {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        const data = await res.json();
                        if (res.ok) {
                            followBtn.innerHTML = '<i class="fas fa-check"></i> Following';
                            followBtn.classList.add('following');
                        } else {
                            followBtn.innerHTML = data.message || 'Error';
                            followBtn.disabled = false;
                        }
                    } catch(e) {
                        followBtn.innerHTML = '<i class="fas fa-user-plus"></i> Follow';
                        followBtn.disabled = false;
                    }
                });
            }
        })
        .catch(err => {
            loading.style.display = 'none';
            body.style.display = 'block';
            body.innerHTML = '<p style="text-align:center;padding:2rem;color:#aaa;">Could not load this profile.</p>';
        });

    document.getElementById('user-profile-modal-close').onclick = () => {
        modal.style.display = 'none';
    };
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });
}

function _vpvTimeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    if (days < 30) return days + 'd ago';
    return new Date(dateStr).toLocaleDateString();
}
