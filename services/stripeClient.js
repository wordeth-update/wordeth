const Stripe = require('stripe');

let stripeInstance = null;

function getStripeClient() {
    if (!stripeInstance) {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
            throw new Error('STRIPE_SECRET_KEY is not configured');
        }
        stripeInstance = new Stripe(secretKey);
    }
    return stripeInstance;
}

function getStripePublishableKey() {
    const key = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!key) {
        throw new Error('STRIPE_PUBLISHABLE_KEY is not configured');
    }
    return key;
}

module.exports = { getStripeClient, getStripePublishableKey };
