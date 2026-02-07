(function() {
  const CONSENT_KEY = 'wordeth_cookie_consent';
  const CONSENT_VERSION = '1';

  function getConsent() {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      if (parsed.version !== CONSENT_VERSION) return null;
      return parsed;
    } catch { return null; }
  }

  function setConsent(accepted) {
    const consent = {
      accepted: accepted,
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    window.dispatchEvent(new CustomEvent('cookieConsentChanged', { detail: consent }));
  }

  function hasConsented() {
    const consent = getConsent();
    return consent && consent.accepted === true;
  }

  function showBanner() {
    if (getConsent() !== null) return;

    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    const inner = document.createElement('div');
    inner.className = 'cookie-consent-inner';

    const text = document.createElement('p');
    text.className = 'cookie-consent-text';
    text.textContent = 'We use cookies and similar technologies to improve your experience, analyze usage, and personalize content. By continuing, you agree to our use of cookies. See our ';

    const privacyLink = document.createElement('a');
    privacyLink.href = '/privacy.html';
    privacyLink.textContent = 'Privacy Policy';
    text.appendChild(privacyLink);

    const andText = document.createTextNode(' and ');
    text.appendChild(andText);

    const termsLink = document.createElement('a');
    termsLink.href = '/terms.html';
    termsLink.textContent = 'Terms of Service';
    text.appendChild(termsLink);

    const period = document.createTextNode('.');
    text.appendChild(period);

    const buttons = document.createElement('div');
    buttons.className = 'cookie-consent-buttons';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'cookie-consent-accept';
    acceptBtn.textContent = 'Accept All';
    acceptBtn.addEventListener('click', function() {
      setConsent(true);
      banner.classList.add('cookie-consent-hidden');
      setTimeout(function() { banner.remove(); }, 400);
    });

    const declineBtn = document.createElement('button');
    declineBtn.className = 'cookie-consent-decline';
    declineBtn.textContent = 'Essential Only';
    declineBtn.addEventListener('click', function() {
      setConsent(false);
      banner.classList.add('cookie-consent-hidden');
      setTimeout(function() { banner.remove(); }, 400);
    });

    buttons.appendChild(acceptBtn);
    buttons.appendChild(declineBtn);
    inner.appendChild(text);
    inner.appendChild(buttons);
    banner.appendChild(inner);
    document.body.appendChild(banner);

    requestAnimationFrame(function() {
      banner.classList.add('cookie-consent-visible');
    });
  }

  window.WordethConsent = {
    hasConsented: hasConsented,
    getConsent: getConsent,
    showBanner: showBanner,
    revokeConsent: function() {
      localStorage.removeItem(CONSENT_KEY);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();
