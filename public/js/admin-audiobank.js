var _token = localStorage.getItem('authToken');
var _base = '';

document.addEventListener('DOMContentLoaded', function() {
    var baseUrl = document.getElementById('api-base-url');
    if (baseUrl) baseUrl.textContent = window.location.origin;
    document.querySelectorAll('.api-url-placeholder').forEach(function(el) { el.textContent = window.location.origin; });

    if (_token) {
        fetch('/api/user/profile', { headers: { 'Authorization': 'Bearer ' + _token } })
            .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
            .then(function() { showContent(); })
            .catch(function() { _token = null; });
    }

    document.getElementById('admin-login-btn').addEventListener('click', doLogin);
    document.getElementById('admin-password').addEventListener('keydown', function(e) { if (e.key === 'Enter') doLogin(); });

    document.querySelectorAll('.admin-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.admin-tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
            tab.classList.add('active');
            document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        });
    });

    document.getElementById('upload-audio').addEventListener('change', function() {
        document.getElementById('audio-file-info').textContent = this.files[0] ? this.files[0].name : 'No file selected';
    });
    document.getElementById('upload-preview').addEventListener('change', function() {
        document.getElementById('preview-file-info').textContent = this.files[0] ? this.files[0].name : 'No file selected';
    });
    document.getElementById('upload-cover').addEventListener('change', function() {
        document.getElementById('cover-file-info').textContent = this.files[0] ? this.files[0].name : 'No file selected';
    });

    document.getElementById('upload-submit-btn').addEventListener('click', uploadTrack);
    document.getElementById('create-key-btn').addEventListener('click', function() {
        var form = document.getElementById('create-key-form');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    });
    document.getElementById('generate-key-btn').addEventListener('click', generateApiKey);
    document.getElementById('copy-key-btn').addEventListener('click', function() {
        var key = document.getElementById('revealed-key').textContent;
        navigator.clipboard.writeText(key).then(function() {
            document.getElementById('copy-key-btn').innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(function() { document.getElementById('copy-key-btn').innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 2000);
        });
    });

    var searchDebounce;
    document.getElementById('tracks-search').addEventListener('input', function() {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(loadTracks, 300);
    });
    document.getElementById('tracks-status-filter').addEventListener('change', loadTracks);
    document.getElementById('tracks-genre-filter').addEventListener('change', loadTracks);
});

function doLogin() {
    var email = document.getElementById('admin-email').value;
    var password = document.getElementById('admin-password').value;
    var errEl = document.getElementById('auth-error');
    errEl.style.display = 'none';

    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.token) {
            _token = data.token;
            localStorage.setItem('authToken', _token);
            showContent();
        } else {
            errEl.textContent = data.message || 'Login failed';
            errEl.style.display = 'block';
        }
    }).catch(function() {
        errEl.textContent = 'Connection error';
        errEl.style.display = 'block';
    });
}

function showContent() {
    document.getElementById('admin-auth').style.display = 'none';
    document.getElementById('admin-content').style.display = 'block';
    loadTracks();
    loadApiKeys();
}

