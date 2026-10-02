function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.escapeHtml = escapeHtml;


/*
 * Buttons and fallbacks without code written into attributes.
 *
 * The site's security policy sends script-src-attr 'none': anything written
 * as onclick="…" or onerror="…" is never run. A control wired that way is
 * drawn, and dead. These listeners do the same jobs from
 * attributes that only NAME what should happen:
 *
 *   data-call="name"        runs an action a page has registered under that
 *                           name, with data-arg="x" or data-args='["x", 1]'.
 *                           Only registered names run: markup cannot reach
 *                           a function a page did not put on the list.
 *   data-fallback-src="…"   an image that fails to load shows this instead
 *                           (data-fallback-class adds a class as it does).
 *   data-fallback="hide"    … or is hidden; "hide-grandparent" hides the
 *                           unit it sits in; "message" and "file-icon"
 *                           replace it with a line of text or an icon.
 */
(function () {
    var actions = Object.create(null);
    window.WordethActions = {
        register: function (map) {
            for (var name in map) {
                if (Object.prototype.hasOwnProperty.call(map, name) && typeof map[name] === 'function') actions[name] = map[name];
            }
        }
    };

    document.addEventListener('click', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-call]') : null;
        if (!el) return;
        var fn = actions[el.getAttribute('data-call')];
        if (!fn) return;
        // A link used as a button must not also follow its href.
        if (el.tagName === 'A') e.preventDefault();
        var args = [];
        if (el.hasAttribute('data-args')) {
            try { args = JSON.parse(el.getAttribute('data-args')); } catch (err) { return; }
            if (!Array.isArray(args)) args = [args];
        } else if (el.hasAttribute('data-arg')) {
            args = [el.getAttribute('data-arg')];
        }
        fn.apply(el, args);
    });

    function fallBack(img) {
        if (!img || img.tagName !== 'IMG' || img.getAttribute('data-fell-back')) return;
        var src = img.getAttribute('data-fallback-src');
        var how = img.getAttribute('data-fallback');
        if (!src && !how) return;
        img.setAttribute('data-fell-back', '1');
        if (src) {
            var extra = img.getAttribute('data-fallback-class');
            if (extra) img.classList.add(extra);
            img.src = src;
        } else if (how === 'hide') {
            img.style.display = 'none';
        } else if (how === 'hide-grandparent') {
            if (img.parentElement && img.parentElement.parentElement) img.parentElement.parentElement.classList.add('hidden');
        } else if (how === 'message' && img.parentElement) {
            var p = document.createElement('p');
            p.textContent = 'Failed to load image';
            img.parentElement.replaceChildren(p);
        } else if (how === 'file-icon' && img.parentElement) {
            var i = document.createElement('i');
            i.className = 'fas fa-file-image';
            img.parentElement.replaceChildren(i);
        }
    }
    // A load error does not bubble; it is caught on the way down instead.
    document.addEventListener('error', function (e) { fallBack(e.target); }, true);
    // Pictures that failed before this script was running.
    document.addEventListener('DOMContentLoaded', function () {
        var imgs = document.querySelectorAll('img[data-fallback-src], img[data-fallback]');
        for (var n = 0; n < imgs.length; n++) {
            if (imgs[n].complete && imgs[n].naturalWidth === 0) fallBack(imgs[n]);
        }
    });
})();
