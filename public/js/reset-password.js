(function() {
    /** With id and token in the address: set a new password. Without: ask for the link. */
    var params = new URLSearchParams(window.location.search);
    var id = params.get('id'), token = params.get('token');
    var $ = function(x) { return document.getElementById(x); };
    function note(text, ok) { var el = $('resetNote'); el.textContent = text; el.className = 'pay-note' + (ok ? ' ok' : ' bad'); el.hidden = false; }
    async function call(path, body) {
        var res = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        var data = {}; try { data = await res.json(); } catch (e) {}
        if (!res.ok) throw new Error(data.message || ('The server refused that (' + res.status + ').'));
        return data;
    }
    if (!id || !token) {
        $('resetForm').hidden = true; $('forgotForm').hidden = false;
        $('resetTitle').textContent = 'Forgot your password?'; $('resetLede').textContent = 'No problem.';
    }
    $('resetForm').addEventListener('submit', async function(e) {
        e.preventDefault(); $('resetBtn').disabled = true;
        try { var r = await call('/api/auth/reset-password', { id: id, token: token, password: $('newPassword').value }); note(r.message, true); $('resetForm').hidden = true; }
        catch (err) { note(err.message, false); $('resetBtn').disabled = false; }
    });
    $('forgotForm').addEventListener('submit', async function(e) {
        e.preventDefault(); $('forgotBtn').disabled = true;
        try { var r = await call('/api/auth/forgot-password', { email: $('forgotEmail').value }); note(r.message, true); }
        catch (err) { note(err.message, false); }
        $('forgotBtn').disabled = false;
    });
})();
