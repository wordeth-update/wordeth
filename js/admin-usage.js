let authToken = null;
const API_BASE = '';
const SEGMENT_COLORS = {
    lyrics: '#4ECDC4',
    community: '#FFD93D',
    merch: '#FF6B6B',
    auth: '#3EB489',
    general: '#8B949E'
};

const SEGMENT_LABELS = {
    lyrics: 'Lyric Finders',
    community: 'Community',
    merch: 'Apparel',
    auth: 'Auth',
    general: 'General'
};

const EVENT_LABELS = {
    lyrics_search: 'Lyrics Search',
    lyrics_view_song: 'View Song',
    lyrics_view_lyrics: 'View Lyrics',
    lyrics_trending: 'Trending',
    karaoke_lyrics: 'Karaoke Lyrics',
    karaoke_youtube: 'Karaoke YouTube',
    merch_browse: 'Browse Products',
    merch_create_design: 'Create Design',
    merch_order: 'Place Order',
    merch_shipping_calc: 'Shipping Calc',
    verse_join: 'Join Verse',
    verse_leave: 'Leave Verse',
    verse_chat: 'Chat Message',
    verse_create: 'Create Verse',
    page_view: 'Page View',
    session_end: 'Session End',
    user_signup: 'Sign Up',
    user_signin: 'Sign In',
    articles_browse: 'Browse Articles',
    articles_featured: 'Featured Articles'
};

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('wordeth_admin_token');
    if (saved) {
        authToken = saved;
        showDashboard();
    }

    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    document.querySelectorAll('.sidebar-menu li').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.sidebar-menu li').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const tab = item.dataset.tab;
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById(`${tab}-tab`).classList.add('active');
            loadTabData(tab);
        });
    });

    document.getElementById('periodDays').addEventListener('change', () => {
        const activeTab = document.querySelector('.sidebar-menu li.active')?.dataset.tab;
        if (activeTab) loadTabData(activeTab);
    });

    document.getElementById('tierSegmentFilter').addEventListener('change', () => {
        loadUsageTiers();
    });
});

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    try {
        const res = await fetch(`${API_BASE}/api/ads/advertisers/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok || data.error) {
            errorEl.textContent = data.error || 'Login failed';
            errorEl.style.display = 'block';
            return;
        }

        if (data.role !== 'admin') {
            errorEl.textContent = 'Admin access required';
            errorEl.style.display = 'block';
            return;
        }

        authToken = data.token;
        localStorage.setItem('wordeth_admin_token', authToken);
        showDashboard();
    } catch (err) {
        errorEl.textContent = 'Connection error. Please try again.';
        errorEl.style.display = 'block';
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('wordeth_admin_token');
    document.getElementById('login-screen').style.display = '';
    document.getElementById('dashboard-screen').style.display = 'none';
}

function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = '';
    loadTabData('overview');
}

function getDays() {
    return document.getElementById('periodDays').value || '30';
}

async function apiFetch(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.status === 401 || res.status === 403) {
        logout();
        throw new Error('Session expired');
    }
    return res.json();
}

function loadTabData(tab) {
    switch (tab) {
        case 'overview': loadOverview(); break;
        case 'usage-tiers': loadUsageTiers(); break;
        case 'lyrics-segment': loadLyricsSegment(); break;
        case 'community-segment': loadCommunitySegment(); break;
        case 'merch-segment': loadMerchSegment(); break;
        case 'genres': loadGenres(); break;
    }
}

async function loadOverview() {
    const days = getDays();
    try {
        const [summary, segComp] = await Promise.all([
            apiFetch(`/api/analytics/admin/summary?days=${days}`),
            apiFetch(`/api/analytics/admin/segment-comparison?days=${days}`)
        ]);

        const d = summary.data;
        document.getElementById('totalEvents').textContent = formatNum(d.totalEvents);

        const segMap = {};
        (d.segments || []).forEach(s => segMap[s.segment] = s);
        document.getElementById('lyricsEvents').textContent = formatNum(segMap.lyrics?.count || 0);
        document.getElementById('communityEvents').textContent = formatNum(segMap.community?.count || 0);
        document.getElementById('merchEvents').textContent = formatNum(segMap.merch?.count || 0);

        renderDailyTrend(d.dailyTrend || []);
        renderSegmentDonut(segComp.data?.segments || d.segments || []);
        renderTopEvents(d.topEventTypes || []);
        renderCrossSegment(segComp.data?.crossSegmentEngagement || []);
    } catch (err) {
        console.error('Overview load error:', err);
    }
}

async function loadUsageTiers() {
    const days = getDays();
    const segment = document.getElementById('tierSegmentFilter').value;
    const segParam = segment ? `&segment=${segment}` : '';

    try {
        const data = await apiFetch(`/api/analytics/admin/usage-tiers?days=${days}${segParam}`);
        const d = data.data;

        const statsEl = document.getElementById('tierStats');
        statsEl.innerHTML = '';
        ['low', 'moderate', 'high', 'hyper'].forEach(tier => {
            const def = d.tierDefinitions[tier];
            const count = d.tiers[tier] || 0;
            statsEl.innerHTML += `
                <div class="tier-card tier-${tier}">
                    <div class="tier-label">${def.label}</div>
                    <div class="tier-count">${formatNum(count)}</div>
                    <div class="tier-range">${def.min}${def.max === Infinity ? '+' : '-' + def.max} events</div>
                </div>
            `;
        });

        renderTierDistribution(d.tiers);
        renderTierUsers(d.topUsersPerTier);
    } catch (err) {
        console.error('Tiers load error:', err);
    }
}

async function loadLyricsSegment() {
    const days = getDays();
    try {
        const summary = await apiFetch(`/api/analytics/admin/summary?days=${days}`);
        const events = (summary.data.topEventTypes || []).filter(e => e.segment === 'lyrics');
        const segData = (summary.data.segments || []).find(s => s.segment === 'lyrics');

        const statsEl = document.getElementById('lyricsStats');
        statsEl.innerHTML = `
            <div class="stat-card stat-lyrics">
                <i class="fas fa-search"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(segData?.count || 0)}</span>
                    <span class="stat-label">Total Searches</span>
                </div>
            </div>
            <div class="stat-card stat-lyrics">
                <i class="fas fa-user"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(segData?.uniqueUsers || 0)}</span>
                    <span class="stat-label">Unique Users</span>
                </div>
            </div>
        `;

        renderActivityList('lyricsActivityList', events);
    } catch (err) {
        console.error('Lyrics segment error:', err);
    }
}

async function loadCommunitySegment() {
    const days = getDays();
    try {
        const data = await apiFetch(`/api/analytics/admin/community-metrics?days=${days}`);
        const d = data.data;

        const totalEvents = (d.activityBreakdown || []).reduce((sum, a) => sum + a.count, 0);
        const totalUsers = (d.activityBreakdown || []).reduce((max, a) => Math.max(max, a.uniqueUsers || 0), 0);

        const statsEl = document.getElementById('communityStats');
        statsEl.innerHTML = `
            <div class="stat-card stat-community">
                <i class="fas fa-comments"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(totalEvents)}</span>
                    <span class="stat-label">Total Events</span>
                </div>
            </div>
            <div class="stat-card stat-community">
                <i class="fas fa-user"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(totalUsers)}</span>
                    <span class="stat-label">Unique Users</span>
                </div>
            </div>
            <div class="stat-card stat-community">
                <i class="fas fa-door-open"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum((d.topRooms || []).length)}</span>
                    <span class="stat-label">Active Rooms</span>
                </div>
            </div>
        `;

        renderActivityList('communityActivityList', (d.activityBreakdown || []).map(a => ({
            segment: 'community', eventType: a.eventType, count: a.count
        })));

        renderRoomsList(d.topRooms || []);
        renderCommunityDaily(d.dailyActivity || []);
    } catch (err) {
        console.error('Community segment error:', err);
    }
}

async function loadMerchSegment() {
    const days = getDays();
    try {
        const data = await apiFetch(`/api/analytics/admin/merch-metrics?days=${days}`);
        const d = data.data;
        const os = d.orderStats;

        const statsEl = document.getElementById('merchStatsGrid');
        statsEl.innerHTML = `
            <div class="stat-card stat-merch">
                <i class="fas fa-shopping-cart"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(os.totalOrders)}</span>
                    <span class="stat-label">Total Orders</span>
                </div>
            </div>
            <div class="stat-card stat-merch">
                <i class="fas fa-dollar-sign"></i>
                <div class="stat-info">
                    <span class="stat-value">$${(os.avgOrderValue || 0).toFixed(2)}</span>
                    <span class="stat-label">Avg Order Value</span>
                </div>
            </div>
            <div class="stat-card stat-merch">
                <i class="fas fa-chart-line"></i>
                <div class="stat-info">
                    <span class="stat-value">$${formatNum(Math.round(os.totalRevenue || 0))}</span>
                    <span class="stat-label">Total Revenue</span>
                </div>
            </div>
            <div class="stat-card stat-merch">
                <i class="fas fa-boxes"></i>
                <div class="stat-info">
                    <span class="stat-value">${(os.avgQuantity || 0).toFixed(1)}</span>
                    <span class="stat-label">Avg Quantity</span>
                </div>
            </div>
        `;

        renderMerchFunnel(d.funnel || []);
        renderTopProducts(d.topProducts || []);
    } catch (err) {
        console.error('Merch segment error:', err);
    }
}

async function loadGenres() {
    const days = getDays();
    try {
        const data = await apiFetch(`/api/analytics/admin/genre-propensity?days=${days}`);
        const d = data.data;

        const statsEl = document.getElementById('genreStatsGrid');
        statsEl.innerHTML = `
            <div class="stat-card">
                <i class="fas fa-guitar" style="color: #4ECDC4;"></i>
                <div class="stat-info">
                    <span class="stat-value">${formatNum(d.totalGenreTaggedSearches)}</span>
                    <span class="stat-label">Genre-Tagged Searches</span>
                </div>
            </div>
            <div class="stat-card">
                <i class="fas fa-list" style="color: #FFD93D;"></i>
                <div class="stat-info">
                    <span class="stat-value">${(d.genres || []).length}</span>
                    <span class="stat-label">Genres Found</span>
                </div>
            </div>
        `;

        renderGenreChart(d.genres || []);
    } catch (err) {
        console.error('Genres error:', err);
    }
}

function renderDailyTrend(trend) {
    const container = document.getElementById('dailyTrendChart');
    if (!trend.length) {
        container.innerHTML = emptyState('No activity data yet');
        return;
    }

    const maxCount = Math.max(...trend.map(t => t.count), 1);
    const width = 100;
    const height = 180;
    const padding = 30;
    const chartW = width - padding;

    const points = trend.map((t, i) => {
        const x = padding + (i / Math.max(trend.length - 1, 1)) * (chartW - 10);
        const y = height - padding - ((t.count / maxCount) * (height - padding - 10));
        return { x, y, ...t };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = pathD + ` L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:200px;">
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${SEGMENT_COLORS.auth}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${SEGMENT_COLORS.auth}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#areaGrad)" />
            <path d="${pathD}" fill="none" stroke="${SEGMENT_COLORS.auth}" stroke-width="0.5"/>
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="0.8" fill="${SEGMENT_COLORS.auth}"><title>${p.date}: ${p.count} events</title></circle>`).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;">
            <span>${trend[0]?.date || ''}</span>
            <span>${trend[trend.length - 1]?.date || ''}</span>
        </div>
    `;
}

