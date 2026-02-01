import './styles/ads.css';
import KnewCleusAds from './KnewCleusAds';

// Auto-initialize if script is loaded directly
if (typeof window !== 'undefined') {
    window.KnewCleusAds = KnewCleusAds;
    
    // Auto-initialize with default config if no manual init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!window.knewCleusAds) {
                window.knewCleusAds = new KnewCleusAds();
                window.knewCleusAds.init();
            }
        });
    } else {
        if (!window.knewCleusAds) {
            window.knewCleusAds = new KnewCleusAds();
            window.knewCleusAds.init();
        }
    }
}

// Export for module systems
export default KnewCleusAds;
