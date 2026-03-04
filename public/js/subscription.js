async function _initSubscription() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/signin.html?redirect=' + encodeURIComponent('/subscription.html');
        return;
    }

    const page = document.getElementById('subPage');
    const loading = document.getElementById('loadingState');

    try {
        const [subRes, plansRes] = await Promise.all([
            fetch(apiUrl('/api/subscriptions/my-subscription'), {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(apiUrl('/api/subscriptions/plans'))
        ]);

        if (subRes.status === 401) {
            localStorage.removeItem('authToken');
            localStorage.removeItem('authToken');
            window.location.href = '/signin.html?redirect=' + encodeURIComponent('/subscription.html');
            return;
        }

        if (!subRes.ok) throw new Error('Failed to load subscription');

        const subData = await subRes.json();
        const plansData = await plansRes.json();

        renderSubscription(subData, plansData.plans || []);
        loading.style.display = 'none';
        page.style.display = 'block';
    } catch (err) {
        console.error('Subscription page error:', err);
        loading.innerHTML = '<p style="color:#fca5a5;">Failed to load subscription. <a href="/" style="color:var(--mint);">Go Home</a></p>';
    }

    setupCancelModal();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initSubscription);
} else {
    _initSubscription();
}

function renderSubscription(subData, allPlans) {
    const { subscription, plan, entitlements, graduation, accountType } = subData;

    const planName = document.getElementById('planName');
    const planBadge = document.getElementById('planBadge');
    const planCategory = document.getElementById('planCategory');
    const planPrice = document.getElementById('planPrice');
    const planCycle = document.getElementById('planCycle');
    const statusBar = document.getElementById('planStatusBar');
    const cancelBtn = document.getElementById('cancelBtn');
    const cancelNotice = document.getElementById('cancelNotice');
    const upgradeBtn = document.getElementById('upgradeBtn');

    planName.textContent = plan ? plan.name : 'Free Plan';
    planCategory.textContent = (accountType || 'fan').charAt(0).toUpperCase() + (accountType || 'fan').slice(1);

    if (subscription && subscription.isActive) {
        const isFree = subscription.nextBillingAmount === 0;

        if (isFree) {
            planPrice.textContent = 'Free';
            planCycle.textContent = '';
            planBadge.textContent = 'Free';
        } else {
            planPrice.textContent = `$${subscription.nextBillingAmount}`;
            planCycle.textContent = `per ${subscription.billingCycle === 'yearly' ? 'year' : 'month'}`;
            planBadge.textContent = subscription.billingCycle === 'yearly' ? 'Yearly' : 'Monthly';
            planBadge.classList.add('paid');
        }

        statusBar.style.display = 'flex';
        const periodInfo = document.getElementById('periodInfo');
        const renewalInfo = document.getElementById('renewalInfo');
        const statusBadgeEl = document.getElementById('statusBadge');

        if (subscription.currentPeriodEnd) {
            const endDate = new Date(subscription.currentPeriodEnd);
            periodInfo.textContent = `Period ends ${endDate.toLocaleDateString()}`;
        }

        if (subscription.cancelAtPeriodEnd) {
            renewalInfo.textContent = 'Will not renew';
            statusBadgeEl.className = 'status-item status-badge canceled';
            statusBadgeEl.innerHTML = '<i class="fas fa-times-circle"></i><span>Canceling</span>';

            cancelNotice.style.display = 'flex';
            const endDate = new Date(subscription.currentPeriodEnd);
            document.getElementById('cancelNoticeText').textContent =
                `Your subscription will end on ${endDate.toLocaleDateString()}. You'll keep access until then.`;

            cancelBtn.style.display = 'none';
            upgradeBtn.textContent = 'Resubscribe';
        } else if (subscription.status === 'past_due') {
            renewalInfo.textContent = 'Payment overdue';
            statusBadgeEl.className = 'status-item status-badge past-due';
            statusBadgeEl.innerHTML = '<i class="fas fa-exclamation-circle"></i><span>Past Due</span>';
            cancelBtn.style.display = 'inline-flex';
        } else {
            const renewDate = new Date(subscription.currentPeriodEnd);
            renewalInfo.textContent = `Renews ${renewDate.toLocaleDateString()}`;
            statusBadgeEl.className = 'status-item status-badge active';
            statusBadgeEl.innerHTML = '<i class="fas fa-check-circle"></i><span>Active</span>';

            if (!isFree) {
                cancelBtn.style.display = 'inline-flex';
            }
        }
    } else {
        planPrice.textContent = plan && plan.priceMonthly > 0 ? `$${plan.priceMonthly}` : 'Free';
        planCycle.textContent = plan && plan.priceMonthly > 0 ? 'per month' : '';
        planBadge.textContent = 'Free';
    }

    renderEntitlements(entitlements || {});
    renderGraduation(graduation);
    renderAvailablePlans(allPlans, plan, accountType, subscription);
}

