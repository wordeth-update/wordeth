async function _initCreatorDashboard() {
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
            localStorage.removeItem('authToken');
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

        loadEarningsData(token, data.profile, data.accountType);
    } catch (err) {
        console.error('Dashboard load error:', err);
        loading.innerHTML = '<p style="color:#fca5a5;">Failed to load dashboard. <a href="/" style="color:var(--mint);">Go Home</a></p>';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initCreatorDashboard);
} else {
    _initCreatorDashboard();
}

async function loadEarningsData(token, profile, accountType) {
    var baseEarnings = profile.totalEarnings || 0;
    var tokenEarnings = 0;
    var tokenValue = 0;

    var supportsTokenEarnings = ['artist', 'designer', 'label', 'creator'].includes(accountType);

    var fetches = [];
    fetches.push(
        fetch('/api/creator/payout-info', { headers: { 'Authorization': 'Bearer ' + token } })
            .then(function(r) { return r.ok ? r.json() : null; })
            .catch(function() { return null; })
    );
    if (supportsTokenEarnings) {
        fetches.push(
            fetch('/api/tokens/balance', { headers: { 'Authorization': 'Bearer ' + token } })
                .then(function(r) { return r.ok ? r.json() : null; })
                .catch(function() { return null; })
        );
    } else {
        fetches.push(Promise.resolve(null));
    }

    var results = await Promise.all(fetches);
    var payoutData = results[0];
    var tokenData = results[1];

    var totalPayout = baseEarnings;
    if (payoutData && payoutData.data && typeof payoutData.data.totalPayout === 'number') {
        totalPayout = payoutData.data.totalPayout;
    }

    if (tokenData) {
        tokenEarnings = tokenData.tokenEarnings || 0;
        tokenValue = tokenData.earningsValue || 0;
    }

    var totalEl = document.getElementById('totalEarned');
    var tokenEl = document.getElementById('tokenEarningsVal');
    var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    if (totalEl) {
        totalEl.textContent = fmt.format(totalPayout + tokenValue);
    }

    if (tokenEl) {
        tokenEl.textContent = tokenEarnings.toLocaleString();
    }
}

function renderDashboard(data) {
    const { profile, currentPlan, graduation, accountType } = data;

    document.getElementById('creatorName').textContent = profile.displayName || 'Creator';
    document.getElementById('creatorHandle').textContent = '@' + (profile.handle || 'creator');

    const badgeEl = document.getElementById('accountBadge');
    const badgeMap = { artist: 'Artist', designer: 'Designer', creator: 'Creator' };
    badgeEl.textContent = badgeMap[accountType] || 'Creator';

    const avatarEl = document.getElementById('creatorAvatar');
    if (profile.avatar && !profile.avatar.includes('default-avatar')) {
        avatarEl.innerHTML = '<img src="' + escapeHtml(profile.avatar) + '" alt="Avatar">';
    } else {
        avatarEl.textContent = (profile.displayName || 'W').charAt(0).toUpperCase();
    }

    document.getElementById('merchSalesCount').textContent = (profile.totalSales || 0).toLocaleString();

    if (currentPlan) {
        document.getElementById('planName').textContent = currentPlan.name;
        if (currentPlan.priceMonthly > 0) {
            document.getElementById('planPrice').textContent = '$' + currentPlan.priceMonthly + '/mo';
        } else {
            document.getElementById('planPrice').textContent = 'Free';
        }
    }

    if (graduation && graduation.graduated) {
        var banner = document.getElementById('graduationBanner');
        banner.style.display = 'flex';

        var meters = document.getElementById('graduationMeters');
        var earnings = graduation.earnings;
        var sales = graduation.sales;
        var months = graduation.months;
        var thresholds = graduation.thresholds;

        meters.innerHTML =
            '<div class="grad-meter">' +
                '<div class="grad-meter-label">Earnings</div>' +
                '<div class="grad-meter-bar"><div class="grad-meter-fill ' + (earnings >= thresholds.earnings ? 'warning' : 'safe') + '" style="width:' + Math.min(100, (earnings / thresholds.earnings) * 100) + '%"></div></div>' +
                '<div class="grad-meter-value">$' + earnings.toFixed(0) + ' / $' + thresholds.earnings + '</div>' +
            '</div>' +
            '<div class="grad-meter">' +
                '<div class="grad-meter-label">Sales</div>' +
                '<div class="grad-meter-bar"><div class="grad-meter-fill ' + (sales >= thresholds.sales ? 'warning' : 'safe') + '" style="width:' + Math.min(100, (sales / thresholds.sales) * 100) + '%"></div></div>' +
                '<div class="grad-meter-value">' + sales + ' / ' + thresholds.sales + '</div>' +
            '</div>' +
            '<div class="grad-meter">' +
                '<div class="grad-meter-label">Months Active</div>' +
                '<div class="grad-meter-bar"><div class="grad-meter-fill ' + (months >= thresholds.months ? 'warning' : 'safe') + '" style="width:' + Math.min(100, (months / thresholds.months) * 100) + '%"></div></div>' +
                '<div class="grad-meter-value">' + months + ' / ' + thresholds.months + '</div>' +
            '</div>';
    }
}
