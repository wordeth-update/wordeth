document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/creator-register.html';
        return;
    }

    const container = document.getElementById('dashboardContainer');
    const loading = document.getElementById('loadingScreen');

    try {
        const res = await fetch('/api/creator/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/creator-register.html';
            return;
        }

        if (res.status === 403) {
            window.location.href = '/';
            return;
        }

        if (!res.ok) throw new Error('Failed to load dashboard');

        const data = await res.json();
        renderDashboard(data);
        loading.style.display = 'none';
        container.style.display = 'block';

        loadPayoutInfo(token);
        loadTokenEarnings(token);
    } catch (err) {
        console.error('Dashboard load error:', err);
        loading.innerHTML = `<p style="color:#fca5a5;">Failed to load dashboard. <a href="/" style="color:var(--mint);">Go Home</a></p>`;
    }

    setupTabs();
    setupLogout();
});

async function loadTokenEarnings(token) {
    try {
        const res = await fetch('/api/tokens/balance', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.tokenEarnings !== 'undefined') {
            const card = document.getElementById('tokenEarningsCard');
            if (card) card.style.display = 'block';
            const earningsEl = document.getElementById('creatorTokenEarnings');
            const valueEl = document.getElementById('creatorTokenValue');
            if (earningsEl) earningsEl.textContent = (data.tokenEarnings || 0).toLocaleString();
            if (valueEl) valueEl.textContent = '$' + (data.earningsValue || 0).toFixed(2);
        }
    } catch (e) {
        console.error('Token earnings load error:', e);
    }
}

