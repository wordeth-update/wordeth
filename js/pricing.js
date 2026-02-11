document.addEventListener('DOMContentLoaded', () => {
    const plansContainer = document.getElementById('plansContainer');
    const billingToggle = document.getElementById('billingToggle');
    const monthlyLabel = document.getElementById('monthlyLabel');
    const yearlyLabel = document.getElementById('yearlyLabel');
    const saveBadge = document.getElementById('saveBadge');
    const categoryDesc = document.getElementById('categoryDescription');
    const categoryTabs = document.querySelectorAll('.cat-tab');

    let allPlans = [];
    let currentCategory = 'fan';
    let billingCycle = 'monthly';
    let currentUserPlan = null;

    const categoryDescriptions = {
        fan: 'Enjoy music, discover lyrics, and connect with your favorite artists.',
        designer: 'Design and sell custom music merch. Start free and grow your brand.',
        artist: 'Tools for independent artists to build, promote, and earn.',
        label: 'Enterprise tools for labels managing rosters, analytics, and revenue.'
    };

    const featuredSlugs = ['fan-plus', 'designer-growth', 'artist-growth', 'label-mid-tier'];

    init();

    async function init() {
        await loadPlans();
        await loadUserSubscription();
        setupToggle();
        setupCategoryTabs();
        renderPlans();
    }

    async function loadPlans() {
        try {
            const res = await fetch(apiUrl('/api/subscriptions/plans'));
            if (!res.ok) throw new Error('Failed to load plans');
            const data = await res.json();
            allPlans = data.plans || [];
        } catch (err) {
            console.error('Error loading plans:', err);
            plansContainer.innerHTML = '<p style="color:#fca5a5;text-align:center;">Failed to load plans. Please try again later.</p>';
        }
    }

    async function loadUserSubscription() {
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
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

    function setupToggle() {
        monthlyLabel.classList.add('active');

        billingToggle.addEventListener('change', () => {
            billingCycle = billingToggle.checked ? 'yearly' : 'monthly';
            monthlyLabel.classList.toggle('active', !billingToggle.checked);
            yearlyLabel.classList.toggle('active', billingToggle.checked);
            saveBadge.classList.toggle('visible', billingToggle.checked);
            renderPlans();
        });
    }

    function setupCategoryTabs() {
        categoryTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                categoryTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentCategory = tab.dataset.category;
                categoryDesc.querySelector('p').textContent = categoryDescriptions[currentCategory] || '';
                renderPlans();
            });
        });
    }

    function renderPlans() {
        const filtered = allPlans.filter(p => p.category === currentCategory);

        if (filtered.length === 0) {
            plansContainer.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:2rem;">No plans available for this category.</p>';
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'pricing-grid';

        filtered.forEach(plan => {
            const card = createPlanCard(plan);
            grid.appendChild(card);
        });

        plansContainer.innerHTML = '';
        plansContainer.appendChild(grid);
    }

    function createPlanCard(plan) {
        const isFeatured = featuredSlugs.includes(plan.slug);
        const isCurrent = currentUserPlan === plan.slug;
        const price = billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
        const isFree = plan.priceMonthly === 0 && plan.priceYearly === 0;
        const isContactSales = plan.isCustomPricing || (plan.category === 'label' && plan.maxArtists > 5);

        const card = document.createElement('div');
        card.className = 'price-card' + (isFeatured ? ' featured' : '') + (isCurrent ? ' current-plan' : '');

        let priceHTML;
        if (isFree) {
            priceHTML = `<span class="price-amount">Free</span>`;
        } else if (isContactSales) {
            priceHTML = `<span class="price-amount">Custom</span>`;
        } else {
            const displayPrice = billingCycle === 'yearly' ? Math.round(price / 12) : price;
            priceHTML = `<span class="price-amount">$${displayPrice}</span><span class="price-period">/${billingCycle === 'yearly' ? 'mo' : 'mo'}</span>`;
            if (billingCycle === 'yearly' && price > 0) {
                priceHTML += `<div class="price-yearly-note">$${price} billed yearly</div>`;
            }
        }

        const features = (plan.features || []).map(f =>
            `<li><i class="fas fa-check"></i> ${escapeHtml(f)}</li>`
        ).join('');

        let btnHTML;
        if (isCurrent) {
            btnHTML = `<div class="card-btn btn-current">Current Plan</div>`;
        } else if (isContactSales) {
            btnHTML = `<a href="mailto:partnerships@wordeth.com" class="card-btn btn-contact">Contact Sales</a>`;
        } else if (isFree) {
            btnHTML = `<a href="/signup.html" class="card-btn btn-secondary">Get Started Free</a>`;
        } else {
            btnHTML = `<button class="card-btn btn-primary" data-slug="${plan.slug}" data-cycle="${billingCycle}">Choose Plan</button>`;
        }

        card.innerHTML = `
            <div class="card-header">
                <div class="card-plan-name">${escapeHtml(plan.name)}</div>
                <div class="card-plan-desc">${escapeHtml(plan.description || '')}</div>
            </div>
            <div class="card-price">${priceHTML}</div>
            <ul class="card-features">${features}</ul>
            ${btnHTML}
        `;

        const btn = card.querySelector('.btn-primary');
        if (btn) {
            btn.addEventListener('click', () => handleSubscribe(plan.slug, billingCycle));
        }

        return card;
    }

    async function handleSubscribe(planSlug, cycle) {
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
        if (!token) {
            window.location.href = '/signin.html?redirect=' + encodeURIComponent('/pricing.html');
            return;
        }

        const btn = document.querySelector(`[data-slug="${planSlug}"]`);
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Processing...';
        }

        try {
            const res = await fetch(apiUrl('/api/subscriptions/subscribe'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ planSlug, billingCycle: cycle })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Subscription failed');
            }

            currentUserPlan = planSlug;
            renderPlans();
            showToast('Subscription activated! Welcome to your new plan.', 'success');

            setTimeout(() => {
                window.location.href = '/subscription.html';
            }, 1500);
        } catch (err) {
            showToast(err.message || 'Something went wrong. Please try again.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Choose Plan';
            }
        }
    }

    function showToast(message, type) {
        const existing = document.querySelector('.pricing-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'pricing-toast';
        toast.style.cssText = `
            position: fixed; bottom: 2rem; left: 50%; transform: translateX(-50%);
            padding: 0.8rem 1.5rem; border-radius: 12px; font-size: 0.9rem;
            font-family: 'Inter', sans-serif; z-index: 9999; animation: toastIn 0.3s ease;
            ${type === 'success'
                ? 'background: rgba(150, 197, 176, 0.15); border: 1px solid rgba(150, 197, 176, 0.3); color: #96C5B0;'
                : 'background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5;'
            }
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
});
