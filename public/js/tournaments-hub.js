class TournamentsHub {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.currentSeason = null;
        this.init();
    }

    async init() {
        await this.loadCurrentSeason();
        await this.loadPastSeasons();
    }

    async loadCurrentSeason() {
        try {
            const res = await fetch('/api/tournaments/seasons/current');
            const data = await res.json();

            if (!data.success || !data.data) {
                this.showNoSeason();
                return;
            }

            const { season, rounds, sponsorships } = data.data;
            this.currentSeason = season;
            this.renderSeasonHero(season);
            this.renderRounds(rounds);
            this.renderSponsor(sponsorships);
            this.loadLeaderboardPreview(season._id);
        } catch (err) {
            console.error('Failed to load season:', err);
            this.showNoSeason();
        }
    }

    showNoSeason() {
        document.getElementById('roundsGrid').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-trophy"></i>
                <p>No active tournament season right now. Check back soon!</p>
            </div>`;
    }

    renderSeasonHero(season) {
        document.getElementById('seasonBadge').textContent =
            season.status === 'active' ? 'Live Season' :
            season.status === 'voting' ? 'Voting Open' : 'Coming Soon';
        document.getElementById('seasonName').textContent = season.name;
        document.getElementById('seasonDesc').textContent = season.description || 'Artists submit original verses or cover songs. Fans vote head-to-head. Who will be crowned champion?';

        const meta = document.getElementById('seasonMeta');
        const start = new Date(season.startAt).toLocaleDateString();
        const end = new Date(season.endAt).toLocaleDateString();
        meta.innerHTML = `
            <span><i class="fas fa-calendar"></i> ${start} - ${end}</span>
            ${season.prizeDescription ? `<span><i class="fas fa-gift"></i> ${season.prizeDescription}</span>` : ''}
        `;
    }

    renderRounds(rounds) {
        const grid = document.getElementById('roundsGrid');
        if (!rounds.length) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>Rounds will be announced soon!</p></div>';
            return;
        }

        grid.innerHTML = rounds.filter(r => r.status !== 'draft').map(round => {
            const statusLabel = {
                'submissions_open': 'Submissions Open',
                'submissions_closed': 'Submissions Closed',
                'showcase': 'Showcase',
                'voting': 'Voting',
                'completed': 'Completed',
                'draft': 'Draft'
            }[round.status] || round.status;

            return `
            <a href="tournament-round.html?id=${round._id}" class="round-card">
                <div class="round-header">
                    <span class="round-name">${round.name}</span>
                    <span class="round-status ${round.status}">${statusLabel}</span>
                </div>
                <span class="round-type-badge">${round.roundType.replace('_', ' ')}</span>
                <div class="round-theme"><i class="fas fa-palette"></i> ${round.theme}</div>
                <div class="round-meta">
                    <span><i class="fas fa-users"></i> Max ${round.maxSubmissions} entries</span>
                    <span><i class="fas fa-calendar-alt"></i> Voting ${new Date(round.votingOpenAt).toLocaleDateString()}</span>
                </div>
            </a>`;
        }).join('');
    }

    renderSponsor(sponsorships) {
        if (!sponsorships || !sponsorships.length) return;
        const bar = document.getElementById('sponsorBar');
        const main = sponsorships.find(s => s.placementKey === 'naming_rights' || s.placementKey === 'presented_by');
        if (main && main.sponsorId) {
            bar.style.display = 'flex';
            document.getElementById('sponsorName').textContent = main.sponsorId.name;
            this.trackMetric(main.sponsorId._id, main._id, 'impression');
        }
    }

    async loadLeaderboardPreview(seasonId) {
        try {
            const res = await fetch(`/api/tournaments/leaderboard?seasonId=${seasonId}&limit=5`);
            const data = await res.json();
            if (!data.success || !data.data.entries.length) return;

            document.getElementById('leaderboardPreview').style.display = 'block';
            const body = document.getElementById('leaderboardBody');
            body.innerHTML = data.data.entries.map((e, i) => {
                const name = e.userId?.name || 'Unknown';
                const initial = name.charAt(0).toUpperCase();
                const rankClass = i < 3 ? `top-${i + 1}` : '';
                return `<tr>
                    <td><span class="leaderboard-rank ${rankClass}">${i + 1}</span></td>
                    <td><div class="leaderboard-artist"><div class="leaderboard-avatar">${initial}</div><span>${name}</span></div></td>
                    <td class="leaderboard-points">${e.points}</td>
                    <td class="leaderboard-record">${e.wins}-${e.losses}</td>
                </tr>`;
            }).join('');

            document.getElementById('fullLeaderboardLink').href = `tournament-leaderboard.html?seasonId=${seasonId}`;
        } catch (err) {
            console.error('Leaderboard preview error:', err);
        }
    }

    async loadPastSeasons() {
        try {
            const res = await fetch('/api/tournaments/seasons');
            const data = await res.json();
            if (!data.success) return;

            const past = data.data.filter(s => s.status === 'completed');
            if (!past.length) return;

            document.getElementById('pastSeasons').style.display = 'block';
            document.getElementById('pastSeasonsList').innerHTML = past.map(s => `
                <a href="verses-tournaments.html?season=${s._id}" class="past-season-link">
                    <i class="fas fa-trophy"></i> ${s.name}
                </a>
            `).join('');
        } catch (err) {
            console.error('Past seasons error:', err);
        }
    }

    async trackMetric(sponsorId, assignmentId, eventType) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
            await fetch('/api/tournaments/metrics', {
                method: 'POST',
                headers,
                body: JSON.stringify({ sponsorId, assignmentId, eventType })
            });
        } catch (e) {}
    }
}

document.addEventListener('DOMContentLoaded', () => new TournamentsHub());
