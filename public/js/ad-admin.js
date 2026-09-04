class AdAdmin {
    constructor() {
        this.token = localStorage.getItem('adAdminToken');
        this.advertiser = null;
        this.allPartners = [];
        this.allAds = [];
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
            const response = await fetch(apiUrl('/api/ads/advertisers/profile'), {
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
                this.loadOverview();
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

        document.querySelectorAll('#partnerFilters .filter-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#partnerFilters .filter-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderPartners(btn.dataset.filter);
            });
        });

        document.querySelectorAll('#adFilters .filter-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#adFilters .filter-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadAllAds(btn.dataset.filter);
            });
        });

        document.querySelectorAll('#apliiqFilters .filter-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#apliiqFilters .filter-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.loadApliiqProducts(btn.dataset.filter);
            });
        });

        document.getElementById('apliiqProductsList').addEventListener('click', event => {
            const button = event.target.closest('[data-product-action]');
            if (button) this.updateApliiqProduct(button.dataset.productId, button.dataset.productAction);
        });
        document.getElementById('warehouseIssuesList').addEventListener('click', event => {
            const button = event.target.closest('[data-issue-action]');
            if (button) {
                this.updateWarehouseIssue(
                    button.dataset.shipmentId,
                    button.dataset.issueKey,
                    button.dataset.issueAction
                );
            }
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
            const response = await fetch(apiUrl('/api/ads/advertisers/login'), {
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
                this.loadOverview();
            } else if (response.ok) {
                document.getElementById('loginError').textContent = 'Admin access required. Advertising partners should use the Ad Portal.';
            } else {
                document.getElementById('loginError').textContent = data.error || 'Login failed';
            }
        } catch (error) {
            console.error('Login error:', error);
            document.getElementById('loginError').textContent = 'Login failed. Please try again.';
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
            case 'overview':
                this.loadOverview();
                break;
            case 'applications':
                this.loadApplications();
                break;
            case 'partners':
                this.loadPartners();
                break;
            case 'ad-oversight':
                this.loadAllAds();
                break;
            case 'apliiq-products':
                this.loadApliiqProducts('pending');
                break;
            case 'warehouse-issues':
                this.loadWarehouseIssues();
                break;
        }
    }

    async loadApliiqProducts(status) {
        const list = document.getElementById('apliiqProductsList');
        list.innerHTML = '<p class="empty-message">Loading products…</p>';
        const response = await fetch(apiUrl(`/api/apliiq/admin/products?status=${encodeURIComponent(status)}`), {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const data = await response.json();
        if (!response.ok) return void (list.innerHTML = `<p class="error-message">${this.escapeHtml(data.error || 'Unable to load products')}</p>`);
        list.innerHTML = data.products.length ? data.products.map(product => `
            <article class="ops-card">
                <h3>${this.escapeHtml(product.name)} <span class="status-pill">${this.escapeHtml(product.status)}</span></h3>
                <div class="ops-meta">${this.escapeHtml(product.type || 'Unknown type')} · ${product.variants.length} variants · ID ${this.escapeHtml(product.storeProductId)}</div>
                ${product.approvedSnapshot ? '<div class="ops-meta">The last approved version remains live while these changes are reviewed.</div>' : ''}
                <div class="ops-actions">
                    <select id="mapping-${product._id}">
                        ${['tshirt','hoodie','tank','longsleeve','sweatshirt','hat'].map(value => `<option value="${value}" ${product.wordethProduct === value ? 'selected' : ''}>${value}</option>`).join('')}
                    </select>
                    <input id="product-note-${product._id}" placeholder="Audit note (optional)" maxlength="1000">
                    <button class="action-btn" data-product-id="${product._id}" data-product-hash="${product.reviewHash || product.lastPayloadHash}" data-product-action="map">Save mapping</button>
                    <button class="action-btn" data-product-id="${product._id}" data-product-hash="${product.reviewHash || product.lastPayloadHash}" data-product-action="approve">Approve</button>
                    <button class="action-btn" data-product-id="${product._id}" data-product-hash="${product.reviewHash || product.lastPayloadHash}" data-product-action="archive">Archive</button>
                </div>
            </article>`).join('') : '<p class="empty-message">No products in this queue.</p>';
    }

    async updateApliiqProduct(id, action) {
        const response = await fetch(apiUrl(`/api/apliiq/admin/products/${id}`), {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                wordethProduct: document.getElementById(`mapping-${id}`).value,
                expectedReviewHash: document.querySelector(`[data-product-id="${id}"]`).dataset.productHash,
                note: document.getElementById(`product-note-${id}`).value
            })
        });
        const data = await response.json();
        if (!response.ok) return alert(data.error || 'Unable to update product');
        this.loadApliiqProducts(data.product.status);
    }

    async loadWarehouseIssues() {
        const list = document.getElementById('warehouseIssuesList');
        list.innerHTML = '<p class="empty-message">Loading issues…</p>';
        const response = await fetch(apiUrl('/api/apliiq/admin/warehouse/issues'), {
            headers: { 'Authorization': `Bearer ${this.token}` }
        });
        const data = await response.json();
        if (!response.ok) return void (list.innerHTML = `<p class="error-message">${this.escapeHtml(data.error || 'Unable to load issues')}</p>`);
        const issues = data.shipments.flatMap(shipment => shipment.items.map(item => ({ shipment, item })));
        list.innerHTML = issues.length ? issues.map(({ shipment, item }) => {
            const safeShipmentId = encodeURIComponent(shipment.shipmentId);
            const safeIssueKey = encodeURIComponent(item.issueKey);
            const isCurrent = item.presentInLatestReport !== false &&
                (item.quantityExpected !== item.quantityReceived || Boolean(item.receivingErrors));
            const audit = (item.issueAudit || []).map(entry => `
                <li>${this.escapeHtml(entry.action)} · ${this.escapeHtml(new Date(entry.at).toLocaleString())}${entry.note ? ` · ${this.escapeHtml(entry.note)}` : ''}</li>
            `).join('');
            return `
            <article class="ops-card">
                <h3>${this.escapeHtml(item.name || item.issueKey)} <span class="status-pill">${this.escapeHtml(item.issueStatus)}</span></h3>
                <div class="ops-meta">Shipment ${this.escapeHtml(shipment.name || shipment.shipmentId)} · Expected ${item.quantityExpected} · Received ${item.quantityReceived}</div>
                ${item.receivingErrors ? `<p>${this.escapeHtml(item.receivingErrors)}</p>` : ''}
                ${isCurrent ? `<div class="ops-actions">
                    <input id="issue-note-${safeShipmentId}-${safeIssueKey}" placeholder="Audit note (optional)" maxlength="1000">
                    <button class="action-btn" data-shipment-id="${safeShipmentId}" data-issue-key="${safeIssueKey}" data-issue-action="acknowledge">Acknowledge</button>
                    <button class="action-btn" data-shipment-id="${safeShipmentId}" data-issue-key="${safeIssueKey}" data-issue-action="resolve">Resolve</button>
                </div>` : '<p class="ops-meta">Historical issue; not present as a discrepancy in the latest report.</p>'}
                ${audit ? `<details class="ops-meta"><summary>${item.issueAudit.length} audit event(s)</summary><ul>${audit}</ul></details>` : '<div class="ops-meta">No staff actions yet</div>'}
            </article>`;
        }).join('') : '<p class="empty-message">No warehouse discrepancies.</p>';
    }

    async updateWarehouseIssue(shipmentId, issueKey, action) {
        const note = document.getElementById(`issue-note-${shipmentId}-${issueKey}`).value;
        const response = await fetch(apiUrl(`/api/apliiq/admin/warehouse/shipments/${shipmentId}/issues/${issueKey}`), {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, note })
        });
        const data = await response.json();
        if (!response.ok) return alert(data.error || 'Unable to update warehouse issue');
        this.loadWarehouseIssues();
    }

    async loadOverview() {
        this.loadApplicationCount();

        try {
            const [analyticsRes, partnersRes, appsRes] = await Promise.all([
                fetch(apiUrl('/api/ads/admin/analytics'), { headers: { 'Authorization': `Bearer ${this.token}` } }),
                fetch(apiUrl('/api/ads/admin/all-advertisers'), { headers: { 'Authorization': `Bearer ${this.token}` } }),
                fetch(apiUrl('/api/ads/admin/pending-applications'), { headers: { 'Authorization': `Bearer ${this.token}` } })
            ]);

            if (analyticsRes.ok) {
                const data = await analyticsRes.json();
                document.getElementById('overviewActiveAds').textContent = data.overview.activeAds || 0;
                document.getElementById('overviewPendingAds').textContent = data.overview.pendingAds || 0;
                document.getElementById('pendingCount').textContent = data.overview.pendingAds || 0;
                document.getElementById('overviewImpressions').textContent = this.formatNumber(data.performance.totalImpressions || 0);
                document.getElementById('overviewClicks').textContent = this.formatNumber(data.performance.totalClicks || 0);

                const topAdsList = document.getElementById('topAdsList');
                if (data.topAds && data.topAds.length > 0) {
                    topAdsList.innerHTML = `<ul class="quick-list">${data.topAds.slice(0, 4).map(ad => `
                        <li>
                            <span class="ql-label">${this.escapeHtml(ad.title)}</span>
                            <span class="ql-value">${this.formatNumber(ad.stats?.impressions || 0)} imp</span>
                        </li>
                    `).join('')}</ul>`;
                } else {
                    topAdsList.innerHTML = '<p class="empty-message">No active ads yet</p>';
                }
            }

            if (partnersRes.ok) {
                const pData = await partnersRes.json();
                const approved = (pData.advertisers || []).filter(a => a.status === 'approved' && a.role !== 'admin');
                document.getElementById('overviewActivePartners').textContent = approved.length;
            }

            if (appsRes.ok) {
                const aData = await appsRes.json();
                const apps = aData.applications || [];
                document.getElementById('overviewPendingApps').textContent = apps.length;
                document.getElementById('appCount').textContent = apps.length;

                const pendingCard = document.getElementById('pendingAppsCard');
                pendingCard.classList.toggle('warning', apps.length > 0);

                const recentContainer = document.getElementById('recentApplications');
                if (apps.length > 0) {
                    recentContainer.innerHTML = `<ul class="quick-list">${apps.slice(0, 4).map(app => `
                        <li>
                            <div>
                                <span class="ql-label">${this.escapeHtml(app.companyName)}</span>
                                <div style="font-size:0.75rem; color:var(--text-secondary);">${this.escapeHtml(app.contactName)} &middot; ${app.accountType === 'partner' ? 'White Glove' : 'Self-Serve'}</div>
                            </div>
                            <button class="action-btn" onclick="adAdmin.switchTab('applications')">Review</button>
                        </li>
                    `).join('')}</ul>`;
                } else {
                    recentContainer.innerHTML = '<p class="empty-message">No pending applications</p>';
                }
            }
        } catch (error) {
            console.error('Load overview error:', error);
        }
    }

    async loadApplicationCount() {
        try {
            const response = await fetch(apiUrl('/api/ads/admin/pending-applications'), {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const count = data.applications ? data.applications.length : 0;
                const countEl = document.getElementById('appCount');
                if (countEl) countEl.textContent = count;
            }
        } catch (error) {
            console.error('Load app count error:', error);
        }
    }

    async loadApplications() {
        try {
            const response = await fetch(apiUrl('/api/ads/admin/pending-applications'), {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('applicationsList');
                const noMessage = document.getElementById('noApplications');
                const countEl = document.getElementById('appCount');

                if (countEl) countEl.textContent = data.applications ? data.applications.length : 0;

                if (data.applications && data.applications.length > 0) {
                    container.innerHTML = data.applications.map(app => this.renderApplication(app)).join('');
                    noMessage.style.display = 'none';
                } else {
                    container.innerHTML = '';
                    noMessage.style.display = 'block';
                }
            }
        } catch (error) {
            console.error('Load applications error:', error);
        }
    }

    renderApplication(app) {
        const budgetLabels = {
            'under-500': 'Under $500/mo', '500-2000': '$500-$2,000/mo', '2000-5000': '$2,000-$5,000/mo',
            '5000-10000': '$5,000-$10,000/mo', '10000-25000': '$10,000-$25,000/mo', '25000-plus': '$25,000+/mo'
        };
        const typeLabels = {
            'brand': 'Brand / Consumer Product', 'record-label': 'Record Label', 'independent-artist': 'Independent Artist',
            'retailer': 'Retailer / E-Commerce', 'tech-company': 'Tech / App Company', 'event-promoter': 'Event Promoter / Venue',
            'media-entertainment': 'Media / Entertainment', 'agency': 'Marketing / Ad Agency', 'nonprofit': 'Nonprofit', 'other': 'Other'
        };
        const acctLabels = { 'self-serve': 'Self-Serve', 'partner': 'Partner (White Glove)' };
        const adExp = { 'yes-digital': 'Digital', 'yes-traditional': 'Traditional', 'yes-both': 'Both', 'no': 'None' };
        const startLabels = { 'immediately': 'Immediately', 'within-2-weeks': 'Within 2 weeks', 'within-month': 'Within a month', 'within-quarter': 'Within 3 months', 'exploring': 'Just exploring' };

        const a = app.application || {};
        const goals = (a.campaignGoals || []).map(g => g.replace(/-/g, ' ')).join(', ');
        const genres = (a.targetGenres || []).map(g => g.replace(/-/g, ' ')).join(', ');
        const date = new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
            <div class="ad-item" style="flex-direction:column; gap:1rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                    <div>
                        <h4>${this.escapeHtml(app.companyName)}</h4>
                        <p style="margin:4px 0;">${this.escapeHtml(app.contactName)} &middot; ${this.escapeHtml(app.email)}</p>
                        <p style="margin:4px 0; font-size:0.8rem; color:var(--text-secondary);">${date}</p>
                    </div>
                    <span class="ad-status pending" style="white-space:nowrap;">${acctLabels[app.accountType] || app.accountType}</span>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 2rem; width:100%; font-size:0.85rem; color:var(--text-secondary);">
                    <div><strong style="color:var(--text-primary);">Business Type:</strong> ${this.escapeHtml(typeLabels[a.businessType] || a.businessType || 'N/A')}${a.businessTypeOther ? ' (' + this.escapeHtml(a.businessTypeOther) + ')' : ''}</div>
                    <div><strong style="color:var(--text-primary);">Budget:</strong> ${budgetLabels[a.monthlyBudget] || a.monthlyBudget || 'N/A'}</div>
                    <div><strong style="color:var(--text-primary);">Ad Experience:</strong> ${adExp[a.previousAdvertising] || a.previousAdvertising || 'N/A'}</div>
                    <div><strong style="color:var(--text-primary);">Start Date:</strong> ${startLabels[a.expectedStartDate] || a.expectedStartDate || 'N/A'}</div>
                    <div style="grid-column:span 2;"><strong style="color:var(--text-primary);">Goals:</strong> ${this.escapeHtml(goals || 'N/A')}${a.campaignGoalsOther ? ' (' + this.escapeHtml(a.campaignGoalsOther) + ')' : ''}</div>
                    <div style="grid-column:span 2;"><strong style="color:var(--text-primary);">Target Audience:</strong> ${this.escapeHtml(a.targetAudience || 'N/A')}</div>
                    ${genres ? `<div style="grid-column:span 2;"><strong style="color:var(--text-primary);">Genres:</strong> ${this.escapeHtml(genres)}</div>` : ''}
                    <div style="grid-column:span 2;"><strong style="color:var(--text-primary);">Description:</strong> ${this.escapeHtml(a.businessDescription || 'N/A')}</div>
                    ${a.additionalNotes ? `<div style="grid-column:span 2;"><strong style="color:var(--text-primary);">Notes:</strong> ${this.escapeHtml(a.additionalNotes)}</div>` : ''}
                    ${app.phone ? `<div><strong style="color:var(--text-primary);">Phone:</strong> ${this.escapeHtml(app.phone)}</div>` : ''}
                    ${app.website ? `<div><strong style="color:var(--text-primary);">Website:</strong> <a href="${this.escapeHtml(app.website)}" target="_blank" rel="noopener" style="color:var(--mint);">${this.escapeHtml(app.website)}</a></div>` : ''}
                </div>
                <div class="ad-actions" style="margin-top:0.5rem;">
                    <button class="btn-primary" onclick="adAdmin.approveApplication('${app._id}')">Approve</button>
                    <button class="btn-danger" onclick="adAdmin.rejectApplication('${app._id}')">Reject</button>
                </div>
            </div>
        `;
    }

    async approveApplication(id) {
        let reviewNotes = prompt('Add review notes (optional):') || '';

        try {
            const response = await fetch(apiUrl(`/api/ads/admin/approve-application/${id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ reviewNotes })
            });

            if (response.ok) {
                alert('Application approved! The partner can now sign in to the Ad Portal.');
                this.loadApplications();
                this.loadOverview();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to approve application');
            }
        } catch (error) {
            console.error('Approve application error:', error);
            alert('Failed to approve application');
        }
    }

    async rejectApplication(id) {
        const reviewNotes = prompt('Reason for rejection (will be sent to applicant):');
        if (reviewNotes === null) return;

        try {
            const response = await fetch(apiUrl(`/api/ads/admin/reject-application/${id}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ reviewNotes })
            });

            if (response.ok) {
                alert('Application rejected.');
                this.loadApplications();
                this.loadOverview();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to reject application');
            }
        } catch (error) {
            console.error('Reject application error:', error);
            alert('Failed to reject application');
        }
    }

    async loadPartners() {
        try {
            const response = await fetch(apiUrl('/api/ads/admin/all-advertisers'), {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                this.allPartners = (data.advertisers || []).filter(a => a.role !== 'admin');
                this.renderPartners('all');
            }
        } catch (error) {
            console.error('Load partners error:', error);
        }
    }

    renderPartners(filter) {
        let filtered = this.allPartners;
        if (filter === 'approved') filtered = filtered.filter(p => p.status === 'approved');
        else if (filter === 'pending') filtered = filtered.filter(p => p.status === 'pending');
        else if (filter === 'partner') filtered = filtered.filter(p => p.accountType === 'partner');
        else if (filter === 'self-serve') filtered = filtered.filter(p => p.accountType === 'self-serve');

        const container = document.getElementById('partnersList');

        if (filtered.length === 0) {
            container.innerHTML = '<p class="empty-message">No partners found</p>';
            return;
        }

        container.innerHTML = filtered.map(p => {
            const typeClass = p.accountType === 'partner' ? 'partner' : 'self-serve';
            const typeLabel = p.accountType === 'partner' ? 'White Glove' : 'Self-Serve';
            const date = new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <div class="partner-item">
                    <div class="partner-info">
                        <h4>${this.escapeHtml(p.companyName)}</h4>
                        <p>${this.escapeHtml(p.contactName)} &middot; ${this.escapeHtml(p.email)}</p>
                        <p>Joined: ${date}</p>
                    </div>
                    <div class="partner-meta">
                        <span class="partner-type ${typeClass}">${typeLabel}</span>
                        <div style="margin-top:6px;"><span class="ad-status ${p.status}">${p.status}</span></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async loadAllAds(status = '') {
        try {
            let url = '/api/ads/admin/all-ads';
            if (status) url += `?status=${status}`;

            const response = await fetch(apiUrl(url), {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                const data = await response.json();
                const container = document.getElementById('allAdsList');

                if (data.ads && data.ads.length > 0) {
                    container.innerHTML = data.ads.map(ad => this.renderAdItem(ad, ad.status === 'pending')).join('');
                } else {
                    container.innerHTML = '<p class="empty-message">No ads found</p>';
                }
            }
        } catch (error) {
            console.error('Load all ads error:', error);
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
                <img src="${this.escapeHtml(ad.imageUrl)}" alt="${this.escapeHtml(ad.title)}" class="ad-item-image" onerror="this.src='images/logo.png'">
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
            const response = await fetch(apiUrl(`/api/ads/admin/approve/${adId}`), {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (response.ok) {
                this.loadAllAds();
                this.loadOverview();
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
            const response = await fetch(apiUrl(`/api/ads/admin/reject/${adId}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ reason })
            });

            if (response.ok) {
                this.loadAllAds();
                this.loadOverview();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to reject ad');
            }
        } catch (error) {
            console.error('Reject ad error:', error);
            alert('Failed to reject ad');
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
            const response = await fetch(apiUrl('/api/ads/admin/upload-for-client'), {
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
            const response = await fetch(apiUrl('/api/ads/admin/create-admin'), {
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
        return window.escapeHtml(text);
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
