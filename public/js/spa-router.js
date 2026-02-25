const SPA_PAGES = [
  '/', '/index.html', '/verses.html', '/lyrics.html', '/merch.html',
  '/pricing.html', '/subscription.html', '/profile.html',
  '/signin.html', '/signup.html', '/terms.html', '/privacy.html',
  '/creator-register.html', '/creator-dashboard.html',
  '/ad-admin.html', '/ad-docs.html', '/ad-register.html'
];

const EXCLUDED_PAGES = [
  '/partner-dashboard.html', '/partner-login.html', '/partner-upload.html',
  '/admin-ads.html', '/admin-usage.html', '/w-admin.html', '/privacy-admin.html'
];

const SHARED_STYLES = [
  'styles.css', 'enhanced.css', 'animations.css', 'cookie-consent.css',
  'mini-player.css', 'notifications.css', 'font-awesome', 'fonts.googleapis.com'
];

class SpaRouter {
  constructor() {
    this._currentPath = window.location.pathname;
    this._managedStyles = new Set();
    this._managedScripts = new Set();
    this._initialPageMarked = false;
    this._init();
  }

  _isUserInRoom() {
    const mgr = window.audioRoomsManager;
    return mgr && mgr.isInRoom && mgr.isInRoom();
  }

  _isSharedStyle(href) {
    if (!href) return false;
    return SHARED_STYLES.some(s => href.includes(s));
  }

