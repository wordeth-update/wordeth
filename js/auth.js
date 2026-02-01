// Social login configurations
const socialConfig = {
    x: {
        clientId: 'YOUR_X_CLIENT_ID',
        redirectUri: `${window.location.origin}/auth/x/callback`
    },
    instagram: {
        clientId: 'YOUR_INSTAGRAM_CLIENT_ID',
        redirectUri: `${window.location.origin}/auth/instagram/callback`
    },
    facebook: {
        clientId: 'YOUR_FACEBOOK_CLIENT_ID',
        redirectUri: `${window.location.origin}/auth/facebook/callback`
    }
};

// DOM Elements
const signinForm = document.getElementById('signin-form');
const socialButtons = document.querySelectorAll('.social-auth-btn');

// Handle traditional sign in
signinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Store the token
            localStorage.setItem('authToken', data.token);
            // Redirect to profile page
            window.location.href = '/profile.html';
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showError(error.message);
    }
});

// Handle social login clicks
socialButtons.forEach(button => {
    button.addEventListener('click', () => {
        const provider = button.classList[1]; // 'x', 'instagram', or 'facebook'
        const config = socialConfig[provider];
        
        // Construct OAuth URL
        const oauthUrl = constructOAuthUrl(provider, config);
        
        // Open OAuth popup
        window.open(oauthUrl, 'OAuth', 'width=500,height=600');
    });
});

// Construct OAuth URL based on provider
function constructOAuthUrl(provider, config) {
    const baseUrls = {
        x: 'https://api.twitter.com/oauth/authorize',
        instagram: 'https://api.instagram.com/oauth/authorize',
        facebook: 'https://www.facebook.com/v12.0/dialog/oauth'
    };

    const url = new URL(baseUrls[provider]);
    url.searchParams.append('client_id', config.clientId);
    url.searchParams.append('redirect_uri', config.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', 'email profile');

    return url.toString();
}

// Handle OAuth callbacks
window.addEventListener('message', async (event) => {
    if (event.origin !== window.location.origin) return;

    try {
        const { code, provider } = event.data;
        
        const response = await fetch('/api/auth/social', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code, provider })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            window.location.href = '/profile.html';
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showError(error.message);
    }
});

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    signinForm.insertBefore(errorDiv, signinForm.firstChild);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Check if user is already authenticated
function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token && window.location.pathname === '/signin.html') {
        window.location.href = '/profile.html';
    }
}

// Run auth check on page load
checkAuth(); 