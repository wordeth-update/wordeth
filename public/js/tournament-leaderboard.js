class TournamentLeaderboard {
    constructor() {
        this.seasonId = new URLSearchParams(window.location.search).get('seasonId');
        this.init();
    }

    async init() {
        if (!this.seasonId) {
            const res = await fetch('/api/tournaments/seasons/current');
            const data = await res.json();
            if (data.success && data.data) {
                this.seasonId = data.data.season._id;
                document.getElementById('breadcrumbSeason').textContent = data.data.season.name;
                document.getElementById('leaderboardSubtitle').textContent = `Top performing artists in ${data.data.season.name}`;
            } else {
                document.getElementById('leaderboardBody').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;">No active season</td></tr>';
                return;
            }
        }

        await Promise.all([this.loadLeaderboard(), this.loadWinners(), this.loadSponsor()]);
    }

    async loadLeaderboard() {
        try {
            const res = await fetch(`/api/tournaments/leaderboard?seasonId=${this.seasonId}&limit=50`);
            const data = await res.json();

            const body = document.getElementById('leaderboardBody');
            if (!data.success || !data.data.entries.length) {
                body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:rgba(255,255,255,0.5);">No leaderboard entries yet</td></tr>';
                return;
            }

            body.innerHTML = data.data.entries.map((e, i) => {
                const name = e.userId?.name || 'Unknown';
                const initial = name.charAt(0).toUpperCase();
                const rankClass = i < 3 ? `top-${i + 1}` : '';
                const medals = ['🥇', '🥈', '🥉'];
                const rankDisplay = i < 3 ? medals[i] : (i + 1);

                return `<tr>
                    <td><span class="leaderboard-rank ${rankClass}">${rankDisplay}</span></td>
                    <td><div class="leaderboard-artist"><div class="leaderboard-avatar">${initial}</div><span>${name}</span></div></td>
                    <td class="leaderboard-points">${e.points}</td>
                    <td class="leaderboard-record">${e.wins}-${e.losses}</td>
                    <td>${e.totalVotesReceived || 0}</td>
                </tr>`;
            }).join('');
        } catch (err) {
            console.error('Leaderboard error:', err);
        }
    }

    async loadWinners() {
        try {
            const res = await fetch(`/api/tournaments/winners?seasonId=${this.seasonId}`);
            const data = await res.json();

            const container = document.getElementById('winnersList');
            if (!data.success || !data.data.length) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-crown"></i><p>No match winners yet</p></div>';
                return;
            }

            container.innerHTML = data.data.map(m => {
                const winner = m.winnerSubmissionId;
                const artist = winner?.artistUserId;
                const name = artist?.name || 'Unknown';
                const roundName = m.roundId?.name || 'Round';

                return `
                <div class="match-card" style="grid-template-columns:auto 1fr auto; cursor:default;">
                    <div style="font-size:1.5rem;">🏆</div>
                    <div>
                        <div class="match-artist-name">${name}</div>
                        <div class="match-submission-title">"${winner?.title || ''}"</div>
                    </div>
                    <div style="text-align:right; font-size:0.8rem; color:rgba(255,255,255,0.5);">${roundName}</div>
                </div>`;
            }).join('');
        } catch (err) {
            console.error('Winners error:', err);
        }
    }

    async loadSponsor() {
        try {
            const res = await fetch('/api/tournaments/sponsorships/active?scopeType=leaderboard');
            const data = await res.json();
            if (data.success && data.data.length) {
                const s = data.data[0];
                if (s.sponsorId) {
                    document.getElementById('sponsorBar').style.display = 'flex';
                    document.getElementById('sponsorName').textContent = s.sponsorId.name;
                }
            }
        } catch (err) {}
    }
}

document.addEventListener('DOMContentLoaded', () => new TournamentLeaderboard());