function renderSegmentDonut(segments) {
    const container = document.getElementById('segmentChart');
    if (!segments.length) {
        container.innerHTML = emptyState('No segment data yet');
        return;
    }

    const total = segments.reduce((sum, s) => sum + s.totalEvents || s.count || 0, 0);
    if (total === 0) {
        container.innerHTML = emptyState('No events recorded');
        return;
    }

    const colors = segments.map(s => SEGMENT_COLORS[s.segment] || '#8B949E');
    let cumAngle = 0;
    const cx = 90, cy = 90, r = 70, ir = 45;

    const paths = segments.map((s, i) => {
        const count = s.totalEvents || s.count || 0;
        const angle = (count / total) * 360;
        const startAngle = cumAngle;
        cumAngle += angle;
        const endAngle = cumAngle;

        const start1 = polarToCart(cx, cy, r, startAngle);
        const end1 = polarToCart(cx, cy, r, endAngle);
        const start2 = polarToCart(cx, cy, ir, endAngle);
        const end2 = polarToCart(cx, cy, ir, startAngle);
        const large = angle > 180 ? 1 : 0;

        return `<path d="M ${start1.x} ${start1.y} A ${r} ${r} 0 ${large} 1 ${end1.x} ${end1.y} L ${start2.x} ${start2.y} A ${ir} ${ir} 0 ${large} 0 ${end2.x} ${end2.y} Z" fill="${colors[i]}"><title>${SEGMENT_LABELS[s.segment] || s.segment}: ${count}</title></path>`;
    });

    const legend = segments.map(s => {
        const count = s.totalEvents || s.count || 0;
        const pct = ((count / total) * 100).toFixed(1);
        return `<div class="legend-item">
            <span class="legend-dot" style="background:${SEGMENT_COLORS[s.segment] || '#8B949E'}"></span>
            <span class="legend-label">${SEGMENT_LABELS[s.segment] || s.segment}</span>
            <span class="legend-value">${pct}%</span>
        </div>`;
    }).join('');

    container.innerHTML = `
        <div class="donut-chart">
            <svg class="donut-svg" viewBox="0 0 180 180">${paths.join('')}</svg>
            <div class="donut-legend">${legend}</div>
        </div>
    `;
}