async function loadPayoutInfo(token) {
    try {
        const res = await fetch('/api/creator/payout-info', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const { data } = await res.json();
        if (!data) return;

        const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
        document.getElementById('creatorPayoutRate').textContent = `${data.payoutPercentage}%`;
        document.getElementById('creatorPlatformFee').textContent = `${data.platformFeePercentage}%`;
        document.getElementById('creatorTotalPayout').textContent = fmt(data.totalPayout || 0);
    } catch (e) {
        console.error('Payout info error:', e);
    }
}

function renderDashboard(data) {
    const { profile, currentPlan, subscription, entitlements, graduation, accountType, availablePlans } = data;

    document.getElementById('creatorName').textContent = profile.displayName || 'Creator';
    document.getElementById('creatorHandle').textContent = `@${profile.handle || 'creator'}`;
    document.getElementById('accountBadge').textContent = accountType === 'artist' ? 'Artist' : 'Designer';

    const avatarEl = document.getElementById('creatorAvatar');
    if (profile.avatar && !profile.avatar.includes('default-avatar')) {
        avatarEl.innerHTML = `<img src="${escapeHtml(profile.avatar)}" alt="Avatar">`;
    } else {
        avatarEl.textContent = (profile.displayName || 'W').charAt(0).toUpperCase();
    }

    if (currentPlan) {
        document.getElementById('planName').textContent = currentPlan.name;
        if (currentPlan.priceMonthly > 0) {
            document.getElementById('planPrice').textContent = `$${currentPlan.priceMonthly}`;
            document.getElementById('planCycle').textContent = '/month';
        } else {
            document.getElementById('planPrice').textContent = 'Free';
        }
    }

    document.getElementById('statEarnings').textContent = `$${(profile.totalEarnings || 0).toFixed(2)}`;
    document.getElementById('statSales').textContent = profile.totalSales || 0;
    document.getElementById('statTemplates').textContent = profile.templateCount || 0;

    const storageMB = ((profile.storageUsedBytes || 0) / (1024 * 1024)).toFixed(1);
    document.getElementById('statStorage').textContent = `${storageMB} MB`;

    if (entitlements) {
        const templateLimit = entitlements.TEMPLATE_LIMIT;
        if (templateLimit && templateLimit !== 'unlimited') {
            document.getElementById('templateLimit').textContent = `of ${templateLimit} max`;
        } else if (templateLimit === 'unlimited' || templateLimit === -1) {
            document.getElementById('templateLimit').textContent = 'unlimited';
        }

        const storageGB = entitlements.DESIGN_STORAGE_GB;
        if (storageGB) {
            document.getElementById('storageLimit').textContent = `of ${storageGB} GB`;
        }
    }

    if (graduation && graduation.graduated) {
        const banner = document.getElementById('graduationBanner');
        banner.style.display = 'flex';

        const meters = document.getElementById('graduationMeters');
        const { earnings, sales, months, thresholds } = graduation;

        meters.innerHTML = `
            <div class="grad-meter">
                <div class="grad-meter-label">Earnings</div>
                <div class="grad-meter-bar"><div class="grad-meter-fill ${earnings >= thresholds.earnings ? 'warning' : 'safe'}" style="width:${Math.min(100, (earnings / thresholds.earnings) * 100)}%"></div></div>
                <div class="grad-meter-value">$${earnings.toFixed(0)} / $${thresholds.earnings}</div>
            </div>
            <div class="grad-meter">
                <div class="grad-meter-label">Sales</div>
                <div class="grad-meter-bar"><div class="grad-meter-fill ${sales >= thresholds.sales ? 'warning' : 'safe'}" style="width:${Math.min(100, (sales / thresholds.sales) * 100)}%"></div></div>
                <div class="grad-meter-value">${sales} / ${thresholds.sales}</div>
            </div>
            <div class="grad-meter">
                <div class="grad-meter-label">Months Active</div>
                <div class="grad-meter-bar"><div class="grad-meter-fill ${months >= thresholds.months ? 'warning' : 'safe'}" style="width:${Math.min(100, (months / thresholds.months) * 100)}%"></div></div>
                <div class="grad-meter-value">${months} / ${thresholds.months}</div>
            </div>
        `;
    }

    renderSocialLinks(profile.socialLinks);
    renderGenres(profile.genres);
    renderEntitlements(entitlements);
    renderPlans(availablePlans, currentPlan);
}

function renderSocialLinks(links) {
    const grid = document.getElementById('socialLinksGrid');
    if (!links) return;

    const icons = { instagram: 'fab fa-instagram', twitter: 'fab fa-twitter', spotify: 'fab fa-spotify', youtube: 'fab fa-youtube', website: 'fas fa-globe' };
    const entries = Object.entries(links).filter(([, v]) => v);

    if (entries.length === 0) return;

    grid.innerHTML = entries.map(([key, url]) => {
        const href = url.startsWith('http') ? url : `https://${url}`;
        return `<a href="${escapeHtml(href)}" target="_blank" class="social-link-chip"><i class="${icons[key] || 'fas fa-link'}"></i> ${escapeHtml(key)}</a>`;
    }).join('');
}

function renderGenres(genres) {
    const el = document.getElementById('genreDisplay');
    if (!genres || genres.length === 0) return;
    el.innerHTML = genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('');
}

function renderEntitlements(entitlements) {
    const list = document.getElementById('entitlementsList');
    if (!entitlements) return;

    const labels = {
        ADS_LEVEL: 'Ad Experience',
        AUDIO_ROOM_LIMIT: 'Audio Room Limit',
        CAN_SAVE_DESIGNS: 'Save Designs',
        DESIGN_STORAGE_GB: 'Design Storage (GB)',
        CAN_ACCESS_PAID_DESIGNER_PACKS: 'Paid Designer Packs',
        CAN_ACCESS_LYRIC_PACKS: 'Lyric Packs Access',
        CAN_CREATE_TEMPLATES: 'Create Templates',
        TEMPLATE_LIMIT: 'Template Limit',
        HAS_STOREFRONT: 'Storefront',
        ANALYTICS_LEVEL: 'Analytics',
        FEATURED_ELIGIBLE: 'Featured Eligible',
        CAN_CUSTOMIZE_MERCH: 'Customize Merch',
        PRIORITY_AUDIO: 'Priority Audio Rooms',
        PROMO_TOOLS: 'Promo Tools',
        TEAM_ACCESS: 'Team Access',
        PRIORITY_SUPPORT: 'Priority Support',
        CAMPAIGN_TOOLS: 'Campaign Tools'
    };

    list.innerHTML = Object.entries(entitlements)
        .filter(([key]) => labels[key])
        .map(([key, value]) => {
            let cls = 'negative';
            let display = String(value);

            if (typeof value === 'boolean') {
                cls = value ? 'positive' : 'negative';
                display = value ? 'Yes' : 'No';
            } else if (typeof value === 'number') {
                cls = value > 0 ? 'numeric' : 'negative';
                display = value === -1 ? 'Unlimited' : String(value);
            } else if (typeof value === 'string') {
                cls = value === 'NONE' ? 'negative' : 'positive';
                display = value.charAt(0) + value.slice(1).toLowerCase();
            }

            return `<div class="entitlement-row">
                <span class="entitlement-key">${labels[key]}</span>
                <span class="entitlement-value ${cls}">${display}</span>
            </div>`;
        }).join('');
}

function renderPlans(plans, currentPlan) {
    const grid = document.getElementById('plansGrid');
    if (!plans || plans.length === 0) {
        grid.innerHTML = '<p class="empty-state">No plans available</p>';
        return;
    }

    grid.innerHTML = plans.map(plan => {
        const isCurrent = plan.isCurrent;
        let btnHtml;
        if (isCurrent) {
            btnHtml = `<button class="plan-card-btn current-btn" disabled>Current Plan</button>`;
        } else if (plan.priceMonthly === 0) {
            btnHtml = `<button class="plan-card-btn current-btn" disabled>Free Tier</button>`;
        } else {
            btnHtml = `<button class="plan-card-btn upgrade-btn" data-plan="${plan.slug}">Select Plan</button>`;
        }

        return `<div class="plan-card ${isCurrent ? 'current' : ''}">
            <div class="plan-card-name">${plan.name}</div>
            <div class="plan-card-price">${plan.priceMonthly > 0 ? '$' + plan.priceMonthly : 'Free'} <span>${plan.priceMonthly > 0 ? '/mo' : ''}</span></div>
            ${plan.priceYearly > 0 ? `<div class="plan-card-yearly">or $${plan.priceYearly}/year</div>` : '<div class="plan-card-yearly">&nbsp;</div>'}
            <ul class="plan-card-features">
                ${(plan.features || []).map(f => `<li><i class="fas fa-check"></i> ${f}</li>`).join('')}
            </ul>
            ${btnHtml}
        </div>`;
    }).join('');

    grid.querySelectorAll('.upgrade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.location.href = '/pricing.html';
        });
    });
}

function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    document.getElementById('upgradePlanBtn')?.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        const upgradeBtn = document.querySelector('[data-tab="upgrade"]');
        upgradeBtn.classList.add('active');
        document.getElementById('tab-upgrade').classList.add('active');
    });
}

function setupLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    });
}
