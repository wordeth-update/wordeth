class AdAdmin {
    constructor() {
        this.token = localStorage.getItem('adAdminToken');
        this.advertiser = null;
        this.init();
    }

    async init() {
        if (this.token) {
            await this.verifyToken();
        } else {
            this.showLoginModal();
        }

        this.setupEventListeners();
    }

    async verifyToken() {
        try {
            const response = await fetch('/api/ads/advertisers/profile', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.advertiser = await response.json();
                if (this.advertiser.role !== 'admin') {
                    alert('Admin access required');
                    this.logout();
                    return;
                }
                document.getElementById('adminName').textContent = this.advertiser.contactName;
                document.getElementById('loginModal').classList.add('hidden');
                this.loadDashboard();
            } else {
                this.showLoginModal();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            this.showLoginModal();
        }
    }

    showLoginModal() {
        document.getElementById('loginModal').classList.remove('hidden');
    }

    setupEventListeners() {
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('createAdForm').addEventListener('submit', (e) => this.handleCreateAd(e));
        document.getElementById('createAdminForm').addEventListener('submit', (e) => this.handleCreateAdmin(e));

        document.querySelectorAll('.sidebar-menu li').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        document.getElementById('statusFilter').addEventListener('change', (e) => {
            this.loadAllAds(e.target.value);
        });

        const imageUrlInput = document.querySelector('input[name="imageUrl"]');
        if (imageUrlInput) {
            imageUrlInput.addEventListener('input', (e) => this.updatePreview(e.target.value));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value;
        const password = form.password.value;

        try {
            const response = await fetch('/api/ads/advertisers/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.advertiser.role === 'admin') {
                this.token = data.token;
                this.advertiser = data.advertiser;
                localStorage.setItem('adAdminToken', this.token);
                document.getElementById('adminName').textContent = this.advertiser.contactName || this.advertiser.email;
                document.getElementById('loginModal').classList.add('hidden');
                this.loadDashboard();
            } else if (response.ok) {
                document.getElementById('loginError').textContent = 'Admin access required';
            } else {
                document.getElementById('loginError').textContent = data.error || 'Login failed';
            }
        } catch (error) {
            console.error('Login error:', error);
            document.getElementById('loginError').textContent = 'Login failed. Please try again.';
        }
    }

    async handleCreateAd(e) {
        e.preventDefault();
        const form = e.target;
        const keywords = form.keywords.value.split(',').map(k => k.trim()).filter(k => k);

        if (keywords.length > 25) {
            alert('Maximum 25 keywords allowed');
            return;
        }

        const adData = {
            clientEmail: form.clientEmail.value,
            title: form.title.value,
            description: form.description.value,
            imageUrl: form.imageUrl.value,
            linkUrl: form.linkUrl.value,
            placement: form.placement.value,
            size: form.size.value,
            keywords
        };

        try {
            const response = await fetch('/api/ads/admin/upload-for-client', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(adData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Ad created successfully!');
                form.reset();
                document.getElementById('adPreview').innerHTML = '<p>Enter image URL to preview</p>';
                this.loadAllAds();
            } else {
                alert(data.error || 'Failed to create ad');
            }
        } catch (error) {
            console.error('Create ad error:', error);
            alert('Failed to create ad');
        }
    }

    async handleCreateAdmin(e) {
        e.preventDefault();
        const form = e.target;

        try {
            const response = await fetch('/api/ads/admin/create-admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    email: form.email.value,
                    password: form.password.value,
                    contactName: form.contactName.value
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Admin account created successfully!');
                form.reset();
            } else {
                alert(data.error || 'Failed to create admin');
            }
        } catch (error) {
            console.error('Create admin error:', error);
            alert('Failed to create admin account');
        }
    }

    switchTab(tabId) {
        document.querySelectorAll('.sidebar-menu li').forEach(item => {
            item.classList.toggle('active', item.dataset.tab === tabId);
        });

        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.toggle('active', tab.id === `${tabId}-tab`);
        });

        switch (tabId) {
            case 'dashboard':
                this.loadDashboard();
                break;
            case 'pending':
                this.loadPendingAds();
                break;
            case 'all-ads':
                this.loadAllAds();
                break;
            case 'advertisers':
                this.loadAdvertisers();
                break;
        }
    }

    async loadDashboard() {
        try {
            const response = await fetch('/api/ads/admin/analytics', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                
                document.getElementById('totalAds').textContent = data.overview.totalAds;
                document.getElementById('activeAds').textContent = data.overview.activeAds;
                document.getElementById('totalImpressions').textContent = this.formatNumber(data.performance.totalImpressions || 0);
                document.getElementById('totalClicks').textContent = this.formatNumber(data.performance.totalClicks || 0);
                document.getElementById('pendingCount').textContent = data.overview.pendingAds;

                const topAdsList = document.getElementById('topAdsList');
                if (data.topAds && data.topAds.length > 0) {
                    topAdsList.innerHTML = data.topAds.map(ad => this.renderAdItem(ad)).join('');
                } else {
                    topAdsList.innerHTML = '<p class="empty-message">No active ads yet</p>';
                }
            }
        } catch (error) {
            console.error('Load dashboard error:', error);
        }
    }

    async loadPendingAds() {
        try {
            const response = await fetch('/api/ads/admin/pending', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('pendingAdsList');
                const noMessage = document.getElementById('noPending');

                if (data.ads && data.ads.length > 0) {
                    container.innerHTML = data.ads.map(ad => this.renderAdItem(ad, true)).join('');
                    noMessage.style.display = 'none';
                } else {
                    container.innerHTML = '';
                    noMessage.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Load pending ads error:', error);
        }
    }

    async loadAllAds(status = '') {
        try {
            let url = '/api/ads/admin/all-ads';
            if (status) url += `?status=${status}`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('allAdsList');

                if (data.ads && data.ads.length > 0) {
                    container.innerHTML = data.ads.map(ad => this.renderAdItem(ad)).join('');
                } else {
                    container.innerHTML = '<p class="empty-message">No ads found</p>';
                }
            }
        } catch (error) {
            console.error('Load all ads error:', error);
        }
    }

    async loadAdvertisers() {
        try {
            const response = await fetch('/api/ads/admin/all-advertisers', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('advertisersList');

                if (data.advertisers && data.advertisers.length > 0) {
                    container.innerHTML = data.advertisers.map(adv => `
                        <div class="advertiser-item">
                            <div class="advertiser-info">
                                <h4>${this.escapeHtml(adv.companyName)}</h4>
                                <p>${this.escapeHtml(adv.email)} | ${adv.accountType}</p>
                            </div>
                            <span class="ad-status ${adv.status}">${adv.status}</span>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<p class="empty-message">No advertisers yet</p>';
                }
            }
        } catch (error) {
            console.error('Load advertisers error:', error);
        }
    }

    renderAdItem(ad, showApproveButtons = false) {
        const advertiserName = ad.advertiserId?.companyName || 'Unknown';
        const keywordsHtml = ad.keywords.slice(0, 5).map(k => 
            `<span class="keyword-tag">${this.escapeHtml(k)}</span>`
        ).join('');
        const moreKeywords = ad.keywords.length > 5 ? `<span class="keyword-tag">+${ad.keywords.length - 5} more</span>` : '';

        let actionsHtml = '';
        if (showApproveButtons) {
            actionsHtml = `
                <div class="ad-actions">
                    <button class="btn-primary" onclick="adAdmin.approveAd('${ad._id}')">Approve</button>
                    <button class="btn-danger" onclick="adAdmin.rejectAd('${ad._id}')">Reject</button>
                </div>
            `;
        }

        return `
            <div class="ad-item">
                <img src="${this.escapeHtml(ad.imageUrl)}" alt="${this.escapeHtml(ad.title)}" class="ad-item-image" onerror="this.src='images/wordeth-logo.svg'">
                <div class="ad-item-info">
                    <h4>${this.escapeHtml(ad.title)}</h4>
                    <p>By: ${this.escapeHtml(advertiserName)} | ${ad.placement} | ${ad.size}</p>
                    <p>Impressions: ${this.formatNumber(ad.stats?.impressions || 0)} | Clicks: ${this.formatNumber(ad.stats?.clicks || 0)}</p>
                    <div class="ad-keywords">${keywordsHtml}${moreKeywords}</div>
                    ${actionsHtml}
                </div>
                <span class="ad-status ${ad.status}">${ad.status}</span>
            </div>
        `;
    }

    async approveAd(adId) {
        try {
            const response = await fetch(`/api/ads/admin/approve/${adId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.loadPendingAds();
                this.loadDashboard();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to approve ad');
            }
        } catch (error) {
            console.error('Approve ad error:', error);
            alert('Failed to approve ad');
        }
    }

    async rejectAd(adId) {
        const reason = prompt('Reason for rejection (optional):');
        try {
            const response = await fetch(`/api/ads/admin/reject/${adId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ reason })
            });

            if (response.ok) {
                this.loadPendingAds();
                this.loadDashboard();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to reject ad');
            }
        } catch (error) {
            console.error('Reject ad error:', error);
            alert('Failed to reject ad');
        }
    }

    updatePreview(url) {
        const preview = document.getElementById('adPreview');
        if (url) {
            preview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Ad Preview" onerror="this.parentElement.innerHTML='<p>Failed to load image</p>'">`;
        } else {
            preview.innerHTML = '<p>Enter image URL to preview</p>';
        }
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    logout() {
        localStorage.removeItem('adAdminToken');
        this.token = null;
        this.advertiser = null;
        window.location.reload();
    }
}

const adAdmin = new AdAdmin();

function logout() {
    adAdmin.logout();
}
