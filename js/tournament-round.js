class TournamentRound {
    constructor() {
        this.token = localStorage.getItem('token');
        this.roundId = new URLSearchParams(window.location.search).get('id');
        this.round = null;
        this.user = null;
        if (!this.roundId) {
            window.location.href = 'verses-tournaments.html';
            return;
        }
        this.init();
    }

    async init() {
        await this.checkAuth();
        await this.loadRound();
        this.setupTabs();
        this.setupSubmissionForm();
    }

    async checkAuth() {
        if (!this.token) return;
        try {
            const res = await fetch('/api/auth/verify', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            if (data.user) this.user = data.user;
        } catch (e) {}
    }

    async loadRound() {
        try {
            const res = await fetch(`/api/tournaments/rounds/${this.roundId}`);
            const data = await res.json();
            if (!data.success) {
                document.getElementById('roundName').textContent = 'Round not found';
                return;
            }

            const { round, submissions, matches } = data.data;
            this.round = round;

            document.title = `${round.name} - Verses Tournament - Wordeth`;
            document.getElementById('roundName').textContent = round.name;
            document.getElementById('roundTheme').innerHTML = `<i class="fas fa-palette"></i> Theme: ${round.theme}`;
            document.getElementById('breadcrumbSeason').textContent = round.seasonId?.name || 'Season';
            document.getElementById('breadcrumbRound').textContent = round.name;

            const dates = document.getElementById('roundDates');
            dates.innerHTML = `
                <span><i class="fas fa-pencil-alt"></i> Submissions: ${new Date(round.submissionOpenAt).toLocaleDateString()} - ${new Date(round.submissionCloseAt).toLocaleDateString()}</span>
                <span><i class="fas fa-vote-yea"></i> Voting: ${new Date(round.votingOpenAt).toLocaleDateString()} - ${new Date(round.votingCloseAt).toLocaleDateString()}</span>
            `;

            this.renderMatches(matches);
            this.renderSubmissions(submissions);

            if (this.user && round.status === 'submissions_open') {
                const accountType = this.user.accountType || 'fan';
                if (accountType === 'artist') {
                    document.getElementById('submitTab').style.display = 'block';
                }
            }
        } catch (err) {
            console.error('Load round error:', err);
        }
    }

    renderMatches(matches) {
        const container = document.getElementById('matchesList');
        if (!matches || !matches.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-random"></i><p>Matches haven\'t been seeded yet. Check back after submissions close!</p></div>';
            return;
        }

        container.innerHTML = matches.map(m => {
            const nameA = m.submissionA?.artistUserId?.name || m.submissionA?.title || 'TBD';
            const nameB = m.submissionB?.artistUserId?.name || m.submissionB?.title || 'TBD';
            const titleA = m.submissionA?.title || '';
            const titleB = m.submissionB?.title || '';
            const typeA = m.submissionA?.submissionType || 'original';
            const typeB = m.submissionB?.submissionType || 'original';
            const isComplete = m.status === 'completed';
            const winnerIsA = isComplete && m.winnerSubmissionId === m.submissionA?._id;
            const winnerIsB = isComplete && m.winnerSubmissionId === m.submissionB?._id;

            return `
            <a href="tournament-match.html?id=${m._id}" class="match-card ${isComplete ? 'completed' : ''}">
                <div class="match-side ${winnerIsA ? 'winner-side' : ''}">
                    <span class="match-artist-name">${nameA} ${winnerIsA ? '<i class="fas fa-crown" style="color:#ffd700;font-size:0.8rem;"></i>' : ''}</span>
                    <span class="match-submission-title">${titleA}</span>
                    <span class="match-submission-type ${typeA}">${typeA}</span>
                </div>
                <div class="match-vs">
                    <span class="vs-text">VS</span>
                    <span class="match-score">${m.scoreA} - ${m.scoreB}</span>
                </div>
                <div class="match-side right ${winnerIsB ? 'winner-side' : ''}">
                    <span class="match-artist-name">${winnerIsB ? '<i class="fas fa-crown" style="color:#ffd700;font-size:0.8rem;"></i> ' : ''}${nameB}</span>
                    <span class="match-submission-title">${titleB}</span>
                    <span class="match-submission-type ${typeB}">${typeB}</span>
                </div>
            </a>`;
        }).join('');
    }

    renderSubmissions(submissions) {
        const container = document.getElementById('submissionsList');
        if (!submissions || !submissions.length) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-microphone-alt"></i><p>No approved submissions yet.</p></div>';
            return;
        }

        container.innerHTML = submissions.map(s => {
            const name = s.artistUserId?.name || 'Unknown Artist';
            const initial = name.charAt(0).toUpperCase();
            return `
            <div class="match-card" style="grid-template-columns:auto 1fr auto; cursor:default;">
                <div class="contestant-avatar" style="width:44px;height:44px;font-size:1rem;">${initial}</div>
                <div>
                    <div class="match-artist-name">${name}</div>
                    <div class="match-submission-title">${s.title}</div>
                    <span class="match-submission-type ${s.submissionType}">${s.submissionType}</span>
                    ${s.submissionType === 'cover' && s.originalSong?.songTitle ? `<span style="font-size:0.75rem;color:rgba(255,255,255,0.4);margin-left:0.5rem;">covering "${s.originalSong.songTitle}" by ${s.originalSong.originalArtist}</span>` : ''}
                </div>
                <div class="reactions-bar" style="flex-direction:column;gap:0.25rem;">
                    ${Object.entries(s.reactionCounts || {}).filter(([,v]) => v > 0).map(([k,v]) => {
                        const icons = { cheer: '🎉', fire: '🔥', clap: '👏', heart: '❤️', mind_blown: '🤯' };
                        return `<span style="font-size:0.75rem;">${icons[k] || k} ${v}</span>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    }

    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
            });
        });
    }

    setupSubmissionForm() {
        const typeSelect = document.getElementById('submissionType');
        const coverFields = document.getElementById('coverFields');

        typeSelect.addEventListener('change', () => {
            coverFields.classList.toggle('visible', typeSelect.value === 'cover');
        });

        document.getElementById('submitVerseBtn').addEventListener('click', () => this.submitVerse());
    }

    async submitVerse() {
        if (!this.token) {
            this.showToast('Please sign in to submit');
            return;
        }

        const btn = document.getElementById('submitVerseBtn');
        const type = document.getElementById('submissionType').value;
        const title = document.getElementById('submissionTitle').value.trim();
        const lyrics = document.getElementById('submissionLyrics').value.trim();
        const audioUrl = document.getElementById('submissionAudio').value.trim();
        const confirmed = document.getElementById('ownershipConfirm').checked;

        if (!title || !lyrics) {
            this.showToast('Title and lyrics are required');
            return;
        }
        if (!confirmed) {
            this.showToast('You must confirm ownership/rights');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
            const body = {
                submissionType: type,
                title,
                lyricsText: lyrics,
                audioUrl,
                ownershipConfirmed: 'true'
            };

            if (type === 'cover') {
                body.originalSongTitle = document.getElementById('originalSongTitle').value.trim();
                body.originalArtist = document.getElementById('originalArtist').value.trim();
            }

            const res = await fetch(`/api/tournaments/rounds/${this.roundId}/submissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (data.success) {
                this.showToast('Verse submitted! It will be reviewed before appearing.');
                document.getElementById('submissionTitle').value = '';
                document.getElementById('submissionLyrics').value = '';
                document.getElementById('submissionAudio').value = '';
                document.getElementById('ownershipConfirm').checked = false;
            } else {
                this.showToast(data.message || data.errors?.[0]?.msg || 'Submission failed');
            }
        } catch (err) {
            this.showToast('Network error');
        }

        btn.disabled = false;
        btn.textContent = 'Submit Verse';
    }

    showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => new TournamentRound());
