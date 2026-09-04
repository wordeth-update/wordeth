require('./setup');

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MerchOrder = require('../models/MerchOrder');

const mockSubmitApliiqOrder = jest.fn().mockResolvedValue({ submitted: true });
const mockRetrieveShippingRate = jest.fn().mockResolvedValue({
    id: 'shr_standard',
    display_name: 'Standard shipping',
    metadata: { wordethShippingCode: 'standard' }
});

jest.mock('../services/apliiqOrders', () => ({ submitApliiqOrder: mockSubmitApliiqOrder }));
jest.mock('../services/stripeClient', () => ({
    getStripeClient: () => ({ shippingRates: { retrieve: mockRetrieveShippingRate } }),
    getStripePublishableKey: () => 'pk_test'
}));

const {
    createWebhookHandler,
    handleCheckoutComplete,
    handleMerchRefund
} = require('../routes/stripe');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

afterEach(async () => {
    jest.clearAllMocks();
    mockRetrieveShippingRate.mockResolvedValue({
        id: 'shr_standard',
        display_name: 'Standard shipping',
        metadata: { wordethShippingCode: 'standard' }
    });
    mockSubmitApliiqOrder.mockResolvedValue({ submitted: true });
    await MerchOrder.deleteMany({});
});

async function unpaidOrder() {
    return MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        payment: { status: 'unpaid', stripeCheckoutSessionId: 'cs_merch' }
    });
}

function paidSession(orderId, overrides = {}) {
    return {
        id: 'cs_merch',
        payment_status: 'paid',
        payment_intent: 'pi_merch',
        amount_subtotal: 2999,
        amount_total: 3598,
        currency: 'usd',
        metadata: { type: 'merch_order', merchOrderId: orderId.toString() },
        shipping_details: {
            name: 'Ada Lovelace',
            phone: '555-0100',
            address: {
                line1: '123 Main St',
                line2: 'Unit 4',
                city: 'Los Angeles',
                state: 'CA',
                postal_code: '90013',
                country: 'US'
            }
        },
        shipping_cost: {
            amount_total: 599,
            shipping_rate: 'shr_standard'
        },
        ...overrides
    };
}

test('stores the paid checkout shipping snapshot and starts fulfillment', async () => {
    const order = await unpaidOrder();
    await handleCheckoutComplete(paidSession(order._id));

    const updated = await MerchOrder.findById(order._id);
    expect(updated.payment.status).toBe('paid');
    expect(updated.payment.stripePaymentIntentId).toBe('pi_merch');
    expect(updated.shippingAddress.toObject()).toMatchObject({
        name: 'Ada Lovelace',
        firstName: 'Ada',
        lastName: 'Lovelace',
        line1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90013',
        countryCode: 'US'
    });
    expect(updated.shippingChoice.toObject()).toMatchObject({
        code: 'standard',
        amount: 5.99,
        stripeShippingRateId: 'shr_standard'
    });
    expect(updated.apliiq.submissionStatus).toBe('pending');
    expect(mockSubmitApliiqOrder).toHaveBeenCalledWith(order._id.toString());
});

test('rejects every Stripe webhook when signature verification is not configured', async () => {
    const req = {
        headers: { 'stripe-signature': 'forged' },
        body: Buffer.from(JSON.stringify({ id: 'evt_forged' }))
    };
    const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };

    await createWebhookHandler('')(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Webhook verification is not configured' });
});

test('a duplicate paid session cannot replace the immutable shipping snapshot', async () => {
    const order = await unpaidOrder();
    await handleCheckoutComplete(paidSession(order._id));
    await handleCheckoutComplete(paidSession(order._id, {
        shipping_details: {
            name: 'Changed Recipient',
            address: {
                line1: '999 Other St',
                city: 'Elsewhere',
                state: 'NY',
                postal_code: '10001',
                country: 'US'
            }
        }
    }));

    const updated = await MerchOrder.findById(order._id);
    expect(updated.shippingAddress.name).toBe('Ada Lovelace');
    expect(updated.shippingAddress.line1).toBe('123 Main St');
});

test('rejects a verified checkout whose merchandise subtotal changed', async () => {
    const order = await unpaidOrder();
    await expect(handleCheckoutComplete(paidSession(order._id, {
        amount_subtotal: 1
    }))).rejects.toThrow(/amount does not match/);
    expect((await MerchOrder.findById(order._id)).payment.status).toBe('unpaid');
    expect(mockSubmitApliiqOrder).not.toHaveBeenCalled();
});

test('refund closes an unsubmitted order so it cannot enter fulfillment', async () => {
    const order = await unpaidOrder();
    await handleCheckoutComplete(paidSession(order._id));
    await handleMerchRefund({
        payment_intent: 'pi_merch',
        amount: 3598,
        amount_refunded: 3598,
        refunded: true
    });

    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('refunded');
    expect(updated.payment.status).toBe('refunded');
    expect(updated.apliiq.submissionStatus).toBe('cancelled');
});

test('partial refund before submission does not cancel fulfillment', async () => {
    const order = await unpaidOrder();
    await handleCheckoutComplete(paidSession(order._id));
    await handleMerchRefund({
        payment_intent: 'pi_merch',
        amount: 3598,
        amount_refunded: 500,
        refunded: false
    });

    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('pending');
    expect(updated.payment.status).toBe('paid');
    expect(updated.payment.amountRefunded).toBe(5);
    expect(updated.apliiq.submissionStatus).toBe('pending');
});

test('partial refund after submission preserves the provider mapping and fulfillment state', async () => {
    const order = await unpaidOrder();
    await handleCheckoutComplete(paidSession(order._id));
    await MerchOrder.updateOne(
        { _id: order._id },
        {
            $set: {
                status: 'confirmed',
                'apliiq.orderId': 'APLIIQ-ALREADY-SUBMITTED',
                'apliiq.submissionStatus': 'submitted'
            }
        }
    );

    await handleMerchRefund({
        payment_intent: 'pi_merch',
        amount: 3598,
        amount_refunded: 500,
        refunded: false
    });

    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('confirmed');
    expect(updated.payment.status).toBe('paid');
    expect(updated.payment.amountRefunded).toBe(5);
    expect(updated.apliiq.orderId).toBe('APLIIQ-ALREADY-SUBMITTED');
    expect(updated.apliiq.submissionStatus).toBe('submitted');
});