  _markInitialPageStyles() {
    if (this._initialPageMarked) return;
    this._initialPageMarked = true;

    document.querySelectorAll('head link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!this._isSharedStyle(href)) {
        link.setAttribute('data-spa-page', 'true');
        this._managedStyles.add(link);
      }
    });

    document.querySelectorAll('head style').forEach(style => {
      style.setAttribute('data-spa-page', 'true');
      this._managedStyles.add(style);
    });
  }

  _init() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;
      if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#')) return;
      if (link.target === '_blank') return;
      if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;

      const path = href.startsWith('/') ? href : '/' + href;
      const cleanPath = path.split('?')[0].split('#')[0];

      if (EXCLUDED_PAGES.includes(cleanPath)) return;
      if (!this._isSpaPage(cleanPath)) return;

      e.preventDefault();
      if (this._isUserInRoom()) {
        if (!confirm('Leaving this page will disconnect you from the audio room. Continue?')) {
          return;
        }
      }
      this.navigate(path);
    });

    window.addEventListener('popstate', () => {
      this._loadPage(window.location.pathname + window.location.search, false);
    });
  }

  _isSpaPage(path) {
    const clean = path === '/' ? '/' : path.replace(/\/$/, '');
    return SPA_PAGES.includes(clean);
  }

  navigate(path) {
    if (path === this._currentPath) return;
    this._loadPage(path, true);
  }

  async _loadPage(path, pushState) {
    try {
      const mgr = window.audioRoomsManager;
      const leavingVerses = this._currentPath === '/verses.html' || this._currentPath === '/verses';
      const cleanTarget = path.split('?')[0].split('#')[0];
      const goingToVerses = cleanTarget === '/verses.html' || cleanTarget === '/verses';

      if (leavingVerses && mgr && mgr.isInRoom()) {
        mgr.detachFromDOM();
        const mp = window._verseMiniPlayer;
        if (mp && !mp.isActive()) {
          mp.activate(mgr.currentRoom, mgr.getRoomName());
        }
      }

      this._markInitialPageStyles();

      const resp = await fetch(path, { headers: { 'X-SPA-Request': '1' } });
      if (!resp.ok) {
        window.location.href = path;
        return;
      }
      const html = await resp.text();

      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const newMain = doc.querySelector('main');
      if (!newMain) {
        window.location.href = path;
        return;
      }

      const title = doc.querySelector('title')?.textContent || 'Wordeth';

      this._removePageStyles();

      const pageStyles = doc.querySelectorAll('link[rel="stylesheet"], style');
      this._loadPageStyles(pageStyles);

      this._managedScripts.forEach(el => el.remove());
      this._managedScripts.clear();

      const currentMain = document.querySelector('main');
      if (currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
        currentMain.className = newMain.className;
      }

      document.title = title;
      this._currentPath = cleanTarget;

      if (pushState) {
        window.history.pushState({}, title, path);
      }

      this._updateActiveNav();
      this._loadPageScripts(doc);
      this._reinitGlobals();

      if (goingToVerses && mgr && mgr._detached) {
        setTimeout(() => {
          mgr.reattachToDOM();
          const mp = window._verseMiniPlayer;
          if (mp && mp.isActive()) {
            mp.deactivate();
          }
        }, 100);
      }

      window.scrollTo(0, 0);
    } catch (err) {
      console.error('SPA navigation error:', err);
      window.location.href = path;
    }
  }

  _removePageStyles() {
    this._managedStyles.forEach(el => el.remove());
    this._managedStyles.clear();
  }

  _loadPageStyles(styleNodes) {
    const existingSharedHrefs = new Set();
    document.querySelectorAll('head link[rel="stylesheet"]').forEach(l => {
      existingSharedHrefs.add(l.href);
    });

    styleNodes.forEach(node => {
      if (node.tagName === 'LINK') {
        const href = node.getAttribute('href');
        if (!href) return;
        const fullHref = new URL(href, window.location.origin).href;
        if (this._isSharedStyle(href) && existingSharedHrefs.has(fullHref)) return;

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-spa-page', 'true');
        document.head.appendChild(link);
        this._managedStyles.add(link);
      } else if (node.tagName === 'STYLE') {
        const style = document.createElement('style');
        style.textContent = node.textContent;
        style.setAttribute('data-spa-page', 'true');
        document.head.appendChild(style);
        this._managedStyles.add(style);
      }
    });
  }

  _loadPageScripts(doc) {
    const skipScripts = ['config.js', 'main.js', 'nav-auth.js', 'cookie-consent.js',
      'socket.io.js', 'notifications.js', 'spa-router.js', 'verse-mini-player.js',
      'verses.js', 'ar-filters.js', 'native-screen-capture.js'];

    const scripts = doc.querySelectorAll('script[src]');
    scripts.forEach(s => {
      const src = s.getAttribute('src');
      if (!src) return;
      if (skipScripts.some(skip => src.includes(skip))) return;

      const existing = document.querySelector(`script[src*="${src.split('/').pop().split('?')[0]}"]`);
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.src = src + (src.includes('?') ? '&' : '?') + '_spa=' + Date.now();
      document.body.appendChild(script);
      this._managedScripts.add(script);
    });

    const inlineScripts = doc.querySelectorAll('script:not([src])');
    inlineScripts.forEach(s => {
      const text = s.textContent;
      if (!text.trim()) return;
      if (text.includes('DOMContentLoaded') && text.includes('AudioRoomsManager')) return;
      const script = document.createElement('script');
      script.textContent = text;
      document.body.appendChild(script);
      this._managedScripts.add(script);
    });
  }

  _updateActiveNav() {
    const activeLinks = document.querySelectorAll('.nav-links a, .mobile-menu-link');
    activeLinks.forEach(a => {
      a.classList.remove('active');
      const linkHref = (a.getAttribute('href') || '');
      const linkPath = linkHref.startsWith('/') ? linkHref : '/' + linkHref;
      const cleanLinkPath = linkPath.split('?')[0].split('#')[0];
      if (cleanLinkPath === this._currentPath ||
          (this._currentPath === '/' && cleanLinkPath === '/index.html') ||
          (this._currentPath === '/index.html' && cleanLinkPath === '/')) {
        a.classList.add('active');
      }
    });
  }

  _reinitGlobals() {
    const menuToggle = document.getElementById('menuToggle');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    if (menuToggle && mobileMenu) {
      menuToggle.onclick = () => mobileMenu.classList.add('active');
    }
    if (mobileMenuClose && mobileMenu) {
      mobileMenuClose.onclick = () => mobileMenu.classList.remove('active');
    }
  }
}

window._spaRouter = null;
document.addEventListener('DOMContentLoaded', () => {
  window._spaRouter = new SpaRouter();
});