function renderEntitlements(entitlements) {
    const grid = document.getElementById('entitlementsGrid');
    grid.innerHTML = '';

    const labelMap = {
        canHostRooms: 'Host Rooms',
        canJoinRooms: 'Join Rooms',
        canUseKaraoke: 'Karaoke Mode',
        canSellMerch: 'Sell Merch',
        canUploadDesigns: 'Upload Designs',
        canViewAnalytics: 'View Analytics',
        canRunAds: 'Run Ads',
        canAccessPartnerDash: 'Partner Dashboard',
        maxRoomSize: 'Max Room Size',
        maxDesignUploads: 'Design Uploads',
        maxActiveListings: 'Active Listings',
        maxArtists: 'Max Artists',
        merchCommission: 'Commission Rate',
        adBudgetLimit: 'Ad Budget Limit',
        storageGB: 'Storage (GB)',
        prioritySupport: 'Priority Support',
        customBranding: 'Custom Branding',
        apiAccess: 'API Access'
    };

    for (const [key, value] of Object.entries(entitlements)) {
        const item = document.createElement('div');
        item.className = 'ent-item';

        const label = labelMap[key] || key.replace(/([A-Z])/g, ' $1').trim();

        let valClass, valText;
        if (typeof value === 'boolean') {
            valClass = value ? 'yes' : 'no';
            valText = value ? 'Yes' : 'No';
        } else if (typeof value === 'number') {
            valClass = 'num';
            valText = value === -1 ? 'Unlimited' : value.toString();
        } else {
            valClass = 'num';
            valText = String(value);
        }

        item.innerHTML = `
            <span class="ent-key">${escapeHtml(label)}</span>
            <span class="ent-val ${valClass}">${valText}</span>
        `;
        grid.appendChild(item);
    }
}

function renderGraduation(graduation) {
    const section = document.getElementById('graduationSection');
    const bars = document.getElementById('graduationBars');

    if (!graduation || !graduation.isRequired) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    bars.innerHTML = '';

    const metrics = [
        { label: 'Earnings', current: graduation.earnings || 0, limit: graduation.earningsLimit || 100, unit: '$' },
        { label: 'Sales', current: graduation.sales || 0, limit: graduation.salesLimit || 10, unit: '' },
        { label: 'Active Months', current: graduation.activeMonths || 0, limit: graduation.monthsLimit || 3, unit: '' }
    ];

    metrics.forEach(m => {
        const pct = Math.min((m.current / m.limit) * 100, 100);
        const fillClass = pct >= 90 ? 'danger' : pct >= 60 ? 'warning' : 'safe';

        const bar = document.createElement('div');
        bar.className = 'grad-bar';
        bar.innerHTML = `
            <div class="grad-bar-label">${m.label}</div>
            <div class="grad-bar-track"><div class="grad-bar-fill ${fillClass}" style="width:${pct}%"></div></div>
            <div class="grad-bar-value">${m.unit}${m.current} / ${m.unit}${m.limit}</div>
        `;
        bars.appendChild(bar);
    });
}

function renderAvailablePlans(allPlans, currentPlan, accountType, subscription) {
    const container = document.getElementById('availablePlans');
    container.innerHTML = '';

    const relevantPlans = allPlans.filter(p => p.category === (accountType || 'fan'));

    if (relevantPlans.length === 0) {
        container.innerHTML = '<p style="color:rgba(255,255,255,0.4);font-size:0.85rem;">No plans available. <a href="/pricing.html" style="color:var(--mint);">Browse all plans</a></p>';
        return;
    }

    relevantPlans.forEach(p => {
        const isCurrent = currentPlan && currentPlan.slug === p.slug;
        const isFree = p.priceMonthly === 0;
        const card = document.createElement('div');
        card.className = 'avail-card' + (isCurrent ? ' active-card' : '');

        const features = (p.features || []).slice(0, 4).map(f =>
            `<li><i class="fas fa-check"></i> ${escapeHtml(f)}</li>`
        ).join('');

        let btnHTML;
        if (isCurrent) {
            btnHTML = `<div class="avail-btn current-btn">Current Plan</div>`;
        } else if (isFree) {
            btnHTML = `<div class="avail-btn current-btn" style="color:rgba(255,255,255,0.3);">Free Tier</div>`;
        } else {
            btnHTML = `<button class="avail-btn switch-btn" data-slug="${p.slug}">Switch to ${escapeHtml(p.name)}</button>`;
        }

        card.innerHTML = `
            <div class="avail-name">${escapeHtml(p.name)}</div>
            <div class="avail-price">$${p.priceMonthly}<span>/mo</span></div>
            <ul class="avail-features">${features}</ul>
            ${btnHTML}
        `;

        const switchBtn = card.querySelector('.switch-btn');
        if (switchBtn) {
            switchBtn.addEventListener('click', () => handleSwitch(p.slug));
        }

        container.appendChild(card);
    });
}

async function handleSwitch(planSlug) {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    const btn = document.querySelector(`[data-slug="${planSlug}"]`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Switching...';
    }

    try {
        const res = await fetch(apiUrl('/api/subscriptions/subscribe'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ planSlug, billingCycle: 'monthly' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Switch failed');

        window.location.reload();
    } catch (err) {
        showToast(err.message || 'Failed to switch plan', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Switch';
        }
    }
}

function setupCancelModal() {
    const cancelBtn = document.getElementById('cancelBtn');
    const modal = document.getElementById('cancelModal');
    const keepBtn = document.getElementById('keepBtn');
    const confirmBtn = document.getElementById('confirmCancelBtn');
    const backdrop = document.getElementById('modalBackdrop');

    cancelBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

    keepBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    backdrop.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    confirmBtn.addEventListener('click', async () => {
        const token = localStorage.getItem('authToken');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Canceling...';

        try {
            const res = await fetch(apiUrl('/api/subscriptions/cancel'), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Cancel failed');

            modal.style.display = 'none';
            window.location.reload();
        } catch (err) {
            showToast(err.message || 'Failed to cancel', 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Yes, Cancel';
        }
    });
}

function showToast(message, type) {
    const existing = document.querySelector('.sub-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'sub-toast';
    toast.style.cssText = `
        position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
        padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem;
        font-family: 'Inter', sans-serif; z-index: 9999;
        ${type === 'success'
            ? 'background: rgba(150, 197, 176, 0.15); border: 1px solid rgba(150, 197, 176, 0.3); color: #96C5B0;'
            : 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;'
        }
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

