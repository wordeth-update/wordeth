/* Wordeth Lyric IQ — sound. Taps, right/wrong, the Wordeth sound logo, and a lo-fi bed behind play.
   Everything is optional: no AudioContext, no permission, or the player's mute → silence, never an error. */
(function () {
    'use strict';

    var KEY = 'liq_sound';               // 'off' when the player muted us
    var BEDS = ['audio/lyric-iq/bed-1.m4a', 'audio/lyric-iq/bed-2.m4a'];
    var LOGO = 'audio/lyric-iq/logo.m4a';
    var BED_VOLUME = 0.55;                // the files are already quiet and band-limited
    var LOGO_VOLUME = 0.8;

    var ctx = null;
    var muted = false;
    try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) { /* storage blocked */ }
    var bed = null;                       // the <audio> playing now
    var bedIndex = -1;
    var unlocked = false;                 // a user gesture has happened
    var logoEl = null;

    function context() {
        if (ctx) return ctx;
        try {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (AC) ctx = new AC();
        } catch (e) { ctx = null; }
        return ctx;
    }

    /* Short synthesized tones: no files, no latency. */
    function tone(spec) {
        if (muted) return;
        var c = context();
        if (!c) return;
        try {
            if (c.state === 'suspended') c.resume();
            var now = c.currentTime;
            var notes = spec.notes || [spec];
            notes.forEach(function (n, i) {
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

    function makeBed(i) {
        var el = new Audio(BEDS[i]);
        el.preload = 'auto';
        el.volume = BED_VOLUME;
        el.addEventListener('ended', function () { if (bed === el) startBed((i + 1) % BEDS.length); });
        return el;
    }

    function startBed(i) {
        if (muted || !unlocked) return;
        if (bed && bedIndex === i && !bed.paused) return;
        stopBed(true);
        bedIndex = i === undefined ? (bedIndex + 1) % BEDS.length : i;
        bed = makeBed(bedIndex);
        var p = bed.play();
        if (p && p.catch) p.catch(function () { bed = null; });
    }

    function stopBed(quick) {
        var el = bed; bed = null;
        if (!el) return;
        if (quick) { try { el.pause(); } catch (e) {} return; }
        // Fade out over ~600ms, then release.
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
        try {
            if (!logoEl) { logoEl = new Audio(LOGO); logoEl.preload = 'auto'; }
            logoEl.volume = LOGO_VOLUME;
            logoEl.currentTime = 0;
            duck(true);
            logoEl.onended = function () { duck(false); };
            var p = logoEl.play();
            if (p && p.catch) p.catch(function () { duck(false); });
        } catch (e) { duck(false); }
    }

    function setMuted(next) {
        muted = !!next;
        try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) {}
        if (muted) { stopBed(true); if (logoEl) { try { logoEl.pause(); } catch (e) {} } }
        else if (unlocked && window.LiqSound.wantsBed && window.LiqSound.wantsBed()) startBed(bedIndex < 0 ? 0 : bedIndex);
        return muted;
    }

    /* Browsers only play after a gesture: the first tap anywhere unlocks, and warms the files. */
    function unlock() {
        if (unlocked) return;
        unlocked = true;
        var c = context();
        if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
        try { new Audio(LOGO).preload = 'auto'; new Audio(BEDS[0]).preload = 'auto'; } catch (e) {}
    }
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true, passive: true });

    window.LiqSound = {
        play: function (name) { var s = SFX[name]; if (s) tone(s); },
        bed: function (on) { if (on) startBed(bedIndex < 0 ? 0 : bedIndex); else stopBed(false); },
        logo: logo,
        duck: duck,
        isMuted: function () { return muted; },
        setMuted: setMuted,
        toggle: function () { return setMuted(!muted); },
        wantsBed: null,                   // set by the app: () => true while a round is on screen
        state: function () { return { unlocked: unlocked, muted: muted, bedIndex: bedIndex, bedPlaying: !!(bed && !bed.paused), logoPlaying: !!(logoEl && !logoEl.paused && !logoEl.ended) }; }
    };
})();
