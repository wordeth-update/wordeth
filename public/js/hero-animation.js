(function () {
    'use strict';

    let activeCleanup = null;

    function initHomeHero() {
        const hero = document.querySelector('.hero-minimal');
        if (!hero || hero.dataset.heroEnhanced === '1') return;
        hero.dataset.heroEnhanced = '1';

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const cleanups = [];
        const heading = hero.querySelector('h1');

        if (heading && typeof gsap !== 'undefined') {
            const originalText = heading.textContent;
            heading.setAttribute('aria-label', originalText);
            heading.replaceChildren(...originalText.split(' ').flatMap((word, index, words) => {
                const outer = document.createElement('span');
                const inner = document.createElement('span');
                outer.className = 'hero-word';
                outer.setAttribute('aria-hidden', 'true');
                outer.style.cssText = 'display:inline-block;overflow:hidden;';
                inner.style.display = 'inline-block';
                inner.textContent = word;
                outer.appendChild(inner);
                return index < words.length - 1 ? [outer, document.createTextNode(' ')] : [outer];
            }));
            const innerWords = heading.querySelectorAll('.hero-word > span');
            if (reduced) {
                gsap.set(innerWords, { yPercent: 0, opacity: 1 });
            } else {
                gsap.set(innerWords, { yPercent: 110, opacity: 0 });
                gsap.to(innerWords, {
                    yPercent: 0,
                    opacity: 1,
                    duration: 0.9,
                    ease: 'power3.out',
                    stagger: 0.06,
                    delay: 0.15
                });
            }
        }

        if (!reduced && typeof window.requestAnimationFrame === 'function') {
            const background = hero.querySelector('.hero-minimal-bg');
            if (background) {
                const canvas = document.createElement('canvas');
                canvas.className = 'hero-particle-canvas';
                canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0.55;';
                background.appendChild(canvas);
                const context = canvas.getContext('2d');
                let width;
                let height;
                let particles = [];
                let animationFrame;
                let running = true;

                function resize() {
                    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
                    width = hero.clientWidth;
                    height = hero.clientHeight;
                    canvas.width = width * pixelRatio;
                    canvas.height = height * pixelRatio;
                    canvas.style.width = `${width}px`;
                    canvas.style.height = `${height}px`;
                    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
                    const count = Math.min(45, Math.round((width * height) / 28000));
                    particles = Array.from({ length: count }, () => ({
                        x: Math.random() * width,
                        y: Math.random() * height,
                        vx: (Math.random() - 0.5) * 0.12,
                        vy: (Math.random() - 0.5) * 0.12,
                        radius: Math.random() * 1.4 + 0.5
                    }));
                }

                function draw() {
                    if (!document.body.contains(hero)) {
                        running = false;
                        return;
                    }
                    context.clearRect(0, 0, width, height);
                    particles.forEach((particle) => {
                        particle.x += particle.vx;
                        particle.y += particle.vy;
                        if (particle.x < 0) particle.x = width;
                        if (particle.x > width) particle.x = 0;
                        if (particle.y < 0) particle.y = height;
                        if (particle.y > height) particle.y = 0;
                    });
                    for (let i = 0; i < particles.length; i += 1) {
                        for (let j = i + 1; j < particles.length; j += 1) {
                            const first = particles[i];
                            const second = particles[j];
                            const dx = first.x - second.x;
                            const dy = first.y - second.y;
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance < 110) {
                                context.strokeStyle = `rgba(0,229,168,${(1 - distance / 110) * 0.12})`;
                                context.lineWidth = 1;
                                context.beginPath();
                                context.moveTo(first.x, first.y);
                                context.lineTo(second.x, second.y);
                                context.stroke();
                            }
                        }
                    }
                    particles.forEach((particle) => {
                        context.beginPath();
                        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
                        context.fillStyle = 'rgba(255,255,255,0.3)';
                        context.fill();
                    });
                    if (running) animationFrame = requestAnimationFrame(draw);
                }

                function onVisibilityChange() {
                    if (document.hidden) {
                        running = false;
                        cancelAnimationFrame(animationFrame);
                    } else if (document.body.contains(hero)) {
                        running = true;
                        animationFrame = requestAnimationFrame(draw);
                    }
                }

                resize();
                animationFrame = requestAnimationFrame(draw);
                window.addEventListener('resize', resize);
                document.addEventListener('visibilitychange', onVisibilityChange);
                cleanups.push(() => {
                    running = false;
                    cancelAnimationFrame(animationFrame);
                    window.removeEventListener('resize', resize);
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                    canvas.remove();
                });
            }
        }

        activeCleanup = () => {
            cleanups.forEach((cleanup) => cleanup());
            activeCleanup = null;
        };
    }

    function boot() {
        if (activeCleanup) activeCleanup();
        initHomeHero();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    const main = document.querySelector('main');
    if (main && typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
            const hero = document.querySelector('.hero-minimal');
            if (hero && hero.dataset.heroEnhanced !== '1') {
                if (activeCleanup) activeCleanup();
                initHomeHero();
            }
        });
        observer.observe(main, { childList: true });
    }
})();