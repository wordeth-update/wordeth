/**
 * Homepage scroll story controller.
 *
 * Two independent pieces:
 *  1. Beat reveals — IntersectionObserver toggling .in-view per .story-beat.
 *     Chosen over GSAP ScrollTrigger because this is just "toggle a class
 *     at a scroll position," which is the cheapest tool that works (see
 *     /animate guidelines, tool-selection step). CSS transitions do the
 *     actual animating (css/homepage-story.css).
 *  2. The Verses capability strip — same pointer-event drag + detent-tick
 *     pattern as the real Verses room hallway (js/verses.js), reused
 *     deliberately so it's one motion grammar across the site, not a
 *     second implementation of the same idea.
 *
 * Same SPA-navigation constraint as hero-animation.js: spa-router.js swaps
 * <main>'s innerHTML on client-side nav without reloading or re-running
 * scripts, so this lives outside <main> and re-initializes via a
 * MutationObserver whenever the homepage's beats reappear.
 *
 * Native scrolling is never touched — no pinning, no scrubbing, no wheel
 * interception. Every beat is real, present-in-the-DOM content; this only
 * adds a class at the right scroll position.
 */
(function () {
    'use strict';

    // The SPA router may execute this file again when navigating back home.
    // Keep one document-lifetime controller so observers and drag listeners
    // cannot multiply across route changes.
    if (window.__wordethStoryControllerInitialized) {
        if (typeof window.__wordethStoryControllerRefresh === 'function') {
            window.__wordethStoryControllerRefresh();
        }
        return;
    }
    window.__wordethStoryControllerInitialized = true;

    let cleanups = [];

    function teardown() {
        cleanups.forEach(fn => { try { fn(); } catch (e) {} });
        cleanups = [];
    }

    function initBeatReveals() {
        const beats = document.querySelectorAll('.story-beat');
        if (!beats.length) return;

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // CSS handles final-state directly

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                    observer.unobserve(entry.target); // reveal is one-way; no re-hide on scroll back up
                }
            });
        }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });

        beats.forEach(beat => observer.observe(beat));
        cleanups.push(() => observer.disconnect());
    }

    function initCapabilityDrag() {
        const track = document.getElementById('capabilityTrack');
        if (!track) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // native overflow-x + scroll-snap fallback stays

        const getCards = () => Array.from(track.querySelectorAll('.capability-card'));
        if (getCards().length < 2) return;

        const nearestCardIndex = (scrollLeft) => {
            const cards = getCards();
            let best = 0, bestDist = Infinity;
            cards.forEach((c, i) => {
                const d = Math.abs(c.offsetLeft - scrollLeft);
                if (d < bestDist) { bestDist = d; best = i; }
            });
            return best;
        };

        const tick = (index, strong) => {
            const card = getCards()[index];
            if (!card) return;
            const scale = strong ? 0.97 : 0.985;
            card.animate(
                [
                    { transform: 'scale(1)' },
                    { transform: `scale(${scale})` },
                    { transform: 'scale(1)' }
                ],
                { duration: 160, easing: 'ease-out' }
            );
            if ('vibrate' in navigator) navigator.vibrate(strong ? 12 : 6);
        };

        let lastIndex = nearestCardIndex(track.scrollLeft);
        let isDown = false, activePointerId = null, startX = 0, startScroll = 0;

        const onPointerDown = (e) => {
            // Touch keeps the browser's reliable native horizontal scrolling.
            if (e.pointerType === 'touch') return;
            isDown = true;
            activePointerId = e.pointerId;
            startX = e.clientX;
            startScroll = track.scrollLeft;
            track.style.cursor = 'grabbing';
            lastIndex = nearestCardIndex(track.scrollLeft);
            const hint = document.getElementById('capabilityDragHint');
            if (hint) hint.classList.add('faded');
        };
        const onPointerMove = (e) => {
            if (!isDown || e.pointerId !== activePointerId) return;
            track.scrollLeft = startScroll - (e.clientX - startX);
            const idx = nearestCardIndex(track.scrollLeft);
            if (idx !== lastIndex) { tick(idx, false); lastIndex = idx; }
        };
        const onPointerUp = (e) => {
            if (!isDown || e.pointerId !== activePointerId) return;
            isDown = false;
            activePointerId = null;
            track.style.cursor = 'grab';
            const idx = nearestCardIndex(track.scrollLeft);
            const target = getCards()[idx];
            if (!target) return;
            track.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
            window.setTimeout(() => tick(idx, true), 300);
        };

        const onPointerCancel = (e) => {
            if (!isDown || e.pointerId !== activePointerId) return;
            isDown = false;
            activePointerId = null;
            track.style.cursor = 'grab';
        };

        track.style.cursor = 'grab';
        track.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerCancel);

        cleanups.push(() => {
            track.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerCancel);
        });
    }

    function boot() {
        if (!document.querySelector('.story-beat')) return; // not on the homepage (or beats not in DOM yet)
        teardown();
        initBeatReveals();
        initCapabilityDrag();
    }

    window.__wordethStoryControllerRefresh = boot;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    const main = document.querySelector('main');
    if (main && typeof MutationObserver !== 'undefined') {
        const routeObserver = new MutationObserver(() => {
            const onHomepage = !!document.querySelector('.story-beat');
            if (onHomepage && cleanups.length === 0) {
                boot();
            } else if (!onHomepage && cleanups.length > 0) {
                teardown(); // navigated away — release the window-level drag listeners
            }
        });
        routeObserver.observe(main, {childList: true});
    }
})();
