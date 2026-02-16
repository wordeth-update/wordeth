class TournamentMatch {
    constructor() {
        this.token = localStorage.getItem('token');
        this.matchId = new URLSearchParams(window.location.search).get('id');
        this.match = null;
        this.userVote = null;
        if (!this.matchId) {
            window.location.href = 'verses-tournaments.html';
            return;
        }
        this.init();
    }

    async init() {
        await this.loadMatch();
    }

    async loadMatch() {
        try {
            const headers = {};
            if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

            const res = await fetch(`/api/tournaments/matches/${this.matchId}`, { headers });
            const data = await res.json();

            if (!data.success) {
                document.getElementById('matchTitle').textContent = 'Match not found';
                return;
            }

            this.match = data.data.match;
            this.userVote = data.data.userVote;
            this.render();
        } catch (err) {
            console.error('Load match error:', err);
        }
    }

    render() {
        const m = this.match;
        const subA = m.submissionA;
        const subB = m.submissionB;

        document.getElementById('matchTitle').textContent = `Match #${m.matchNumber}`;
        document.getElementById('breadcrumbMatch').textContent = `Match #${m.matchNumber}`;

        if (m.roundId) {
            const link = document.getElementById('breadcrumbRoundLink');
            link.textContent = 'Round';
            link.href = `tournament-round.html?id=${typeof m.roundId === 'object' ? m.roundId._id : m.roundId}`;
        }

        const votingOpen = m.status === 'voting' || m.status === 'active';
        const isComplete = m.status === 'completed';

        let statusText = '';
        if (isComplete) {
            statusText = 'This match has ended.';
        } else if (votingOpen) {
            statusText = 'Voting is open! Cast your vote below.';
        } else if (m.status === 'pending') {
            statusText = 'Voting has not started yet.';
        }
        document.getElementById('votingStatus').textContent = statusText;

        const contestants = document.getElementById('contestants');
        contestants.innerHTML = `
            ${this.renderContestant(subA, 'A', m)}
            ${this.renderContestant(subB, 'B', m)}
        `;

        contestants.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.vote(e.target.dataset.submissionId));
        });

        contestants.querySelectorAll('.reaction-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const el = e.target.closest('.reaction-btn');
                this.react(el.dataset.submissionId, el.dataset.type);
            });
        });
    }

    renderContestant(sub, side, match) {
        if (!sub) return '<div class="contestant-card"><p>TBD</p></div>';

        const artist = sub.artistUserId;
        const name = artist?.name || 'Unknown Artist';
        const initial = name.charAt(0).toUpperCase();
        const isWinner = match.status === 'completed' && match.winnerSubmissionId?.toString() === sub._id?.toString();
        const hasVoted = !!this.userVote;
        const votedForThis = this.userVote?.voteForSubmissionId === sub._id;
        const votingOpen = match.status === 'voting' || match.status === 'active';
        const score = side === 'A' ? match.scoreA : match.scoreB;

        const rc = sub.reactionCounts || {};
        const reactions = { cheer: '🎉', fire: '🔥', clap: '👏', heart: '❤️', mind_blown: '🤯' };

        return `
        <div class="contestant-card ${votedForThis ? 'voted' : ''} ${isWinner ? 'winner' : ''}">
            ${isWinner ? '<div style="margin-bottom:0.5rem;"><i class="fas fa-crown" style="color:#ffd700;font-size:1.2rem;"></i></div>' : ''}
            <div class="contestant-avatar">${initial}</div>
            <div class="contestant-name">${name}</div>
            <div class="contestant-title">"${sub.title}"</div>
            <span class="contestant-type match-submission-type ${sub.submissionType}">${sub.submissionType}</span>
            ${sub.submissionType === 'cover' && sub.originalSong?.songTitle ?
                `<div style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-bottom:0.75rem;">Covering "${sub.originalSong.songTitle}" by ${sub.originalSong.originalArtist}</div>` : ''}
            <div class="contestant-lyrics">${sub.lyricsText || ''}</div>
            ${sub.audioUrl ? `<div class="contestant-audio"><audio controls src="${sub.audioUrl}"></audio></div>` : ''}
            <div style="font-size:0.85rem; color:var(--mint); margin-bottom:0.75rem; font-weight:700;">${score} votes</div>
            <div class="reactions-bar" style="margin-bottom:0.75rem;">
                ${Object.entries(reactions).map(([type, emoji]) =>
                    `<button class="reaction-btn" data-submission-id="${sub._id}" data-type="${type}">${emoji} <span class="count">${rc[type] || 0}</span></button>`
                ).join('')}
            </div>
            ${votingOpen && !hasVoted ?
                `<button class="vote-btn" data-submission-id="${sub._id}"><i class="fas fa-vote-yea"></i> Vote for ${name}</button>` :
                votedForThis ?
                    `<button class="vote-btn voted" disabled><i class="fas fa-check"></i> Your Vote</button>` :
                    hasVoted ?
                        `<button class="vote-btn" disabled style="opacity:0.3;">Vote</button>` :
                        `<button class="vote-btn" disabled>${match.status === 'completed' ? 'Match Ended' : 'Voting Not Open'}</button>`
            }
        </div>`;
    }

    async vote(submissionId) {
        if (!this.token) {
            this.showToast('Please sign in to vote');
            return;
        }

        try {
            const res = await fetch(`/api/tournaments/matches/${this.matchId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ voteForSubmissionId: submissionId })
            });

            const data = await res.json();
            if (data.success) {
                this.showToast('Vote recorded!');
                await this.loadMatch();
            } else {
                this.showToast(data.message || 'Vote failed');
            }
        } catch (err) {
            this.showToast('Network error');
        }
    }

    async react(submissionId, type) {
        if (!this.token) {
            this.showToast('Please sign in to react');
            return;
        }

        try {
            const res = await fetch(`/api/tournaments/submissions/${submissionId}/react`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ type })
            });

            const data = await res.json();
            if (data.success) {
                await this.loadMatch();
            }
        } catch (err) {
            this.showToast('Network error');
        }
    }

    showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => new TournamentMatch());
