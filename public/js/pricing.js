(function() {
    const plansContainer = document.getElementById('plansContainer');
    const billingToggle = document.getElementById('billingToggle');
    const billingRow = document.getElementById('billingRow');
    const monthlyLabel = document.getElementById('monthlyLabel');
    const yearlyLabel = document.getElementById('yearlyLabel');
    const saveBadge = document.getElementById('saveBadge');
    const categoryDesc = document.getElementById('categoryDescription');
    const categoryLead = document.getElementById('categoryLead');
    const categoryTabs = document.querySelectorAll('.cat-tab');
    const stepsSection = document.getElementById('pricingSteps');
    const stepsTitle = document.getElementById('stepsTitle');
    const stepsList = document.getElementById('stepsList');
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
    const AUDIENCES = {
        fan: {
            lead: 'Here to listen, or here to host?',
            text: 'Listening is free. User+ is for the rooms that charge at the door: yours, or somebody else\'s.',
            stepsTitle: 'How most people come to User+',
            steps: [
                ['Walk in free', 'Join, find a room, raise a hand, take the stage. Open a free room of your own whenever you like.'],
                ['Look before you pay', 'After 8 active hours you earn a Wildcard: three free minutes inside one paid room, so you know what is behind the door.'],
                ['Go User+ when it is worth it', 'The day there is a paid room you want to be in, or one you want to run, it is $3.99 and you are through.']
            ]
        },
        designer: {
            lead: 'Got designs a music fan would wear?',
            text: 'Put them where the fans already are. Start on Explore for nothing, and move up only once your work is selling.',
            stepsTitle: 'How a designer starts',
            steps: [
                ['Start on Explore, free', 'Up to 5 templates in the marketplace, with your name on every one.'],
                ['Sell', 'Explore earns on the standard revenue share, with no monthly fee while you find out what sells.'],
                ['Move up when it is working', 'After $100 in earnings, 10 sales or 3 active months, pick the paid plan that fits what you have built.']
            ]
        },
        artist: {
            lead: 'What could your lyrics be doing between releases?',
            text: 'An official home on Wordeth for your words and your merch, with the tools to see what your listeners respond to.',
            ask: 'Not sure which one fits where you are? Tell us about your music and we will say which we would pick.'
        },
        label: {
            lead: 'How many artists are you carrying?',
            text: 'One dashboard for the roster: who is selling, what is earning, and where to put the next push.',
            ask: 'A label rarely fits a box. Tell us about your roster and we will work out the plan with you.'
        }
    };

    /** What the two listener plans really do, said as what you get to do. */
    function customerPlanCopy(plan, cycle) {
        if (plan.slug === 'fan-free') {
            return {
                name: 'User',
                description: 'For listening, talking and opening rooms of your own. Free, with no end date.',
                features: [
                    ['Every free room', 'listen, chat, raise a hand, take the stage'],
                    ['Your own free rooms', 'open one whenever you have something to say'],
                    ['Lyric search and merch', 'find the words, then wear them'],
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
                description: 'For the rooms that charge at the door: going into them, and running your own.',
                features: [
                    ['Go into paid rooms', 'each room shows its token price before you enter'],
                    ['Charge at your own door', 'open a paid room, set its price, and the tokens people pay go to you'],
                    ['50 tokens with the plan', cycle === 'yearly'
                        ? 'added when you join and at each yearly renewal'
                        : 'added when you join and every month it renews'],
                    ['Everything in User', 'nothing is taken away']
                ],
                // The same 50 tokens cost $3.49 as a pack: said plainly, so the price is weighed against something real.
                aside: cycle === 'yearly'
                    ? 'Monthly adds the 50 tokens every month; yearly adds them once a year and costs less in dollars.'
                    : 'Bought on their own, 50 tokens are $3.49. The plan is $3.99.',
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
        const p = categoryDesc.querySelector('p');
        if (p) p.textContent = audience.text;

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

        renderSteps(audience);

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

    function renderSteps(audience) {
        if (!stepsSection) return;
        if (!audience.steps) { stepsSection.hidden = true; return; }
        stepsTitle.textContent = audience.stepsTitle;
        stepsList.innerHTML = audience.steps.map(([title, text]) =>
            `<li><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></li>`
        ).join('');
        stepsSection.hidden = false;
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
                `<li><i class="fas fa-check"></i> <span><strong>${escapeHtml(what)}</strong> <span class="feature-detail">${escapeHtml(detail)}</span></span></li>`).join('')
            : (plan.features || []).map(f => `<li><i class="fas fa-check"></i> <span>${escapeHtml(f)}</span></li>`).join('');

        let btnHTML;
        let reassure = '';
        if (isCurrent) {
            btnHTML = `<div class="card-btn btn-current">Your plan today</div>`;
        } else if (isContactSales) {
            btnHTML = `<a href="mailto:partnerships@wordeth.com?subject=${encodeURIComponent(name + ' plan for our label')}" class="card-btn btn-contact">Talk to us</a>`;
            reassure = 'A conversation, not a contract.';
        } else if (isFree) {
            const href = copy ? copy.href : '/signup.html';
            const label = copy ? copy.button : (signedIn ? 'Start with ' + name : 'Start free');
            btnHTML = `<a href="${href}" class="card-btn btn-secondary">${escapeHtml(label)}</a>`;
            reassure = 'No card. No end date.';
        } else {
            const label = copy ? copy.button : 'Choose ' + name;
            btnHTML = `<button class="card-btn btn-primary" data-slug="${plan.slug}" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
            reassure = 'Cancel whenever you like. You keep it until the period you paid for ends.';
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
