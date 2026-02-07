// DOM Elements
const signinForm = document.getElementById('signin-form');
const signupForm = document.getElementById('signup-form');
const socialButtons = document.querySelectorAll('.social-auth-btn');

// Handle sign in
if (signinForm) {
    signinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const submitBtn = signinForm.querySelector('.submit-btn');
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

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
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = '/';
            } else {
                throw new Error(data.message || 'Sign in failed');
            }
        } catch (error) {
            showError(error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    });
}

// Handle sign up
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        const agreeTerms = document.getElementById('agree-terms');
        const submitBtn = signupForm.querySelector('.submit-btn');
        
        if (password !== confirmPassword) {
            showError('Passwords do not match');
            return;
        }

        if (agreeTerms && !agreeTerms.checked) {
            showError('You must agree to the Terms of Service and Privacy Policy');
            return;
        }
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            const response = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password, agreedToTerms: true })
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = '/';
            } else {
                throw new Error(data.message || data.errors?.[0]?.msg || 'Sign up failed');
            }
        } catch (error) {
            showError(error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    });
}

// Handle social login clicks (disabled until OAuth is configured)
socialButtons.forEach(button => {
    button.addEventListener('click', () => {
        showError('Social login coming soon! Please use email sign in for now.');
    });
});

// Show error message
function showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) existingError.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const form = signinForm || signupForm;
    if (form) {
        form.insertBefore(errorDiv, form.firstChild);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    } else {
        alert(message);
    }
}

// Check if user is already authenticated
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const path = window.location.pathname;
    if (token && (path === '/signin.html' || path === '/signup.html')) {
        window.location.href = '/';
    }
}

// Run auth check on page load
checkAuth(); 