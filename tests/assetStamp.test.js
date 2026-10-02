/** Every local script and stylesheet gets the build's version; other hosts' files do not. */
const { stampAssets } = require('../services/assetStamp');

test('an unversioned local script or stylesheet is given the build version', () => {
    const out = stampAssets('<script src="js/utils.js"></script><link rel="stylesheet" href="css/ads.css">', 'b1');
    expect(out).toBe('<script src="js/utils.js?v=b1"></script><link rel="stylesheet" href="css/ads.css?v=b1">');
});

test('an existing version is replaced whole, letters included', () => {
    expect(stampAssets('<script src="js/ad-admin.js?v=20261002d"></script>', 'b1')).toBe('<script src="js/ad-admin.js?v=b1"></script>');
    expect(stampAssets('<script src="js/admin-usage.js?v=1790220429"></script>', 'b1')).toBe('<script src="js/admin-usage.js?v=b1"></script>');
});

test('files on other hosts are left alone', () => {
    const cdn = '<script src="https://cdnjs.cloudflare.com/x/lib.min.js"></script><link href="//fonts.example/x.css">';
    expect(stampAssets(cdn, 'b1')).toBe(cdn);
});

test('a page link or an image is not touched', () => {
    const html = '<a href="merch.html">Merch</a><img src="images/logo.png"><a href="/docs/app.js.html">x</a>';
    expect(stampAssets(html, 'b1')).toBe(html);
});

test('stamping twice changes nothing more', () => {
    const once = stampAssets('<script src="js/utils.js"></script>', 'b1');
    expect(stampAssets(once, 'b1')).toBe(once);
});
