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
        this.setupDragDrop('labelDropZone', 'labelFileInput', (file) => this.uploadFile(file, 'label'));
        this.setupDragDrop('salesDropZone', 'salesFileInput', (file) => this.uploadFile(file, 'sales'));
        this.setupCopyButtons();

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
            });
        });
    }

    setupDragDrop(zoneId, inputId, onFile) {
        const zone = document.getElementById(zoneId);
        const input = document.getElementById(inputId);

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

    async uploadFile(file, type) {
        const statusEl = document.getElementById(`${type === 'label' ? 'label' : 'sales'}UploadStatus`);
        statusEl.style.display = 'block';
        statusEl.className = 'upload-status uploading';
        statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Uploading ${file.name}...`;

        const formData = new FormData();
        formData.append('csvFile', file);

        const endpoint = type === 'label' ? '/api/partner/bulk/label' : '/api/partner/bulk/sales';

        try {
            const res = await fetch(`${this.API_BASE}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                },
                body: formData
            });

            const data = await res.json();

            if (res.ok && data.success) {
                let details = '';
                if (type === 'label') {
                    details = `${data.data.labelsCreated} labels created, ${data.data.labelsUpdated} updated, ${data.data.artistsAdded} artists added`;
                } else {
                    details = `${data.data.salesImported} sales imported`;
                    if (data.data.rowErrors > 0) {
                        details += `, ${data.data.rowErrors} rows had errors`;
                    }
                }

                statusEl.className = 'upload-status success';
                statusEl.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message} &mdash; ${details}`;

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
}

document.addEventListener('DOMContentLoaded', () => new PartnerUpload());
