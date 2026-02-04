// Navigation Auth State Handler
// Shows Sign Out when logged in, Sign In when not

(function() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    
    // Find all signin buttons in navigation
    const signinBtns = document.querySelectorAll('.nav-signin-btn, .mobile-signin-btn');
    
    if (token && user) {
        // User is logged in - show Sign Out
        signinBtns.forEach(btn => {
            btn.textContent = 'Sign Out';
            btn.href = '#';
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('authToken');
                localStorage.removeItem('user');
                window.location.href = '/';
            });
        });
    }
})();
