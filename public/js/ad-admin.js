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
                            <button class="action-btn" data-admin-action="tab" data-tab-name="applications">Review</button>
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
                    <button class="btn-primary" data-admin-action="approve-application" data-id="${app._id}">Approve</button>
                    <button class="btn-danger" data-admin-action="reject-application" data-id="${app._id}">Reject</button>
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

                this.allAds = data.ads || [];
                this.adFilter = status;
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

        // What can be done to an ad depends on where it stands. Every ad can be
        // edited and deleted; a running one can be paused, a paused one resumed.
        const id = ad._id;
        const buttons = [];
        if (showApproveButtons) {
            buttons.push(`<button class="btn-primary" data-admin-action="approve-ad" data-id="${id}">Approve</button>`);
            buttons.push(`<button class="btn-danger" data-admin-action="reject-ad" data-id="${id}">Reject</button>`);
        }
        if (ad.status === 'active') buttons.push(`<button class="action-btn" data-admin-action="pause-ad" data-id="${id}">Pause</button>`);
        if (ad.status === 'paused' || ad.status === 'rejected') buttons.push(`<button class="action-btn" data-admin-action="resume-ad" data-id="${id}">${ad.status === 'paused' ? 'Resume' : 'Make active'}</button>`);
        buttons.push(`<button class="action-btn" data-admin-action="edit-ad" data-id="${id}">Edit</button>`);
        buttons.push(`<button class="action-btn" style="color:#f85149;" id="ad-delete-${id}" data-admin-action="delete-ad" data-id="${id}">Delete</button>`);
        const actionsHtml = `<div class="ad-actions" style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.75rem;">${buttons.join('')}</div>`;

        const rate = `Rate: $${Number(ad.pricing?.cpm ?? 0).toFixed(2)} per 1,000 impressions · $${Number(ad.pricing?.cpc ?? 0).toFixed(2)} per click`;
        const takeover = ad.placement === 'app-takeover' && ad.takeover
            ? ` | ${this.escapeHtml(ad.takeover.format || 'skyscraper')} · ${ad.takeover.durationSec || 30}s` : '';

        return `
            <div class="ad-item" id="ad-item-${id}" style="flex-wrap:wrap;">
                <img src="${this.escapeHtml(ad.imageUrl)}" alt="${this.escapeHtml(ad.title)}" class="ad-item-image" data-fallback-src="images/logo.png">
                <div class="ad-item-info">
                    <h4>${this.escapeHtml(ad.title)}</h4>
                    <p>By: ${this.escapeHtml(advertiserName)} | ${ad.placement} | ${ad.size}${takeover}</p>
                    <p>Impressions: ${this.formatNumber(ad.stats?.impressions || 0)} | Clicks: ${this.formatNumber(ad.stats?.clicks || 0)}</p>
                    <p>${rate}</p>
                    <div class="ad-keywords">${keywordsHtml}${moreKeywords}${ad.keywords.length === 0 && String(ad.placement).startsWith('app-') ? '<span class="keyword-tag">run-of-app</span>' : ''}</div>
                    ${actionsHtml}
                    <p id="ad-msg-${id}" role="status" style="display:none; margin-top:.5rem; font-weight:600;"></p>
                </div>
                <span class="ad-status ${ad.status}">${ad.status}</span>
                <div id="ad-edit-${id}" style="flex-basis:100%; display:none;"></div>
            </div>
        `;
    }

    /** Said on the ad itself; a pop-up can be switched off by the browser. */
    adMessage(adId, text, ok) {
        const el = document.getElementById(`ad-msg-${adId}`);
        if (!el) return;
        el.textContent = text;
        el.style.color = ok ? '#3EB489' : '#f85149';
        el.style.display = text ? 'block' : 'none';
    }

    async updateAd(adId, changes) {
        const response = await fetch(apiUrl(`/api/ads/update/${adId}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
            body: JSON.stringify(changes)
        });
        let data = {};
        try { data = await response.json(); } catch (e) { data = {}; }
        if (!response.ok) throw new Error(data.error || `The server refused that (${response.status}).`);
        return data;
    }

    async setAdStatus(adId, status) {
        try {
            await this.updateAd(adId, { status });
            await this.loadAllAds(this.adFilter || '');
            this.loadOverview();
        } catch (error) {
            this.adMessage(adId, error.message, false);
        }
    }

    /** Open the edit form under an ad, or close it if it is already open. */
    editAd(adId) {
        const box = document.getElementById(`ad-edit-${adId}`);
        const ad = (this.allAds || []).find(a => a._id === adId);
        if (!box || !ad) return;
        if (box.style.display !== 'none') { box.style.display = 'none'; box.innerHTML = ''; return; }
        const v = (x) => this.escapeHtml(x === undefined || x === null ? '' : String(x));
        const inApp = String(ad.placement).startsWith('app-');
        const takeover = ad.placement === 'app-takeover';
        const end = ad.schedule?.endDate ? new Date(ad.schedule.endDate).toISOString().slice(0, 10) : '';
        box.innerHTML = `
            <form class="ad-form" data-ad-edit-form="${adId}" style="margin-top:1rem; padding-top:1rem; border-top:1px solid var(--dark-border);">
                <div class="form-group"><label>Ad Title</label><input type="text" name="title" required maxlength="100" value="${v(ad.title)}"></div>
                <div class="form-group"><label>Description</label><textarea name="description" maxlength="200">${v(ad.description)}</textarea></div>
                <div class="form-group"><label>Click URL</label><input type="url" name="linkUrl" required value="${v(ad.linkUrl)}"></div>
                ${inApp ? `<div class="form-group"><label>Button text</label><input type="text" name="cta" maxlength="24" value="${v(ad.cta)}"></div>` : ''}
                <div class="form-group"><label>Keywords (comma-separated)</label><textarea name="keywords">${v((ad.keywords || []).join(', '))}</textarea>
                    <small>${inApp ? 'Empty means run-of-app: it can show anywhere, behind any targeted ad that fits.' : 'Up to 25.'}</small></div>
                <div class="form-row">
                    <div class="form-group"><label>Rate per 1,000 impressions ($)</label><input type="number" name="cpm" min="0" max="1000" step="0.01" value="${v(ad.pricing?.cpm ?? 0)}"></div>
                    <div class="form-group"><label>Rate per click ($)</label><input type="number" name="cpc" min="0" max="100" step="0.01" value="${v(ad.pricing?.cpc ?? 0)}"></div>
                </div>
                <div class="form-group"><label>Stop running after (optional)</label><input type="date" name="endDate" value="${v(end)}"></div>
                ${takeover ? `
                <div class="form-group"><label>Length (seconds)</label><input type="number" name="durationSec" min="5" max="90" value="${v(ad.takeover?.durationSec ?? 30)}"></div>
                <div class="form-group"><label>Script for the host</label><textarea name="script" maxlength="1500">${v(ad.takeover?.script)}</textarea></div>` : ''}
                <small style="display:block; margin-bottom:1rem; color:var(--text-secondary);">Artwork, a takeover clip and the placement are fixed once an ad is made. To change one, delete the ad and create it again.</small>
                <div style="display:flex; gap:.5rem;">
                    <button type="submit" class="btn-primary">Save changes</button>
                    <button type="button" class="action-btn" data-admin-action="edit-ad" data-id="${adId}">Cancel</button>
                </div>
            </form>`;
        box.style.display = 'block';
    }

    async saveAd(e, adId) {
        e.preventDefault();
        const form = e.target;
        const button = form.querySelector('button[type="submit"]');
        const field = (name) => (form[name] ? form[name].value : undefined);
        const keywords = (field('keywords') || '').split(',').map(k => k.trim()).filter(k => k);
        if (keywords.length > 25) { this.adMessage(adId, 'Maximum 25 keywords allowed.', false); return; }
        const changes = {
            title: field('title'), description: field('description'), linkUrl: field('linkUrl'),
            keywords: keywords.join(','), cpm: field('cpm'), cpc: field('cpc'), endDate: field('endDate') || ''
        };
        for (const name of ['cta', 'durationSec', 'script']) if (form[name]) changes[name] = form[name].value;
        if (button) { button.disabled = true; button.textContent = 'Saving…'; }
        try {
            await this.updateAd(adId, changes);
            await this.loadAllAds(this.adFilter || '');
            this.adMessage(adId, 'Saved.', true);
        } catch (error) {
            this.adMessage(adId, error.message, false);
            if (button) { button.disabled = false; button.textContent = 'Save changes'; }
        }
    }

    /** Two presses: the first asks, on the button itself; the second deletes. */
    async deleteAd(adId) {
        const button = document.getElementById(`ad-delete-${adId}`);
        if (button && button.dataset.armed !== 'yes') {
            button.dataset.armed = 'yes';
            button.textContent = 'Delete for good? Press again';
            setTimeout(() => { if (button.isConnected) { button.dataset.armed = ''; button.textContent = 'Delete'; } }, 5000);
            return;
        }
        try {
            const response = await fetch(apiUrl(`/api/ads/delete/${adId}`), {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            let data = {};
            try { data = await response.json(); } catch (e) { data = {}; }
            if (!response.ok) throw new Error(data.error || `The server refused that (${response.status}).`);
            await this.loadAllAds(this.adFilter || '');
            this.loadOverview();
        } catch (error) {
            this.adMessage(adId, error.message, false);
        }
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
        // No pop-up to ask why: a browser may have switched those off, and the reason was never stored.
        const reason = '';
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
        // The page and this script are cached separately; a field one of them
        // does not know about yet is read as empty rather than as an error.
        const value = (name) => (form[name] && typeof form[name].value === 'string' ? form[name].value : '');
        const button = form.querySelector('button[type="submit"]');
        const say = (text, kind) => showCreateAdStatus(text, kind);

        // One upload at a time. A large file takes a while, and with nothing
        // on screen to say so the natural thing is to press the button again.
        if (this.creatingAd) return;

        const keywords = value('keywords').split(',').map(k => k.trim()).filter(k => k);
        if (keywords.length > 25) { say('Maximum 25 keywords allowed.', 'error'); return; }

        const picked = form.image && form.image.files && form.image.files.length > 0 ? form.image.files[0] : null;
        if (!picked && !value('imageUrl')) { say('Choose the artwork file, or paste its address.', 'error'); return; }

        const placement = value('placement');
        const clip = placement === 'app-takeover' && form.media && form.media.files && form.media.files.length > 0 ? form.media.files[0] : null;
        if (clip && clip.size > AD_UPLOAD_LIMIT) {
            say(`That clip is ${megabytes(clip.size)}. The limit is 20 MB: export it shorter or at a lower quality and choose it again.`, 'error');
            return;
        }

        this.creatingAd = true;
        const label = button ? button.textContent : '';
        if (button) { button.disabled = true; button.textContent = 'Working…'; }

        try {
            // Artwork straight out of a design tool can be tens of megabytes.
            // It is made a sensible size here, on this computer, before it is sent.
            let image = picked;
            if (picked) {
                say('Preparing the artwork…', 'busy');
                image = await shrinkArtwork(picked);
                if (image.size > AD_UPLOAD_LIMIT) {
                    say(`That image is ${megabytes(picked.size)} and could not be made smaller here. Export it at 2000 pixels on its long side, or under 20 MB, and choose it again.`, 'error');
                    return;
                }
            }

            // Sent as a form so artwork and a takeover clip can ride along as files.
            const adData = new FormData();
            adData.append('clientEmail', value('clientEmail'));
            adData.append('title', value('title'));
            adData.append('description', value('description'));
            adData.append('imageUrl', value('imageUrl'));
            adData.append('linkUrl', value('linkUrl'));
            adData.append('placement', placement);
            adData.append('size', value('size'));
            adData.append('keywords', keywords.join(','));
            adData.append('billingMode', value('billingMode'));
            adData.append('cpm', value('cpm'));
            adData.append('cpc', value('cpc'));
            if (image) adData.append('image', image, image.name || picked.name);
            if (placement.startsWith('app-')) {
                adData.append('cta', value('cta'));
                adData.append('chatEnabled', form.chatEnabled && form.chatEnabled.checked ? 'true' : 'false');
                adData.append('chatAccountEmail', value('chatAccountEmail'));
            }
            if (placement === 'app-takeover') {
                adData.append('takeoverFormat', value('takeoverFormat'));
                adData.append('durationSec', value('durationSec'));
                adData.append('mediaUrl', value('mediaUrl'));
                adData.append('script', value('script'));
                adData.append('hostEmails', value('hostEmails'));
                if (clip) adData.append('media', clip);
            }

            const sending = (image ? image.size : 0) + (clip ? clip.size : 0);
            say(sending > 1024 * 1024 ? `Uploading ${megabytes(sending)}…` : 'Uploading…', 'busy');

            const response = await fetch(apiUrl('/api/ads/admin/upload-for-client'), {
                method: 'POST',
                // No content-type: the browser sets the multipart boundary itself.
                headers: { 'Authorization': `Bearer ${this.token}` },
                body: adData
            });

            // Not every refusal arrives as JSON (a proxy's own error page does not).
            let data = {};
            try { data = await response.json(); } catch (parseError) { data = {}; }

            if (response.ok) {
                const made = value('title');
                form.reset();
                // Back to the first placement: show the fields that one needs.
                if (form.placement) form.placement.dispatchEvent(new Event('change', { bubbles: true }));
                document.getElementById('adPreview').innerHTML = '<p>Choose the artwork to preview it</p>';
                say(`"${made}": ${data.message || 'Ad created.'}`, data.servingNow === false ? 'warn' : 'done');
                this.loadAllAds();
            } else if (response.status === 401) {
                say('You have been signed out. Sign in again, then create the ad.', 'error');
                this.showLoginModal();
            } else {
                say(data.error || `The server refused that (${response.status}). Nothing was created.`, 'error');
            }
        } catch (error) {
            console.error('Create ad error:', error);
            say('The upload did not get through. Check the connection and try again; nothing was created.', 'error');
        } finally {
            this.creatingAd = false;
            if (button) { button.disabled = false; button.textContent = label || 'Create Ad'; }
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
            preview.innerHTML = `<img src="${this.escapeHtml(url)}" alt="Ad Preview" data-fallback="message">`;
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


/**
 * The create-ad form shows what the chosen placement needs and nothing
 * else: a banner size for the website, button text and chat for the app,
 * and the clip, length and host script for a sponsor takeover.
 */
(function () {
    const HINTS = {
        'app-lyrics': 'Looks like a song in the results: square artwork, the title as the song line, the description under it, and an AD sticker. Artwork: square, 600 × 600 or larger.',
        'app-messages': 'A row in the conversation list, marked AD. Square logo, 600 × 600 or larger. Can offer a pound to chat.',
        'app-room-strip': 'A slim strip along the bottom of a room: small square logo, one line of text. Matched to the room\'s name and topic.',
        'app-photo-slide': 'Shown when somebody swipes past a photo shared in a room. Tall artwork, 1080 × 1350.',
        'app-merch': 'A small unit under the Order button on a product. Square artwork, 600 × 600 or larger.',
        'app-takeover': 'A sponsor break the host starts in a paid room. Skyscraper artwork: 600 × 1600 (tall). Video and audio also need a square logo here.'
    };
    function sync() {
        const select = document.getElementById('adPlacement');
        if (!select) return;
        const value = select.value;
        const inApp = value.indexOf('app-') === 0;
        const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? '' : 'none'; };
        show('sizeGroup', !inApp);
        show('appFields', inApp);
        show('takeoverFields', value === 'app-takeover');
        const hint = document.getElementById('placementHint');
        if (hint) hint.textContent = HINTS[value] || '';
    }
    document.addEventListener('change', (e) => { if (e.target && e.target.id === 'adPlacement') sync(); });
    document.addEventListener('DOMContentLoaded', sync);
})();


/** The most the server takes for one file. */
const AD_UPLOAD_LIMIT = 20 * 1024 * 1024;
/** Artwork is drawn on a phone; nothing needs more pixels than this on its long side. */
const ARTWORK_MAX_SIDE = 2000;

function megabytes(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * What happened, said on the page next to the button. A pop-up can be
 * switched off by the browser after a few of them, and then a failure and
 * a success look the same: nothing.
 */
function showCreateAdStatus(text, kind) {
    const el = document.getElementById('createAdStatus');
    if (!el) { if (kind === 'error' || kind === 'done' || kind === 'warn') alert(text); return; }
    const colours = { error: '#f85149', warn: '#D29922', done: '#3EB489', busy: 'inherit' };
    el.textContent = text;
    el.style.color = colours[kind] || 'inherit';
    el.style.display = text ? 'block' : 'none';
    if (kind !== 'busy') el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/**
 * Bring artwork down to a size worth sending. Small files and animations go
 * as they are. Anything large is redrawn at no more than ARTWORK_MAX_SIDE:
 * a PNG stays a PNG (it may have a transparent background), everything else
 * becomes a JPEG. If this browser cannot do it, the original is returned
 * and the caller decides whether it is still too big.
 */
async function shrinkArtwork(file) {
    if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
    try {
        const first = await createImageBitmap(file);
        const long = Math.max(first.width, first.height);
        if (long <= ARTWORK_MAX_SIDE && file.size <= 2 * 1024 * 1024) { first.close(); return file; }
        const scale = Math.min(1, ARTWORK_MAX_SIDE / long);
        const width = Math.max(1, Math.round(first.width * scale));
        const height = Math.max(1, Math.round(first.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(first, 0, 0, width, height);
        first.close();
        const png = file.type === 'image/png';
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, png ? 'image/png' : 'image/jpeg', 0.9));
        if (!blob || blob.size >= file.size) return file;
        const base = file.name.replace(/\.[^.]+$/, '');
        return new File([blob], `${base}.${png ? 'png' : 'jpg'}`, { type: blob.type });
    } catch (error) {
        console.warn('Could not resize artwork in the browser:', error);
        return file;
    }
}

/** Show what was picked, with its size, the moment it is picked: the wrong file is obvious before it is sent. */
document.addEventListener('change', (e) => {
    if (!e.target || e.target.id !== 'adImageFile') return;
    const file = e.target.files && e.target.files[0];
    const box = document.getElementById('adPreview');
    if (!box) return;
    if (!file) { box.innerHTML = '<p>Choose the artwork to preview it</p>'; return; }
    const url = URL.createObjectURL(file);
    box.innerHTML = '';
    const img = new Image();
    img.style.maxWidth = '100%'; img.style.maxHeight = '260px';
    const note = document.createElement('p');
    note.textContent = `${file.name} · ${megabytes(file.size)}`;
    img.onload = () => {
        const big = Math.max(img.naturalWidth, img.naturalHeight) > ARTWORK_MAX_SIDE || file.size > 2 * 1024 * 1024;
        note.textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight} · ${megabytes(file.size)}` + (big ? ' · it will be made smaller before it is sent' : '');
        URL.revokeObjectURL(url);
    };
    img.src = url;
    box.appendChild(img); box.appendChild(note);
    showCreateAdStatus('', 'busy');
});


