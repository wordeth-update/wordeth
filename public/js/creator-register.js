document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('authToken');
    if (token) {
        const userData = localStorage.getItem('user');
        if (userData) {
            const user = JSON.parse(userData);
            if (user.accountType === 'artist' || user.accountType === 'designer') {
                window.location.href = '/creator-dashboard.html';
                return;
            }
        }
    }

    const typeCards = document.querySelectorAll('.type-card');
    const formTitle = document.getElementById('formTitle');
    const genreChips = document.querySelectorAll('.genre-chip');
    const form = document.getElementById('creatorRegisterForm');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = document.getElementById('submitBtn');

    let selectedType = 'artist';
    let selectedGenres = [];

    typeCards.forEach(card => {
        card.addEventListener('click', () => {
            typeCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedType = card.dataset.type;
            formTitle.textContent = selectedType === 'artist' ? 'Register as Artist' : 'Register as Designer';
        });
    });

    genreChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const genre = chip.dataset.genre;
            if (chip.classList.contains('selected')) {
                chip.classList.remove('selected');
                selectedGenres = selectedGenres.filter(g => g !== genre);
            } else if (selectedGenres.length < 3) {
                chip.classList.add('selected');
                selectedGenres.push(genre);
            }
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.style.display = 'none';

        const displayName = document.getElementById('displayName').value.trim();
        const name = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const agreeTerms = document.getElementById('agreeTerms').checked;

        if (!displayName || !name || !email || !password) {
            showError('Please fill in all fields');
            return;
        }

        if (!agreeTerms) {
            showError('You must agree to the Terms of Service');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating Account...';

        try {
            const response = await fetch('/api/creator/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    email,
                    password,
                    accountType: selectedType,
                    displayName,
                    genres: selectedGenres,
                    agreedToTerms: agreeTerms
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.errors?.[0]?.msg || 'Registration failed');
            }

            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = '/creator-dashboard.html';
        } catch (err) {
            showError(err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-rocket"></i> Create My Account';
        }
    });

    function showError(msg) {
        errorMessage.textContent = msg;
        errorMessage.style.display = 'block';
    }
});
