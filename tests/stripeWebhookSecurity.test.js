const express = require('express');
const request = require('supertest');
const { createWebhookHandler } = require('../routes/stripe');

test('Stripe webhook fails closed when its signing secret is missing', async () => {
    const app = express();
    app.post(
        '/webhook',
        express.raw({ type: 'application/json' }),
        createWebhookHandler(undefined)
    );

    const response = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'forged')
        .send(JSON.stringify({ id: 'evt_forged', type: 'checkout.session.completed' }));

    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/verification is not configured/i);
});