require('./setup');

const express = require('express');
const request = require('supertest');

const mockCheckoutCreate = jest.fn();
const mockCustomerCreate = jest.fn();
const mockUserUpdate = jest.fn();
const mockPlanFindOne = jest.fn();
let mockUser;

jest.mock('../middleware/auth', () => (req, res, next) => {
    req.user = mockUser;
    next();
});
jest.mock('../services/stripeClient', () => ({
    getStripeClient: () => ({
        customers: { create: mockCustomerCreate },
        checkout: { sessions: { create: mockCheckoutCreate } },
        billingPortal: { sessions: { create: jest.fn() } }
    }),
    getStripePublishableKey: () => 'pk_test'
}));
jest.mock('../models/User', () => ({
    findByIdAndUpdate: (...args) => mockUserUpdate(...args)
}));
jest.mock('../models/Plan', () => ({
    findOne: (...args) => mockPlanFindOne(...args),
    findById: jest.fn()
}));
jest.mock('../models/Subscription', () => ({
    findOne: jest.fn(),
    findById: jest.fn()
}));
jest.mock('../routes/subscriptions', () => ({
    grantTokensForPlan: jest.fn()
}));

const stripeRoutes = require('../routes/stripe');
const app = express();
app.use(express.json());
app.use('/api/stripe', stripeRoutes);

beforeEach(() => {
    jest.clearAllMocks();
    mockUser = {
        _id: { toString: () => 'user-1' },
        email: 'buyer@example.com',
        name: 'Buyer',
        accountType: 'fan',
        stripeCustomerId: ''
    };
    mockCustomerCreate.mockResolvedValue({ id: 'cus_new' });
    mockCheckoutCreate.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' });
    mockUserUpdate.mockResolvedValue({});
});

test('creates a payment Checkout Session for a new token-pack customer', async () => {
    const response = await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({ packId: 'pack_25' })
        .expect(200);

    expect(mockCustomerCreate).toHaveBeenCalledTimes(1);
    expect(mockUserUpdate).toHaveBeenCalledWith(
        mockUser._id,
        { stripeCustomerId: 'cus_new' }
    );
    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_new',
        mode: 'payment',
        metadata: expect.objectContaining({ type: 'token_pack', userId: 'user-1' })
    }));
    expect(response.body.url).toBe('https://checkout.stripe.com/test');
});

test('creates a subscription Checkout Session for an existing customer', async () => {
    mockUser.stripeCustomerId = 'cus_existing';
    mockPlanFindOne.mockResolvedValue({
        slug: 'user-plus',
        active: true,
        name: 'User+',
        description: 'User+ membership',
        category: 'fan',
        currency: 'USD',
        priceMonthly: 9.99,
        priceYearly: 99.99
    });

    await request(app)
        .post('/api/stripe/create-checkout-session')
        .send({ planSlug: 'user-plus', billingCycle: 'monthly' })
        .expect(200);

    expect(mockCustomerCreate).not.toHaveBeenCalled();
    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({
        customer: 'cus_existing',
        mode: 'subscription',
        metadata: expect.objectContaining({
            type: 'subscription',
            planSlug: 'user-plus',
            userId: 'user-1'
        })
    }));
});