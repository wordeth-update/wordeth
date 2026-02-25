document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('user');
    const desktopBtn = document.querySelector('.nav-signin-btn');
    const mobileBtn = document.querySelector('.mobile-signin-btn');

    if (token && userStr) {
        verifyToken(token).then(valid => {
            if (valid) {
                showLoggedInState();
            } else {
                clearAuth();
            }
        });
    }

    function showLoggedInState() {
        let user;
        try { user = JSON.parse(localStorage.getItem('user')); } catch (e) { user = {}; }

        if (desktopBtn) {
            desktopBtn.textContent = 'Profile';
            desktopBtn.href = '/profile.html';

            if (!desktopBtn.parentNode.querySelector('.nav-signout-btn')) {
                const subLink = document.createElement('a');
                subLink.textContent = 'My Plan';
                subLink.href = '/subscription.html';
                subLink.className = 'nav-sub-btn';
                subLink.style.cssText = 'color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; margin-left: 0.75rem;';
                desktopBtn.parentNode.appendChild(subLink);

                const signoutLink = document.createElement('a');
                signoutLink.textContent = 'Sign Out';
                signoutLink.href = '#';
                signoutLink.className = 'nav-signout-btn';
                signoutLink.style.cssText = 'color: rgba(255,255,255,0.6); text-decoration: none; font-size: 0.85rem; margin-left: 0.75rem; cursor: pointer;';
                signoutLink.addEventListener('click', handleSignOut);
                desktopBtn.parentNode.appendChild(signoutLink);
            }
        }

        if (mobileBtn) {
            mobileBtn.innerHTML = '<i class="fas fa-user"></i>';
            mobileBtn.href = '/profile.html';
            mobileBtn.title = 'Profile';
        }

        const mobileAuthSection = document.querySelector('.mobile-menu-auth');
        if (mobileAuthSection) {
            mobileAuthSection.replaceChildren();
            const profileLink = document.createElement('a');
            profileLink.href = '/profile.html';
            profileLink.className = 'mobile-signin-btn mobile-profile-link';
            const profileIcon = document.createElement('i');
            profileIcon.className = 'fas fa-user';
            const profileSpan = document.createElement('span');
            profileSpan.textContent = 'My Profile';
            profileLink.append(profileIcon, profileSpan);

            const subLink = document.createElement('a');
            subLink.href = '/subscription.html';
            subLink.className = 'mobile-sub-link';
            subLink.textContent = 'My Plan';

            const signoutLink = document.createElement('a');
            signoutLink.href = '#';
            signoutLink.className = 'mobile-signout-link';
            signoutLink.textContent = 'Sign Out';
            signoutLink.addEventListener('click', handleSignOut);

            mobileAuthSection.append(profileLink, subLink, signoutLink);
        }
    }

    async function verifyToken(t) {
        try {
            const res = await fetch(apiUrl('/api/auth/verify'), {
                headers: { 'Authorization': `Bearer ${t}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.user) {
                    const existing = JSON.parse(localStorage.getItem('user') || '{}');
                    localStorage.setItem('user', JSON.stringify({
                        ...existing,
                        _id: data.user._id || existing._id,
                        name: data.user.name,
                        email: data.user.email,
                        avatar: data.user.avatar
                    }));
                }
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    function clearAuth() {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
    }

    function handleSignOut(e) {
        e.preventDefault();
        clearAuth();
        window.location.href = '/';
    }
});
