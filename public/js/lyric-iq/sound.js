/* Wordeth Lyric IQ — sound. Taps, right/wrong, the Wordeth sound logo, and a lo-fi bed behind play.
   Everything is optional: no AudioContext, no permission, or the player's mute → silence, never an error.

   Phones only play audio that was started inside a tap. So the first tap on the
   page starts (and instantly pauses) every media element we will ever use; from
   then on those same elements may be played from timers and network callbacks.
   iOS ignores element volume, so the files themselves are mixed at the right level. */
(function () {
    'use strict';

    var KEY = 'liq_sound';               // 'off' when the player muted us
    var BEDS = ['audio/lyric-iq/bed-1.m4a', 'audio/lyric-iq/bed-2.m4a'];
    var LOGO = 'audio/lyric-iq/logo.m4a';
    var BED_VOLUME = 0.55;                // honoured where volume is adjustable; the files are already quiet
    var LOGO_VOLUME = 0.8;

    var ctx = null;
    var muted = false;
    try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { /* storage blocked */ }
    var beds = [];                        // one element per bed, reused for the whole visit
    var logoEl = null;
    var bed = null;                       // the element playing now
    var bedIndex = -1;
    var unlocked = false;                 // a real tap has happened and the elements are primed
    var wantBed = true;                   // music is the page's ambience: on from the first moment we are allowed
    var OWNER_KEY = 'liq_bed_owner';      // which tab is playing the bed, so two tabs never play it together
    var tabId = String(Date.now()) + Math.random().toString(36).slice(2, 8);
    var ownerTimer = null;

    function ownerRead() { try { return JSON.parse(localStorage.getItem(OWNER_KEY) || 'null'); } catch (e) { return null; } }
    function ownerFresh(o) { return !!(o && o.id !== tabId && Date.now() - o.t < 3500); }
    function ownerClaim() {
        try { localStorage.setItem(OWNER_KEY, JSON.stringify({ id: tabId, t: Date.now() })); } catch (e) {}
        if (!ownerTimer) ownerTimer = setInterval(function () { if (bed && !bed.paused) { try { localStorage.setItem(OWNER_KEY, JSON.stringify({ id: tabId, t: Date.now() })); } catch (e) {} } }, 1000);
    }
    function ownerRelease() {
        if (ownerTimer) { clearInterval(ownerTimer); ownerTimer = null; }
        var o = ownerRead();
        if (o && o.id === tabId) { try { localStorage.removeItem(OWNER_KEY); } catch (e) {} }
    }

    function make(src, vol) {
        var el = new Audio(src);
        el.preload = 'auto';
        el.setAttribute('playsinline', '');
        try { el.volume = vol; } catch (e) { /* iOS */ }
        return el;
    }
    function elements() {
        if (!beds.length) {
            beds = BEDS.map(function (src, i) {
                var el = make(src, BED_VOLUME);
                el.addEventListener('ended', function () { if (bed === el) startBed((i + 1) % BEDS.length); });
                return el;
            });
        }
        if (!logoEl) logoEl = make(LOGO, LOGO_VOLUME);
        return beds.concat([logoEl]);
    }

    function context() {
        if (ctx) return ctx;
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        } catch (e) { ctx = null; }
        return ctx;
    }

    /* Short synthesized tones: no files, no latency. (Follows the phone's silent switch, as games do.) */
    function tone(spec) {
        if (muted) return;
        var c = context();
        if (!c) return;
        try {
            if (c.state === 'suspended') c.resume();
            var now = c.currentTime;
            var notes = spec.notes || [spec];
            notes.forEach(function (n) {
                var start = now + (n.at || 0);
                var osc = c.createOscillator();
                var gain = c.createGain();
                osc.type = n.type || 'sine';
                osc.frequency.setValueAtTime(n.freq, start);
                if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, start + n.dur);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(n.vol || 0.12, start + 0.006);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
                osc.connect(gain); gain.connect(c.destination);
                osc.start(start); osc.stop(start + n.dur + 0.02);
            });
        } catch (e) { /* never break play over a blip */ }
    }

    var SFX = {
        tap:     { freq: 1400, to: 900, dur: 0.05, type: 'triangle', vol: 0.06 },
        select:  { freq: 660, to: 990, dur: 0.09, type: 'triangle', vol: 0.08 },
        correct: { notes: [{ freq: 784, dur: 0.12, vol: 0.10 }, { freq: 1175, dur: 0.22, vol: 0.10, at: 0.09 }] },
        wrong:   { notes: [{ freq: 220, to: 140, dur: 0.22, type: 'sawtooth', vol: 0.05 }] },
        streak:  { notes: [{ freq: 784, dur: 0.1, vol: 0.09 }, { freq: 988, dur: 0.1, vol: 0.09, at: 0.08 }, { freq: 1319, dur: 0.28, vol: 0.1, at: 0.16 }] },
        tick:    { freq: 1000, dur: 0.03, type: 'square', vol: 0.025 }
    };

    function startBed(i) {
        wantBed = true;
        if (muted || !unlocked) return;
        if (i === undefined) i = bedIndex < 0 ? 0 : bedIndex;
        var el = elements()[i];
        if (bed === el && !el.paused) return;
        if (ownerFresh(ownerRead())) return;          // another tab of ours has the music
        stopBed(true);
        bedIndex = i;
        bed = el;
        try { el.currentTime = 0; } catch (e) {}
        try { el.volume = BED_VOLUME; } catch (e) {}
        var p = el.play();
        if (p && p.then) p.then(ownerClaim, function () { if (bed === el) bed = null; }); else ownerClaim();
    }

    function stopBed(quick) {
        wantBed = wantBed && quick === 'keep';
        var el = bed; bed = null;
        ownerRelease();
        if (!el) return;
        if (quick === true) { try { el.pause(); } catch (e) {} return; }
        // Fade over ~600ms where volume is adjustable, then pause.
        var steps = 12, n = 0, v = el.volume;
        var t = setInterval(function () {
            n++;
            try { el.volume = Math.max(0, v * (1 - n / steps)); } catch (e) {}
            if (n >= steps) { clearInterval(t); try { el.pause(); } catch (e) {} }
        }, 50);
    }

    function duck(on) {
        if (!bed) return;
        try { bed.volume = on ? BED_VOLUME * 0.35 : BED_VOLUME; } catch (e) {}
    }

    function logo() {
        if (muted || !unlocked) return;
        var el = elements()[BEDS.length];
        try {
            el.muted = false;
            el.volume = LOGO_VOLUME;
            el.currentTime = 0;
            duck(true);
            el.onended = function () { duck(false); };
            var p = el.play();
            if (p && p.catch) p.catch(function () { duck(false); });
        } catch (e) { duck(false); }
    }

    function setMuted(next) {
        muted = !!next;
        try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) {}
        if (muted) {
            stopBed('keep');
            if (logoEl) { try { logoEl.pause(); } catch (e) {} }
        } else if (unlocked && wantBed) {
            startBed();
        }
        return muted;
    }

    /* The priming tap: start and pause every element, muted, inside the gesture. */
    function unlock() {
        if (unlocked) return;
        unlocked = true;
        var c = context();
        if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
        elements().forEach(function (el) {
            if (!el.paused) return;                    // already playing (the load got it): leave it be
            try {
                el.muted = true;
                var p = el.play();
                var settle = function () { try { el.pause(); el.currentTime = 0; } catch (e) {} el.muted = false; };
                if (p && p.then) p.then(settle, function () { el.muted = false; }); else settle();
            } catch (e) { el.muted = false; }
        });
        // Music picks up on this very tap.
        if (wantBed && !muted) setTimeout(function () { startBed(); }, 150);
    }
    ['touchend', 'click', 'keydown'].forEach(function (ev) {
        document.addEventListener(ev, unlock, { capture: true, passive: true });
    });

    /* From the load, where the browser lets us (it does for a site the visitor has
       played before); everywhere else the first tap picks it up. */
    function tryAmbient() {
        if (muted || !wantBed || unlocked || ownerFresh(ownerRead())) return;
        var el = elements()[0];
        try { el.currentTime = 0; } catch (e) {}
        var p = el.play();
        if (p && p.then) {
            p.then(function () { unlocked = true; bed = el; bedIndex = 0; ownerClaim(); }, function () { /* waits for the tap */ });
        }
    }
    // Another tab took the music, or let it go.
    window.addEventListener('storage', function (e) {
        if (e.key !== OWNER_KEY) return;
        var o = ownerRead();
        if (ownerFresh(o) && bed && !bed.paused) { stopBed(true); return; }
        if (ownerFresh(o)) return;
        if (unlocked) { if (wantBed && !muted && !(bed && !bed.paused)) startBed(); }
        else tryAmbient();                         // the other tab let go before we ever had a tap
    });
    window.addEventListener('pagehide', function () { if (bed && !bed.paused) ownerRelease(); });
    if (document.readyState === 'complete') tryAmbient();
    else window.addEventListener('load', tryAmbient);
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;
        if (unlocked && wantBed && !muted && !(bed && !bed.paused)) startBed();
    });

    window.LiqSound = {
        play: function (name) { var s = SFX[name]; if (s) tone(s); },
        bed: function (on) { if (on) startBed(); else stopBed(false); },
        logo: logo,
        duck: duck,
        isMuted: function () { return muted; },
        setMuted: setMuted,
        toggle: function () { return setMuted(!muted); },
        wantsBed: null,                   // set by the app: () => true while a round is on screen
        state: function () { return { unlocked: unlocked, muted: muted, bedIndex: bedIndex, bedPlaying: !!(bed && !bed.paused), logoPlaying: !!(logoEl && !logoEl.paused && !logoEl.ended), wantBed: wantBed }; }
    };
})();
