(function() {
    /**
     * Your earnings: tokens becoming money.
     *
     * Two steps, in order. First the creator sets up where payouts go, on
     * Stripe's own pages. Then, once they have enough, they ask for a payout;
     * an admin sends it. Everything shown comes from /api/payouts/status.
     */
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/signin.html?redirect=' + encodeURIComponent('/payouts.html');
        return;
    }
    const $ = (id) => document.getElementById(id);
    const money = (n) => '$' + Number(n || 0).toFixed(2);
    const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

    function note(text, kind) {
        const el = $('payoutNote');
        el.textContent = text;
        el.className = 'pay-note' + (kind ? ' ' + kind : '');
        el.hidden = !text;
    }

    async function call(path, method) {
        const res = await fetch(apiUrl(path), { method: method || 'GET', headers });
        let data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) throw new Error(data.message || ('The server refused that (' + res.status + ').'));
        return data;
    }

    async function load() {
        try {
            const s = await call('/api/payouts/status');
            $('earnTokens').textContent = Number(s.tokenEarnings).toLocaleString();
            $('earnValue').textContent = money(s.earningsValue);
            $('earnMinimum').textContent = '$' + s.minimumUsd;
            $('earnMinTokens').textContent = Number(s.minimumTokens).toLocaleString();
            $('earnRate').textContent = (s.rate * 100).toFixed(0) + '¢';

            const connect = $('stepConnect');
            connect.classList.toggle('done', s.payoutsEnabled);
            $('connectState').textContent = s.payoutsEnabled ? 'Ready' : (s.connected ? 'Not finished' : 'Not set up');
            $('connectBtn').textContent = s.payoutsEnabled ? 'Update bank or details' : (s.connected ? 'Finish setting up' : 'Set up payouts');
            if (s.connected && !s.payoutsEnabled) $('connectText').textContent = 'Stripe still needs something from you before payouts can be sent. Pick up where you left off.';

            const short = Number(s.tokenEarnings) < s.minimumTokens;
            $('requestState').textContent = s.open ? 'Requested' : (short ? (s.minimumTokens - s.tokenEarnings).toLocaleString() + ' tokens to go' : 'Ready');
            $('stepRequest').classList.toggle('done', !!s.open);
            $('requestBtn').disabled = !s.canRequest;
            $('requestBtn').textContent = s.canRequest ? 'Request ' + money(s.earningsValue) : 'Request payout';
            $('openRequest').hidden = !s.open;
            if (s.open) {
                $('openAmount').textContent = money(s.open.amountUsd) + ' (' + Number(s.open.tokens).toLocaleString() + ' tokens)';
                $('openDate').textContent = new Date(s.open.requestedAt).toLocaleDateString();
            }

            const rows = s.history || [];
            $('history').hidden = rows.length === 0;
            $('historyBody').innerHTML = rows.map((r) =>
                '<tr><td>' + new Date(r.requestedAt).toLocaleDateString() + '</td><td>' + Number(r.tokens).toLocaleString() + '</td><td>' + money(r.amountUsd) +
                '</td><td class="status-' + escapeHtml(r.status) + '">' + escapeHtml(label(r)) + '</td></tr>'
            ).join('');
        } catch (e) {
            note(e.message, 'bad');
        }
    }

    function label(r) {
        if (r.status === 'paid') return 'Sent ' + new Date(r.paidAt).toLocaleDateString();
        if (r.status === 'rejected') return 'Declined' + (r.note ? ': ' + r.note : '');
        if (r.status === 'failed') return 'Could not be sent; being looked at';
        if (r.status === 'cancelled') return 'Cancelled';
        return r.status;
    }

    WordethActions.register({
        'payouts.connect': async () => {
            const btn = $('connectBtn'); btn.disabled = true;
            try {
                const r = await call('/api/payouts/connect/start', 'POST');
                window.location.href = r.url;
            } catch (e) { note(e.message, 'bad'); btn.disabled = false; }
        },
        'payouts.request': async () => {
            const btn = $('requestBtn'); btn.disabled = true;
            try {
                const r = await call('/api/payouts/request', 'POST');
                note(r.message, 'ok');
            } catch (e) { note(e.message, 'bad'); }
            await load();
        },
        'payouts.cancel': async () => {
            try {
                const s = await call('/api/payouts/status');
                if (!s.open) return;
                const r = await call('/api/payouts/request/' + s.open.id + '/cancel', 'POST');
                note(r.message, 'ok');
            } catch (e) { note(e.message, 'bad'); }
            await load();
        }
    });

    // Back from Stripe's pages: ask again rather than wait for the webhook.
    const back = new URLSearchParams(window.location.search).get('payouts');
    (async () => {
        if (back) {
            try { await call('/api/payouts/connect/refresh', 'POST'); } catch (e) { /* status below still tells the truth */ }
            try { window.history.replaceState({}, '', window.location.pathname); } catch (e) { /* fine */ }
            if (back === 'done') note('Thanks. If Stripe is still checking something, this page says so until it is done.', 'ok');
        }
        await load();
    })();
})();