function loadTracks() {
    var search = document.getElementById('tracks-search').value;
    var status = document.getElementById('tracks-status-filter').value;
    var genre = document.getElementById('tracks-genre-filter').value;

    var params = [];
    if (search) params.push('search=' + encodeURIComponent(search));
    if (status) params.push('status=' + status);
    if (genre && genre !== 'all') params.push('genre=' + encodeURIComponent(genre));
    var qs = params.length ? '?' + params.join('&') : '';

    fetch('/api/audiobank/admin/tracks' + qs, { headers: { 'Authorization': 'Bearer ' + _token } })
        .then(function(r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function(data) {
            document.getElementById('stat-total').textContent = data.counts.total;
            document.getElementById('stat-active').textContent = data.counts.active;
            document.getElementById('stat-pending').textContent = data.counts.pending;

            var genreFilter = document.getElementById('tracks-genre-filter');
            if (genreFilter.options.length <= 1 && data.genres) {
                data.genres.forEach(function(g) {
                    var opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g.charAt(0).toUpperCase() + g.slice(1);
                    genreFilter.appendChild(opt);
                });
            }

            var tbody = document.getElementById('tracks-tbody');
            var empty = document.getElementById('tracks-empty');
            if (!data.tracks || data.tracks.length === 0) {
                tbody.innerHTML = '';
                empty.style.display = 'flex';
                return;
            }
            empty.style.display = 'none';

            tbody.innerHTML = data.tracks.map(function(t) {
                var statusClass = t.active ? 'status-active' : 'status-pending';
                var statusLabel = t.active ? 'Active' : 'Pending';
                var featuredStar = t.featured ? '<i class="fas fa-star featured-star"></i>' : '';
                var source = t.submittedBy ? esc(t.submittedBy) : '<span class="source-admin">Admin</span>';
                return '<tr data-id="' + t._id + '">'
                    + '<td class="track-cell">'
                    + (t.coverArt ? '<img src="' + esc(t.coverArt) + '" class="track-thumb">' : '<div class="track-thumb-placeholder"><i class="fas fa-music"></i></div>')
                    + '<div><strong>' + esc(t.title) + '</strong> ' + featuredStar + '<br><span class="track-artist">' + esc(t.artist) + '</span></div>'
                    + '</td>'
                    + '<td><span class="genre-badge">' + esc(t.genre) + '</span> <span class="mood-badge">' + esc(t.mood) + '</span></td>'
                    + '<td><i class="fas fa-coins coin-icon"></i> ' + t.tokenPrice + '<br><small>' + t.rentalDays + 'd</small></td>'
                    + '<td>' + t.totalRentals + '</td>'
                    + '<td><span class="status-badge ' + statusClass + '">' + statusLabel + '</span></td>'
                    + '<td>' + source + '</td>'
                    + '<td class="actions-cell">'
                    + (!t.active ? '<button class="action-btn approve-btn" title="Approve"><i class="fas fa-check"></i></button>' : '<button class="action-btn reject-btn" title="Deactivate"><i class="fas fa-pause"></i></button>')
                    + '<button class="action-btn feature-btn" title="Toggle Featured"><i class="fas fa-star"></i></button>'
                    + '<button class="action-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button>'
                    + '</td></tr>';
            }).join('');

            tbody.querySelectorAll('.approve-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { trackAction(btn.closest('tr').dataset.id, 'approve'); });
            });
            tbody.querySelectorAll('.reject-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { trackAction(btn.closest('tr').dataset.id, 'reject'); });
            });
            tbody.querySelectorAll('.feature-btn').forEach(function(btn) {
                btn.addEventListener('click', function() { trackAction(btn.closest('tr').dataset.id, 'feature'); });
            });
            tbody.querySelectorAll('.delete-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    if (confirm('Permanently delete this track?')) trackAction(btn.closest('tr').dataset.id, 'delete');
                });
            });
        })
        .catch(function(err) { console.error('Load tracks error:', err); });
}

function trackAction(id, action) {
    var method = action === 'delete' ? 'DELETE' : 'PUT';
    var url = action === 'delete' ? '/api/audiobank/admin/tracks/' + id : '/api/audiobank/admin/tracks/' + id + '/' + action;
    fetch(url, { method: method, headers: { 'Authorization': 'Bearer ' + _token } })
        .then(function(r) { return r.json(); })
        .then(function() { loadTracks(); });
}

function uploadTrack() {
    var btn = document.getElementById('upload-submit-btn');
    var status = document.getElementById('upload-status');
    var title = document.getElementById('upload-title').value;
    var audioFile = document.getElementById('upload-audio').files[0];

    if (!title) { showStatus('Title is required', true); return; }
    if (!audioFile) { showStatus('Audio file is required', true); return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
    status.style.display = 'none';

    var fd = new FormData();
    fd.append('title', title);
    fd.append('artist', document.getElementById('upload-artist').value || '');
    fd.append('genre', document.getElementById('upload-genre').value);
    fd.append('mood', document.getElementById('upload-mood').value);
    fd.append('bpm', document.getElementById('upload-bpm').value || '');
    fd.append('duration', document.getElementById('upload-duration').value || '30');
    fd.append('tokenPrice', document.getElementById('upload-price').value || '5');
    fd.append('rentalDays', document.getElementById('upload-rental-days').value || '30');
    fd.append('tags', document.getElementById('upload-tags').value || '');
    fd.append('audio', audioFile);

    var previewFile = document.getElementById('upload-preview').files[0];
    if (previewFile) fd.append('preview', previewFile);
    var coverFile = document.getElementById('upload-cover').files[0];
    if (coverFile) fd.append('cover', coverFile);

    fetch('/api/audiobank/admin/tracks', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _token },
        body: fd
    }).then(function(r) { return r.json(); }).then(function(data) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Upload Track';
        if (data.success) {
            showStatus('Track uploaded and activated!', false);
            document.getElementById('upload-title').value = '';
            document.getElementById('upload-artist').value = '';
            document.getElementById('upload-tags').value = '';
            document.getElementById('upload-audio').value = '';
            document.getElementById('upload-preview').value = '';
            document.getElementById('upload-cover').value = '';
            document.getElementById('audio-file-info').textContent = 'No file selected';
            document.getElementById('preview-file-info').textContent = 'No file selected';
            document.getElementById('cover-file-info').textContent = 'No file selected';
            loadTracks();
        } else {
            showStatus(data.message || 'Upload failed', true);
        }
    }).catch(function() {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload"></i> Upload Track';
        showStatus('Upload failed', true);
    });
}

