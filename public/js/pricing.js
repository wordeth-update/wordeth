(function() {
    const plansContainer = document.getElementById('plansContainer');
    const billingToggle = document.getElementById('billingToggle');
    const billingRow = document.getElementById('billingRow');
    const monthlyLabel = document.getElementById('monthlyLabel');
    const yearlyLabel = document.getElementById('yearlyLabel');
    const saveBadge = document.getElementById('saveBadge');
    const categoryLead = document.getElementById('categoryLead');
    const categoryTabs = document.querySelectorAll('.cat-tab');
    const payNote = document.getElementById('payNote');
    const closeBtn = document.getElementById('closeBtn');

    if (!plansContainer) return;

    let allPlans = [];
    let currentCategory = 'fan';
    // What the visitor asked for. A tab whose plans are not sold by the year shows monthly regardless.
    let wantsYearly = false;
    let currentUserPlan = null;
    const signedIn = !!localStorage.getItem('authToken');

    /*
     * The words for each kind of visitor.
     *
     * Each opens with a question in that person's own terms, then says
     * what the plans are for before any price is shown. The steps under
     * the cards describe only what the product does today: every figure in
     * them is one the server enforces.
     */
    /** One question per kind of visitor, in their own terms. */
    const AUDIENCES = {
        fan: { lead: 'Here to listen, or here to host?' },
        designer: { lead: 'Got designs a music fan would wear? Start free, move up when they sell.' },
        artist: { lead: 'What could your lyrics be doing between releases?', ask: 'Not sure which fits? Tell us about your music:' },
        label: { lead: 'How many artists are you carrying?', ask: 'Tell us about your roster and we will work it out with you:' }
    };

    /** What the two listener plans really do, said as what you get to do. */
    function customerPlanCopy(plan, cycle) {
        if (plan.slug === 'fan-free') {
            return {
                name: 'User',
                description: 'Listen, talk, open your own free rooms.',
                features: [
                    ['Every free room', ''],
                    ['Free rooms of your own', ''],
                    ['Lyric search and merch', ''],
                    ['One Wildcard', 'three free minutes in a paid room, after 8 active hours']
                ],
                button: signedIn ? 'Go to the rooms' : 'Join free',
                href: signedIn ? '/verses.html' : '/signup.html',
                flag: ''
            };
        }
        if (plan.slug === 'fan-plus') {
            return {
                name: 'User+',
                description: 'Rooms that charge at the door: theirs, and yours.',
                features: [
                    ['Go into paid rooms', ''],
                    ['Charge at your own door', 'the tokens people pay go to you'],
                    ['50 tokens with the plan', cycle === 'yearly' ? 'each year it renews' : 'every month it renews'],
                    ['Everything in User', '']
                ],
                aside: cycle === 'yearly' ? null : 'Bought as a pack, 50 tokens would be about $3.75. The plan is $3.99.',
                button: 'Get User+',
                flag: 'Paid rooms'
            };
        }
        return null;
    }

    init();

    async function init() {
        showPaymentReturn();
        await loadPlans();
        await loadUserSubscription();
        setupToggle();
        setupCategoryTabs();
        if (closeBtn && signedIn) { closeBtn.textContent = 'Find a room'; closeBtn.setAttribute('href', '/verses.html'); }
        render();
    }

    /** Back from Stripe: say what happened, once, and tidy the address. */
    function showPaymentReturn() {
        if (!payNote) return;
        const params = new URLSearchParams(window.location.search);
        const result = params.get('payment');
        if (!result) return;
        if (result === 'success') {
            payNote.className = 'pay-note pay-note-ok';
            payNote.textContent = 'Payment received, and thank you. Your plan switches on within a minute; if this page still shows the old one, refresh it.';
        } else if (result === 'canceled') {
            payNote.className = 'pay-note';
            payNote.textContent = 'No charge was made. The plans are here whenever you want them.';
        } else {
            return;
        }
        payNote.hidden = false;
        try { window.history.replaceState({}, '', window.location.pathname); } catch (e) { /* the note still shows */ }
    }

    async function loadPlans() {
        try {
            const res = await fetch(apiUrl('/api/subscriptions/plans'));
            if (!res.ok) throw new Error('Failed to load plans');
            const data = await res.json();
            allPlans = data.plans || [];
        } catch (err) {
            console.error('Error loading plans:', err);
            plansContainer.innerHTML = '<p class="plans-problem">The plans did not load. Check your connection and refresh; nothing on your account has changed.</p>';
        }
    }

    async function loadUserSubscription() {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        try {
            const res = await fetch(apiUrl('/api/subscriptions/my-subscription'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.plan) {
                    currentUserPlan = data.plan.slug;
                }
            }
        } catch (err) {
            console.error('Error loading user subscription:', err);
        }
    }

    /** A plan is sold by the year only when it has a yearly price of its own. Checkout uses the same rule. */
    function yearlyPrice(plan) {
        const y = Number(plan.priceYearly);
        return Number.isFinite(y) && y > 0 ? y : null;
    }

    function money(n) {
        return Number.isInteger(n) ? String(n) : n.toFixed(2);
    }

    function plansFor(category) {
        return allPlans.filter(p =>
            p.category === category &&
            !(category === 'fan' && p.slug === 'fan-creator')
        );
    }

    function setupToggle() {
        billingToggle.addEventListener('change', () => {
            wantsYearly = billingToggle.checked;
            render();
        });
    }

    function setupCategoryTabs() {
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                currentCategory = tab.dataset.category;
                render();
            });
        });
    }

    function render() {
        const audience = AUDIENCES[currentCategory] || AUDIENCES.fan;
        if (categoryLead) categoryLead.textContent = audience.lead;

        const filtered = plansFor(currentCategory);

        // Yearly is offered only where a plan is really sold that way, and the saving shown is the real one.
        const yearlyPlans = filtered.filter(pl => yearlyPrice(pl) && pl.priceMonthly > 0);
        const canYearly = yearlyPlans.length > 0;
        const cycle = canYearly && wantsYearly ? 'yearly' : 'monthly';
        if (billingRow) billingRow.hidden = !canYearly;
        monthlyLabel.classList.toggle('active', cycle === 'monthly');
        yearlyLabel.classList.toggle('active', cycle === 'yearly');
        if (canYearly) {
            const best = Math.max(...yearlyPlans.map(pl => pl.priceMonthly * 12 - yearlyPrice(pl)));
            saveBadge.textContent = best > 0 ? `$${money(Math.round(best * 100) / 100)} less a year` : '';
            saveBadge.classList.toggle('visible', best > 0);
        }

        if (allPlans.length === 0) return;   // the load failed and said so
        if (filtered.length === 0) {
            plansContainer.innerHTML = '<p class="plans-problem">No plans to show here yet.</p>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'pricing-grid';
        filtered.forEach(plan => grid.appendChild(createPlanCard(plan, cycle)));

        plansContainer.innerHTML = '';
        plansContainer.appendChild(grid);

        if (audience.ask) {
            const ask = document.createElement('p');
            ask.className = 'plans-ask';
            ask.innerHTML = `${escapeHtml(audience.ask)} <a href="mailto:partnerships@wordeth.com">partnerships@wordeth.com</a>`;
            plansContainer.appendChild(ask);
        }
    }

    function createPlanCard(plan, cycle) {
        const copy = customerPlanCopy(plan, cycle);
        const name = copy ? copy.name : plan.name;
        const description = copy ? copy.description : (plan.description || '');
        const flag = copy ? copy.flag : (plan.slug === 'designer-free' ? 'Start here' : '');
        const isCurrent = currentUserPlan === plan.slug;
        const isFree = !(plan.priceMonthly > 0) && !yearlyPrice(plan);
        const isContactSales = plan.isCustomPricing || (plan.category === 'label' && plan.maxArtists > 5);
        // A plan with no yearly price is shown, and sold, by the month even when yearly is switched on.
        const planCycle = cycle === 'yearly' && yearlyPrice(plan) ? 'yearly' : 'monthly';

        const card = document.createElement('div');
        card.className = 'price-card' + (flag ? ' featured' : '') + (isCurrent ? ' current-plan' : '');
        if (flag) card.dataset.flag = flag;

        let priceHTML;
        if (isFree) {
            priceHTML = `<span class="price-amount">Free</span>`;
        } else if (isContactSales) {
            priceHTML = `<span class="price-amount">Let's talk</span>`;
        } else if (planCycle === 'yearly') {
            const yearly = yearlyPrice(plan);
            const saved = Math.round((plan.priceMonthly * 12 - yearly) * 100) / 100;
            priceHTML = `<span class="price-amount">$${money(yearly)}</span><span class="price-period">/year</span>`
                + `<div class="price-yearly-note">About $${(yearly / 12).toFixed(2)} a month${saved > 0 ? `, $${money(saved)} less than twelve monthly payments` : ''}</div>`;
        } else {
            priceHTML = `<span class="price-amount">$${money(plan.priceMonthly)}</span><span class="price-period">/month</span>`;
        }

        const features = copy
            ? copy.features.map(([what, detail]) =>
                `<li><i class="fas fa-check"></i> <span><strong>${escapeHtml(what)}</strong>${detail ? ` <span class="feature-detail">${escapeHtml(detail)}</span>` : ''}</span></li>`).join('')
            : (plan.features || []).map(f => `<li><i class="fas fa-check"></i> <span>${escapeHtml(f)}</span></li>`).join('');

        let btnHTML;
        let reassure = '';
        if (isCurrent) {
            btnHTML = `<div class="card-btn btn-current">Your plan today</div>`;
        } else if (isContactSales) {
            btnHTML = `<a href="mailto:partnerships@wordeth.com?subject=${encodeURIComponent(name + ' plan for our label')}" class="card-btn btn-contact">Talk to us</a>`;
            reassure = '';
        } else if (isFree) {
            const href = copy ? copy.href : '/signup.html';
            const label = copy ? copy.button : (signedIn ? 'Start with ' + name : 'Start free');
            btnHTML = `<a href="${href}" class="card-btn btn-secondary">${escapeHtml(label)}</a>`;
            reassure = 'No card. No end date.';
        } else {
            const label = copy ? copy.button : 'Choose ' + name;
            btnHTML = `<button class="card-btn btn-primary" data-slug="${plan.slug}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
            reassure = 'Cancel any time.';
        }

        card.innerHTML = `
            <div class="card-header">
                <div class="card-plan-name">${escapeHtml(name)}</div>
                <div class="card-plan-desc">${escapeHtml(description)}</div>
            </div>
            <div class="card-price">${priceHTML}</div>
            <ul class="card-features">${features}</ul>
            ${copy && copy.aside ? `<p class="card-aside">${escapeHtml(copy.aside)}</p>` : ''}
            ${btnHTML}
            ${reassure ? `<p class="card-reassure">${escapeHtml(reassure)}</p>` : ''}
        `;

        const btn = card.querySelector('.btn-primary');
        if (btn) {
            btn.addEventListener('click', () => handleSubscribe(plan.slug, planCycle, btn));
        }

        return card;
    }

    async function handleSubscribe(planSlug, cycle, btn) {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/signin.html?redirect=' + encodeURIComponent('/pricing.html');
            return;
        }

        const label = btn ? btn.dataset.label : '';
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Opening secure checkout…';
        }

        try {
            const res = await fetch(apiUrl('/api/stripe/create-checkout-session'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ planSlug, billingCycle: cycle })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Checkout did not open');
            }

            if (!data.url) throw new Error('Secure checkout is unavailable');
            window.location.href = data.url;
        } catch (err) {
            showToast((err.message || 'Something went wrong.') + ' You have not been charged.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = label || 'Try again';
            }
        }
    }

    function showToast(message, type) {
        const existing = document.querySelector('.pricing-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'pricing-toast' + (type === 'success' ? ' pricing-toast-ok' : '');
        toast.setAttribute('role', 'alert');
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 6000);
    }
})();