function renderTopEvents(events) {
    const container = document.getElementById('topEventsList');
    if (!events.length) {
        container.innerHTML = emptyState('No events yet');
        return;
    }

    container.innerHTML = events.slice(0, 15).map(e => `
        <div class="event-list-item">
            <div>
                <span class="event-name">${EVENT_LABELS[e.eventType] || e.eventType}</span>
                <span class="event-segment-badge badge-${e.segment}">${SEGMENT_LABELS[e.segment] || e.segment}</span>
            </div>
            <span class="event-count">${formatNum(e.count)}</span>
        </div>
    `).join('');
}

function renderCrossSegment(data) {
    const container = document.getElementById('crossSegmentChart');
    if (!data.length) {
        container.innerHTML = emptyState('No cross-segment data yet');
        return;
    }

    const maxVal = Math.max(...data.map(d => d.userCount), 1);
    const labels = { 1: '1 Segment', 2: '2 Segments', 3: '3 Segments', 4: '4 Segments', 5: '5 Segments' };
    const barColors = ['#8B949E', '#4ECDC4', '#FFD93D', '#FF6B6B', '#3EB489'];

    container.innerHTML = `<div class="bar-chart">${data.map((d, i) => `
        <div class="bar-row">
            <span class="bar-label">${labels[d.segmentCount] || d.segmentCount + ' Segments'}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${(d.userCount / maxVal) * 100}%;background:${barColors[i] || barColors[0]};">${d.userCount}</div>
            </div>
            <span class="bar-value">${d.userCount} users</span>
        </div>
    `).join('')}</div>`;
}

