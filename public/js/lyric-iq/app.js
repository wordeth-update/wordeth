/* Wordeth Lyric IQ — application. Vanilla JS, one screen at a time, no framework. */
(function () {
    'use strict';

    var api = window.LiqApi;
    var copy = window.LiqCopy;
    var main = document.getElementById('liq-main');
    var live = document.getElementById('liq-live');
    var toastEl = document.getElementById('liq-toast');
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var ADVANCE_DELAY = { QUICK_PLAY: 1100, DAILY_10: 1200, RAPID_FIRE: 420, STREAK: 1100 };
    /* Worlds are levels: the block → the court → the rooftop. */
    var WORLDS = ['block', 'court', 'rooftop'];
    var WORLD_NAMES = { block: 'the block', court: 'the court', rooftop: 'the rooftop' };
    var WORLD_IQ_TIERS = [{ min: 75, world: 'rooftop' }, { min: 50, world: 'court' }, { min: -1, world: 'block' }];
    var WORLD_STREAK_TIERS = [{ min: 10, world: 'rooftop' }, { min: 5, world: 'court' }, { min: 0, world: 'block' }];
    /* Scene art: one SVG per world, with a portrait cut for phones where one was drawn. */
    var SCENE_BASE = 'images/lyric-iq/streets-';
    var SCENE_PHONE = { block: true, rooftop: true };
    var sceneCache = {};
    var TYPED_EXTRA_DELAY = 700;

    var sound = window.LiqSound || { play: function () {}, bed: function () {}, logo: function () {}, duck: function () {}, isMuted: function () { return true; }, toggle: function () { return true; } };
    var state = {
        config: null,
        daily: null,
        session: null,
        question: null,
        pending: false,      // an answer request is in flight
        answered: false,     // current question resolved on screen
        category: 'all',
        artist: null,        // { key, name, providerArtistId } when the round is scoped to one artist
        artistQuery: '',
        artistResults: [],
        challengeCode: null,
        results: null,
        timer: null,
        advanceTimer: null,
        lastMode: 'QUICK_PLAY',
        modePicked: false,   // the player chose a mode in this visit (highlights it when they come back a step)
        questionShownAt: 0
    };

    /* ------------------------------------------------------------------ */
    /* Utilities                                                           */
    /* ------------------------------------------------------------------ */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function announce(text) { if (live) { live.textContent = ''; setTimeout(function () { live.textContent = text; }, 30); } }
    var toastTimer = null;
    function toast(text, ms) {
        if (!toastEl) return;
        toastEl.textContent = text;
        toastEl.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.hidden = true; }, ms || 2600);
    }
    function render(html) {
        main.innerHTML = html;
        window.scrollTo(0, 0);
    }
    function fmtMs(ms) { return (Math.round(ms / 100) / 10).toFixed(1) + 's'; }
    function pct(n) { return Math.round(n * 100) + '%'; }
    function setRoute(hash) { if (location.hash !== hash) history.pushState(null, '', hash); }
    function clearTimers() {
        if (state.timer) { clearInterval(state.timer); state.timer = null; }
        if (state.advanceTimer) { clearTimeout(state.advanceTimer); state.advanceTimer = null; }
    }
    /** Switch the stage world; each game drops you into one of the three worlds. */
    function setWorld(world) {
        if (WORLDS.indexOf(world) < 0) world = WORLDS[0];
        state.world = world;
        document.body.setAttribute('data-world', world);
        loadScene(world);
    }
    function phoneScene() {
        return window.matchMedia && window.matchMedia('(max-width: 767px) and (orientation: portrait)').matches;
    }
    /** Fetch a world's SVG once and inline it, so the display font applies to its signs and graffiti. */
    function loadScene(world) {
        var host = document.querySelector('.liq-world--' + world);
        if (!host) return Promise.resolve();
        var variant = phoneScene() && SCENE_PHONE[world] ? world + '-phone' : world;
        if (host.getAttribute('data-scene') === variant) return Promise.resolve();
        var url = SCENE_BASE + variant + '.svg?v=1';
        var p = sceneCache[variant] || (sceneCache[variant] = fetch(url).then(function (r) { if (!r.ok) throw new Error('scene ' + r.status); return r.text(); }));
        return p.then(function (svg) {
            if (host.getAttribute('data-scene') === variant) return;
            host.innerHTML = svg;
            host.setAttribute('data-scene', variant);
        }).catch(function () { /* the CSS sky stands in */ });
    }
    /** Warm the other worlds once the page is idle so a level-up never waits on the network. */
    function preloadScenes() {
        var run = function () { WORLDS.forEach(function (w) { if (w !== state.world) loadScene(w); }); };
        if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 4000 }); else setTimeout(run, 2500);
    }
    function forcedWorld() {
        var forced = new URLSearchParams(location.search).get('world');
        return forced && WORLDS.indexOf(forced) >= 0 ? forced : null;
    }
    function tierWorld(tiers, value) {
        var v = value === null || value === undefined ? -1 : value;
        for (var i = 0; i < tiers.length; i++) if (v >= tiers[i].min) return tiers[i].world;
        return 'block';
    }
    function worldForIq(value) { return tierWorld(WORLD_IQ_TIERS, value); }
    function worldForStreak(streak) { return tierWorld(WORLD_STREAK_TIERS, streak); }
    /** The world a new game opens in: Streak always starts on the block and climbs; Rapid Fire is the court; otherwise your Lyric IQ tier. */
    function worldForMode(mode) {
        if (forcedWorld()) return forcedWorld();
        if (mode === 'STREAK') return 'block';
        if (mode === 'RAPID_FIRE') return 'court';
        return worldForIq(state.lyricIq);
    }
    function isTypingTarget(el) {
        return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }

    /* ------------------------------------------------------------------ */
    /* Header                                                              */
    /* ------------------------------------------------------------------ */
    function updateHeader(route) {
        var link = document.getElementById('liq-auth-link');
        if (link) {
            if (api.hasAuth()) {
                link.setAttribute('data-signed-in', 'true');
                var name = 'Signed in';
                try { var u = JSON.parse(localStorage.getItem('user') || '{}'); if (u && u.name) name = u.name; } catch (e) { /* ignore */ }
                link.textContent = name;
                link.href = '/profile.html';
            } else {
                link.textContent = 'Sign in';
                link.href = '/signin.html?return=' + encodeURIComponent('/lyric-iq.html' + (location.hash || ''));
            }
        }
        var links = document.querySelectorAll('.liq-top__nav a[data-route]');
        for (var i = 0; i < links.length; i++) {
            if (links[i].getAttribute('data-route') === route) links[i].setAttribute('aria-current', 'page');
            else links[i].removeAttribute('aria-current');
        }
    }

    /* ------------------------------------------------------------------ */
    /* Screens: states                                                     */
    /* ------------------------------------------------------------------ */
    function renderLoading(text) {
        render('<div class="liq-state" role="status"><div class="liq-spinner" aria-hidden="true"></div><p class="liq-state__text">' + esc(text || 'Loading') + '</p></div>');
    }
    function renderError(err, retryAction) {
        var title = 'Something got in the way.';
        var text = err && err.message ? err.message : 'Please try again.';
        if (err && err.code === 'NO_ELIGIBLE_QUESTIONS') { title = 'Nothing to play right now.'; }
        if (err && err.code === 'DATABASE_UNAVAILABLE') { title = 'We’re between beats.'; }
        if (err && err.code === 'LYRICS_PROVIDER_UNAVAILABLE') { title = 'The lyrics are taking a minute.'; }
        if (err && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) { title = 'Lost the signal.'; }
        if (err && err.code === 'RATE_LIMITED') { title = 'Easy.'; }
        render(
            '<div class="liq-state">' +
            '<h1 class="liq-state__title">' + esc(title) + '</h1>' +
            '<p class="liq-state__text">' + esc(text) + '</p>' +
            '<div class="liq-result__actions liq-result__actions--row">' +
            (retryAction ? '<button class="liq-btn" data-action="' + esc(retryAction) + '">Try again</button>' : '') +
            '<a class="liq-btn liq-btn--ghost" href="#play" data-action="home">Back</a>' +
            '</div></div>'
        );
    }

    /* ------------------------------------------------------------------ */
    /* Entry                                                               */
    /* ------------------------------------------------------------------ */
    function loadConfig() {
        if (state.config) return Promise.resolve(state.config);
        return api.config().then(function (cfg) { state.config = cfg; return cfg; });
    }

    var CAT_LABELS = { hiphop: 'Hip-Hop', rnb: 'R&B', pop: 'Pop', rock: 'Rock', country: 'Country' };
    var CAT_META = { all: 'Every genre in the catalog.', hiphop: 'Bars, flow and punchlines.', rnb: 'Slow jams and smooth hooks.', pop: 'The hooks everybody knows.', rock: 'Riffs, anthems and choruses.', country: 'Stories, trucks and heartbreak.' };
    var MODE_META = {
        QUICK_PLAY: { name: 'Play', meta: 'Ten questions. Your pace.' },
        DAILY_10: { name: 'Daily 10', meta: 'Ten. Same set for everyone.' },
        RAPID_FIRE: { name: 'Rapid Fire', meta: '60 seconds. Go.' },
        STREAK: { name: 'Streak', meta: 'Until you miss.' }
    };

    /** Entry data: config, today's daily and (when known) the player's profile. Cached for the flow. */
    function loadEntry() {
        return Promise.all([loadConfig(), api.daily().catch(function () { return null; }), (api.hasAuth() || api.hasGuest()) ? api.profile().catch(function () { return null; }) : Promise.resolve(null)])
            .then(function (all) {
                var cfg = all[0]; var daily = all[1]; var profile = all[2];
                state.daily = daily;
                var iq = profile && profile.lyricIq ? profile.lyricIq : null;
                state.lyricIq = iq ? iq.value : null;
                setWorld(forcedWorld() || worldForIq(state.lyricIq));
                // Signed in via the shared cookie: this origin has no stored user yet, so name the header from the profile.
                var authLink = document.getElementById('liq-auth-link');
                if (authLink && profile && profile.player && !profile.player.isGuest && authLink.textContent === 'Signed in') authLink.textContent = profile.player.displayName || 'Profile';
                return { cfg: cfg, daily: daily, iq: iq };
            });
    }

    function stepsHtml(current) {
        var steps = ['Play', 'Mode', 'Genre', 'Artist'];
        return '<ol class="liq-steps" aria-label="Setup steps">' + steps.map(function (s, i) {
            var n = i + 1;
            var cls = n < current ? ' liq-steps__item--done' : (n === current ? ' liq-steps__item--current' : '');
            return '<li class="liq-steps__item' + cls + '"' + (n === current ? ' aria-current="step"' : '') + '><span class="liq-steps__n">' + n + '</span>' + s + '</li>';
        }).join('') + '</ol>';
    }

    /** Step 1: one thing to do. Press Play. */
    function renderEntry() {
        updateHeader('play');
        clearTimers();
        state.session = null; state.question = null;
        renderLoading('Warming up');
        loadEntry().then(function (d) {
            var cfg = d.cfg; var daily = d.daily; var iq = d.iq;
            render(
                '<section class="liq-entry">' +
                '<div class="liq-entry__head liq-enter">' +
                '<div class="liq-kicker">Wordeth</div>' +
                '<h1 class="liq-h1">Lyric <span class="liq-h1__wonder">IQ</span></h1>' +
                '<p class="liq-entry__thesis">Music lover? Know the words? Find out your Lyric IQ.</p>' +
                (iq && iq.value !== null ? '<div class="liq-entry__iq"><strong>' + esc(iq.value) + '</strong><span class="liq-muted">your Lyric IQ' + (iq.provisional ? ' · provisional' : '') + '</span></div>' : '') +
                '</div>' +
                '<div class="liq-entry__primary">' +
                '<button class="liq-btn liq-btn--primary liq-btn--block liq-btn--hero" data-action="go" data-step="mode" autofocus>Play</button>' +
                (daily && daily.status === 'ACTIVE' ? '<button class="liq-btn liq-btn--ghost liq-btn--block" data-action="play" data-mode="DAILY_10">Resume today’s Daily 10</button>' : '') +
                '</div>' +
                '<p class="liq-entry__foot">' + (cfg.synthetic ? 'Development catalog: test content, not real lyrics. ' : '') + (daily && daily.dailyStreak > 1 ? esc(daily.dailyStreak) + '-day daily streak. ' : '') + (!api.hasAuth() ? 'No account needed to play. ' : '') + '<a href="https://wordeth.com">Part of Wordeth</a></p>' +
                '</section>'
            );
            api.track('game_view', {});
        }).catch(function (err) { renderError(err, 'home'); });
    }

    /** Step 2: choose how you want to play. Daily 10 is a fixed set, so it begins right away. */
    function renderModes() {
        updateHeader('play');
        clearTimers();
        renderLoading('Warming up');
        loadEntry().then(function (d) {
            var cfg = d.cfg; var daily = d.daily;
            var order = ['QUICK_PLAY', 'DAILY_10', 'RAPID_FIRE', 'STREAK'];
            var enabled = {};
            cfg.modes.forEach(function (m) { enabled[m.key] = m; });
            var dailyDone = daily && daily.status === 'COMPLETED';
            var cards = order.filter(function (k) { return enabled[k]; }).map(function (k) {
                var m = MODE_META[k];
                var meta = m.meta;
                var cls = 'liq-mode liq-mode--big';
                if (k === 'DAILY_10') {
                    if (dailyDone) { cls += ' liq-mode--done'; meta = 'Done · ' + daily.summary.correct + '/' + daily.questionCount; }
                    else if (daily && daily.status === 'ACTIVE') meta = 'In progress · resume';
                }
                if (state.modePicked && k === state.lastMode) cls += ' liq-mode--picked';
                return '<button class="' + cls + '" data-action="select-mode" data-mode="' + k + '"><span class="liq-mode__name">' + m.name + '</span><span class="liq-mode__meta">' + esc(meta) + '</span></button>';
            }).join('');
            render(
                '<section class="liq-entry liq-entry--step liq-enter">' +
                stepsHtml(2) +
                '<div class="liq-entry__head">' +
                '<h1 class="liq-h1 liq-h1--step">Pick your <span class="liq-h1__wonder">mode</span></h1>' +
                '</div>' +
                '<div class="liq-modegrid" role="group" aria-label="Game modes">' + cards + '</div>' +
                '<div class="liq-entry__nav"><button class="liq-btn liq-btn--ghost liq-btn--sm" data-action="go" data-step="play">Back</button></div>' +
                '</section>'
            );
        }).catch(function (err) { renderError(err, 'home'); });
    }

    /** Step 3: choose a genre, then begin. */
    function renderGenre() {
        updateHeader('play');
        clearTimers();
        if (state.lastMode === 'DAILY_10') return startGame('DAILY_10');
        renderLoading('Warming up');
        loadEntry().then(function (d) {
            var cfg = d.cfg;
            var cats = (cfg.categories || []).filter(function (c) { return c.genre !== 'other'; });
            if (cats.length < 2) return startGame(state.lastMode);
            var m = MODE_META[state.lastMode] || MODE_META.QUICK_PLAY;
            var artistStep = !!(cfg.flags && cfg.flags.artistChallenges);
            var options = [{ genre: 'all', label: 'Everything', meta: CAT_META.all }].concat(cats.map(function (c) {
                return { genre: c.genre, label: CAT_LABELS[c.genre] || c.genre, meta: CAT_META[c.genre] || (c.count ? c.count + ' tracks' : '') };
            }));
            render(
                '<section class="liq-entry liq-entry--step liq-enter">' +
                stepsHtml(3) +
                '<div class="liq-entry__head">' +
                '<div class="liq-kicker">Mode · ' + esc(m.name) + '</div>' +
                '<h1 class="liq-h1 liq-h1--step">Pick your <span class="liq-h1__wonder">genre</span></h1>' +
                '</div>' +
                '<div class="liq-modegrid" role="group" aria-label="Choose genre">' +
                options.map(function (o) {
                    return '<button class="liq-mode liq-mode--big liq-genre" data-action="category" data-category="' + esc(o.genre) + '" aria-pressed="' + (state.category === o.genre) + '"><span class="liq-mode__name">' + esc(o.label) + '</span>' + (o.meta ? '<span class="liq-mode__meta">' + esc(o.meta) + '</span>' : '') + '</button>';
                }).join('') +
                '</div>' +
                '<div class="liq-entry__primary">' +
                (artistStep
                    ? '<button class="liq-btn liq-btn--primary liq-btn--block" data-action="to-artist">Next</button>'
                    : '<button class="liq-btn liq-btn--primary liq-btn--block" data-action="begin">Begin</button>') +
                '<div class="liq-entry__nav"><button class="liq-btn liq-btn--ghost liq-btn--sm" data-action="go" data-step="mode">Back</button></div>' +
                '</div>' +
                '</section>'
            );
        }).catch(function (err) { renderError(err, 'home'); });
    }

    /** Step 4: narrow the genre to one artist, or play the whole thing. */
    var artistSearchTimer = null;
    function artistResultsHtml(list) {
        var picked = state.artist ? state.artist.key : null;
        var html = list.map(function (a) {
            var meta = a.ready ? esc(a.tracks) + ' songs ready' : (a.tracks ? esc(a.tracks) + ' songs · more load on start' : 'Loads on start');
            return '<button class="liq-mode liq-artist__item" data-action="pick-artist" data-key="' + esc(a.key) + '" data-name="' + esc(a.name) + '" data-pid="' + esc(a.providerArtistId || '') + '" aria-pressed="' + (picked === a.key) + '"><span class="liq-mode__name">' + esc(a.name) + '</span><span class="liq-mode__meta">' + meta + '</span></button>';
        }).join('');
        if (!html && state.artistQuery.length >= 2) html = '<p class="liq-faint">No artist by that name yet. Try the full name.</p>';
        return html;
    }
    function artistPickedHtml() {
        var catLabel = state.category === 'all' ? 'every genre' : (CAT_LABELS[state.category] || state.category);
        return state.artist
            ? 'Playing <strong>' + esc(state.artist.name) + '</strong> only. <button class="liq-link" data-action="clear-artist">Any artist instead</button>'
            : 'Any artist in ' + esc(catLabel) + '.';
    }
    function renderArtist() {
        updateHeader('play');
        clearTimers();
        if (state.lastMode === 'DAILY_10') return startGame('DAILY_10');
        var m = MODE_META[state.lastMode] || MODE_META.QUICK_PLAY;
        var catLabel = state.category === 'all' ? 'Everything' : (CAT_LABELS[state.category] || state.category);
        render(
            '<section class="liq-entry liq-entry--step liq-enter">' +
            stepsHtml(4) +
            '<div class="liq-entry__head">' +
            '<div class="liq-kicker">' + esc(m.name) + ' · ' + esc(catLabel) + '</div>' +
            '<h1 class="liq-h1 liq-h1--step">Pick an <span class="liq-h1__wonder">artist</span></h1>' +
            '<p class="liq-entry__sub">Every question from one catalogue. Or skip it and play the whole genre.</p>' +
            '</div>' +
            '<div class="liq-artist">' +
            '<input class="liq-input liq-artist__input" id="liq-artist-q" type="search" placeholder="Search an artist" autocomplete="off" maxlength="60" value="' + esc(state.artistQuery) + '" aria-label="Search an artist">' +
            '<div class="liq-artist__results" id="liq-artist-results" aria-live="polite">' + artistResultsHtml(state.artistResults) + '</div>' +
            '<p class="liq-artist__picked" id="liq-artist-picked">' + artistPickedHtml() + '</p>' +
            '</div>' +
            '<div class="liq-entry__primary">' +
            '<button class="liq-btn liq-btn--primary liq-btn--block" data-action="begin">Begin</button>' +
            '<div class="liq-entry__nav"><button class="liq-btn liq-btn--ghost liq-btn--sm" data-action="go" data-step="genre">Back</button></div>' +
            '</div>' +
            '</section>'
        );
        var input = document.getElementById('liq-artist-q');
        if (!input) return;
        input.addEventListener('input', function () {
            var q = input.value.trim();
            state.artistQuery = q;
            clearTimeout(artistSearchTimer);
            if (q.length < 2) { state.artistResults = []; refreshArtistResults(); return; }
            artistSearchTimer = setTimeout(function () {
                api.artists(q).then(function (d) {
                    if (state.artistQuery !== q) return;
                    state.artistResults = d.artists || [];
                    refreshArtistResults();
                }).catch(function () { /* the picker stays as it was */ });
            }, 280);
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
        if (!state.artistResults.length) input.focus();
    }
    function refreshArtistResults() {
        var box = document.getElementById('liq-artist-results');
        var picked = document.getElementById('liq-artist-picked');
        if (box) box.innerHTML = artistResultsHtml(state.artistResults);
        if (picked) picked.innerHTML = artistPickedHtml();
    }

    /* ------------------------------------------------------------------ */
    /* Game                                                                */
    /* ------------------------------------------------------------------ */
    function startGame(mode) {
        clearTimers();
        sound.play('select');
        state.lastMode = mode;
        setWorld(worldForMode(mode));
        var scoped = mode !== 'DAILY_10' && state.artist;
        renderLoading(mode === 'DAILY_10' ? 'Setting today’s ten' : (scoped ? 'Pulling ' + state.artist.name + '’s catalogue' : 'Finding the line'));
        var req = mode === 'DAILY_10' ? api.startDaily() : api.startSession(mode, state.category !== 'all' ? state.category : null, state.challengeCode, scoped ? state.artist : null);
        req.then(function (data) {
            state.challengeCode = null;
            state.session = data.session;
            state.question = data.question;
            state.results = null;
            setRoute('#game');
            document.body.setAttribute('data-screen', 'game');
            api.track('game_start', { game_mode: mode, category: state.category, artist: scoped ? state.artist.key : null, resumed: !!data.resumed });
            if (!data.question) return finishAndShowResults();
            renderGame();
        }).catch(function (err) {
            if (err.code === 'DAILY_ALREADY_PLAYED' && err.details && err.details.sessionId) {
                state.results = err.details.results;
                state.session = err.details.results.session;
                return renderResults(state.results, { daily: true });
            }
            if (err.code === 'ARTIST_TOO_THIN') { setRoute('#artist'); return renderError(err, 'to-artist-step'); }
            renderError(err, 'retry-start');
        });
    }

    function progressDots() {
        var s = state.session;
        var total = s.gameMode === 'STREAK' || s.gameMode === 'RAPID_FIRE' ? 0 : s.questionCount;
        if (!total) return '';
        var html = '<div class="liq-progress" aria-hidden="true">';
        for (var i = 0; i < total; i++) {
            var cls = 'liq-progress__dot';
            if (i < s.answered) cls += ' liq-progress__dot--done';
            else if (i === s.answered) cls += ' liq-progress__dot--current';
            html += '<span class="' + cls + '"></span>';
        }
        return html + '</div>';
    }

    function barHtml() {
        var s = state.session;
        var left = '<span><strong>' + esc(copy.MODE_LABELS[s.gameMode] || s.gameMode) + '</strong>' +
            (s.gameMode === 'STREAK' ? ' · <span class="liq-game__streak">' + esc(s.currentStreak) + ' streak</span>' :
             s.gameMode === 'RAPID_FIRE' ? ' · <span class="liq-game__score">' + esc(s.correctCount) + ' right</span>' :
             ' · ' + esc(Math.min(s.answered + 1, s.questionCount)) + '/' + esc(s.questionCount)) + '</span>';
        var right = '<span><span class="liq-game__score">' + esc(s.score) + ' pts</span>' +
            (s.currentStreak >= 2 && s.gameMode !== 'STREAK' ? ' · <span class="liq-game__streak">×' + esc(s.currentStreak) + '</span>' : '') +
            ' <button class="liq-game__quit" data-action="quit" aria-label="End game">End</button></span>';
        return '<div class="liq-game__bar" id="liq-bar">' + left + right + '</div>';
    }

    function blankHtml(len) {
        var cls = 'liq-blank' + (len >= 3 ? ' liq-blank--w3' : len === 2 ? ' liq-blank--w2' : '');
        return '<span class="' + cls + '" id="liq-blank" aria-label="blank"> </span>';
    }

    function lyricHtml(q) {
        var lines = q.prompt.lines;
        var html = '';
        for (var i = 0; i < lines.length; i++) {
            var isLast = i === lines.length - 1;
            var line = lines[i];
            var content;
            if (line.indexOf('[[BLANK]]') >= 0) {
                var parts = line.split('[[BLANK]]');
                content = esc(parts[0]) + blankHtml(q.prompt.blankLength || 1) + esc(parts[1] || '');
            } else {
                content = esc(line);
            }
            var cls = 'liq-lyric__line' + (!isLast && lines.length > 1 ? ' liq-lyric__line--context' : '');
            html += '<span class="' + cls + '">' + (q.prompt.kind === 'EXCERPT' && isLast ? '<span class="liq-lyric__quote">“</span>' + content + '<span class="liq-lyric__quote">”</span>' : content) + '</span>';
        }
        return '<p class="liq-lyric liq-enter" id="liq-lyric">' + html + '</p>';
    }

    function answerHtml(q) {
        if (q.answerType === 'MULTIPLE_CHOICE') {
            var isLines = q.template === 'NEXT_LINE';
            return '<div class="liq-choices' + (isLines ? ' liq-choices--lines' : '') + '" id="liq-choices" role="group" aria-label="Answers">' +
                q.choices.map(function (c, i) {
                    return '<button class="liq-choice" data-action="choice" data-index="' + i + '" aria-keyshortcuts="' + (i + 1) + '"><span class="liq-choice__key" aria-hidden="true">' + (i + 1) + '</span><span class="liq-choice__text">' + esc(c) + '</span></button>';
                }).join('') + '</div>';
        }
        return '<form class="liq-typed" id="liq-typed" autocomplete="off">' +
            '<div class="liq-typed__row"><input class="liq-input" id="liq-input" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="120" placeholder="' + (q.prompt.blankLength > 1 ? 'the words…' : 'the word…') + '" aria-label="Your answer" autofocus>' +
            '<button class="liq-btn" type="submit" id="liq-submit">Say it</button></div>' +
            '<div class="liq-typed__hint">Type it. Enter to submit. Spelling close enough counts.</div></form>';
    }

    function metaHtml(q) {
        var label = copy.INSTRUCTIONS[q.template] || q.prompt.instruction;
        var right = '';
        if (q.trackPublicMetadata) right = '<em>' + esc(q.trackPublicMetadata.title) + ' — ' + esc(q.trackPublicMetadata.artist) + '</em>';
        else right = '<em>' + esc(copy.BAND_LABELS[q.difficultyBand] || '') + '</em>';
        return '<div class="liq-q__meta"><span>' + esc(label) + (q.answerType === 'TYPED' ? ' · typed' : '') + '</span>' + right + '</div>';
    }

    function renderGame() {
        updateHeader('play');
        var s = state.session; var q = state.question;
        state.answered = false; state.pending = false;
        var timer = s.gameMode === 'RAPID_FIRE'
            ? '<div class="liq-timer-row"><div class="liq-timer" aria-hidden="true"><div class="liq-timer__fill" id="liq-timer-fill"></div></div>' +
              '<span class="liq-timer__clock" id="liq-timer-clock" role="timer" aria-live="off" aria-label="Seconds left">' + esc(Math.max(0, Math.ceil((new Date(s.deadlineAt).getTime() - Date.now()) / 1000))) + '</span></div>'
            : '';
        render(
            '<section class="liq-game" aria-label="Game">' +
            barHtml() + timer + progressDots() +
            '<div class="liq-q" id="liq-q" data-qid="' + esc(q.id) + '">' + metaHtml(q) + lyricHtml(q) + answerHtml(q) + '</div>' +
            '<div class="liq-feedback" id="liq-feedback" aria-live="off"></div>' +
            '</section>'
        );
        state.questionShownAt = Date.now();
        api.track('question_view', { game_mode: s.gameMode, question_number: s.answered + 1, difficulty: q.difficulty, template: q.template });
        var input = document.getElementById('liq-input');
        if (input) input.focus();
        if (s.gameMode === 'RAPID_FIRE') startTimer();
        announce(copy.INSTRUCTIONS[q.template] + '. ' + q.prompt.lines.join(' ').replace('[[BLANK]]', 'blank') + (q.answerType === 'MULTIPLE_CHOICE' ? '. Options: ' + q.choices.map(function (c, i) { return (i + 1) + ', ' + c; }).join('. ') : ''));
    }

    function swapQuestion(next) {
        state.question = next;
        state.answered = false; state.pending = false;
        // This question was generated during the last answer; tell the server it is on screen now so the clock starts here.
        if (state.session) api.shown(state.session.id, next.id).catch(function () { /* timing falls back to generation time */ });
        var container = document.getElementById('liq-q');
        var fb = document.getElementById('liq-feedback');
        if (!container) return renderGame();
        container.setAttribute('data-qid', next.id);
        container.innerHTML = metaHtml(next) + lyricHtml(next) + answerHtml(next);
        if (fb) { fb.innerHTML = ''; fb.className = 'liq-feedback'; }
        var bar = document.getElementById('liq-bar');
        if (bar) bar.outerHTML = barHtml();
        var dots = main.querySelector('.liq-progress');
        if (dots) dots.outerHTML = progressDots();
        state.questionShownAt = Date.now();
        api.track('question_view', { game_mode: state.session.gameMode, question_number: state.session.answered + 1, difficulty: next.difficulty, template: next.template });
        var input = document.getElementById('liq-input');
        if (input) input.focus();
        announce(copy.INSTRUCTIONS[next.template] + '. ' + next.prompt.lines.join(' ').replace('[[BLANK]]', 'blank') + (next.answerType === 'MULTIPLE_CHOICE' ? '. Options: ' + next.choices.map(function (c, i) { return (i + 1) + ', ' + c; }).join('. ') : ''));
    }

    function startTimer() {
        clearTimers();
        var deadline = new Date(state.session.deadlineAt).getTime();
        var total = Math.max(1, deadline - Date.now());
        var fill = document.getElementById('liq-timer-fill');
        var clock = document.getElementById('liq-timer-clock');
        var lastShown = null;
        state.timer = setInterval(function () {
            var left = deadline - Date.now();
            if (fill) {
                fill.style.transform = 'scaleX(' + Math.max(0, left / total) + ')';
                if (left < 10000) fill.classList.add('liq-timer__fill--urgent');
            }
            if (clock) {
                var secs = Math.max(0, Math.ceil(left / 1000));
                if (secs !== lastShown) {
                    clock.textContent = secs;
                    lastShown = secs;
                    if (secs <= 10) { clock.classList.add('liq-timer__clock--urgent'); if (secs <= 5) announce(secs + ' seconds'); }
                }
            }
            if (left <= 0) {
                clearTimers();
                finishAndShowResults();
            }
        }, 250);
    }

    function submit(payload) {
        if (state.answered || state.pending || !state.session || !state.question) return;
        state.pending = true;
        var q = state.question; var s = state.session;
        var clientMs = Date.now() - state.questionShownAt;
        api.track('answer_submit', { game_mode: s.gameMode, question_number: s.answered + 1, difficulty: q.difficulty, response_time: clientMs, template: q.template });
        var buttons = main.querySelectorAll('.liq-choice');
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;
        var submitBtn = document.getElementById('liq-submit'); if (submitBtn) submitBtn.disabled = true;
        api.answer(s.id, payload).then(function (res) {
            state.pending = false;
            state.answered = true;
            if (res.timedOut) return finishAndShowResults(res.results);
            showFeedback(res, payload);
        }).catch(function (err) {
            state.pending = false;
            if (err.code === 'QUESTION_ALREADY_ANSWERED' || err.code === 'SESSION_NOT_ACTIVE') return resync(err);
            for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
            if (submitBtn) submitBtn.disabled = false;
            toast(err.message || 'Could not submit. Try again.', 3200);
        });
    }

    /** After a network hiccup, ask the server where we are. */
    function resync(err) {
        if (err && err.code === 'SESSION_NOT_ACTIVE') return finishAndShowResults();
        api.question(state.session.id).then(function (data) {
            state.session = data.session;
            if (!data.question) return finishAndShowResults();
            swapQuestion(data.question);
        }).catch(function () { finishAndShowResults(); });
    }

    function showFeedback(res, payload) {
        var q = state.question;
        var prevStreak = state.session.currentStreak;
        state.session = res.session;
        var brokenStreak = !res.correct ? prevStreak : 0;
        var line = copy.feedback(res, { streak: res.streak, streakBroken: res.sessionCompleted && state.session.endReason === 'STREAK_BROKEN', brokenStreak: brokenStreak });

        // Multiple choice: mark the picked and correct choices.
        if (q.answerType === 'MULTIPLE_CHOICE') {
            var buttons = main.querySelectorAll('.liq-choice');
            for (var i = 0; i < buttons.length; i++) {
                var b = buttons[i];
                if (i === res.correctChoiceIndex) b.classList.add('liq-choice--correct');
                else if (i === payload.choiceIndex) b.classList.add('liq-choice--wrong');
                else b.classList.add('liq-choice--dim');
            }
        } else {
            var form = document.getElementById('liq-typed');
            if (form) form.innerHTML = '<div class="liq-typed__hint">You said: <strong>' + esc(payload.answer || '—') + '</strong></div>';
        }
        // Reveal the blank in place.
        var blank = document.getElementById('liq-blank');
        if (blank) {
            blank.textContent = res.canonicalAnswer;
            blank.classList.add('liq-blank--revealed', res.correct ? 'liq-blank--correct' : 'liq-blank--wrong');
            blank.classList.remove('liq-blank--w2', 'liq-blank--w3');
            blank.style.minWidth = '0';
        }

        var detail = [];
        if (res.correct) detail.push('<strong>+' + esc(res.pointsAwarded) + '</strong>');
        if (q.prompt.kind === 'EXCERPT' && q.template !== 'NEXT_LINE') detail.push('<strong>' + esc(res.canonicalAnswer) + '</strong>');
        if (res.track) detail.push(esc(res.track.title) + ' — ' + esc(res.track.artist) + (res.track.releaseYear ? ' (' + esc(res.track.releaseYear) + ')' : ''));
        detail.push(fmtMs(res.responseTimeMs));

        var fb = document.getElementById('liq-feedback');
        var mode = state.session.gameMode;
        var delay = ADVANCE_DELAY[mode] || 1000;
        if (q.answerType === 'TYPED') delay += TYPED_EXTRA_DELAY;
        if (!res.correct) delay += 300;
        if (reduceMotion) delay += 200;
        var showNext = mode !== 'RAPID_FIRE';
        if (fb) {
            fb.className = 'liq-feedback ' + (res.correct ? 'liq-feedback--correct' : 'liq-feedback--wrong');
            fb.innerHTML = '<div class="liq-feedback__line liq-enter">' + esc(line) + '</div>' +
                '<div class="liq-feedback__detail">' + detail.join('<span aria-hidden="true">·</span>') + '</div>' +
                (showNext ? '<div class="liq-feedback__next"><button class="liq-btn liq-btn--sm" data-action="advance">' + (res.sessionCompleted ? 'See result' : 'Next') + ' →</button></div>' : '');
            // On phones the card can land below the fold (behind Safari's toolbar): bring it into view.
            try { fb.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); } catch (e) { /* older engines */ }
        }
        sound.play(res.correct ? (res.streak >= 3 && res.streak % 3 === 0 ? 'streak' : 'correct') : 'wrong');
        announce((res.correct ? 'Correct. ' : 'Not quite. The answer was ' + res.canonicalAnswer + '. ') + line);
        var bar = document.getElementById('liq-bar'); if (bar) bar.outerHTML = barHtml();
        var dots = main.querySelector('.liq-progress');
        if (dots) {
            dots.outerHTML = progressDots();
            var d = main.querySelectorAll('.liq-progress__dot');
            if (!res.correct && d[state.session.answered - 1]) d[state.session.answered - 1].classList.add('liq-progress__dot--wrong');
        }
        api.track(res.correct ? 'answer_correct' : 'answer_incorrect', { game_mode: mode, question_number: state.session.answered, difficulty: q.difficulty, response_time: res.responseTimeMs, score: state.session.score, streak: res.streak });

        // Streak: the world levels up with the run.
        if (mode === 'STREAK' && res.correct && !forcedWorld()) {
            var nextWorld = worldForStreak(res.streak);
            if (nextWorld !== state.world) { setWorld(nextWorld); toast('Level up. Welcome to ' + WORLD_NAMES[nextWorld] + '.', 2200); }
        }
        state.next = res.sessionCompleted ? { done: true, results: res.results } : { question: res.nextQuestion };
        state.advanceTimer = setTimeout(advance, delay);
    }

    function advance() {
        if (state.advanceTimer) { clearTimeout(state.advanceTimer); state.advanceTimer = null; }
        var next = state.next; state.next = null;
        if (!next) return;
        if (next.done) return finishAndShowResults(next.results);
        if (next.question) return swapQuestion(next.question);
        // No question attached (unexpected): ask the server.
        api.question(state.session.id).then(function (data) { if (data.question) swapQuestion(data.question); else finishAndShowResults(); }).catch(function (err) { renderError(err, 'home'); });
    }

    function finishAndShowResults(results) {
        clearTimers();
        var s = state.session;
        if (!s) return renderEntry();
        var p = results ? Promise.resolve(results) : api.results(s.id);
        p.then(function (r) {
            state.results = r;
            state.session = r.session;
            if (r.lyricIq && r.lyricIq.after !== null) state.lyricIq = r.lyricIq.after;
            api.track('game_complete', { game_mode: r.session.gameMode, score: r.session.score, streak: r.session.bestStreak, correct: r.session.correctCount });
            setRoute('#results/' + r.session.id);
            sound.logo();
            renderResults(r, { daily: r.session.gameMode === 'DAILY_10' });
        }).catch(function (err) { renderError(err, 'home'); });
    }

    function quitGame() {
        if (!state.session) return renderEntry();
        clearTimers();
        var s = state.session;
        if (s.answered > 0) return finishAndShowResults();
        api.abandon(s.id).catch(function () {});
        state.session = null; state.question = null;
        setRoute('#play');
        renderEntry();
    }

    /* ------------------------------------------------------------------ */
    /* Results                                                             */
    /* ------------------------------------------------------------------ */
    function renderResults(r, opts) {
        opts = opts || {};
        updateHeader('play');
        clearTimers();
        var s = r.session; var iq = r.lyricIq;
        var value = iq.after;
        var delta = iq.delta;
        var deltaHtml = '';
        if (delta !== null && delta !== undefined && delta !== 0) deltaHtml = '<span class="liq-iq__delta ' + (delta > 0 ? 'liq-iq__delta--up' : 'liq-iq__delta--down') + '">' + (delta > 0 ? '+' : '') + esc(delta) + '</span>';
        else if (iq.before === null && value !== null) deltaHtml = '<span class="liq-iq__delta">new</span>';
        var answered = s.correctCount + s.wrongCount;
        var kicker = opts.daily ? 'Daily 10 · ' + esc(s.dailyDateKey || '') : esc(copy.MODE_LABELS[s.gameMode] || 'Session') + (s.artist ? ' · ' + esc(s.artist.name) : '') + (s.endReason === 'TIME_UP' ? ' · time' : (s.endReason === 'ENDED_EARLY' ? ' · ended early' : ''));
        var headline = opts.daily ? esc(s.correctCount) + '/' + esc(s.questionCount) : (s.gameMode === 'STREAK' ? 'Streak of ' + esc(s.bestStreak) : (s.gameMode === 'RAPID_FIRE' ? esc(s.correctCount) + ' in 60 seconds' : esc(s.correctCount) + '/' + esc(answered)));
        var genres = iq.subScores && iq.subScores.genres ? Object.keys(iq.subScores.genres) : [];
        var subHtml = '';
        var artistIq = s.artist && iq.subScores && iq.subScores.artists ? iq.subScores.artists[s.artist.key] : null;
        if (genres.length || artistIq) {
            subHtml = '<div class="liq-subscores">' +
                (artistIq ? '<div class="liq-stat liq-stat--artist"><div class="liq-stat__v">' + esc(artistIq.value) + '</div><div class="liq-stat__k">' + esc(s.artist.name) + ' IQ</div></div>' : '') +
                genres.map(function (g) { var sc = iq.subScores.genres[g]; return '<div class="liq-stat"><div class="liq-stat__v">' + esc(sc.value) + '</div><div class="liq-stat__k">' + esc(sc.label) + '</div></div>'; }).join('') + '</div>';
        } else if (s.artist) {
            subHtml = '<p class="liq-faint">' + esc(s.artist.name) + ' IQ appears after ' + esc(iq.thresholds.minQuestionsForCategoryScore) + ' of their questions.</p>';
        }
        var breakdown = (r.breakdown || []).map(function (b) {
            return '<li class="liq-breakdown__row ' + (b.correct ? 'liq-breakdown__row--correct' : 'liq-breakdown__row--wrong') + '"><span class="liq-breakdown__mark" aria-label="' + (b.correct ? 'correct' : 'wrong') + '">' + (b.correct ? '✓' : '✕') + '</span><span class="liq-breakdown__track">' + esc(b.track ? b.track.title : '') + '<small>' + esc(b.track ? b.track.artist : '') + ' · ' + esc(copy.INSTRUCTIONS[b.template] || b.template) + ' · ' + esc(copy.BAND_LABELS[b.difficultyBand] || '') + '</small></span><span class="liq-breakdown__pts">' + (b.correct ? '+' + esc(b.points) : '0') + ' · ' + esc(fmtMs(b.responseTimeMs)) + '</span></li>';
        }).join('');
        var savePrompt = '';
        if (r.isGuest) {
            savePrompt = '<div class="liq-save"><h2 class="liq-save__title">Save your Lyric IQ.</h2><p class="liq-save__text">Create a free account and this number, your streaks and your rank follow you. Your guest history comes with you.</p>' +
                '<div class="liq-result__actions liq-result__actions--row"><a class="liq-btn" href="/signup.html?return=' + encodeURIComponent('/lyric-iq.html#profile') + '" data-action="register">Create account</a><a class="liq-btn liq-btn--ghost" href="/signin.html?return=' + encodeURIComponent('/lyric-iq.html#profile') + '">Sign in</a></div></div>';
            api.track('registration_prompt', { game_mode: s.gameMode });
        }
        render(
            '<section class="liq-result">' +
            '<div class="liq-result__hero liq-enter">' +
            '<div class="liq-kicker">' + kicker + '</div>' +
            '<h1 class="liq-h2">' + headline + '</h1>' +
            '<div class="liq-iq" aria-label="Lyric IQ ' + esc(value === null ? 'unscored' : value) + '"><span class="liq-iq__value">' + (value === null ? '—' : esc(value)) + '</span>' + deltaHtml + '</div>' +
            '<div class="liq-iq__line">' + esc(copy.iqLine(value)) + '</div>' +
            '<div class="liq-iq__note">Lyric IQ' + (iq.provisional ? ' · provisional until ' + esc(iq.thresholds.minQuestionsForScore) + ' questions' : '') + (r.dailyStreak > 1 ? ' · ' + esc(r.dailyStreak) + '-day daily streak' : '') + '</div>' +
            '</div>' +
            '<div class="liq-stats">' +
            '<div class="liq-stat"><div class="liq-stat__v">' + esc(s.score) + '</div><div class="liq-stat__k">Score</div></div>' +
            '<div class="liq-stat"><div class="liq-stat__v">' + esc(pct(s.accuracy)) + '</div><div class="liq-stat__k">Accuracy</div></div>' +
            '<div class="liq-stat"><div class="liq-stat__v">' + esc(s.bestStreak) + '</div><div class="liq-stat__k">Best streak</div></div>' +
            '<div class="liq-stat"><div class="liq-stat__v">' + esc(fmtMs(s.averageResponseMs)) + '</div><div class="liq-stat__k">Avg time</div></div>' +
            '</div>' +
            subHtml +
            (r.share && r.share.cardPath ? '<div class="liq-card liq-enter">' +
                '<img class="liq-card__img" src="' + esc(r.share.cardPath) + '" alt="Share card: Lyric IQ ' + esc(value === null ? 'unscored' : value) + '" width="1200" height="630" loading="eager" decoding="async">' +
                '<div class="liq-card__actions">' +
                '<button class="liq-btn liq-btn--primary" data-action="share">Share</button>' +
                '<a class="liq-btn" href="' + esc(r.share.storyPath) + '" download="lyric-iq-' + esc(value === null ? 'card' : value) + '-story.png" data-action="save-story">Save for Stories</a>' +
                '<button class="liq-btn liq-btn--ghost" data-action="copy-link">Copy link</button>' +
                '</div></div>' : '') +
            '<div class="liq-result__actions">' +
            '<button class="liq-btn liq-btn--primary" data-action="replay" data-mode="' + esc(s.gameMode === 'DAILY_10' ? 'QUICK_PLAY' : s.gameMode) + '">' + (s.gameMode === 'DAILY_10' ? 'Play more' : 'Play again') + '</button>' +
            (r.share && r.share.cardPath ? '' : '<button class="liq-btn" data-action="share">Share result</button>') +
            (s.artist ? '<button class="liq-btn liq-btn--ghost" data-action="artist-board" data-key="' + esc(s.artist.key) + '" data-name="' + esc(s.artist.name) + '">' + esc(s.artist.name) + ' board</button>' : '') +
            (s.gameMode !== 'DAILY_10' && state.daily && state.daily.status !== 'COMPLETED' ? '<button class="liq-btn liq-btn--ghost" data-action="play" data-mode="DAILY_10">Daily 10</button>' : '') +
            '<a class="liq-btn liq-btn--ghost" href="#profile">Your profile</a>' +
            '</div>' +
            savePrompt +
            (breakdown ? '<div class="liq-section"><div class="liq-kicker">The run</div><ol class="liq-breakdown">' + breakdown + '</ol></div>' : '') +
            '</section>'
        );
        announce('Session complete. Lyric IQ ' + (value === null ? 'not yet scored' : value) + '. ' + headline);
    }

    function shareUrlFor(r) {
        return r.share.pagePath ? location.origin + r.share.pagePath : location.origin + '/lyric-iq.html?challenge=' + encodeURIComponent(r.session.id);
    }
    /** Copy with the clipboard API where the page is secure, else the old select-and-copy trick (works on plain http). */
    function copyText(payload, okMessage) {
        var done = function () { toast(okMessage || 'Copied. Go post it.'); };
        var legacy = function () {
            try {
                var ta = document.createElement('textarea');
                ta.value = payload; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '-1000px';
                document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, payload.length);
                var ok = document.execCommand && document.execCommand('copy');
                document.body.removeChild(ta);
                if (ok) done(); else toast('Select the link and copy it.');
            } catch (e) { toast('Select the link and copy it.'); }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(payload).then(done).catch(legacy);
        else legacy();
    }
    /** In-page share sheet: the card, the link and direct hand-offs. Used wherever the native sheet is unavailable (plain http, desktop). */
    function openShareSheet(r) {
        closeShareSheet();
        var url = shareUrlFor(r);
        var text = r.share.short || r.share.text;
        var enc = encodeURIComponent;
        var value = r.lyricIq && r.lyricIq.after !== null ? r.lyricIq.after : 'card';
        var sheet = document.createElement('div');
        sheet.className = 'liq-sheet'; sheet.id = 'liq-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Share your Lyric IQ');
        sheet.innerHTML =
            '<div class="liq-sheet__backdrop" data-action="sheet-close"></div>' +
            '<div class="liq-sheet__panel liq-enter">' +
            '<div class="liq-sheet__head"><div class="liq-kicker">Share it</div><button class="liq-sheet__close" data-action="sheet-close" aria-label="Close">✕</button></div>' +
            (r.share.cardPath ? '<img class="liq-card__img" src="' + esc(r.share.cardPath) + '" alt="Your Lyric IQ card" width="1200" height="630">' : '') +
            '<div class="liq-sheet__link"><input class="liq-input liq-sheet__url" type="text" readonly value="' + esc(url) + '" aria-label="Share link" onfocus="this.select()"><button class="liq-btn liq-btn--sm" data-action="copy-link">Copy</button></div>' +
            '<div class="liq-sheet__grid">' +
            '<a class="liq-btn liq-btn--sm" href="sms:?&body=' + enc(text + ' ' + url) + '" data-action="share-to" data-to="sms">Messages</a>' +
            '<a class="liq-btn liq-btn--sm" href="https://wa.me/?text=' + enc(text + ' ' + url) + '" target="_blank" rel="noopener" data-action="share-to" data-to="whatsapp">WhatsApp</a>' +
            '<a class="liq-btn liq-btn--sm" href="https://twitter.com/intent/tweet?text=' + enc(text) + '&url=' + enc(url) + '" target="_blank" rel="noopener" data-action="share-to" data-to="x">X</a>' +
            '<a class="liq-btn liq-btn--sm" href="https://www.facebook.com/sharer/sharer.php?u=' + enc(url) + '" target="_blank" rel="noopener" data-action="share-to" data-to="facebook">Facebook</a>' +
            (r.share.cardPath ? '<a class="liq-btn liq-btn--sm" href="' + esc(r.share.cardPath) + '" download="lyric-iq-' + esc(value) + '.png" data-action="share-to" data-to="download">Save card</a>' : '') +
            (r.share.storyPath ? '<a class="liq-btn liq-btn--sm" href="' + esc(r.share.storyPath) + '" download="lyric-iq-' + esc(value) + '-story.png" data-action="share-to" data-to="story">Save for Stories</a>' : '') +
            '</div>' +
            '<p class="liq-sheet__hint">On your phone over https the Share button opens the system share sheet with the card attached.</p>' +
            '</div>';
        document.body.appendChild(sheet);
        document.body.classList.add('liq-body--sheet');
        var close = sheet.querySelector('.liq-sheet__close'); if (close) close.focus();
    }
    function closeShareSheet() {
        var el = document.getElementById('liq-sheet');
        if (el) el.parentNode.removeChild(el);
        document.body.classList.remove('liq-body--sheet');
    }
    /** Share: the system sheet with the card attached where the page is secure and the browser allows files; otherwise the in-page sheet. */
    function share() {
        var r = state.results;
        if (!r || !r.share) return;
        api.track('share_click', { game_mode: r.session.gameMode });
        var url = shareUrlFor(r);
        // The link alone: its preview is the card, so sending the image or the
        // line as well only repeats it. The card file stays available in the sheet.
        if (navigator.share) return navigator.share({ url: url }).catch(function (err) { if (err && err.name !== 'AbortError') openShareSheet(r); });
        openShareSheet(r);
    }

    /* ------------------------------------------------------------------ */
    /* Profile                                                             */
    /* ------------------------------------------------------------------ */
    function renderProfile() {
        updateHeader('profile');
        clearTimers();
        if (!api.hasAuth() && !api.hasGuest()) {
            return render('<section class="liq-state"><h1 class="liq-state__title">No Lyric IQ yet.</h1><p class="liq-state__text">Play one round and this page starts telling you what you actually know.</p><div><button class="liq-btn liq-btn--primary" data-action="play" data-mode="QUICK_PLAY">Play</button></div></section>');
        }
        renderLoading('Reading the record');
        api.profile().then(function (p) {
            var iq = p.lyricIq; var m = p.metrics;
            var value = iq.value;
            var cats = { hiphop: 'Hip-Hop', rnb: 'R&B', pop: 'Pop', rock: 'Rock', country: 'Country', other: 'Other' };
            var subs = [];
            if (iq.subScores) {
                Object.keys(iq.subScores.genres || {}).forEach(function (g) { subs.push(iq.subScores.genres[g]); });
                Object.keys(iq.subScores.eras || {}).forEach(function (e) { subs.push(iq.subScores.eras[e]); });
                if (iq.subScores.recall) subs.push(iq.subScores.recall);
                if (iq.subScores.recognition) subs.push(iq.subScores.recognition);
                Object.keys(iq.subScores.artists || {}).forEach(function (k) { subs.push(iq.subScores.artists[k]); });
            }
            var artistRows = m && m.byArtist ? Object.keys(m.byArtist).filter(function (k) { return k !== 'unknown' && m.byArtist[k].attempts >= 3; }).sort(function (a, b) { return m.byArtist[b].attempts - m.byArtist[a].attempts; }).slice(0, 12).map(function (k) {
                var b = m.byArtist[k];
                var sc = iq.subScores && iq.subScores.artists ? iq.subScores.artists[k] : null;
                var name = sc ? sc.label.replace(/ IQ$/, '') : k.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
                return '<tr><td><button class="liq-link" data-action="artist-board" data-key="' + esc(k) + '" data-name="' + esc(name) + '">' + esc(name) + '</button></td><td class="num">' + esc(b.attempts) + '</td><td class="num">' + esc(pct(b.accuracy)) + '</td><td class="num">' + (sc ? esc(sc.value) : '—') + '</td></tr>';
            }).join('') : '';
            var genreRows = m ? Object.keys(m.byGenre).sort(function (a, b) { return m.byGenre[b].attempts - m.byGenre[a].attempts; }).map(function (g) {
                var b = m.byGenre[g];
                return '<tr><td>' + esc(cats[g] || g) + '</td><td class="num">' + esc(b.attempts) + '</td><td class="num">' + esc(pct(b.accuracy)) + '</td><td class="num">' + esc(b.avgDifficulty) + '</td></tr>';
            }).join('') : '';
            var decadeRows = m ? Object.keys(m.byDecade).filter(function (d) { return d !== 'unknown'; }).sort().map(function (d) {
                var b = m.byDecade[d];
                return '<tr><td>' + esc(d) + '</td><td class="num">' + esc(b.attempts) + '</td><td class="num">' + esc(pct(b.accuracy)) + '</td><td class="num">' + esc(b.avgDifficulty) + '</td></tr>';
            }).join('') : '';
            var recent = (p.recentSessions || []).map(function (s) {
                return '<tr><td>' + esc(copy.MODE_LABELS[s.gameMode] || s.gameMode) + (s.dailyDateKey ? ' · ' + esc(s.dailyDateKey) : '') + '</td><td class="num">' + esc(s.correct) + '/' + esc(s.correct + s.wrong) + '</td><td class="num">' + esc(s.score) + '</td><td class="num">' + esc(s.bestStreak) + '</td></tr>';
            }).join('');
            render(
                '<section class="liq-result">' +
                '<div class="liq-result__hero liq-enter">' +
                '<div class="liq-kicker">' + esc(p.player.displayName || 'You') + (p.player.isGuest ? ' · guest' : '') + '</div>' +
                '<div class="liq-iq"><span class="liq-iq__value">' + (value === null ? '—' : esc(value)) + '</span></div>' +
                '<div class="liq-iq__line">' + esc(copy.iqLine(value)) + '</div>' +
                '<div class="liq-iq__note">Lyric IQ v' + esc(iq.version) + (iq.provisional ? ' · provisional' : '') + ' · ' + esc(iq.sampleSize) + ' questions</div>' +
                '</div>' +
                (m ? '<div class="liq-stats">' +
                    '<div class="liq-stat"><div class="liq-stat__v">' + esc(pct(m.totals.accuracy)) + '</div><div class="liq-stat__k">Accuracy</div></div>' +
                    '<div class="liq-stat"><div class="liq-stat__v">' + esc(m.bestStreak) + '</div><div class="liq-stat__k">Best streak</div></div>' +
                    '<div class="liq-stat"><div class="liq-stat__v">' + esc(m.daily.streak || 0) + '</div><div class="liq-stat__k">Daily streak</div></div>' +
                    '<div class="liq-stat"><div class="liq-stat__v">' + esc(m.artistsPlayed) + '</div><div class="liq-stat__k">Artists</div></div>' +
                    '</div>' : '') +
                (subs.length ? '<div class="liq-section"><div class="liq-kicker">Sub-scores</div><div class="liq-subscores">' + subs.map(function (sc) { return '<div class="liq-stat"><div class="liq-stat__v">' + esc(sc.value) + '</div><div class="liq-stat__k">' + esc(sc.label) + '</div></div>'; }).join('') + '</div></div>' :
                    '<p class="liq-faint">Genre, era and recall sub-scores unlock after ' + esc(iq.thresholds.minQuestionsForCategoryScore) + ' questions in a category.</p>') +
                '<div class="liq-section"><div class="liq-kicker">What the number means</div><ul class="liq-explain">' + (p.explanation || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></div>' +
                (genreRows ? '<div class="liq-section"><div class="liq-kicker">By genre</div><table class="liq-table"><thead><tr><th>Genre</th><th class="num">Qs</th><th class="num">Acc.</th><th class="num">Diff.</th></tr></thead><tbody>' + genreRows + '</tbody></table></div>' : '') +
                (artistRows ? '<div class="liq-section"><div class="liq-kicker">By artist</div><table class="liq-table"><thead><tr><th>Artist</th><th class="num">Qs</th><th class="num">Acc.</th><th class="num">Artist IQ</th></tr></thead><tbody>' + artistRows + '</tbody></table></div>' : '') +
                (decadeRows ? '<div class="liq-section"><div class="liq-kicker">By era</div><table class="liq-table"><thead><tr><th>Era</th><th class="num">Qs</th><th class="num">Acc.</th><th class="num">Diff.</th></tr></thead><tbody>' + decadeRows + '</tbody></table></div>' : '') +
                (recent ? '<div class="liq-section"><div class="liq-kicker">Recent</div><table class="liq-table"><thead><tr><th>Mode</th><th class="num">Right</th><th class="num">Score</th><th class="num">Streak</th></tr></thead><tbody>' + recent + '</tbody></table></div>' : '') +
                '<div class="liq-result__actions"><button class="liq-btn liq-btn--primary" data-action="play" data-mode="QUICK_PLAY">Play</button><button class="liq-btn" data-action="share-profile">Share Lyric IQ</button></div>' +
                (p.player.isGuest ? '<div class="liq-save"><h2 class="liq-save__title">This is a guest record.</h2><p class="liq-save__text">Create an account to keep it and get on the boards.</p><div class="liq-result__actions liq-result__actions--row"><a class="liq-btn" href="/signup.html?return=' + encodeURIComponent('/lyric-iq.html#profile') + '">Create account</a><a class="liq-btn liq-btn--ghost" href="/signin.html?return=' + encodeURIComponent('/lyric-iq.html#profile') + '">Sign in</a></div></div>' : '') +
                '</section>'
            );
            state.profileShare = p.share;
        }).catch(function (err) {
            if (err.status === 401) { api.clearGuest(); return renderProfile(); }
            renderError(err, 'profile');
        });
    }

    /* ------------------------------------------------------------------ */
    /* Leaderboard                                                         */
    /* ------------------------------------------------------------------ */
    var boardTab = 'daily';
    var boardArtist = null;   // { key, name } for the Artist IQ board
    var BOARD_TABS = ['daily', 'weekly', 'all-time', 'artist'];
    function boardTabsHtml(labels) {
        return '<div class="liq-tabs" role="tablist">' + BOARD_TABS.map(function (t) { return '<button class="liq-chip" role="tab" aria-selected="' + (t === boardTab) + '" aria-pressed="' + (t === boardTab) + '" data-action="board" data-board="' + t + '">' + esc(labels[t]) + '</button>'; }).join('') + '</div>';
    }
    function renderLeaderboard() {
        updateHeader('leaderboard');
        clearTimers();
        var labels = { daily: 'Daily', weekly: 'Weekly', 'all-time': 'All time', artist: 'Artist IQ' };
        if (boardTab === 'artist' && !boardArtist && state.artist) boardArtist = { key: state.artist.key, name: state.artist.name };
        if (boardTab === 'artist' && !boardArtist) {
            // No artist chosen yet: the same picker as the setup step, feeding the board instead.
            render(
                '<section class="liq-section">' +
                '<div class="liq-kicker">Leaderboard</div>' +
                '<h1 class="liq-h2">Artist IQ</h1>' +
                boardTabsHtml(labels) +
                '<p class="liq-muted">Who knows one artist’s words best. Pick the artist.</p>' +
                '<div class="liq-artist"><input class="liq-input liq-artist__input" id="liq-board-q" type="search" placeholder="Search an artist" autocomplete="off" maxlength="60" aria-label="Search an artist">' +
                '<div class="liq-artist__results" id="liq-board-results" aria-live="polite"></div></div>' +
                '</section>'
            );
            var input = document.getElementById('liq-board-q');
            if (!input) return;
            input.focus();
            input.addEventListener('input', function () {
                var q = input.value.trim();
                clearTimeout(artistSearchTimer);
                var box = document.getElementById('liq-board-results');
                if (q.length < 2) { if (box) box.innerHTML = ''; return; }
                artistSearchTimer = setTimeout(function () {
                    api.artists(q).then(function (d) {
                        if (input.value.trim() !== q || !box) return;
                        box.innerHTML = (d.artists || []).map(function (a) {
                            return '<button class="liq-mode liq-artist__item" data-action="artist-board" data-key="' + esc(a.key) + '" data-name="' + esc(a.name) + '"><span class="liq-mode__name">' + esc(a.name) + '</span><span class="liq-mode__meta">' + (a.tracks ? esc(a.tracks) + ' songs' : 'Not played yet') + '</span></button>';
                        }).join('') || '<p class="liq-faint">No artist by that name yet.</p>';
                    }).catch(function () {});
                }, 280);
            });
            return;
        }
        renderLoading('Checking the board');
        (boardTab === 'artist' ? api.artistBoard(boardArtist.key) : api.leaderboard(boardTab)).then(function (b) {
            var valueLabel = boardTab === 'all-time' ? 'Lyric IQ' : (boardTab === 'artist' ? 'Artist IQ' : 'Score');
            var artistName = boardTab === 'artist' ? ((b.artist && b.artist.name) || boardArtist.name || boardArtist.key) : null;
            var rows = b.entries.map(function (e) {
                return '<tr' + (e.isYou ? ' class="liq-me"' : '') + '><td class="num">' + esc(e.rank) + '</td><td>' + esc(e.displayName) + '</td><td class="num">' + esc(e.value) + '</td></tr>';
            }).join('');
            var me = '';
            if (b.me && artistName && !b.me.value) me = '<p class="liq-muted">Your ' + esc(artistName) + ' IQ unlocks after 15 of their questions.' + (b.me.ranked ? '' : ' <a href="/signup.html?return=' + encodeURIComponent('/lyric-iq.html#leaderboard') + '">Create an account</a> to be ranked when it does.') + '</p>';
            else if (b.me) me = '<p class="liq-muted">' + (b.me.ranked ? 'You are #' + esc(b.me.rank) + ' with ' + esc(b.me.value) + '.' : 'Your ' + esc(artistName ? artistName + ' IQ' : valueLabel) + ' of ' + esc(b.me.value) + ' is not ranked. <a href="/signup.html?return=' + encodeURIComponent('/lyric-iq.html#leaderboard') + '">Create an account</a> to get on the board.') + '</p>';
            render(
                '<section class="liq-section">' +
                '<div class="liq-kicker">Leaderboard · ' + esc(artistName || b.periodKey) + '</div>' +
                '<h1 class="liq-h2">' + esc(artistName ? artistName + ' IQ' : labels[boardTab]) + '</h1>' +
                boardTabsHtml(labels) +
                (artistName ? '<p class="liq-muted">Everyone’s Artist IQ for ' + esc(artistName) + ' from rounds scoped to their songs. <button class="liq-link" data-action="board-artist-change">Another artist</button></p>' : '') +
                (rows ? '<table class="liq-table"><thead><tr><th class="num">#</th><th>Player</th><th class="num">' + valueLabel + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="liq-empty">Nobody on the board yet. Be first.</p>') +
                me +
                (artistName
                    ? '<div><button class="liq-btn liq-btn--primary" data-action="play-artist" data-key="' + esc(boardArtist.key) + '" data-name="' + esc(artistName) + '">Play ' + esc(artistName) + '</button></div>'
                    : '<div><button class="liq-btn liq-btn--primary" data-action="play" data-mode="' + (boardTab === 'daily' ? 'DAILY_10' : 'QUICK_PLAY') + '">' + (boardTab === 'daily' ? 'Play Daily 10' : 'Play') + '</button></div>') +
                '</section>'
            );
        }).catch(function (err) { renderError(err, 'leaderboard'); });
    }

    /* ------------------------------------------------------------------ */
    /* Routing + events                                                    */
    /* ------------------------------------------------------------------ */
    function route() {
        var hash = location.hash || '#play';
        document.body.setAttribute('data-screen', hash.slice(1).split('/')[0] || 'play');
        if (hash.indexOf('#results/') === 0) {
            var id = hash.slice(9);
            if (state.results && state.results.session.id === id) return renderResults(state.results, { daily: state.results.session.gameMode === 'DAILY_10' });
            renderLoading('Pulling the result');
            return api.results(id).then(function (r) { state.results = r; state.session = r.session; renderResults(r, { daily: r.session.gameMode === 'DAILY_10' }); }).catch(function (err) { renderError(err, 'home'); });
        }
        if (hash === '#game') {
            if (state.session && state.question && state.session.status === 'ACTIVE') return renderGame();
            return renderEntry();
        }
        if (hash === '#mode') return renderModes();
        if (hash === '#genre') return renderGenre();
        if (hash === '#artist') return renderArtist();
        if (hash === '#daily') return startGame('DAILY_10');
        if (hash === '#profile') return renderProfile();
        if (hash === '#leaderboard') return renderLeaderboard();
        renderEntry();
    }

    // The share sheet lives outside <main>; route its clicks through the same handler.
    document.body.addEventListener('click', function (e) {
        var sheet = e.target.closest('#liq-sheet'); if (!sheet) return;
        var el = e.target.closest('[data-action]'); if (!el) return;
        var action = el.getAttribute('data-action');
        if (action === 'sheet-close') { e.preventDefault(); closeShareSheet(); }
        else if (action === 'copy-link') { e.preventDefault(); if (state.results) { api.track('share_link_copy', { game_mode: state.results.session.gameMode }); copyText(shareUrlFor(state.results), 'Link copied.'); } }
        else if (action === 'share-to' && state.results) api.track('share_to', { game_mode: state.results.session.gameMode, target: el.getAttribute('data-to') });
    });
    main.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var action = el.getAttribute('data-action');
        sound.play(action === 'choice' ? 'tick' : 'tap');
        switch (action) {
            case 'play': e.preventDefault(); startGame(el.getAttribute('data-mode') || 'QUICK_PLAY'); break;
            case 'go': { e.preventDefault(); var step = el.getAttribute('data-step'); api.track('setup_step', { step: step }); setRoute('#' + step); route(); break; }
            case 'select-mode': { e.preventDefault(); var picked = el.getAttribute('data-mode') || 'QUICK_PLAY'; state.lastMode = picked; state.modePicked = true; api.track('mode_select', { game_mode: picked }); if (picked === 'DAILY_10') return startGame(picked); setRoute('#genre'); route(); break; }
            case 'begin': e.preventDefault(); api.track('genre_select', { game_mode: state.lastMode, category: state.category, artist: state.artist ? state.artist.key : null }); startGame(state.lastMode || 'QUICK_PLAY'); break;
            case 'to-artist': e.preventDefault(); api.track('genre_select', { game_mode: state.lastMode, category: state.category }); setRoute('#artist'); route(); break;
            case 'to-artist-step': e.preventDefault(); setRoute('#artist'); route(); break;
            case 'pick-artist': {
                e.preventDefault();
                var key = el.getAttribute('data-key');
                state.artist = state.artist && state.artist.key === key ? null : { key: key, name: el.getAttribute('data-name'), providerArtistId: el.getAttribute('data-pid') || null };
                api.track('artist_select', { artist: state.artist ? key : null });
                refreshArtistResults();
                break;
            }
            case 'clear-artist': e.preventDefault(); state.artist = null; refreshArtistResults(); break;
            case 'artist-board': e.preventDefault(); boardTab = 'artist'; boardArtist = { key: el.getAttribute('data-key'), name: el.getAttribute('data-name') }; setRoute('#leaderboard'); renderLeaderboard(); break;
            case 'replay': e.preventDefault(); api.track('replay_click', { game_mode: el.getAttribute('data-mode') }); startGame(el.getAttribute('data-mode') || 'QUICK_PLAY'); break;
            case 'retry-start': e.preventDefault(); startGame(state.lastMode); break;
            case 'category': {
                state.category = el.getAttribute('data-category');
                var chips = main.querySelectorAll('[data-action="category"]');
                for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i] === el));
                break;
            }
            case 'choice': submit({ questionId: state.question.id, choiceIndex: parseInt(el.getAttribute('data-index'), 10) }); break;
            case 'advance': advance(); break;
            case 'quit': quitGame(); break;
            case 'share': share(); break;
            case 'copy-link': { e.preventDefault(); if (state.results) { api.track('share_link_copy', { game_mode: state.results.session.gameMode }); copyText(shareUrlFor(state.results), 'Link copied.'); } break; }
            case 'sheet-close': e.preventDefault(); closeShareSheet(); break;
            case 'share-to': if (state.results) api.track('share_to', { game_mode: state.results.session.gameMode, target: el.getAttribute('data-to') }); break;
            case 'save-story': if (state.results) api.track('share_story_save', { game_mode: state.results.session.gameMode }); break;
            case 'share-profile': {
                var sp = state.profileShare;
                if (!sp) break;
                api.track('share_click', { game_mode: 'profile' });
                var txt = sp.text + '\n' + location.origin + '/lyric-iq.html';
                if (navigator.share) navigator.share({ title: 'Wordeth Lyric IQ', text: sp.text, url: location.origin + '/lyric-iq.html' }).catch(function () {});
                else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Copied.'); });
                break;
            }
            case 'board': boardTab = el.getAttribute('data-board'); renderLeaderboard(); break;
            case 'board-artist-change': e.preventDefault(); boardArtist = null; renderLeaderboard(); break;
            case 'play-artist': e.preventDefault(); state.artist = { key: el.getAttribute('data-key'), name: el.getAttribute('data-name'), providerArtistId: null }; state.category = 'all'; startGame(state.lastMode === 'DAILY_10' ? 'QUICK_PLAY' : (state.lastMode || 'QUICK_PLAY')); break;
            case 'home': e.preventDefault(); setRoute('#play'); renderEntry(); break;
            case 'profile': e.preventDefault(); renderProfile(); break;
            case 'leaderboard': e.preventDefault(); renderLeaderboard(); break;
            case 'register': api.track('registration_prompt', { clicked: true }); break;
            default: break;
        }
    });

    main.addEventListener('submit', function (e) {
        if (e.target && e.target.id === 'liq-typed') {
            e.preventDefault();
            var input = document.getElementById('liq-input');
            var value = input ? input.value.trim() : '';
            if (!value) { if (input) input.focus(); return; }
            submit({ questionId: state.question.id, answer: value });
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && document.getElementById('liq-sheet')) { closeShareSheet(); return; }
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (!state.session || !state.question || location.hash !== '#game') return;
        if (isTypingTarget(document.activeElement)) return; // never hijack text inputs
        if (state.answered && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') && state.next) { e.preventDefault(); advance(); return; }
        if (state.question.answerType === 'MULTIPLE_CHOICE' && !state.answered && /^[1-4]$/.test(e.key)) {
            var idx = parseInt(e.key, 10) - 1;
            if (idx < state.question.choices.length) { e.preventDefault(); submit({ questionId: state.question.id, choiceIndex: idx }); }
        }
    });

    /* Pointer parallax on the stage (fine pointers only; never under reduced motion). */
    (function initParallax() {
        var stage = document.querySelector('.liq-stage');
        if (!stage || reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
        var raf = null, tx = 0, ty = 0;
        document.addEventListener('mousemove', function (e) {
            tx = (e.clientX / window.innerWidth - 0.5) * 2;
            ty = (e.clientY / window.innerHeight - 0.5) * 2;
            if (raf) return;
            raf = requestAnimationFrame(function () {
                raf = null;
                stage.style.setProperty('--px', tx.toFixed(3));
                stage.style.setProperty('--py', ty.toFixed(3));
            });
        }, { passive: true });
    })();

    (function initSoundButton() {
        var btn = document.getElementById('liq-sound');
        if (!btn) return;
        function paint() {
            var m = sound.isMuted();
            btn.textContent = '♪';
            btn.setAttribute('aria-pressed', String(!m));
            btn.setAttribute('aria-label', m ? 'Sound off' : 'Sound on');
            btn.classList.toggle('liq-top__sound--off', m);
        }
        paint();
        btn.addEventListener('click', function () {
            var m = sound.toggle();
            paint();
            if (!m) sound.play('select');
            toast(m ? 'Sound off.' : 'Sound on.', 1400);
        });
    })();

    window.addEventListener('popstate', function () { route(); });
    window.addEventListener('hashchange', function () { route(); });
    window.addEventListener('online', function () { toast('Back online.'); });
    window.addEventListener('offline', function () { toast('You’re offline. Answers will wait.', 4000); });
    document.addEventListener('visibilitychange', function () {
        // Coming back to a Rapid Fire game: the server clock kept running; resync the bar.
        if (!document.hidden && state.session && state.session.gameMode === 'RAPID_FIRE' && state.session.status === 'ACTIVE' && location.hash === '#game') startTimer();
    });

    /* ------------------------------------------------------------------ */
    /* Boot                                                                */
    /* ------------------------------------------------------------------ */
    var params = new URLSearchParams(location.search);
    setWorld(params.get('world') || 'block');
    preloadScenes();
    // Rotating a phone swaps between the portrait and wide cuts of the current scene.
    if (window.matchMedia) {
        var orient = window.matchMedia('(orientation: portrait)');
        var onOrient = function () { loadScene(state.world); };
        if (orient.addEventListener) orient.addEventListener('change', onOrient); else if (orient.addListener) orient.addListener(onOrient);
    }
    if (params.get('challenge')) state.challengeCode = params.get('challenge').slice(0, 64);
    if (params.get('mode') && /^[A-Z_]+$/.test(params.get('mode'))) state.lastMode = params.get('mode');

    api.claimIfNeeded().then(function (claimed) {
        if (claimed) { toast('Your guest history is saved to your account.'); api.track('registration_complete', {}); }
        if (params.get('mode') && !location.hash) return startGame(state.lastMode);
        route();
    });
})();
