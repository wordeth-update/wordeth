class TournamentAdmin {
    constructor() {
        this.token = localStorage.getItem('authToken');
        this.seasons = [];
        this.editingSeasonId = null;
        if (!this.token) {
            window.location.href = 'signin.html';
            return;
        }
        this.init();
    }

    async init() {
        this.setupNav();
        this.setupForms();
        this.setupNavToggle();
        await this.loadAll();
        await this.loadNavVisibility();
    }

    setupNav() {
        document.querySelectorAll('.admin-nav-link').forEach(link => {
            link.addEventListener('click', () => {
                document.querySelectorAll('.admin-nav-link').forEach(l => l.classList.remove('active'));
                document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
                link.classList.add('active');
                document.getElementById(`section-${link.dataset.section}`).classList.add('active');
            });
        });
    }

    setupForms() {
        document.getElementById('createSeasonBtn').addEventListener('click', () => {
            this.editingSeasonId = null;
            document.getElementById('seasonFormTitle').textContent = 'Create Season';
            document.getElementById('seasonFormContainer').style.display = 'block';
            this.clearSeasonForm();
        });
        document.getElementById('cancelSeasonBtn').addEventListener('click', () => {
            document.getElementById('seasonFormContainer').style.display = 'none';
        });
        document.getElementById('saveSeasonBtn').addEventListener('click', () => this.saveSeason());

        document.getElementById('createRoundBtn').addEventListener('click', () => {
            document.getElementById('roundFormContainer').style.display = 'block';
            this.populateSeasonSelect();
        });
        document.getElementById('cancelRoundBtn').addEventListener('click', () => {
            document.getElementById('roundFormContainer').style.display = 'none';
        });
        document.getElementById('saveRoundBtn').addEventListener('click', () => this.saveRound());

        document.getElementById('createSponsorBtn').addEventListener('click', () => {
            document.getElementById('sponsorFormContainer').style.display = 'block';
        });
        document.getElementById('cancelSponsorBtn').addEventListener('click', () => {
            document.getElementById('sponsorFormContainer').style.display = 'none';
        });
        document.getElementById('saveSponsorBtn').addEventListener('click', () => this.saveSponsor());

        document.getElementById('subFilterStatus').addEventListener('change', () => this.loadSubmissions());
    }

    async loadAll() {
        await Promise.all([
            this.loadSeasons(),
            this.loadSubmissions(),
            this.loadSponsors()
        ]);
        if (this.seasons.length) {
            this.loadOverview(this.seasons[0]._id);
            this.loadRounds();
        }
    }

    headers() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`
        };
    }

    async loadSeasons() {
        try {
            const res = await fetch('/api/tournaments/seasons');
            const data = await res.json();
            this.seasons = data.data || [];
            const body = document.getElementById('seasonsBody');
            if (!this.seasons.length) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.4);">No seasons yet</td></tr>';
                return;
            }
            body.innerHTML = this.seasons.map(s => `
                <tr>
                    <td>${s.name}</td>
                    <td><span class="round-status ${s.status}">${s.status}</span></td>
                    <td>${new Date(s.startAt).toLocaleDateString()} - ${new Date(s.endAt).toLocaleDateString()}</td>
                    <td>
                        <button class="admin-action-btn" onclick="admin.editSeason('${s._id}')"><i class="fas fa-edit"></i></button>
                        <button class="admin-action-btn" onclick="admin.loadOverview('${s._id}')"><i class="fas fa-chart-bar"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Load seasons error:', err);
        }
    }

    clearSeasonForm() {
        document.getElementById('seasonName').value = '';
        document.getElementById('seasonDescription').value = '';
        document.getElementById('seasonStart').value = '';
        document.getElementById('seasonEnd').value = '';
        document.getElementById('seasonPrize').value = '';
        document.getElementById('seasonStatus').value = 'draft';
    }

    editSeason(id) {
        const s = this.seasons.find(x => x._id === id);
        if (!s) return;
        this.editingSeasonId = id;
        document.getElementById('seasonFormTitle').textContent = 'Edit Season';
        document.getElementById('seasonFormContainer').style.display = 'block';
        document.getElementById('seasonName').value = s.name;
        document.getElementById('seasonDescription').value = s.description || '';
        document.getElementById('seasonStart').value = s.startAt.substring(0, 10);
        document.getElementById('seasonEnd').value = s.endAt.substring(0, 10);
        document.getElementById('seasonPrize').value = s.prizeDescription || '';
        document.getElementById('seasonStatus').value = s.status;
    }

    async saveSeason() {
        const body = {
            name: document.getElementById('seasonName').value,
            description: document.getElementById('seasonDescription').value,
            startAt: new Date(document.getElementById('seasonStart').value).toISOString(),
            endAt: new Date(document.getElementById('seasonEnd').value).toISOString(),
            prizeDescription: document.getElementById('seasonPrize').value,
            status: document.getElementById('seasonStatus').value
        };

        try {
            const url = this.editingSeasonId
                ? `/api/tournaments/admin/seasons/${this.editingSeasonId}`
                : '/api/tournaments/admin/seasons';
            const method = this.editingSeasonId ? 'PATCH' : 'POST';

            const res = await fetch(url, { method, headers: this.headers(), body: JSON.stringify(body) });
            const data = await res.json();
            if (data.success) {
                this.showToast('Season saved');
                document.getElementById('seasonFormContainer').style.display = 'none';
                this.editingSeasonId = null;
                await this.loadSeasons();
            } else {
                this.showToast(data.message || 'Error saving season');
            }
        } catch (err) {
            this.showToast('Network error');
        }
    }

    populateSeasonSelect() {
        const sel = document.getElementById('roundSeason');
        sel.innerHTML = this.seasons.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
    }

    async saveRound() {
        const body = {
            seasonId: document.getElementById('roundSeason').value,
            name: document.getElementById('roundNameInput').value,
            theme: document.getElementById('roundThemeInput').value,
            roundType: document.getElementById('roundType').value,
            submissionOpenAt: new Date(document.getElementById('roundSubOpen').value).toISOString(),
            submissionCloseAt: new Date(document.getElementById('roundSubClose').value).toISOString(),
            votingOpenAt: new Date(document.getElementById('roundVoteOpen').value).toISOString(),
            votingCloseAt: new Date(document.getElementById('roundVoteClose').value).toISOString(),
            maxSubmissions: parseInt(document.getElementById('roundMaxSub').value),
            bracketSize: parseInt(document.getElementById('roundBracketSize').value)
        };

        try {
            const res = await fetch('/api/tournaments/admin/rounds', {
                method: 'POST', headers: this.headers(), body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                this.showToast('Round created');
                document.getElementById('roundFormContainer').style.display = 'none';
                this.loadRounds();
            } else {
                this.showToast(data.message || data.errors?.[0]?.msg || 'Error');
            }
        } catch (err) {
            this.showToast('Network error');
        }
    }

    async loadRounds() {
        try {
            const allRounds = [];
            for (const s of this.seasons) {
                const res = await fetch(`/api/tournaments/seasons/${s._id}`);
                const data = await res.json();
                if (data.success && data.data.rounds) {
                    data.data.rounds.forEach(r => { r._seasonName = s.name; allRounds.push(r); });
                }
            }

            const body = document.getElementById('roundsBody');
            if (!allRounds.length) {
                body.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.4);">No rounds yet</td></tr>';
                return;
            }
            body.innerHTML = allRounds.map(r => `
                <tr>
                    <td>${r.name}</td>
                    <td>${r._seasonName}</td>
                    <td>${r.theme}</td>
                    <td><span class="round-status ${r.status}">${r.status}</span></td>
                    <td>
                        <button class="admin-action-btn" onclick="admin.updateRoundStatus('${r._id}', 'submissions_open')" title="Open Submissions"><i class="fas fa-door-open"></i></button>
                        <button class="admin-action-btn" onclick="admin.seedRound('${r._id}')" title="Seed Matches"><i class="fas fa-random"></i></button>
                        <button class="admin-action-btn" onclick="admin.updateRoundStatus('${r._id}', 'voting')" title="Open Voting"><i class="fas fa-vote-yea"></i></button>
                        <button class="admin-action-btn" onclick="admin.updateRoundStatus('${r._id}', 'completed')" title="Complete"><i class="fas fa-check-circle"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Load rounds error:', err);
        }
    }

    async updateRoundStatus(id, status) {
        try {
            const res = await fetch(`/api/tournaments/admin/rounds/${id}`, {
                method: 'PATCH', headers: this.headers(), body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(`Round status: ${status}`);
                this.loadRounds();
            }
        } catch (err) {
            this.showToast('Error updating round');
        }
    }

    async seedRound(id) {
        if (!confirm('This will create bracket matches from approved submissions. Continue?')) return;
        try {
            const res = await fetch(`/api/tournaments/admin/rounds/${id}/seed`, {
                method: 'POST', headers: this.headers()
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(`${data.data.matchesCreated} matches created`);
                this.loadRounds();
            } else {
                this.showToast(data.message || 'Seeding failed');
            }
        } catch (err) {
            this.showToast('Error seeding round');
        }
    }

    async loadSubmissions() {
        try {
            const status = document.getElementById('subFilterStatus').value;
            let url = '/api/tournaments/admin/submissions?';
            if (status) url += `status=${status}`;

            const res = await fetch(url, { headers: this.headers() });
            const data = await res.json();

            const body = document.getElementById('submissionsBody');
            if (!data.success || !data.data.length) {
                body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.4);">No submissions</td></tr>';
                return;
            }

            body.innerHTML = data.data.map(s => `
                <tr>
                    <td>${s.artistUserId?.name || 'Unknown'}</td>
                    <td>${s.title}</td>
                    <td><span class="match-submission-type ${s.submissionType}">${s.submissionType}</span></td>
                    <td>${s.roundId?.name || '—'}</td>
                    <td><span class="round-status ${s.status}">${s.status}</span></td>
                    <td>
                        ${s.status === 'pending' ? `
                            <button class="admin-action-btn success" onclick="admin.moderateSubmission('${s._id}', 'approved')"><i class="fas fa-check"></i></button>
                            <button class="admin-action-btn danger" onclick="admin.moderateSubmission('${s._id}', 'rejected')"><i class="fas fa-times"></i></button>
                        ` : ''}
                        <button class="admin-action-btn" onclick="admin.viewLyrics('${s._id}')" title="View Lyrics"><i class="fas fa-eye"></i></button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Load submissions error:', err);
        }
    }

    async moderateSubmission(id, status) {
        try {
            const res = await fetch(`/api/tournaments/admin/submissions/${id}`, {
                method: 'PATCH', headers: this.headers(), body: JSON.stringify({ status })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast(`Submission ${status}`);
                this.loadSubmissions();
            }
        } catch (err) {
            this.showToast('Error moderating submission');
        }
    }

    viewLyrics(id) {
        this.showToast('Opening submission details...');
    }

    async loadOverview(seasonId) {
        try {
            const res = await fetch(`/api/tournaments/admin/reports/season/${seasonId}`, {
                headers: this.headers()
            });
            const data = await res.json();
            if (!data.success) return;
            const d = data.data;

            document.getElementById('overviewStats').innerHTML = `
                <div class="admin-stat-card"><div class="stat-value">${d.rounds}</div><div class="stat-label">Rounds</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.submissions}</div><div class="stat-label">Submissions</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.approvedSubmissions}</div><div class="stat-label">Approved</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.matches}</div><div class="stat-label">Matches</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.completedMatches}</div><div class="stat-label">Completed</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.totalVotes}</div><div class="stat-label">Total Votes</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.uniqueVoters}</div><div class="stat-label">Unique Voters</div></div>
                <div class="admin-stat-card"><div class="stat-value">${d.reactions}</div><div class="stat-label">Reactions</div></div>
            `;

            if (d.topArtists && d.topArtists.length) {
                document.getElementById('topArtistsOverview').innerHTML = `
                    <h3 class="section-title" style="margin-top:1.5rem;"><i class="fas fa-medal"></i> Top Artists</h3>
                    <table class="admin-table">
                        <thead><tr><th>#</th><th>Artist</th><th>Points</th><th>W-L</th></tr></thead>
                        <tbody>${d.topArtists.map((a, i) => `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${a.userId?.name || 'Unknown'}</td>
                                <td style="color:var(--mint);font-weight:700;">${a.points}</td>
                                <td>${a.wins}-${a.losses}</td>
                            </tr>
                        `).join('')}</tbody>
                    </table>`;
            }
        } catch (err) {
            console.error('Overview error:', err);
        }
    }

    async loadSponsors() {
        try {
            const res = await fetch('/api/tournaments/admin/sponsors', { headers: this.headers() });
            const data = await res.json();
            const body = document.getElementById('sponsorsBody');
            if (!data.success || !data.data.length) {
                body.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:1.5rem;color:rgba(255,255,255,0.4);">No sponsors yet</td></tr>';
                return;
            }
            body.innerHTML = data.data.map(s => `
                <tr>
                    <td>${s.name}</td>
                    <td>${s.category}</td>
                    <td>${s.isActive ? '<span style="color:#2ecc71;">Active</span>' : '<span style="color:#e74c3c;">Inactive</span>'}</td>
                    <td>
                        <button class="admin-action-btn" onclick="admin.toggleSponsor('${s._id}', ${!s.isActive})">${s.isActive ? 'Deactivate' : 'Activate'}</button>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Load sponsors error:', err);
        }
    }

    async saveSponsor() {
        const body = {
            name: document.getElementById('sponsorNameInput').value,
            logoUrl: document.getElementById('sponsorLogo').value,
            ctaUrl: document.getElementById('sponsorCta').value,
            ctaText: document.getElementById('sponsorCtaText').value,
            category: document.getElementById('sponsorCategory').value,
            contactEmail: document.getElementById('sponsorEmail').value
        };

        try {
            const res = await fetch('/api/tournaments/admin/sponsors', {
                method: 'POST', headers: this.headers(), body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.success) {
                this.showToast('Sponsor added');
                document.getElementById('sponsorFormContainer').style.display = 'none';
                this.loadSponsors();
            } else {
                this.showToast(data.message || 'Error');
            }
        } catch (err) {
            this.showToast('Network error');
        }
    }

    async toggleSponsor(id, isActive) {
        try {
            await fetch(`/api/tournaments/admin/sponsors/${id}`, {
                method: 'PATCH', headers: this.headers(), body: JSON.stringify({ isActive })
            });
            this.loadSponsors();
        } catch (err) {
            this.showToast('Error');
        }
    }

    setupNavToggle() {
        const toggle = document.getElementById('navVisibilityToggle');
        const track = document.getElementById('toggleTrack');
        const thumb = document.getElementById('toggleThumb');

        toggle.addEventListener('change', async () => {
            const isOn = toggle.checked;
            this.updateToggleUI(isOn, track, thumb);
            try {
                const res = await fetch('/api/tournaments/admin/feature-flags', {
                    method: 'PATCH',
                    headers: this.headers(),
                    body: JSON.stringify({ tournaments_nav_visible: isOn })
                });
                const data = await res.json();
                if (data.success) {
                    this.showToast(isOn ? 'Tournament link is now visible to everyone' : 'Tournament link is now hidden');
                } else {
                    toggle.checked = !isOn;
                    this.updateToggleUI(!isOn, track, thumb);
                    this.showToast('Failed to update');
                }
            } catch (err) {
                toggle.checked = !isOn;
                this.updateToggleUI(!isOn, track, thumb);
                this.showToast('Network error');
            }
        });
    }

    updateToggleUI(isOn, track, thumb) {
        if (isOn) {
            track.style.background = 'var(--mint)';
            thumb.style.left = '26px';
        } else {
            track.style.background = 'rgba(255,255,255,0.15)';
            thumb.style.left = '2px';
        }
    }

    async loadNavVisibility() {
        try {
            const res = await fetch('/api/tournaments/feature-flags');
            const data = await res.json();
            const isOn = data.success && data.data.tournaments_nav_visible;
            const toggle = document.getElementById('navVisibilityToggle');
            const track = document.getElementById('toggleTrack');
            const thumb = document.getElementById('toggleThumb');
            toggle.checked = isOn;
            this.updateToggleUI(isOn, track, thumb);
        } catch (e) {}
    }

    showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

let admin;
document.addEventListener('DOMContentLoaded', () => { admin = new TournamentAdmin(); });