function renderTierDistribution(tiers) {
    const container = document.getElementById('tierDistChart');
    const total = Object.values(tiers).reduce((s, v) => s + v, 0);
    if (total === 0) {
        container.innerHTML = emptyState('No user tier data yet');
        return;
    }

    const tierColors = { low: '#8B949E', moderate: '#4ECDC4', high: '#FFD93D', hyper: '#FF6B6B' };
    const maxVal = Math.max(...Object.values(tiers), 1);

    container.innerHTML = `<div class="bar-chart">${Object.entries(tiers).map(([tier, count]) => `
        <div class="bar-row">
            <span class="bar-label" style="color:${tierColors[tier]}">${tier.charAt(0).toUpperCase() + tier.slice(1)}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${(count / maxVal) * 100}%;background:${tierColors[tier]};">${count}</div>
            </div>
            <span class="bar-value">${((count / total) * 100).toFixed(1)}%</span>
        </div>
    `).join('')}</div>`;
}

function renderTierUsers(topUsersPerTier) {
    const container = document.getElementById('tierUsersList');
    const tierColors = { low: '#8B949E', moderate: '#4ECDC4', high: '#FFD93D', hyper: '#FF6B6B' };
    let html = '';

    Object.entries(topUsersPerTier).forEach(([tier, users]) => {
        if (users.length === 0) return;
        html += `<h4 style="color:${tierColors[tier]};margin:1rem 0 0.5rem;text-transform:capitalize;">${tier} Tier</h4>`;
        html += users.map(u => `
            <div class="event-list-item">
                <span class="event-name" style="font-size:0.8rem;">${u.userId || 'Anonymous'}</span>
                <span class="event-count">${u.eventCount} events</span>
            </div>
        `).join('');
    });

    container.innerHTML = html || emptyState('No user data yet');
}

function renderActivityList(containerId, events) {
    const container = document.getElementById(containerId);
    if (!events.length) {
        container.innerHTML = emptyState('No activity data yet');
        return;
    }
    container.innerHTML = events.map(e => `
        <div class="event-list-item">
            <span class="event-name">${EVENT_LABELS[e.eventType] || e.eventType}</span>
            <span class="event-count">${formatNum(e.count)}</span>
        </div>
    `).join('');
}

