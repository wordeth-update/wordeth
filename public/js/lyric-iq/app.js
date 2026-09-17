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
    /* Worlds are levels: meadow → city → desert. */
    var WORLDS = ['meadow', 'city', 'desert'];
    var WORLD_NAMES = { meadow: 'the meadow', city: 'the city', desert: 'the desert' };
    var WORLD_IQ_TIERS = [{ min: 75, world: 'desert' }, { min: 50, world: 'city' }, { min: -1, world: 'meadow' }];
    var WORLD_STREAK_TIERS = [{ min: 10, world: 'desert' }, { min: 5, world: 'city' }, { min: 0, world: 'meadow' }];
    var TYPED_EXTRA_DELAY = 700;

    var state = {
        config: null,
        daily: null,
        session: null,
        question: null,
        pending: false,      // an answer request is in flight
        answered: false,     // current question resolved on screen
        category: 'all',
        challengeCode: null,
        results: null,
        timer: null,
        advanceTimer: null,
        lastMode: 'QUICK_PLAY',
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
    /** Switch the stage world; each game drops you into one of the two worlds. */
    function setWorld(world) {
        if (WORLDS.indexOf(world) < 0) world = WORLDS[0];
        state.world = world;
        document.body.setAttribute('data-world', world);
    }
    function forcedWorld() {
        var forced = new URLSearchParams(location.search).get('world');
        return forced && WORLDS.indexOf(forced) >= 0 ? forced : null;
    }
    function tierWorld(tiers, value) {
        var v = value === null || value === undefined ? -1 : value;
        for (var i = 0; i < tiers.length; i++) if (v >= tiers[i].min) return tiers[i].world;
        return 'meadow';
    }
    function worldForIq(value) { return tierWorld(WORLD_IQ_TIERS, value); }
    function worldForStreak(streak) { return tierWorld(WORLD_STREAK_TIERS, streak); }
    /** The world a new game opens in: Streak always starts in the meadow and climbs; Rapid Fire is the city; otherwise your Lyric IQ tier. */
    function worldForMode(mode) {
        if (forcedWorld()) return forcedWorld();
        if (mode === 'STREAK') return 'meadow';
        if (mode === 'RAPID_FIRE') return 'city';
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

    function renderEntry() {
        updateHeader('play');
        clearTimers();
        state.session = null; state.question = null;
        renderLoading('Warming up');
        Promise.all([loadConfig(), api.daily().catch(function () { return null; }), (api.hasAuth() || api.hasGuest()) ? api.profile().catch(function () { return null; }) : Promise.resolve(null)])
            .then(function (all) {
                var cfg = all[0]; var daily = all[1]; var profile = all[2];
                state.daily = daily;
                var modes = {};
                cfg.modes.forEach(function (m) { modes[m.key] = m; });
                var iq = profile && profile.lyricIq ? profile.lyricIq : null;
                state.lyricIq = iq ? iq.value : null;
                setWorld(forcedWorld() || worldForIq(state.lyricIq));
                // Signed in via the shared cookie: this origin has no stored user yet, so name the header from the profile.
                var authLink = document.getElementById('liq-auth-link');
                if (authLink && profile && profile.player && !profile.player.isGuest && authLink.textContent === 'Signed in') authLink.textContent = profile.player.displayName || 'Profile';
                var dailyMeta = 'Ten. Same set for everyone.';
                var dailyDone = false;
                if (daily && daily.status === 'COMPLETED') { dailyDone = true; dailyMeta = 'Done · ' + daily.summary.correct + '/' + daily.questionCount; }
                else if (daily && daily.status === 'ACTIVE') { dailyMeta = 'In progress · resume'; }
                var cats = (cfg.categories || []).filter(function (c) { return c.genre !== 'other'; });
                var catLabels = { hiphop: 'Hip-Hop', rnb: 'R&B', pop: 'Pop', rock: 'Rock', country: 'Country' };

                render(
                    '<section class="liq-entry">' +
                    '<div class="liq-entry__head liq-enter">' +
                    '<div class="liq-kicker">Wordeth</div>' +
                    '<h1 class="liq-h1">Lyric <span class="liq-h1__wonder">IQ</span></h1>' +
                    '<p class="liq-entry__thesis">The world between thought and speech. This is where words go to be spoken.</p>' +
                    (iq && iq.value !== null ? '<div class="liq-entry__iq"><strong>' + esc(iq.value) + '</strong><span class="liq-muted">your Lyric IQ' + (iq.provisional ? ' · provisional' : '') + '</span></div>' : '') +
                    '</div>' +
                    '<div class="liq-entry__primary">' +
                    '<button class="liq-btn liq-btn--primary liq-btn--block" data-action="play" data-mode="QUICK_PLAY" autofocus>Play</button>' +
                    '<div class="liq-entry__modes" role="group" aria-labelledby="liq-modes-label">' +
                    '<span class="liq-entry__modes-label" id="liq-modes-label">Modes</span>' +
                    '<div class="liq-entry__secondary">' +
                    (modes.DAILY_10 ? '<button class="liq-mode' + (dailyDone ? ' liq-mode--done' : '') + '" data-action="play" data-mode="DAILY_10"><span class="liq-mode__name">Daily 10</span><span class="liq-mode__meta">' + esc(dailyMeta) + '</span></button>' : '') +
                    (modes.RAPID_FIRE ? '<button class="liq-mode" data-action="play" data-mode="RAPID_FIRE"><span class="liq-mode__name">Rapid Fire</span><span class="liq-mode__meta">60 seconds. Go.</span></button>' : '') +
                    (modes.STREAK ? '<button class="liq-mode" data-action="play" data-mode="STREAK"><span class="liq-mode__name">Streak</span><span class="liq-mode__meta">Until you miss.</span></button>' : '') +
                    '</div></div>' +
                    (cats.length > 1 ? '<div class="liq-chips" role="group" aria-label="Choose category">' +
                        '<button class="liq-chip" data-action="category" data-category="all" aria-pressed="' + (state.category === 'all') + '">Everything</button>' +
                        cats.map(function (c) { return '<button class="liq-chip" data-action="category" data-category="' + esc(c.genre) + '" aria-pressed="' + (state.category === c.genre) + '">' + esc(catLabels[c.genre] || c.genre) + '</button>'; }).join('') +
                        '</div>' : '') +
                    '</div>' +
                    '<p class="liq-entry__foot">' + (cfg.synthetic ? 'Development catalog: test content, not real lyrics. ' : '') + (daily && daily.dailyStreak > 1 ? esc(daily.dailyStreak) + '-day daily streak. ' : '') + (!api.hasAuth() ? 'No account needed to play. ' : '') + '<a href="https://wordeth.com">Part of Wordeth</a></p>' +
                    '</section>'
                );
                api.track('game_view', {});
            })
            .catch(function (err) { renderError(err, 'home'); });
    }

    /* ------------------------------------------------------------------ */
    /* Game                                                                */
    /* ------------------------------------------------------------------ */
    function startGame(mode) {
        clearTimers();
        state.lastMode = mode;
        setWorld(worldForMode(mode));
        renderLoading(mode === 'DAILY_10' ? 'Setting today’s ten' : 'Finding the line');
        var req = mode === 'DAILY_10' ? api.startDaily() : api.startSession(mode, state.category !== 'all' ? state.category : null, state.challengeCode);
        req.then(function (data) {
            state.challengeCode = null;
            state.session = data.session;
            state.question = data.question;
            state.results = null;
            setRoute('#game');
            api.track('game_start', { game_mode: mode, category: state.category, resumed: !!data.resumed });
            if (!data.question) return finishAndShowResults();
            renderGame();
        }).catch(function (err) {
            if (err.code === 'DAILY_ALREADY_PLAYED' && err.details && err.details.sessionId) {
                state.results = err.details.results;
                state.session = err.details.results.session;
                return renderResults(state.results, { daily: true });
            }
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
        var timer = s.gameMode === 'RAPID_FIRE' ? '<div class="liq-timer" aria-hidden="true"><div class="liq-timer__fill" id="liq-timer-fill"></div></div>' : '';
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
        state.timer = setInterval(function () {
            var left = deadline - Date.now();
            if (fill) {
                fill.style.transform = 'scaleX(' + Math.max(0, left / total) + ')';
                if (left < 10000) fill.classList.add('liq-timer__fill--urgent');
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
        }
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
        var kicker = opts.daily ? 'Daily 10 · ' + esc(s.dailyDateKey || '') : esc(copy.MODE_LABELS[s.gameMode] || 'Session') + (s.endReason === 'TIME_UP' ? ' · time' : '');
        var headline = opts.daily ? esc(s.correctCount) + '/' + esc(s.questionCount) : (s.gameMode === 'STREAK' ? 'Streak of ' + esc(s.bestStreak) : (s.gameMode === 'RAPID_FIRE' ? esc(s.correctCount) + ' in 60 seconds' : esc(s.correctCount) + '/' + esc(answered)));
        var genres = iq.subScores && iq.subScores.genres ? Object.keys(iq.subScores.genres) : [];
        var subHtml = '';
        if (genres.length) {
            subHtml = '<div class="liq-subscores">' + genres.map(function (g) { var sc = iq.subScores.genres[g]; return '<div class="liq-stat"><div class="liq-stat__v">' + esc(sc.value) + '</div><div class="liq-stat__k">' + esc(sc.label) + '</div></div>'; }).join('') + '</div>';
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
            '<div class="liq-result__actions">' +
            '<button class="liq-btn liq-btn--primary" data-action="replay" data-mode="' + esc(s.gameMode === 'DAILY_10' ? 'QUICK_PLAY' : s.gameMode) + '">' + (s.gameMode === 'DAILY_10' ? 'Play more' : 'Play again') + '</button>' +
            '<button class="liq-btn" data-action="share">Share result</button>' +
            (s.gameMode !== 'DAILY_10' && state.daily && state.daily.status !== 'COMPLETED' ? '<button class="liq-btn liq-btn--ghost" data-action="play" data-mode="DAILY_10">Daily 10</button>' : '') +
            '<a class="liq-btn liq-btn--ghost" href="#profile">Your profile</a>' +
            '</div>' +
            savePrompt +
            (breakdown ? '<div class="liq-section"><div class="liq-kicker">The run</div><ol class="liq-breakdown">' + breakdown + '</ol></div>' : '') +
            '</section>'
        );
        announce('Session complete. Lyric IQ ' + (value === null ? 'not yet scored' : value) + '. ' + headline);
    }

    function share() {
        var r = state.results;
        if (!r || !r.share) return;
        api.track('share_click', { game_mode: r.session.gameMode });
        var text = r.share.text;
        var url = location.origin + '/lyric-iq.html' + (r.share.url ? '?challenge=' + encodeURIComponent(r.session.id) : '');
        if (navigator.share) {
            navigator.share({ title: 'Wordeth Lyric IQ', text: text, url: url }).catch(function () {});
            return;
        }
        var payload = text + '\n' + url;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(payload).then(function () { toast('Copied. Go post it.'); }).catch(function () { toast('Could not copy.'); });
        } else {
            toast('Sharing is not available here.');
        }
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
            }
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
    function renderLeaderboard() {
        updateHeader('leaderboard');
        clearTimers();
        renderLoading('Checking the board');
        api.leaderboard(boardTab).then(function (b) {
            var labels = { daily: 'Daily', weekly: 'Weekly', 'all-time': 'All time' };
            var valueLabel = boardTab === 'all-time' ? 'Lyric IQ' : 'Score';
            var rows = b.entries.map(function (e) {
                return '<tr' + (e.isYou ? ' class="liq-me"' : '') + '><td class="num">' + esc(e.rank) + '</td><td>' + esc(e.displayName) + '</td><td class="num">' + esc(e.value) + '</td></tr>';
            }).join('');
            var me = '';
            if (b.me) me = '<p class="liq-muted">' + (b.me.ranked ? 'You are #' + esc(b.me.rank) + ' with ' + esc(b.me.value) + '.' : 'Your ' + valueLabel.toLowerCase() + ' of ' + esc(b.me.value) + ' is not ranked. <a href="/signup.html?return=' + encodeURIComponent('/lyric-iq.html#leaderboard') + '">Create an account</a> to get on the board.') + '</p>';
            render(
                '<section class="liq-section">' +
                '<div class="liq-kicker">Leaderboard · ' + esc(b.periodKey) + '</div>' +
                '<h1 class="liq-h2">' + esc(labels[boardTab]) + '</h1>' +
                '<div class="liq-tabs" role="tablist">' + ['daily', 'weekly', 'all-time'].map(function (t) { return '<button class="liq-chip" role="tab" aria-selected="' + (t === boardTab) + '" aria-pressed="' + (t === boardTab) + '" data-action="board" data-board="' + t + '">' + esc(labels[t]) + '</button>'; }).join('') + '</div>' +
                (rows ? '<table class="liq-table"><thead><tr><th class="num">#</th><th>Player</th><th class="num">' + valueLabel + '</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<p class="liq-empty">Nobody on the board yet. Be first.</p>') +
                me +
                '<div><button class="liq-btn liq-btn--primary" data-action="play" data-mode="' + (boardTab === 'daily' ? 'DAILY_10' : 'QUICK_PLAY') + '">' + (boardTab === 'daily' ? 'Play Daily 10' : 'Play') + '</button></div>' +
                '</section>'
            );
        }).catch(function (err) { renderError(err, 'leaderboard'); });
    }

    /* ------------------------------------------------------------------ */
    /* Routing + events                                                    */
    /* ------------------------------------------------------------------ */
    function route() {
        var hash = location.hash || '#play';
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
        if (hash === '#daily') return startGame('DAILY_10');
        if (hash === '#profile') return renderProfile();
        if (hash === '#leaderboard') return renderLeaderboard();
        renderEntry();
    }

    main.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var action = el.getAttribute('data-action');
        switch (action) {
            case 'play': e.preventDefault(); startGame(el.getAttribute('data-mode') || 'QUICK_PLAY'); break;
            case 'replay': e.preventDefault(); api.track('replay_click', { game_mode: el.getAttribute('data-mode') }); startGame(el.getAttribute('data-mode') || 'QUICK_PLAY'); break;
            case 'retry-start': e.preventDefault(); startGame(state.lastMode); break;
            case 'category': {
                state.category = el.getAttribute('data-category');
                var chips = main.querySelectorAll('.liq-chip[data-action="category"]');
                for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', String(chips[i] === el));
                break;
            }
            case 'choice': submit({ questionId: state.question.id, choiceIndex: parseInt(el.getAttribute('data-index'), 10) }); break;
            case 'advance': advance(); break;
            case 'quit': quitGame(); break;
            case 'share': share(); break;
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
    setWorld(params.get('world') || 'meadow');
    if (params.get('challenge')) state.challengeCode = params.get('challenge').slice(0, 64);
    if (params.get('mode') && /^[A-Z_]+$/.test(params.get('mode'))) state.lastMode = params.get('mode');

    api.claimIfNeeded().then(function (claimed) {
        if (claimed) { toast('Your guest history is saved to your account.'); api.track('registration_complete', {}); }
        if (params.get('mode') && !location.hash) return startGame(state.lastMode);
        route();
    });
})();
