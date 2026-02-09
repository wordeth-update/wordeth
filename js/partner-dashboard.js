class PartnerDashboard {
    constructor() {
        this.API_BASE = window.location.origin;
        this.token = localStorage.getItem('partnerToken');
        this.label = JSON.parse(localStorage.getItem('partnerLabel') || 'null');
        this.charts = {};
        this.map = null;
        this.mapMarkers = [];
        this.currentView = 'label';
        this.currentArtist = null;

        if (!this.token) {
            window.location.href = '/partner-login.html';
            return;
        }

        this.init();
    }

    async init() {
        this.setupEventListeners();
        document.getElementById('labelName').textContent = this.label?.name || '';
        document.getElementById('dashboardTitle').textContent = `${this.label?.name || 'Partner'} Dashboard`;
        await this.loadLabelDashboard();
        this.initMap();
        this.loadGeoData();
    }

    setupEventListeners() {
        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('partnerToken');
            localStorage.removeItem('partnerLabel');
            localStorage.removeItem('partnerUser');
            window.location.href = '/partner-login.html';
        });

        document.getElementById('applyDateFilter').addEventListener('click', () => this.applyDateFilter());
        document.getElementById('clearDateFilter').addEventListener('click', () => this.clearDateFilter());

        document.getElementById('shareBtn').addEventListener('click', () => this.showShareModal());
        document.getElementById('closeShareModal').addEventListener('click', () => this.hideShareModal());
        document.getElementById('generateShareLink').addEventListener('click', () => this.generateShareLink());
        document.getElementById('copyShareLink').addEventListener('click', () => this.copyShareLink());

        document.getElementById('bcLabel').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLabelView();
        });
    }

    async apiCall(endpoint, options = {}) {
        const res = await fetch(`${this.API_BASE}/api/partner${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
                ...options.headers
            }
        });

        if (res.status === 401) {
            localStorage.removeItem('partnerToken');
            window.location.href = '/partner-login.html';
            return null;
        }

        return res.json();
    }

    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }

    formatNumber(num) {
        return new Intl.NumberFormat('en-US').format(num);
    }

    getDateParams() {
        const start = document.getElementById('startDate').value;
        const end = document.getElementById('endDate').value;
        const params = new URLSearchParams();
        if (start) params.set('startDate', start);
        if (end) params.set('endDate', end);
        return params.toString() ? `?${params.toString()}` : '';
    }

    applyDateFilter() {
        if (this.currentView === 'artist' && this.currentArtist) {
            this.loadArtistDashboard(this.currentArtist);
        } else {
            this.loadLabelDashboard();
        }
        this.loadGeoData();
    }

    clearDateFilter() {
        document.getElementById('startDate').value = '';
        document.getElementById('endDate').value = '';
        this.applyDateFilter();
    }

    async loadLabelDashboard() {
        const data = await this.apiCall(`/dashboard/summary${this.getDateParams()}`);
        if (!data || !data.success) return;

        const d = data.data;
        document.getElementById('totalRevenue').textContent = this.formatCurrency(d.stats.totalRevenue);
        document.getElementById('totalRevenueShare').textContent = this.formatCurrency(d.stats.totalRevenueShare);
        document.getElementById('totalOrders').textContent = this.formatNumber(d.stats.totalOrders);
        document.getElementById('totalUnits').textContent = this.formatNumber(d.stats.totalUnits);

        this.renderRevenueChart(d.monthlyTrend);
        this.renderArtistChart(d.artistBreakdown);
        this.renderArtistTable(d.artistBreakdown);
        this.renderRecentSales(d.recentSales);
    }

    renderRevenueChart(trend) {
        const ctx = document.getElementById('revenueChart');
        if (this.charts.revenue) this.charts.revenue.destroy();

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const labels = trend.map(t => `${months[t._id.month - 1]} ${t._id.year}`);

        this.charts.revenue = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Revenue',
                        data: trend.map(t => t.revenue),
                        borderColor: '#96C5B0',
                        backgroundColor: 'rgba(150, 197, 176, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2
                    },
                    {
                        label: 'Your Share',
                        data: trend.map(t => t.revenueShare),
                        borderColor: '#5F0E82',
                        backgroundColor: 'rgba(95, 14, 130, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#aaa' } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: $${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        ticks: { color: '#888', callback: v => '$' + v.toLocaleString() },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    renderArtistChart(artists) {
        const ctx = document.getElementById('artistChart');
        if (this.charts.artist) this.charts.artist.destroy();

        const colors = ['#96C5B0', '#5F0E82', '#755B69', '#553555', '#4ade80', '#f472b6', '#38bdf8', '#fbbf24'];

        this.charts.artist = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: artists.map(a => a.artistName),
                datasets: [{
                    data: artists.map(a => a.revenue),
                    backgroundColor: artists.map((_, i) => colors[i % colors.length]),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#ccc', font: { size: 11 }, padding: 12 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.label}: $${ctx.parsed.toFixed(2)}`
                        }
                    }
                }
            }
        });
    }

    renderArtistTable(artists) {
        const html = `<table class="data-table">
            <thead><tr>
                <th>Artist</th><th>Revenue</th><th>Your Share</th><th>Orders</th><th>Units</th>
            </tr></thead>
            <tbody>
                ${artists.map(a => `<tr>
                    <td class="clickable" data-artist="${a._id}">${a.artistName}</td>
                    <td class="revenue">${this.formatCurrency(a.revenue)}</td>
                    <td>${this.formatCurrency(a.revenueShare)}</td>
                    <td>${this.formatNumber(a.orders)}</td>
                    <td>${this.formatNumber(a.units)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        const wrap = document.getElementById('artistTable');
        wrap.innerHTML = html;
        wrap.querySelectorAll('.clickable').forEach(el => {
            el.addEventListener('click', () => this.showArtistView(el.dataset.artist));
        });
    }

    renderRecentSales(sales) {
        const html = `<table class="data-table">
            <thead><tr>
                <th>Date</th><th>Order</th><th>Artist</th><th>Product</th><th>Song</th><th>Qty</th><th>Amount</th><th>Your Share</th><th>Location</th>
            </tr></thead>
            <tbody>
                ${sales.map(s => `<tr>
                    <td class="muted">${new Date(s.saleDate).toLocaleDateString()}</td>
                    <td class="muted">${s.orderId.substring(0, 12)}...</td>
                    <td>${s.artistName}</td>
                    <td>${s.productName}</td>
                    <td>${s.songTitle || '-'}</td>
                    <td>${s.quantity}</td>
                    <td class="revenue">${this.formatCurrency(s.totalAmount)}</td>
                    <td>${this.formatCurrency(s.revenueShare)}</td>
                    <td class="muted">${s.geo?.city || ''}, ${s.geo?.country || ''}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        document.getElementById('recentSalesTable').innerHTML = html;
    }

    async showArtistView(artistSlug) {
        this.currentView = 'artist';
        this.currentArtist = artistSlug;
        document.getElementById('labelView').style.display = 'none';
        document.getElementById('artistView').style.display = 'grid';

        await this.loadArtistDashboard(artistSlug);
        this.loadGeoData(artistSlug);

        const bcLabel = document.getElementById('bcLabel');
        bcLabel.classList.remove('active');
        let bcArtist = document.getElementById('bcArtist');
        if (!bcArtist) {
            const sep = document.createElement('span');
            sep.className = 'bc-separator';
            sep.id = 'bcSep';
            sep.textContent = ' / ';
            bcArtist = document.createElement('span');
            bcArtist.className = 'bc-link active';
            bcArtist.id = 'bcArtist';
            document.getElementById('breadcrumb').appendChild(sep);
            document.getElementById('breadcrumb').appendChild(bcArtist);
        }
        bcArtist.className = 'bc-link active';
    }

    showLabelView() {
        this.currentView = 'label';
        this.currentArtist = null;
        document.getElementById('labelView').style.display = 'grid';
        document.getElementById('artistView').style.display = 'none';
        document.getElementById('bcLabel').classList.add('active');

        const bcArtist = document.getElementById('bcArtist');
        const bcSep = document.getElementById('bcSep');
        if (bcArtist) bcArtist.remove();
        if (bcSep) bcSep.remove();

        this.loadLabelDashboard();
        this.loadGeoData();
    }

    async loadArtistDashboard(artistSlug) {
        const data = await this.apiCall(`/dashboard/artist/${artistSlug}${this.getDateParams()}`);
        if (!data || !data.success) return;

        const d = data.data;
        const bcArtist = document.getElementById('bcArtist');
        if (bcArtist) bcArtist.textContent = d.artist.name;

        document.getElementById('totalRevenue').textContent = this.formatCurrency(d.stats.totalRevenue);
        document.getElementById('totalRevenueShare').textContent = this.formatCurrency(d.stats.totalRevenueShare);
        document.getElementById('totalOrders').textContent = this.formatNumber(d.stats.totalOrders);
        document.getElementById('totalUnits').textContent = this.formatNumber(d.stats.totalUnits);

        this.renderArtistRevenueChart(d.monthlyTrend);
        this.renderSongTable(d.songBreakdown);
        this.renderAlbumTable(d.albumBreakdown);
        this.renderLyricsLeaderboard(d.lyricsLeaderboard);
        this.renderSkuTable(d.skuBreakdown);
        this.renderArtistGeoTable(d.geoBreakdown);
        this.initTallyTabs();
    }

    renderArtistRevenueChart(trend) {
        const ctx = document.getElementById('artistRevenueChart');
        if (this.charts.artistRevenue) this.charts.artistRevenue.destroy();

        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const labels = trend.map(t => `${months[t._id.month - 1]} ${t._id.year}`);

        this.charts.artistRevenue = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Revenue',
                    data: trend.map(t => t.revenue),
                    backgroundColor: 'rgba(150, 197, 176, 0.6)',
                    borderColor: '#96C5B0',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `Revenue: $${ctx.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    x: { ticks: { color: '#888' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        ticks: { color: '#888', callback: v => '$' + v.toLocaleString() },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });
    }

    renderSongTable(songs) {
        if (!songs || !songs.length) {
            document.getElementById('songTable').innerHTML = '<p class="muted">No song/lyrics data for this artist.</p>';
            return;
        }
        const html = `<table class="data-table">
            <thead><tr>
                <th>Song</th><th>Album</th><th>Lyrics Used</th><th>Apparel Types</th><th>Revenue</th><th>Units</th><th>SKUs</th>
            </tr></thead>
            <tbody>
                ${songs.map(s => `<tr>
                    <td><i class="fas fa-music" style="color:#96C5B0;margin-right:6px;"></i>${s._id}</td>
                    <td class="muted">${s.albumTitle || '-'}</td>
                    <td class="lyrics-snippets">${s.lyricsSnippets && s.lyricsSnippets.length
                        ? s.lyricsSnippets.map(l => `<span class="lyric-tag">"${l}"</span>`).join('')
                        : '<span class="muted">—</span>'}</td>
                    <td>${s.productTypes ? s.productTypes.map(t => `<span class="product-tag">${t}</span>`).join('') : '-'}</td>
                    <td class="revenue">${this.formatCurrency(s.revenue)}</td>
                    <td>${this.formatNumber(s.units)}</td>
                    <td>${s.skuCount}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        document.getElementById('songTable').innerHTML = html;
    }

    renderAlbumTable(albums) {
        if (!albums || !albums.length) {
            document.getElementById('albumTable').innerHTML = '<p class="muted">No album data for this artist.</p>';
            return;
        }
        const html = `<table class="data-table">
            <thead><tr>
                <th>Album</th><th>Songs Used</th><th>Apparel Types</th><th>Revenue</th><th>Units</th><th>SKUs</th>
            </tr></thead>
            <tbody>
                ${albums.map(a => `<tr>
                    <td><i class="fas fa-compact-disc" style="color:#96C5B0;margin-right:6px;"></i>${a._id}</td>
                    <td>${a.songs && a.songs.filter(s => s).length
                        ? a.songs.filter(s => s).map(s => `<span class="song-tag">${s}</span>`).join('')
                        : '<span class="muted">—</span>'}</td>
                    <td>${a.productTypes ? a.productTypes.map(t => `<span class="product-tag">${t}</span>`).join('') : '-'}</td>
                    <td class="revenue">${this.formatCurrency(a.revenue)}</td>
                    <td>${this.formatNumber(a.units)}</td>
                    <td>${a.skuCount}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        document.getElementById('albumTable').innerHTML = html;
    }

    initTallyTabs() {
        document.querySelectorAll('.tally-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.tally-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                document.getElementById('songTable').style.display = target === 'songs' ? '' : 'none';
                document.getElementById('albumTable').style.display = target === 'albums' ? '' : 'none';
            });
        });
    }

    renderLyricsLeaderboard(lyrics) {
        const el = document.getElementById('lyricsLeaderboard');
        if (!lyrics || !lyrics.length) {
            el.innerHTML = '<p class="muted">No lyrics data available for this artist.</p>';
            return;
        }
        const maxMakes = Math.max(...lyrics.map(l => l.totalMakes), 1);
        const html = `<table class="data-table lyrics-leaderboard">
            <thead><tr>
                <th>#</th><th>Lyric</th><th>Song</th><th>Album</th><th>Apparel Types</th><th>Total Makes</th><th>Revenue</th><th></th>
            </tr></thead>
            <tbody>
                ${lyrics.map((l, i) => {
                    const barWidth = Math.round((l.totalMakes / maxMakes) * 100);
                    return `<tr class="${l.coined ? 'coined-row' : ''}">
                        <td class="rank">${i + 1}</td>
                        <td class="lyric-text">
                            <span class="lyric-quote">"${l._id}"</span>
                            ${l.coined ? '<span class="coined-badge">Coined</span>' : ''}
                        </td>
                        <td class="muted">${l.songTitle || '-'}</td>
                        <td class="muted">${l.albumTitle || '-'}</td>
                        <td>${l.productTypes ? l.productTypes.map(t => `<span class="product-tag">${t}</span>`).join('') : '-'}</td>
                        <td class="makes-cell">
                            <span class="makes-count">${this.formatNumber(l.totalMakes)}</span>
                            <div class="makes-bar"><div class="makes-bar-fill${l.coined ? ' coined' : ''}" style="width:${barWidth}%"></div></div>
                        </td>
                        <td class="revenue">${this.formatCurrency(l.revenue)}</td>
                        <td>${l.coined ? '<i class="fas fa-fire coined-icon"></i>' : ''}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
        el.innerHTML = html;
    }

    renderSkuTable(skus) {
        const html = `<table class="data-table">
            <thead><tr>
                <th>SKU</th><th>Product</th><th>Type</th><th>Song</th><th>Revenue</th><th>Units</th>
            </tr></thead>
            <tbody>
                ${skus.map(s => `<tr>
                    <td class="muted">${s._id}</td>
                    <td>${s.productName}</td>
                    <td>${s.productType}</td>
                    <td>${s.songTitle || '-'}</td>
                    <td class="revenue">${this.formatCurrency(s.revenue)}</td>
                    <td>${this.formatNumber(s.units)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        document.getElementById('skuTable').innerHTML = html;
    }

    renderArtistGeoTable(geo) {
        const html = `<table class="data-table">
            <thead><tr>
                <th>Country</th><th>Revenue</th><th>Orders</th><th>Units</th>
            </tr></thead>
            <tbody>
                ${geo.map(g => `<tr>
                    <td>${g._id.country} (${g._id.countryCode})</td>
                    <td class="revenue">${this.formatCurrency(g.revenue)}</td>
                    <td>${this.formatNumber(g.orders)}</td>
                    <td>${this.formatNumber(g.units)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
        document.getElementById('artistGeoTable').innerHTML = html;
    }

    initMap() {
        this.map = L.map('geoMap', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxZoom: 10
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd'
        }).addTo(this.map);
    }

    async loadGeoData(artistSlug) {
        const params = new URLSearchParams();
        if (artistSlug) params.set('artistSlug', artistSlug);
        const qs = params.toString() ? `?${params.toString()}` : '';

        const data = await this.apiCall(`/dashboard/geo${qs}`);
        if (!data || !data.success) return;

        this.mapMarkers.forEach(m => this.map.removeLayer(m));
        this.mapMarkers = [];

        const maxRev = Math.max(...data.data.map(d => d.revenue), 1);

        data.data.forEach(point => {
            if (!point.lat || !point.lng) return;

            const radius = Math.max(6, Math.min(35, (point.revenue / maxRev) * 35));
            const marker = L.circleMarker([point.lat, point.lng], {
                radius,
                fillColor: '#96C5B0',
                fillOpacity: 0.6,
                color: '#5F0E82',
                weight: 1.5
            }).addTo(this.map);

            marker.bindPopup(`
                <div class="map-popup">
                    <h4>${point._id.city || point._id.region}, ${point._id.country}</h4>
                    <p><strong>Revenue:</strong> $${point.revenue.toFixed(2)}</p>
                    <p><strong>Orders:</strong> ${point.orders}</p>
                    <p><strong>Units:</strong> ${point.units}</p>
                </div>
            `);

            this.mapMarkers.push(marker);
        });
    }

    showShareModal() {
        document.getElementById('shareModal').style.display = 'flex';
        document.getElementById('shareLinkResult').style.display = 'none';

        const scopeSelect = document.getElementById('shareScope');
        scopeSelect.innerHTML = '<option value="label">Full Label Dashboard</option>';
        if (this.label) {
            const labelData = JSON.parse(localStorage.getItem('partnerLabel'));
            if (labelData && labelData.slug) {
                scopeSelect.innerHTML += '<option value="artist">Specific Artist</option>';
            }
        }
    }

    hideShareModal() {
        document.getElementById('shareModal').style.display = 'none';
    }

    async generateShareLink() {
        const scope = document.getElementById('shareScope').value;
        const expiresInDays = parseInt(document.getElementById('shareExpiry').value);
        const permissions = {
            revenue: document.getElementById('permRevenue').checked,
            skuDetails: document.getElementById('permSku').checked,
            geoData: document.getElementById('permGeo').checked
        };

        const body = { scope, expiresInDays, permissions };
        if (scope === 'artist' && this.currentArtist) {
            body.artistSlug = this.currentArtist;
        }

        const data = await this.apiCall('/share', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (data && data.success) {
            const url = `${this.API_BASE}/partner-dashboard.html?share=${data.data.token}`;
            document.getElementById('shareLinkUrl').value = url;
            document.getElementById('shareLinkResult').style.display = 'block';
        }
    }

    copyShareLink() {
        const input = document.getElementById('shareLinkUrl');
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            const btn = document.getElementById('copyShareLink');
            btn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => btn.innerHTML = '<i class="fas fa-copy"></i>', 2000);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const shareToken = params.get('share');

    if (shareToken) {
        loadSharedDashboard(shareToken);
    } else {
        new PartnerDashboard();
    }
});

async function loadSharedDashboard(token) {
    const API_BASE = window.location.origin;

    const shareBtn = document.getElementById('shareBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const dateFilter = document.querySelector('.date-filter');
    if (shareBtn) shareBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (dateFilter) dateFilter.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/api/partner/shared/${token}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
            document.querySelector('.dashboard-wrapper').innerHTML = `
                <div style="text-align:center;padding:5rem 2rem;">
                    <i class="fas fa-link-slash" style="font-size:3rem;color:var(--purple-light);margin-bottom:1rem;"></i>
                    <h2 style="color:var(--white);">Invalid or Expired Link</h2>
                    <p style="color:var(--purple-light);">This share link is no longer valid.</p>
                </div>`;
            return;
        }

        const d = data.data;
        document.getElementById('labelName').textContent = d.label.name;
        document.getElementById('dashboardTitle').textContent = `${d.label.name} Dashboard`;
        document.getElementById('dashboardSubtitle').textContent = d.scope === 'artist'
            ? `Artist: ${d.artistSlug} - Shared view`
            : 'Shared view';

        document.getElementById('totalRevenue').textContent = formatCurrency(d.stats.totalRevenue);
        document.getElementById('totalRevenueShare').textContent = formatCurrency(d.stats.totalRevenueShare);
        document.getElementById('totalOrders').textContent = formatNumber(d.stats.totalOrders);
        document.getElementById('totalUnits').textContent = formatNumber(d.stats.totalUnits);

        if (d.artistBreakdown && d.artistBreakdown.length) {
            const ctx = document.getElementById('artistChart');
            const colors = ['#96C5B0', '#5F0E82', '#755B69', '#553555', '#4ade80', '#f472b6'];
            new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: d.artistBreakdown.map(a => a.artistName),
                    datasets: [{ data: d.artistBreakdown.map(a => a.revenue), backgroundColor: colors, borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#ccc' } } } }
            });

            const artistTableHtml = `<table class="data-table">
                <thead><tr><th>Artist</th><th>Revenue</th><th>Orders</th></tr></thead>
                <tbody>${d.artistBreakdown.map(a => `<tr>
                    <td>${a.artistName}</td>
                    <td class="revenue">${formatCurrency(a.revenue)}</td>
                    <td>${formatNumber(a.orders)}</td>
                </tr>`).join('')}</tbody>
            </table>`;
            document.getElementById('artistTable').innerHTML = artistTableHtml;
        }

        if (d.permissions.skuDetails && d.skuBreakdown && d.skuBreakdown.length) {
            const skuHtml = `<table class="data-table">
                <thead><tr><th>SKU</th><th>Product</th><th>Artist</th><th>Song</th><th>Revenue</th><th>Units</th></tr></thead>
                <tbody>${d.skuBreakdown.map(s => `<tr>
                    <td class="muted">${s._id}</td>
                    <td>${s.productName}</td>
                    <td>${s.artistName}</td>
                    <td>${s.songTitle || '-'}</td>
                    <td class="revenue">${formatCurrency(s.revenue)}</td>
                    <td>${formatNumber(s.units)}</td>
                </tr>`).join('')}</tbody>
            </table>`;
            document.getElementById('recentSalesTable').innerHTML = skuHtml;
        }

        if (d.permissions.geoData && d.geoBreakdown && d.geoBreakdown.length) {
            const map = L.map('geoMap', { center: [20, 0], zoom: 2, minZoom: 2 });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; CARTO', subdomains: 'abcd'
            }).addTo(map);

            const maxRev = Math.max(...d.geoBreakdown.map(g => g.revenue), 1);
            d.geoBreakdown.forEach(g => {
                if (!g.lat || !g.lng) return;
                const r = Math.max(6, Math.min(35, (g.revenue / maxRev) * 35));
                L.circleMarker([g.lat, g.lng], {
                    radius: r, fillColor: '#96C5B0', fillOpacity: 0.6, color: '#5F0E82', weight: 1.5
                }).addTo(map).bindPopup(`<div class="map-popup"><h4>${g._id.city}, ${g._id.country}</h4><p>Revenue: $${g.revenue.toFixed(2)}</p><p>Orders: ${g.orders}</p></div>`);
            });
        }

    } catch (err) {
        console.error('Shared dashboard error:', err);
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}
function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num || 0);
}