function showStatus(msg, isError) {
    var el = document.getElementById('upload-status');
    el.textContent = msg;
    el.className = 'upload-status ' + (isError ? 'error' : 'success');
    el.style.display = 'block';
}

function loadApiKeys() {
    fetch('/api/audiobank/admin/api-keys', { headers: { 'Authorization': 'Bearer ' + _token } })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            var list = document.getElementById('api-keys-list');
            if (!data.keys || data.keys.length === 0) {
                list.innerHTML = '<div class="keys-empty"><i class="fas fa-key"></i><p>No API keys created yet</p></div>';
                return;
            }
            list.innerHTML = data.keys.map(function(k) {
                return '<div class="key-card" data-id="' + k._id + '">'
                    + '<div class="key-info">'
                    + '<strong>' + esc(k.name) + '</strong>'
                    + '<span class="key-org">' + esc(k.organization) + '</span>'
                    + '<span class="key-email">' + esc(k.email) + '</span>'
                    + '<div class="key-meta">'
                    + '<code>' + esc(k.keyPrefix) + '...</code>'
                    + '<span class="key-perms">' + (k.permissions || []).join(', ') + '</span>'
                    + '</div>'
                    + '<div class="key-stats">'
                    + '<span>' + (k.totalRequests || 0) + ' requests</span>'
                    + '<span>Last used: ' + (k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : 'Never') + '</span>'
                    + '</div>'
                    + '</div>'
                    + '<div class="key-actions">'
                    + '<span class="status-badge ' + (k.active ? 'status-active' : 'status-pending') + '">' + (k.active ? 'Active' : 'Disabled') + '</span>'
                    + '<button class="action-btn toggle-key-btn" title="Toggle"><i class="fas fa-power-off"></i></button>'
                    + '<button class="action-btn delete-key-btn" title="Delete"><i class="fas fa-trash"></i></button>'
                    + '</div></div>';
            }).join('');
            list.querySelectorAll('.toggle-key-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var id = btn.closest('.key-card').dataset.id;
                    fetch('/api/audiobank/admin/api-keys/' + id + '/toggle', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + _token } })
                        .then(function() { loadApiKeys(); });
                });
            });
            list.querySelectorAll('.delete-key-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    if (!confirm('Delete this API key? Rights holder will lose access.')) return;
                    var id = btn.closest('.key-card').dataset.id;
                    fetch('/api/audiobank/admin/api-keys/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + _token } })
                        .then(function() { loadApiKeys(); });
                });
            });
        });
}

function generateApiKey() {
    var name = document.getElementById('key-name').value;
    var org = document.getElementById('key-org').value;
    var email = document.getElementById('key-email').value;
    if (!name || !org || !email) { alert('All fields are required'); return; }

    var perms = [];
    document.querySelectorAll('.perm-checks input:checked').forEach(function(cb) { perms.push(cb.value); });

    fetch('/api/audiobank/admin/api-keys', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, organization: org, email: email, permissions: perms })
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
            document.getElementById('revealed-key').textContent = data.apiKey.key;
            document.getElementById('key-reveal').style.display = 'block';
            document.getElementById('create-key-form').style.display = 'none';
            document.getElementById('key-name').value = '';
            document.getElementById('key-org').value = '';
            document.getElementById('key-email').value = '';
            loadApiKeys();
        } else {
            alert(data.message || 'Failed to create key');
        }
    });
}

function esc(str) {
    var d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
