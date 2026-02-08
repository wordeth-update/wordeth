document.addEventListener('DOMContentLoaded', () => {
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
        editBtn: document.getElementById('edit-profile-btn'),
        editModal: document.getElementById('edit-modal'),
        editClose: document.getElementById('edit-modal-close'),
        editCancel: document.getElementById('edit-cancel'),
        editForm: document.getElementById('edit-profile-form'),
        editName: document.getElementById('edit-name'),
        editBio: document.getElementById('edit-bio'),
        editSave: document.getElementById('edit-save'),
        bioCharCount: document.getElementById('bio-char-count'),
        avatarBtn: document.getElementById('edit-avatar-btn'),
        settingsEmail: document.getElementById('settings-email'),
        settingsJoined: document.getElementById('settings-joined'),
        deleteBtn: document.getElementById('delete-account-btn'),
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

        localStorage.setItem('user', JSON.stringify({ name: user.name, email: user.email, avatar: user.avatar }));
    }

    els.editBtn.addEventListener('click', () => {
        els.editName.value = currentUser?.name || '';
        els.editBio.value = currentUser?.bio || '';
        els.bioCharCount.textContent = (currentUser?.bio || '').length;
        els.editModal.style.display = 'flex';
    });

    function closeModal() {
        els.editModal.style.display = 'none';
    }

    els.editClose.addEventListener('click', closeModal);
    els.editCancel.addEventListener('click', closeModal);
    els.editModal.addEventListener('click', (e) => {
        if (e.target === els.editModal) closeModal();
    });

    els.editBio.addEventListener('input', () => {
        els.bioCharCount.textContent = els.editBio.value.length;
    });

    els.editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
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
                closeModal();
                showToast('Profile updated!');
            } else {
                showToast(data.message || 'Update failed', true);
            }
        } catch (err) {
            showToast('Something went wrong', true);
        }

        els.editSave.disabled = false;
        els.editSave.textContent = 'Save Changes';
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
                    localStorage.setItem('user', JSON.stringify({ name: currentUser.name, email: currentUser.email, avatar: data.avatarUrl }));
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

    async function loadTabContent(tab) {
        if (tab === 'settings') return;

        try {
            const res = await apiFetch(`/api/user/${tab}`);
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

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
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
});

function viewUserProfile(userId) {
    if (!userId) return;
    const modal = document.getElementById('user-profile-modal');
    const loading = document.getElementById('user-profile-modal-loading');
    const body = document.getElementById('user-profile-modal-body');
    if (!modal) return;

    modal.style.display = 'flex';
    loading.style.display = 'flex';
    body.style.display = 'none';

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
            const safeAvatar = (user.avatar && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('assets/') || user.avatar.startsWith('http'))) ? user.avatar : 'assets/default-avatar.png';
            
            body.innerHTML = `
                <div class="user-profile-view">
                    <div class="user-profile-view-avatar">
                        <img id="user-profile-view-img" src="assets/default-avatar.png" alt="Profile">
                    </div>
                    <h2 id="user-profile-view-name"></h2>
                    <p class="user-profile-view-bio" id="user-profile-view-bio"></p>
                    <div class="user-profile-view-stats">
                        <div class="stat"><span class="stat-value">${parseInt(user.followingCount) || 0}</span><span class="stat-label">Following</span></div>
                        <div class="stat"><span class="stat-value">${parseInt(user.followersCount) || 0}</span><span class="stat-label">Followers</span></div>
                        <div class="stat"><span class="stat-value">${parseInt(user.searchCount) || 0}</span><span class="stat-label">Searches</span></div>
                    </div>
                    ${joined ? `<p class="user-profile-view-joined">Joined ${esc(joined)}</p>` : ''}
                </div>
            `;
            
            const nameEl = document.getElementById('user-profile-view-name');
            const bioEl = document.getElementById('user-profile-view-bio');
            const imgEl = document.getElementById('user-profile-view-img');
            if (nameEl) nameEl.textContent = user.name || 'Unknown';
            if (bioEl) bioEl.textContent = user.bio || 'No bio yet';
            if (imgEl) { imgEl.src = safeAvatar; imgEl.onerror = function() { this.src = 'assets/default-avatar.png'; }; }
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
