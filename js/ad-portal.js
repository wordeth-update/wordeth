class AdPortal {
    constructor() {
        this.token = localStorage.getItem('adPortalToken');
        this.advertiser = null;
        this.init();
    }

    async init() {
        if (this.token) {
            await this.verifyToken();
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
                this.showPortal();
            } else {
                this.showAuth();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            this.showAuth();
        }
    }

    showAuth() {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('portalSection').style.display = 'none';
        document.getElementById('userInfo').style.display = 'none';
    }

    showPortal() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('portalSection').style.display = 'block';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('companyName').textContent = this.advertiser.companyName;
        this.loadMyAds();
    }

    setupEventListeners() {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
        });

        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('createAdForm').addEventListener('submit', (e) => this.handleCreateAd(e));

        document.querySelectorAll('.sidebar-menu li').forEach(item => {
            item.addEventListener('click', () => this.switchTab(item.dataset.tab));
        });

        const imageUrlInput = document.getElementById('imageUrlInput');
        if (imageUrlInput) {
            imageUrlInput.addEventListener('input', (e) => this.updatePreview(e.target.value));
        }

        const keywordsInput = document.getElementById('keywordsInput');
        if (keywordsInput) {
            keywordsInput.addEventListener('input', (e) => this.updateKeywordCount(e.target.value));
        }
    }

    switchAuthTab(tabId) {
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        document.querySelectorAll('.auth-form').forEach(form => {
            form.classList.toggle('active', form.id === `${tabId}Form`);
        });
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

            if (response.ok) {
                this.token = data.token;
                this.advertiser = data.advertiser;
                localStorage.setItem('adPortalToken', this.token);
                this.showPortal();
            } else {
                const errorEl = document.getElementById('loginError');
                if (data.status === 'pending') {
                    errorEl.style.color = '#D29922';
                    errorEl.textContent = data.error;
                } else {
                    errorEl.style.color = '';
                    errorEl.textContent = data.error || 'Login failed';
                }
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
            title: form.title.value,
            description: form.description.value,
            imageUrl: form.imageUrl.value,
            linkUrl: form.linkUrl.value,
            placement: form.placement.value,
            size: form.size.value,
            keywords
        };

        try {
            const response = await fetch('/api/ads/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(adData)
            });

            const data = await response.json();

            if (response.ok) {
                alert('Ad submitted for review! You\'ll be notified when it\'s approved.');
                form.reset();
                document.getElementById('adPreview').innerHTML = '<p>Enter image URL above to see preview</p>';
                document.getElementById('keywordCount').textContent = '0';
                this.switchTab('my-ads');
            } else {
                alert(data.error || 'Failed to create ad');
            }
        } catch (error) {
            console.error('Create ad error:', error);
            alert('Failed to create ad');
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
            case 'my-ads':
                this.loadMyAds();
                break;
            case 'account':
                this.loadAccount();
                break;
        }
    }

    async loadMyAds() {
        try {
            const response = await fetch('/api/ads/my-ads', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('myAdsList');
                const noAds = document.getElementById('noAds');

                if (data.ads && data.ads.length > 0) {
                    container.innerHTML = data.ads.map(ad => this.renderAdItem(ad)).join('');
                    noAds.style.display = 'none';
                } else {
                    container.innerHTML = '';
                    noAds.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Load my ads error:', error);
        }
    }

    loadAccount() {
        const container = document.getElementById('accountInfo');
        if (this.advertiser) {
            container.innerHTML = `
                <p><strong>Company:</strong> ${this.escapeHtml(this.advertiser.companyName)}</p>
                <p><strong>Contact:</strong> ${this.escapeHtml(this.advertiser.contactName)}</p>
                <p><strong>Email:</strong> ${this.escapeHtml(this.advertiser.email)}</p>
                <p><strong>Account Type:</strong> ${this.advertiser.accountType}</p>
                <p><strong>Status:</strong> ${this.advertiser.status}</p>
            `;
        }
    }

    renderAdItem(ad) {
        const keywordsHtml = ad.keywords.slice(0, 5).map(k => 
            `<span class="keyword-tag">${this.escapeHtml(k)}</span>`
        ).join('');
        const moreKeywords = ad.keywords.length > 5 ? `<span class="keyword-tag">+${ad.keywords.length - 5} more</span>` : '';

        let actionsHtml = '';
        if (ad.status === 'active' || ad.status === 'paused') {
            const toggleAction = ad.status === 'active' ? 'paused' : 'active';
            const toggleLabel = ad.status === 'active' ? 'Pause' : 'Resume';
            actionsHtml = `
                <div class="ad-actions">
                    <button class="btn-secondary" onclick="adPortal.toggleAd('${ad._id}', '${toggleAction}')">${toggleLabel}</button>
                </div>
            `;
        }

        return `
            <div class="ad-item">
                <img src="${this.escapeHtml(ad.imageUrl)}" alt="${this.escapeHtml(ad.title)}" class="ad-item-image" onerror="this.src='images/logo.png'">
                <div class="ad-item-info">
                    <h4>${this.escapeHtml(ad.title)}</h4>
                    <p>${ad.placement} | ${ad.size}</p>
                    <p>Impressions: ${this.formatNumber(ad.stats?.impressions || 0)} | Clicks: ${this.formatNumber(ad.stats?.clicks || 0)}</p>
                    <div class="ad-keywords">${keywordsHtml}${moreKeywords}</div>
                    ${actionsHtml}
                </div>
                <span class="ad-status ${ad.status}">${ad.status}</span>
            </div>
        `;
    }

    async toggleAd(adId, newStatus) {
        try {
            const response = await fetch(`/api/ads/update/${adId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ status: newStatus })
            });

            if (response.ok) {
                this.loadMyAds();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update ad');
            }
        } catch (error) {
            console.error('Toggle ad error:', error);
            alert('Failed to update ad');
        }
    }

    updatePreview(url) {
        const preview = document.getElementById('adPreview');
        if (url) {
            preview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Ad Preview" onerror="this.parentElement.innerHTML='<p>Failed to load image</p>'">`;
        } else {
            preview.innerHTML = '<p>Enter image URL above to see preview</p>';
        }
    }

    updateKeywordCount(value) {
        const keywords = value.split(',').map(k => k.trim()).filter(k => k);
        const count = keywords.length;
        const countEl = document.getElementById('keywordCount');
        countEl.textContent = count;
        countEl.style.color = count > 25 ? '#F85149' : 'inherit';
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
        localStorage.removeItem('adPortalToken');
        this.token = null;
        this.advertiser = null;
        window.location.reload();
    }
}

const adPortal = new AdPortal();

function logout() {
    adPortal.logout();
}

function showTab(tabId) {
    adPortal.switchTab(tabId);
}
