class PartnerUpload {
    constructor() {
        this.API_BASE = window.location.origin;
        this.token = localStorage.getItem('partnerToken');

        if (!this.token) {
            window.location.href = '/partner-login.html';
            return;
        }

        this.init();
    }

    init() {
        this.setupTabs();
        this.setupDragDrop('rosterDropZone', 'rosterFileInput', (file) => this.uploadRoster(file));
        this.setupDragDrop('salesDropZone', 'salesFileInput', (file) => this.uploadSales(file));
        this.setupCopyButtons();
        this.setupArtworkTab();

        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('partnerToken');
            localStorage.removeItem('partnerLabel');
            localStorage.removeItem('partnerUser');
            window.location.href = '/partner-login.html';
        });
    }

    setupTabs() {
        document.querySelectorAll('.upload-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.upload-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}Tab`).classList.add('active');

                if (tab.dataset.tab === 'artwork') {
                    this.loadArtists();
                }
            });
        });
    }

    setupDragDrop(zoneId, inputId, onFile) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);
        if (!zone || !input) return;

        zone.addEventListener('click', () => input.click());

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
        });

        input.addEventListener('change', () => {
            if (input.files[0]) onFile(input.files[0]);
            input.value = '';
        });
    }

    setupCopyButtons() {
        document.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const text = document.getElementById(targetId).textContent;
                navigator.clipboard.writeText(text).then(() => {
                    const origHTML = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied';
                    setTimeout(() => btn.innerHTML = origHTML, 2000);
                });
            });
        });
    }

    setupArtworkTab() {
        const select = document.getElementById('artworkArtistSelect');
        const uploadArea = document.getElementById('artworkUploadArea');

        select.addEventListener('change', () => {
            if (select.value) {
                uploadArea.style.display = 'block';
                this.loadArtistArtwork(select.value);
            } else {
                uploadArea.style.display = 'none';
            }
        });

        this.setupDragDrop('artworkDropZone', 'artworkFileInput', (file) => this.uploadArtwork(file));
    }

    async loadArtists() {
        const select = document.getElementById('artworkArtistSelect');
        const currentVal = select.value;

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/dashboard/artists`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();

            if (data.success && data.data) {
                select.innerHTML = '<option value="">-- Choose an artist --</option>';
                data.data.forEach(artist => {
                    const opt = document.createElement('option');
                    opt.value = artist.slug;
                    opt.textContent = `${artist.name}${artist.genre ? ' (' + artist.genre + ')' : ''}`;
                    select.appendChild(opt);
                });

                if (currentVal) {
                    select.value = currentVal;
                }
            }
        } catch (err) {
            console.error('Failed to load artists:', err);
        }
    }

    async uploadSales(file) {
        const statusEl = document.getElementById('salesUploadStatus');
        statusEl.style.display = 'block';
        statusEl.className = 'upload-status uploading';
        statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing ${file.name}...`;

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/bulk/sales`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                let details = `${data.data.recorded} sales recorded`;
                if (data.data.duplicates > 0) {
                    details += `, ${data.data.duplicates} duplicates skipped`;
                }

                statusEl.className = 'upload-status success';
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message} &mdash; ${details}`;

                if (data.data.parseErrors && data.data.parseErrors.length) {
                    statusEl.innerHTML += `<div class="error-details"><strong>Parse warnings:</strong><ul>${data.data.parseErrors.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
                }
                if (data.data.processingErrors && data.data.processingErrors.length) {
                    statusEl.innerHTML += `<div class="error-details"><strong>Processing errors:</strong><ul>${data.data.processingErrors.map(e => `<li>Row ${e.row}: ${e.message}</li>`).join('')}</ul></div>`;
                }
            } else {
                statusEl.className = 'upload-status error';
                statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Upload failed'}`;
                if (data.expected) {
                    statusEl.innerHTML += `<div class="error-details"><strong>Expected columns:</strong> ${data.expected.join(', ')}</div>`;
                }
            }
        } catch (err) {
            statusEl.className = 'upload-status error';
            statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Network error: ${err.message}`;
        }
    }

    async uploadRoster(file) {
        const statusEl = document.getElementById('rosterUploadStatus');
        statusEl.style.display = 'block';
        statusEl.className = 'upload-status uploading';
        statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading ${file.name}...`;

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/bulk/roster`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                let details = `${data.data.artistsAdded} artists added`;
                if (data.data.artistsSkipped > 0) {
                    details += `, ${data.data.artistsSkipped} already existed`;
                }

                statusEl.className = 'upload-status success';
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message} &mdash; ${details}`;

                if (data.data.artists && data.data.artists.length) {
                    let artistList = '<div class="added-artists"><strong>New artists added:</strong><ul>';
                    data.data.artists.forEach(a => {
                        artistList += `<li><strong>${a.name}</strong> ${a.genre ? '(' + a.genre + ')' : ''} <span class="artist-id-display">ID: ${a.artistId}</span></li>`;
                    });
                    artistList += '</ul></div>';
                    statusEl.innerHTML += artistList;
                }

                if (data.data.errors && data.data.errors.length) {
                    statusEl.innerHTML += `<div class="error-details"><strong>Warnings:</strong><ul>${data.data.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>`;
                }
            } else {
                statusEl.className = 'upload-status error';
                statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Upload failed'}`;
                if (data.expected) {
                    statusEl.innerHTML += `<div class="error-details"><strong>Expected columns:</strong> ${data.expected.join(', ')}</div>`;
                }
            }
        } catch (err) {
            statusEl.className = 'upload-status error';
            statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Network error: ${err.message}`;
        }
    }

    async uploadArtwork(file) {
        const artistSlug = document.getElementById('artworkArtistSelect').value;
        if (!artistSlug) {
            alert('Please select an artist first.');
            return;
        }

        const statusEl = document.getElementById('artworkUploadStatus');
        statusEl.style.display = 'block';
        statusEl.className = 'upload-status uploading';
        statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading ${file.name}...`;

        const formData = new FormData();
        formData.append('artworkFile', file);
        formData.append('artistSlug', artistSlug);

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/artwork/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                statusEl.className = 'upload-status success';
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message}`;
                this.loadArtistArtwork(artistSlug);
            } else {
                statusEl.className = 'upload-status error';
                statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message || 'Upload failed'}`;
            }
        } catch (err) {
            statusEl.className = 'upload-status error';
            statusEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Network error: ${err.message}`;
        }
    }

    async loadArtistArtwork(artistSlug) {
        const gallery = document.getElementById('artworkGallery');
        gallery.innerHTML = '<div class="loading-artwork"><i class="fas fa-spinner fa-spin"></i> Loading artwork...</div>';

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/artwork/${artistSlug}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();

            if (data.success && data.data.artwork.length) {
                gallery.innerHTML = `<h4>${data.data.artistName}'s Artwork (${data.data.artwork.length})</h4>`;
                const grid = document.createElement('div');
                grid.className = 'artwork-grid';

                data.data.artwork.forEach(art => {
                    const card = document.createElement('div');
                    card.className = 'artwork-card';

                    const isImage = ['png', 'svg'].includes(art.format);
                    const sizeKB = Math.round(art.fileSize / 1024);
                    const sizeStr = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;

                    card.innerHTML = `
                        <div class="artwork-preview">
                            ${isImage ? `<img src="${art.url}" alt="${art.filename}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-file-image\\'></i>'">` : `<i class="fas fa-file-${art.format === 'pdf' ? 'pdf' : 'alt'}"></i>`}
                        </div>
                        <div class="artwork-info">
                            <span class="artwork-filename" title="${art.filename}">${art.filename}</span>
                            <span class="artwork-meta">${art.format.toUpperCase()} &middot; ${sizeStr}</span>
                        </div>
                        <button class="artwork-delete" data-artwork-id="${art._id}" data-artist-slug="${artistSlug}" title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    `;

                    card.querySelector('.artwork-delete').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteArtwork(artistSlug, art._id);
                    });

                    grid.appendChild(card);
                });

                gallery.appendChild(grid);
            } else {
                gallery.innerHTML = '<div class="no-artwork"><i class="fas fa-image"></i><span>No artwork uploaded yet for this artist.</span></div>';
            }
        } catch (err) {
            gallery.innerHTML = '<div class="no-artwork"><i class="fas fa-exclamation-triangle"></i><span>Failed to load artwork.</span></div>';
        }
    }

    async deleteArtwork(artistSlug, artworkId) {
        if (!confirm('Delete this artwork file? This cannot be undone.')) return;

        try {
            const res = await fetch(`${this.API_BASE}/api/partner/artwork/${artistSlug}/${artworkId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await res.json();
            if (data.success) {
                this.loadArtistArtwork(artistSlug);
            } else {
                alert(data.message || 'Failed to delete artwork');
            }
        } catch (err) {
            alert('Network error: ' + err.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => new PartnerUpload());
