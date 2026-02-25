// Admin Advertising Platform JavaScript

class AdminAds {
    constructor() {
        this.selectedKeywords = [];
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadAds();
        this.loadAnalytics();
    }
    
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab.dataset.tab);
            });
        });
        
        // Targeting tags
        document.querySelectorAll('.targeting-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                this.toggleKeyword(tag);
            });
        });
        
        // Form submission
        document.getElementById('createAdForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createAd();
        });
        
        // Image upload
        this.setupImageUpload();
        
        // Load initial data
        this.loadInitialData();
    }
    
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');
        
        // Load data for specific tabs
        if (tabName === 'manage') {
            this.loadAds();
        } else if (tabName === 'analytics') {
            this.loadAnalytics();
        }
    }
    
    toggleKeyword(tag) {
        const keyword = tag.dataset.keyword;
        
        if (tag.classList.contains('selected')) {
            tag.classList.remove('selected');
            this.selectedKeywords = this.selectedKeywords.filter(k => k !== keyword);
        } else {
            tag.classList.add('selected');
            this.selectedKeywords.push(keyword);
        }
        
        // Update hidden input
        document.getElementById('targetingInput').value = this.selectedKeywords.join(',');
    }
    
    async createAd() {
        const form = document.getElementById('createAdForm');
        const formData = new FormData(form);
        
        // Get image URL from hidden input
        const imageUrl = document.getElementById('imageUrlInput').value;
        
        const adData = {
            type: formData.get('type'),
            category: formData.get('category'),
            title: formData.get('title'),
            description: formData.get('description'),
            image: imageUrl || 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80',
            link: formData.get('link'),
            cpm: parseFloat(formData.get('cpm')),
            targeting: this.selectedKeywords
        };
        
        try {
            const response = await fetch(apiUrl('/api/ads/admin/ad'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(adData)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.showNotification('Ad created successfully!', 'success');
                form.reset();
                this.selectedKeywords = [];
                document.querySelectorAll('.targeting-tag').forEach(tag => {
                    tag.classList.remove('selected');
                });
                document.getElementById('targetingInput').value = '';
                this.loadAds(); // Refresh ads list
            } else {
                throw new Error('Failed to create ad');
            }
        } catch (error) {
            console.error('Error creating ad:', error);
            this.showNotification('Failed to create ad. Please try again.', 'error');
        }
    }
    
    async loadAds() {
        try {
            const response = await fetch(apiUrl('/api/ads/inventory'));
            if (response.ok) {
                const inventory = await response.json();
                this.displayAds(inventory);
            }
        } catch (error) {
            console.error('Error loading ads:', error);
            this.showNotification('Failed to load ads.', 'error');
        }
    }
    
    displayAds(inventory) {
        const adsGrid = document.getElementById('adsGrid');
        const allAds = Object.values(inventory).flat();
        
        if (allAds.length === 0) {
            adsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                    <p style="color: rgba(255, 255, 255, 0.6);">No ads found. Create your first ad!</p>
                </div>
            `;
            return;
        }
        
        adsGrid.innerHTML = allAds.map(ad => `
            <div class="ad-card">
                <div class="ad-card-header">
                    <span class="ad-status ${ad.active ? 'active' : 'inactive'}">
                        ${ad.active ? 'Active' : 'Inactive'}
                    </span>
                    <div class="ad-actions">
                        <button class="btn btn-secondary btn-small" onclick="adminAds.toggleAdStatus('${ad.id}')">
                            ${ad.active ? 'Pause' : 'Activate'}
                        </button>
                        <button class="btn btn-secondary btn-small" onclick="adminAds.deleteAd('${ad.id}')">
                            Delete
                        </button>
                    </div>
                </div>
                
                <div class="ad-title">${ad.title}</div>
                <div class="ad-description">${ad.description}</div>
                
                <div class="ad-metrics">
                    <div class="metric">
                        <div class="metric-value">${ad.impressions}</div>
                        <div class="metric-label">Impressions</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${ad.clicks}</div>
                        <div class="metric-label">Clicks</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(2) : '0'}%</div>
                        <div class="metric-label">CTR</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">$${((ad.impressions / 1000) * ad.cpm).toFixed(2)}</div>
                        <div class="metric-label">Revenue</div>
                    </div>
                </div>
                
                <div style="font-size: 0.8rem; color: rgba(255, 255, 255, 0.6); margin-top: 1rem;">
                    <strong>Type:</strong> ${ad.type} | <strong>Category:</strong> ${ad.category} | <strong>CPM:</strong> $${ad.cpm}
                </div>
            </div>
        `).join('');
    }
    
    async toggleAdStatus(adId) {
        try {
            const response = await fetch(apiUrl(`/api/ads/admin/ad/${adId}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ active: false }) // Toggle logic would be on server
            });
            
            if (response.ok) {
                this.showNotification('Ad status updated!', 'success');
                this.loadAds(); // Refresh list
            } else {
                throw new Error('Failed to update ad status');
            }
        } catch (error) {
            console.error('Error updating ad status:', error);
            this.showNotification('Failed to update ad status.', 'error');
        }
    }
    
    async deleteAd(adId) {
        if (!confirm('Are you sure you want to delete this ad? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(apiUrl(`/api/ads/admin/ad/${adId}`), {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showNotification('Ad deleted successfully!', 'success');
                this.loadAds(); // Refresh list
            } else {
                throw new Error('Failed to delete ad');
            }
        } catch (error) {
            console.error('Error deleting ad:', error);
            this.showNotification('Failed to delete ad.', 'error');
        }
    }
    
    async loadAnalytics() {
        try {
            const response = await fetch(apiUrl('/api/ads/analytics'));
            if (response.ok) {
                const analytics = await response.json();
                this.displayAnalytics(analytics);
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            this.showNotification('Failed to load analytics.', 'error');
        }
    }
    
    displayAnalytics(analytics) {
        // Update summary cards
        document.getElementById('analyticsImpressions').textContent = analytics.totalImpressions.toLocaleString();
        document.getElementById('analyticsClicks').textContent = analytics.totalClicks.toLocaleString();
        document.getElementById('analyticsCTR').textContent = analytics.ctr + '%';
        
        const totalRevenue = Object.values(analytics.adPerformance).reduce((sum, ad) => sum + ad.revenue, 0);
        document.getElementById('analyticsRevenue').textContent = '$' + totalRevenue.toFixed(2);
        
        // Display individual ad performance
        const performanceGrid = document.getElementById('adPerformanceGrid');
        const ads = Object.entries(analytics.adPerformance);
        
        if (ads.length === 0) {
            performanceGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
                    <p style="color: rgba(255, 255, 255, 0.6);">No performance data available yet.</p>
                </div>
            `;
            return;
        }
        
        performanceGrid.innerHTML = ads.map(([adId, ad]) => `
            <div class="ad-card">
                <div class="ad-title">${ad.title}</div>
                <div class="ad-metrics">
                    <div class="metric">
                        <div class="metric-value">${ad.impressions.toLocaleString()}</div>
                        <div class="metric-label">Impressions</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${ad.clicks.toLocaleString()}</div>
                        <div class="metric-label">Clicks</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${ad.ctr}%</div>
                        <div class="metric-label">CTR</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">$${ad.revenue.toFixed(2)}</div>
                        <div class="metric-label">Revenue</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    setupImageUpload() {
        const uploadArea = document.getElementById('imageUploadArea');
        const imageInput = document.getElementById('imageInput');
        const imagePreview = document.getElementById('imagePreview');
        const imageUrlInput = document.getElementById('imageUrlInput');
        
        // Click to upload
        uploadArea.addEventListener('click', () => {
            imageInput.click();
        });
        
        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleImageFile(files[0]);
            }
        });
        
        // File input change
        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleImageFile(e.target.files[0]);
            }
        });
    }
    
    handleImageFile(file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            this.showNotification('Please select a valid image file.', 'error');
            return;
        }
        
        // Validate file size (5MB limit)
        if (file.size > 5 * 1024 * 1024) {
            this.showNotification('Image size must be less than 5MB.', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const imagePreview = document.getElementById('imagePreview');
            const imageUrlInput = document.getElementById('imageUrlInput');
            
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
            imageUrlInput.value = e.target.result;
            
            this.showNotification('Image uploaded successfully!', 'success');
        };
        
        reader.readAsDataURL(file);
    }
    
    loadInitialData() {
        this.loadAds();
        this.loadAnalytics();
        this.updateHeaderStats();
    }
    
    updateHeaderStats() {
        // Update header stats with current data
        const totalAds = document.querySelectorAll('.ad-card').length;
        document.getElementById('totalAds').textContent = totalAds;
        
        // These would be updated with real data from analytics
        document.getElementById('totalImpressions').textContent = '1,234';
        document.getElementById('totalClicks').textContent = '89';
        document.getElementById('totalRevenue').textContent = '$45.67';
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }
}

// Initialize admin ads
const adminAds = new AdminAds();

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
