require('./setup');

const axios = require('axios');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MerchOrder = require('../models/MerchOrder');
const ApliiqProduct = require('../models/ApliiqProduct');
const { submitApliiqOrder, sweepApliiqOrders } = require('../services/apliiqOrders');

jest.mock('axios');

let mongod;

beforeAll(async () => {
    process.env.APLIIQ_APP_KEY = 'test-app';
    process.env.APLIIQ_SHARED_SECRET = 'test-secret';
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

afterEach(async () => {
    jest.clearAllMocks();
    await Promise.all([MerchOrder.deleteMany({}), ApliiqProduct.deleteMany({})]);
});

async function paidOrder(overrides = {}) {
    return MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        colorName: 'Black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        status: 'pending',
        shippingAddress: {
            name: 'Ada Lovelace',
            firstName: 'Ada',
            lastName: 'Lovelace',
            line1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90013',
            countryCode: 'US'
        },
        shippingChoice: { code: 'standard', label: 'Standard shipping' },
        payment: { status: 'paid', stripeCheckoutSessionId: `cs_${new mongoose.Types.ObjectId()}` },
        apliiq: { submissionStatus: 'pending', nextAttemptAt: new Date(), ...overrides.apliiq },
        ...overrides
    });
}

async function approvedProduct() {
    return ApliiqProduct.create({
        identityKey: 'test-product',
        storeProductId: 'store-product',
        type: 'supplier-premium-tee',
        name: 'Supplier Premium Jersey',
        wordethProduct: 'tshirt',
        status: 'approved',
        variants: [{ sku: 'APQ-123S1A1', color: 'black', size: 'M' }]
    });
}

test('submits a paid order once and maps the Apliiq order ID', async () => {
    await approvedProduct();
    const order = await paidOrder();
    axios.post.mockResolvedValue({ status: 200, data: { id: 567890 } });

    const responses = await Promise.all([
        submitApliiqOrder(order._id),
        submitApliiqOrder(order._id),
        submitApliiqOrder(order._id)
    ]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(responses.filter(result => result.submitted)).toHaveLength(1);
    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('confirmed');
    expect(updated.apliiq.orderId).toBe('567890');
    expect(updated.apliiq.submissionStatus).toBe('submitted');
});

test('uses the approved Wordeth garment mapping instead of supplier type or name', async () => {
    await ApliiqProduct.create({
        identityKey: 'wrong-mapping',
        storeProductId: 'wrong-store-product',
        type: 'tshirt',
        name: 'T-Shirt',
        wordethProduct: 'hoodie',
        status: 'approved',
        variants: [{ sku: 'WRONG-SKU', color: 'black', size: 'M' }]
    });
    await approvedProduct();
    const order = await paidOrder();
    axios.post.mockResolvedValue({ status: 200, data: { id: 'APLIIQ-MAPPED' } });

    await submitApliiqOrder(order._id);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][1].line_items[0].sku).toBe('APQ-123S1A1');
});

test('does not automatically retry an ambiguous transport failure', async () => {
    await approvedProduct();
    const order = await paidOrder();
    axios.post.mockRejectedValue(new Error('network unavailable'));

    const result = await submitApliiqOrder(order._id);
    expect(result.failed).toBe(true);
    expect(result.error).toBe('network unavailable');
    const updated = await MerchOrder.findById(order._id);
    expect(updated.apliiq.submissionStatus).toBe('failed');
    expect(updated.apliiq.nextAttemptAt).toBeNull();
    expect(updated.apliiq.lastError).toMatch(/outcome is unknown/);
});

test('schedules a retry after an explicit provider failure response', async () => {
    await approvedProduct();
    const order = await paidOrder();
    axios.post.mockResolvedValue({ status: 503, data: { message: 'temporarily unavailable' } });

    await expect(submitApliiqOrder(order._id)).rejects.toThrow('temporarily unavailable');
    const updated = await MerchOrder.findById(order._id);
    expect(updated.apliiq.submissionStatus).toBe('retry');
    expect(updated.apliiq.nextAttemptAt).toBeInstanceOf(Date);
});

test('marks an expired in-flight lease for staff review instead of posting again', async () => {
    await approvedProduct();
    const order = await paidOrder({
        apliiq: {
            submissionStatus: 'submitting',
            leaseId: 'abandoned',
            leaseUntil: new Date(Date.now() - 1000),
            nextAttemptAt: null
        }
    });

    await sweepApliiqOrders();
    expect(axios.post).not.toHaveBeenCalled();
    const updated = await MerchOrder.findById(order._id);
    expect(updated.apliiq.submissionStatus).toBe('failed');
    expect(updated.apliiq.lastError).toMatch(/outcome is unknown/);
});

test('surfaces an unrecoverable product mapping failure without calling Apliiq', async () => {
    const order = await paidOrder();
    const result = await submitApliiqOrder(order._id);

    expect(result.failed).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
    const updated = await MerchOrder.findById(order._id);
    expect(updated.apliiq.submissionStatus).toBe('failed');
    expect(updated.apliiq.lastError).toMatch(/No approved Apliiq SKU/);
});

test('does not submit refunded or cancelled orders', async () => {
    await approvedProduct();
    const order = await paidOrder({
        status: 'refunded',
        payment: { status: 'refunded', stripeCheckoutSessionId: 'cs_refunded' },
        apliiq: { submissionStatus: 'cancelled', nextAttemptAt: null }
    });

    expect(await submitApliiqOrder(order._id)).toEqual({ submitted: false, skipped: true });
    expect(axios.post).not.toHaveBeenCalled();
});

test('maps one provider order without reopening an order refunded during submission', async () => {
    await approvedProduct();
    const order = await paidOrder();
    let releaseResponse;
    axios.post.mockImplementation(() => new Promise(resolve => {
        releaseResponse = () => resolve({ status: 200, data: { id: 'APLIIQ-RACE-1' } });
    }));

    const submission = submitApliiqOrder(order._id);
    while (!releaseResponse) {
        await new Promise(resolve => setImmediate(resolve));
    }
    await MerchOrder.updateOne(
        { _id: order._id },
        {
            $set: {
                status: 'refunded',
                'payment.status': 'refunded',
                'payment.closedAt': new Date(),
                'apliiq.nextAttemptAt': null
            }
        }
    );
    releaseResponse();
    await submission;
    await submitApliiqOrder(order._id);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('refunded');
    expect(updated.payment.status).toBe('refunded');
    expect(updated.apliiq.orderId).toBe('APLIIQ-RACE-1');
    expect(updated.apliiq.submissionStatus).toBe('submitted');
});