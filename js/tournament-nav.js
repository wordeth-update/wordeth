(async function() {
    try {
        const res = await fetch('/api/tournaments/feature-flags');
        const data = await res.json();
        if (data.success && data.data.tournaments_nav_visible) {
            document.querySelectorAll('.tournament-nav-item').forEach(el => {
                el.style.display = '';
            });
        }
    } catch (e) {}
})();