/*
 * Every button this script draws is wired here, by what it says it does
 * (data-admin-action) rather than by an onclick written into the markup.
 * The site's security policy does not run code written into attributes
 * (script-src-attr 'none'), so a button drawn with onclick="…" looks right
 * and does nothing at all when pressed. That is how Pause, Edit and Delete
 * first shipped: present, and dead.
 */
document.addEventListener('click', (e) => {
    const button = e.target && e.target.closest ? e.target.closest('[data-admin-action]') : null;
    if (!button) return;
    const id = button.dataset.id;
    switch (button.dataset.adminAction) {
        case 'tab': adAdmin.switchTab(button.dataset.tabName); break;
        case 'logout': adAdmin.logout(); break;
        case 'approve-application': adAdmin.approveApplication(id); break;
        case 'reject-application': adAdmin.rejectApplication(id); break;
        case 'approve-ad': adAdmin.approveAd(id); break;
        case 'reject-ad': adAdmin.rejectAd(id); break;
        case 'pause-ad': adAdmin.setAdStatus(id, 'paused'); break;
        case 'resume-ad': adAdmin.setAdStatus(id, 'active'); break;
        case 'edit-ad': adAdmin.editAd(id); break;
        case 'delete-ad': adAdmin.deleteAd(id); break;
        default: break;
    }
});
document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.dataset && form.dataset.adEditForm) adAdmin.saveAd(e, form.dataset.adEditForm);
});
