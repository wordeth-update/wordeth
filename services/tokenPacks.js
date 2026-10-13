'use strict';

/**
 * The token packs, in one place.
 *
 * The website, the phone apps and Stripe checkout all read this table.
 * Website prices are what Stripe charges. In the app the price is whatever
 * the store shows for the product id, set in App Store Connect and Play
 * Console; the server never trusts a price the phone reports, only the
 * product id in a signed receipt.
 *
 * Price per token falls as the pack grows, so the fan who commits more
 * gets more, while the company's share never drops below about a fifth
 * of face even after a 30% store fee.
 */
const TOKEN_PACKS = [
    { id: 'pack_25',  tokens: 25,  priceCents: 199,  storeProductId: 'com.wordeth.app.tokens.25' },
    { id: 'pack_60',  tokens: 60,  priceCents: 449,  storeProductId: 'com.wordeth.app.tokens.60' },
    { id: 'pack_140', tokens: 140, priceCents: 999,  storeProductId: 'com.wordeth.app.tokens.140', featured: true },
    { id: 'pack_300', tokens: 300, priceCents: 1999, storeProductId: 'com.wordeth.app.tokens.300' },
    { id: 'pack_800', tokens: 800, priceCents: 4999, storeProductId: 'com.wordeth.app.tokens.800' }
];

/** Packs no longer sold, still credited when an older app build's receipt arrives. */
const RETIRED_PACKS = [
    { id: 'pack_50',  tokens: 50,  priceCents: 349, storeProductId: 'com.wordeth.app.tokens.50' },
    { id: 'pack_100', tokens: 100, priceCents: 599, storeProductId: 'com.wordeth.app.tokens.100' }
];

// Dollars as well as cents: the ledgers record dollars, Stripe wants cents.
for (const p of TOKEN_PACKS.concat(RETIRED_PACKS)) p.price = p.priceCents / 100;

/** What a creator is paid per token cashed out, in dollars. */
const CASHOUT_RATE = 0.03;
/** The smallest payout, in dollars: below this the transfer fee eats the money. */
const MIN_PAYOUT_USD = 25;
/** The same floor in tokens. */
const MIN_PAYOUT_TOKENS = Math.ceil(MIN_PAYOUT_USD / CASHOUT_RATE);

function packById(id) {
    return TOKEN_PACKS.find((p) => p.id === id) || null;
}

/** A pack by its store product id, current or retired. */
function packByProductId(productId) {
    return TOKEN_PACKS.concat(RETIRED_PACKS).find((p) => p.storeProductId === productId) || null;
}

/** The shape the website and the app read. */
function publicPacks() {
    return TOKEN_PACKS.map((p) => ({
        id: p.id, tokens: p.tokens, price: p.priceCents / 100, priceCents: p.priceCents,
        perToken: Math.round(p.priceCents / p.tokens * 10) / 10,
        appleProductId: p.storeProductId, featured: !!p.featured
    }));
}

function dollarsFor(tokens) {
    return Math.round(tokens * CASHOUT_RATE * 100) / 100;
}

module.exports = { TOKEN_PACKS, RETIRED_PACKS, CASHOUT_RATE, MIN_PAYOUT_USD, MIN_PAYOUT_TOKENS, packById, packByProductId, publicPacks, dollarsFor };
