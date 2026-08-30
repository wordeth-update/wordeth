/**
 * Homepage hero enhancement — kinetic headline reveal + a subtle living
 * particle network behind the existing aurora background.
 *
 * This page uses spa-router.js, which swaps `<main>`'s innerHTML on client-side
 * navigation without reloading the document or re-running scripts. Since this
 * file is loaded outside <main> (same as main.js/config.js), it only executes
 * once per real page load — so a MutationObserver watches for `.hero-minimal`
 * re-appearing after an SPA navigation back to the homepage, and re-initializes.
 *
 * Fully additive: the hero is already a complete, readable static page via its
 * existing CSS (see .hero-minimal in styles.css). This only layers motion on
 * top and cleans itself up if the user navigates away mid-animation.
 */
(function () {
    'use strict';

    // The SPA router may load this file again when returning home. Reuse the
    // existing document-lifetime controller instead of creating another
    // MutationObserver and another set of listeners.
    if (window.__wordethHeroControllerInitialized) {
        if (typeof window.__wordethHeroControllerRefresh === 'function') {
            window.__wordethHeroControllerRefresh();
        }
        return;
    }
    window.__wordethHeroControllerInitialized = true;

    let activeCleanup = null;

    function initHomeHero() {
        const hero = document.querySelector('.hero-minimal');
        if (!hero || hero.dataset.heroEnhanced === '1') return;
        hero.dataset.heroEnhanced = '1';

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const cleanups = [];

        // ---- Kinetic headline reveal ----
        const h1 = hero.querySelector('h1');
        if (h1) {
            const originalText = h1.textContent;
            h1.setAttribute('aria-label', originalText); // keep one accessible, unsplit name
            const words = originalText.split(' ');
            h1.innerHTML = words
                .map(w => `<span class="hero-word" aria-hidden="true" style="display:inline-block;overflow:hidden;"><span style="display:inline-block;">${w}</span></span>`)
                .join(' ');
            const inner = h1.querySelectorAll('.hero-word > span');
            if (reduced) {
                inner.forEach(el => {
                    el.style.transform = 'translateY(0)';
                    el.style.opacity = '1';
                });
            } else {
                inner.forEach((el, index) => {
                    el.animate(
                        [
                            { transform: 'translateY(110%)', opacity: 0 },
                            { transform: 'translateY(0)', opacity: 1 }
                        ],
                        {
                            duration: 900,
                            delay: 150 + (index * 60),
                            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                            fill: 'both'
                        }
                    );
                });
            }
        }

        // ---- Living particle network (skipped entirely under reduced motion —
        // the existing CSS aurora shimmer already provides a calm, complete look) ----
        if (!reduced && typeof window.requestAnimationFrame === 'function') {
            const bg = hero.querySelector('.hero-minimal-bg');
            if (bg) {
                const canvas = document.createElement('canvas');
                canvas.className = 'hero-particle-canvas';
                canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.55;';
                bg.appendChild(canvas);
                const ctx = canvas.getContext('2d');
                let w, h, dpr, particles = [], raf, running = true;

                function resize() {
                    dpr = Math.min(window.devicePixelRatio || 1, 2);
                    w = hero.clientWidth; h = hero.clientHeight;
                    canvas.width = w * dpr; canvas.height = h * dpr;
                    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    const count = Math.min(45, Math.round((w * h) / 28000)); // deliberately light for a marketing page
                    particles = Array.from({length: count}, () => ({
                        x: Math.random() * w, y: Math.random() * h,
                        vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
                        r: Math.random() * 1.4 + 0.5
                    }));
                }

                function draw() {
                    // Stop entirely once the hero leaves the DOM (SPA navigation away) —
                    // otherwise this rAF loop would keep running forever on other pages.
                    if (!document.body.contains(hero)) { running = false; return; }
                    ctx.clearRect(0, 0, w, h);
                    for (const p of particles) {
                        p.x += p.vx; p.y += p.vy;
                        if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
                        if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
                    }
                    for (let i = 0; i < particles.length; i++) {
                        for (let j = i + 1; j < particles.length; j++) {
                            const a = particles[i], b = particles[j];
                            const dx = a.x - b.x, dy = a.y - b.y, dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < 110) {
                                ctx.strokeStyle = `rgba(0,229,168,${(1 - dist / 110) * 0.12})`;
                                ctx.lineWidth = 1;
                                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                            }
                        }
                    }
                    for (const p of particles) {
                        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
                    }
                    if (running) raf = requestAnimationFrame(draw);
                }

                function onVisibility() {
                    if (document.hidden) { running = false; cancelAnimationFrame(raf); }
                    else if (document.body.contains(hero)) { running = true; raf = requestAnimationFrame(draw); }
                }

                resize();
                raf = requestAnimationFrame(draw);
                window.addEventListener('resize', resize);
                document.addEventListener('visibilitychange', onVisibility);

                cleanups.push(() => {
                    running = false;
                    cancelAnimationFrame(raf);
                    window.removeEventListener('resize', resize);
                    document.removeEventListener('visibilitychange', onVisibility);
                    canvas.remove();
                });
            }
        }

        activeCleanup = () => { cleanups.forEach(fn => fn()); activeCleanup = null; };
    }

    function boot() {
        if (activeCleanup) { activeCleanup(); }
        initHomeHero();
    }

    window.__wordethHeroControllerRefresh = boot;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Re-run whenever spa-router.js swaps <main>'s content back to the homepage.
    const main = document.querySelector('main');
    if (main && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            const hero = document.querySelector('.hero-minimal');
            if (hero && hero.dataset.heroEnhanced !== '1') {
                if (activeCleanup) activeCleanup();
                initHomeHero();
            } else if (!hero && activeCleanup) {
                activeCleanup();
            }
        });
        observer.observe(main, {childList: true});
    }
})();
