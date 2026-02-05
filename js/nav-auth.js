// Navigation Auth State Handler
// Shows Sign Out when logged in, Sign In when not

document.addEventListener('DOMContentLoaded', function() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        // User is logged in - update nav buttons to show Sign Out
        const desktopBtn = document.querySelector('.nav-signin-btn');
        const mobileBtn = document.querySelector('.mobile-signin-btn');
        
        if (desktopBtn) {
            desktopBtn.textContent = 'Sign Out';
            desktopBtn.href = '#';
            desktopBtn.addEventListener('click', handleSignOut);
        }
        
        if (mobileBtn) {
            // Mobile button has an icon, so update innerHTML carefully
            mobileBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i>';
            mobileBtn.href = '#';
            mobileBtn.title = 'Sign Out';
            mobileBtn.addEventListener('click', handleSignOut);
        }
    }
    
    function handleSignOut(e) {
        e.preventDefault();
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        window.location.href = '/';
    }
});