function renderRoomsList(rooms) {
    const container = document.getElementById('topRoomsList');
    if (!rooms.length) {
        container.innerHTML = emptyState('No room data yet');
        return;
    }
    container.innerHTML = rooms.map(r => `
        <div class="event-list-item">
            <div>
                <span class="event-name">${escapeHtml(r.roomName || r.roomId || 'Unknown')}</span>
                <span class="event-segment-badge badge-community">${r.uniqueUsers} users</span>
            </div>
            <span class="event-count">${formatNum(r.totalEvents)}</span>
        </div>
    `).join('');
}

function renderCommunityDaily(daily) {
    const container = document.getElementById('communityDailyChart');
    if (!daily.length) {
        container.innerHTML = emptyState('No daily community data');
        return;
    }
    renderLineChart(container, daily, '#FFD93D');
}

function renderMerchFunnel(funnel) {
    const container = document.getElementById('merchFunnelList');
    if (!funnel.length) {
        container.innerHTML = emptyState('No funnel data yet');
        return;
    }

    const funnelIcons = {
        merch_browse: 'fa-eye',
        merch_create_design: 'fa-paint-brush',
        merch_shipping_calc: 'fa-truck',
        merch_order: 'fa-shopping-cart'
    };

    const sorted = [...funnel].sort((a, b) => b.count - a.count);
    container.innerHTML = sorted.map(f => `
        <div class="funnel-item">
            <div class="funnel-icon"><i class="fas ${funnelIcons[f.stage] || 'fa-circle'}"></i></div>
            <div class="funnel-info">
                <div class="funnel-stage">${EVENT_LABELS[f.stage] || f.stage}</div>
                <div class="funnel-detail">${f.uniqueUsers} unique users</div>
            </div>
            <span class="funnel-count">${formatNum(f.count)}</span>
        </div>
    `).join('');
}

function renderTopProducts(products) {
    const container = document.getElementById('topProductsList');
    if (!products.length) {
        container.innerHTML = emptyState('No product data yet');
        return;
    }
    container.innerHTML = products.map((p, i) => `
        <div class="event-list-item">
            <span class="event-name"><strong>#${i + 1}</strong> ${escapeHtml(p.productId)}</span>
            <span class="event-count">${formatNum(p.interactions)}</span>
        </div>
    `).join('');
}

function renderGenreChart(genres) {
    const container = document.getElementById('genreBarChart');
    if (!genres.length) {
        container.innerHTML = emptyState('No genre data yet. Genre info comes from lyrics searches.');
        return;
    }

    const maxVal = Math.max(...genres.map(g => g.searchCount), 1);
    const hues = genres.map((_, i) => `hsl(${160 + (i * 15) % 200}, 60%, 55%)`);

    container.innerHTML = `<div class="bar-chart">${genres.map((g, i) => `
        <div class="bar-row">
            <span class="bar-label">${escapeHtml(g.genre)}</span>
            <div class="bar-track">
                <div class="bar-fill" style="width:${(g.searchCount / maxVal) * 100}%;background:${hues[i]};">${g.percentage}%</div>
            </div>
            <span class="bar-value">${formatNum(g.searchCount)}</span>
        </div>
    `).join('')}</div>`;
}

function renderLineChart(container, data, color) {
    const maxCount = Math.max(...data.map(t => t.count), 1);
    const width = 100;
    const height = 180;
    const padding = 30;
    const chartW = width - padding;

    const points = data.map((t, i) => {
        const x = padding + (i / Math.max(data.length - 1, 1)) * (chartW - 10);
        const y = height - padding - ((t.count / maxCount) * (height - padding - 10));
        return { x, y, ...t };
    });

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = pathD + ` L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%;height:200px;">
            <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <path d="${areaD}" fill="url(#lineGrad)" />
            <path d="${pathD}" fill="none" stroke="${color}" stroke-width="0.5"/>
            ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="0.8" fill="${color}"><title>${p.date}: ${p.count}</title></circle>`).join('')}
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;">
            <span>${data[0]?.date || ''}</span>
            <span>${data[data.length - 1]?.date || ''}</span>
        </div>
    `;
}

function polarToCart(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}

function emptyState(msg) {
    return `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>${msg}</p></div>`;
}
