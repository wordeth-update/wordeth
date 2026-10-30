/**
 * The press: whether merch can be ordered right now.
 *
 * Printing goes live when the Apliiq order flow is wired and switched on;
 * until then the app shows the design studio with a "press opens soon"
 * tease instead of a dead Order button. One Railway setting flips it:
 * MERCH_ORDERING=on. No app build is needed to open the press.
 */
function isOpen() {
    return /^(1|true|on|yes)$/i.test(String(process.env.MERCH_ORDERING || ''));
}

module.exports = { isOpen };
