// DOM Elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const editAvatarBtn = document.querySelector('.edit-avatar');
const profilePicture = document.getElementById('profile-picture');
const userName = document.getElementById('user-name');
const userBio = document.getElementById('user-bio');

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/signin.html';
    }
    return token;
}

// Load user profile data
async function loadUserProfile() {
    const token = checkAuth();
    
    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            updateProfileUI(data);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showError(error.message);
    }
}

// Update profile UI with user data
function updateProfileUI(userData) {
    userName.textContent = userData.name;
    userBio.textContent = userData.bio;
    if (userData.avatar) {
        profilePicture.src = userData.avatar;
    }
}

// Handle tab switching
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        const tabName = button.dataset.tab;
        
        // Update active states
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.add('hidden'));
        
        button.classList.add('active');
        document.getElementById(tabName).classList.remove('hidden');
        
        // Load tab content
        loadTabContent(tabName);
    });
});

// Load content for each tab
async function loadTabContent(tabName) {
    const token = checkAuth();
    const container = document.getElementById(tabName);
    
    try {
        const response = await fetch(`/api/user/${tabName}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            switch(tabName) {
                case 'history':
                    renderHistory(data, container.querySelector('.history-list'));
                    break;
                case 'annotations':
                    renderAnnotations(data, container.querySelector('.annotations-list'));
                    break;
                case 'friends':
                    renderFriends(data, container.querySelector('.friends-list'));
                    break;
                case 'merch':
                    renderMerch(data, container.querySelector('.merch-grid'));
                    break;
            }
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showError(error.message);
    }
}

// Render functions for different content types
function renderHistory(data, container) {
    container.innerHTML = data.map(item => `
        <div class="history-item">
            <h3>${item.songTitle}</h3>
            <p>${item.artist}</p>
            <span class="timestamp">${new Date(item.timestamp).toLocaleDateString()}</span>
        </div>
    `).join('');
}

function renderAnnotations(data, container) {
    container.innerHTML = data.map(item => `
        <div class="annotation-item">
            <h3>${item.songTitle}</h3>
            <p class="annotation-text">${item.text}</p>
            <div class="annotation-meta">
                <span class="likes">${item.likes} likes</span>
                <span class="timestamp">${new Date(item.timestamp).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

function renderFriends(data, container) {
    container.innerHTML = data.map(friend => `
        <div class="friend-card">
            <div class="friend-avatar">
                <img src="${friend.avatar || 'assets/default-avatar.png'}" alt="${friend.name}">
            </div>
            <h3>${friend.name}</h3>
            <p>${friend.mutualSongs} mutual songs</p>
        </div>
    `).join('');
}

function renderMerch(data, container) {
    container.innerHTML = data.map(item => `
        <div class="merch-item">
            <img src="${item.image}" alt="${item.name}">
            <div class="merch-info">
                <h3>${item.name}</h3>
                <p>${item.type}</p>
                <span class="timestamp">Created on ${new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
        </div>
    `).join('');
}

// Handle profile picture upload
editAvatarBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);

        try {
            const token = checkAuth();
            const response = await fetch('/api/user/avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                profilePicture.src = data.avatarUrl;
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            showError(error.message);
        }
    };

    input.click();
});

// Show error message
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    document.querySelector('.profile-container').insertBefore(
        errorDiv,
        document.querySelector('.profile-header')
    );
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Initialize profile page
document.addEventListener('DOMContentLoaded', () => {
    loadUserProfile();
    // Load initial tab content (history)
    loadTabContent('history');
}); 