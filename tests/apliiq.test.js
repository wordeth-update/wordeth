require('./setup');

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const request = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.APLIIQ_APP_KEY = 'test-apliiq-app-key';
process.env.APLIIQ_SHARED_SECRET = 'test-apliiq-shared-secret';

const apliqRoutes = require('../routes/apliiq');
const ApliiqEvent = require('../models/ApliiqEvent');
const ApliiqProduct = require('../models/ApliiqProduct');
const ApliiqWarehouseShipment = require('../models/ApliiqWarehouseShipment');
const MerchOrder = require('../models/MerchOrder');
const { reconcilePendingFulfillmentsForOrder } = require('../services/apliiqFulfillment');

const app = express();
app.use('/api/apliiq', express.raw({ type: 'application/json' }), apliqRoutes);

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
    await Promise.all([
        ApliiqEvent.deleteMany({}),
        ApliiqProduct.deleteMany({}),
        ApliiqWarehouseShipment.deleteMany({}),
        MerchOrder.deleteMany({})
    ]);
});

function productPayload(overrides = {}) {
    return {
        store_ProductId: null,
        type: 't-shirt',
        name: 'Wordeth Tour Tee',
        currency: 'USD',
        imageUrls: ['https://example.com/tee.jpg'],
        sizes: ['s', 'm'],
        colors: ['black'],
        variants: [{
            sku: 'APQ-WORDETH-S-BLK',
            price: 42,
            color: 'black',
            size: 's',
            imageUrl: 'https://example.com/tee-s.jpg',
            weight: 8,
            weightUnit: 'oz'
        }],
        ...overrides
    };
}

function fulfillmentSignature(rawBody) {
    return crypto
        .createHmac('sha256', process.env.APLIIQ_SHARED_SECRET)
        .update(Buffer.from(rawBody).toString('base64'))
        .digest('base64');
}

test('imports an Apliiq product as pending and returns the documented response', async () => {
    const response = await request(app)
        .post('/api/apliiq/products')
        .send(productPayload())
        .expect(200);

    expect(response.body.hasError).toBe(false);
    expect(response.body.storeProductId).toBeTruthy();

    const product = await ApliiqProduct.findOne({ storeProductId: response.body.storeProductId });
    expect(product.status).toBe('pending');
    expect(product.variants[0].sku).toBe('APQ-WORDETH-S-BLK');
});

test('updates an existing product instead of duplicating it', async () => {
    const first = await request(app).post('/api/apliiq/products').send(productPayload());
    await request(app)
        .post('/api/apliiq/products')
        .send(productPayload({
            store_ProductId: first.body.storeProductId,
            name: 'Updated Wordeth Tour Tee'
        }))
        .expect(200);

    expect(await ApliiqProduct.countDocuments({})).toBe(1);
    expect((await ApliiqProduct.findOne({})).name).toBe('Updated Wordeth Tour Tee');
});

test('handles concurrent duplicate product callbacks without creating duplicate products', async () => {
    const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
            request(app).post('/api/apliiq/products').send(productPayload()).expect(200)
        )
    );

    expect(await ApliiqProduct.countDocuments({})).toBe(1);
    expect(new Set(responses.map(response => response.body.storeProductId)).size).toBe(1);
});

test('returns the minimum product search response Apliiq documents', async () => {
    const imported = await request(app).post('/api/apliiq/products').send(productPayload());

    const response = await request(app)
        .get('/api/apliiq/products/search?search=Tour')
        .expect(200);

    expect(response.body).toEqual([{
        store_ProductId: imported.body.storeProductId,
        name: 'Wordeth Tour Tee',
        imageUrls: ['https://example.com/tee.jpg']
    }]);
});

test('rejects a fulfillment callback with an invalid signature', async () => {
    await request(app)
        .post('/api/apliiq/fulfillment')
        .set('x-apliiq-hmac', 'invalid')
        .send({ fulfillment: { order_id: '123' } })
        .expect(401);
});

test('accepts signed fulfillment and updates a Wordeth merchandise order', async () => {
    const order = await MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        status: 'confirmed',
        apliiq: { orderId: 'APLIIQ-ORDER-100' }
    });
    const payload = JSON.stringify({
        fulfillment: {
            order_id: 'APLIIQ-ORDER-100',
            status: 'Shipped',
            tracking_company: 'USPS',
            tracking_numbers: ['9400000000000000000000'],
            tracking_urls: ['https://tools.usps.com/go/TrackConfirmAction?tLabels=9400'],
            line_items: [{ sku: 'APQ-WORDETH-S-BLK', quantity: 1 }]
        }
    });

    await request(app)
        .post('/api/apliiq/fulfillment')
        .set('Content-Type', 'application/json')
        .set('x-apliiq-hmac', fulfillmentSignature(payload))
        .send(payload)
        .expect(200, { success: true, matched: true });

    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('shipped');
    expect(updated.trackingNumber).toBe('9400000000000000000000');
    expect(updated.apliiq.trackingCompany).toBe('USPS');
    expect(updated.apliiq.primaryTracking.toObject()).toEqual({
        number: '9400000000000000000000',
        company: 'USPS',
        url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400'
    });
});

test('merges multiple fulfillment packages and does not downgrade a delivered order', async () => {
    const order = await MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 2,
        unitPrice: 29.99,
        totalPrice: 59.98,
        status: 'delivered',
        trackingNumber: 'FIRST',
        apliiq: {
            orderId: 'APLIIQ-ORDER-200',
            trackingCompany: 'UPS',
            trackingNumbers: ['FIRST'],
            trackingUrls: ['https://example.com/first']
        }
    });
    const payload = JSON.stringify({
        fulfillment: {
            order_id: 'APLIIQ-ORDER-200',
            tracking_company: 'USPS',
            tracking_numbers: ['SECOND'],
            tracking_urls: ['https://example.com/second'],
            line_items: [{ sku: 'SECOND-SKU', quantity: 1 }]
        }
    });

    await request(app)
        .post('/api/apliiq/fulfillment')
        .set('Content-Type', 'application/json')
        .set('x-apliiq-hmac', fulfillmentSignature(payload))
        .send(payload)
        .expect(200);

    const updated = await MerchOrder.findById(order._id);
    expect(updated.status).toBe('delivered');
    expect(updated.apliiq.trackingNumbers.sort()).toEqual(['FIRST', 'SECOND']);
    expect(updated.apliiq.trackingUrls.sort()).toEqual([
        'https://example.com/first',
        'https://example.com/second'
    ]);
    expect(updated.trackingNumber).toBe('FIRST');
    expect(updated.apliiq.trackingCompany).toBe('UPS');
});

test('acknowledges exact duplicate fulfillment without applying it twice', async () => {
    const order = await MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        status: 'confirmed',
        apliiq: { orderId: 'APLIIQ-ORDER-300' }
    });
    const payload = JSON.stringify({
        fulfillment: {
            order_id: 'APLIIQ-ORDER-300',
            tracking_numbers: ['DUPLICATE'],
            tracking_urls: []
        }
    });
    const send = () => request(app)
        .post('/api/apliiq/fulfillment')
        .set('Content-Type', 'application/json')
        .set('x-apliiq-hmac', fulfillmentSignature(payload))
        .send(payload)
        .expect(200);

    await send();
    const firstUpdate = (await MerchOrder.findById(order._id)).apliiq.lastEventAt;
    await send();
    const secondUpdate = (await MerchOrder.findById(order._id)).apliiq.lastEventAt;

    expect(secondUpdate.getTime()).toBe(firstUpdate.getTime());
    expect((await ApliiqEvent.findOne({ type: 'fulfillment' })).attempts).toBe(2);
});

test('reconciles fulfillment that arrived before the local order was available', async () => {
    const orderId = new mongoose.Types.ObjectId();
    const payload = JSON.stringify({
        fulfillment: {
            order_id: orderId.toString(),
            tracking_company: 'UPS',
            tracking_numbers: ['DELAYED'],
            tracking_urls: ['https://example.com/delayed']
        }
    });

    const pending = await request(app)
        .post('/api/apliiq/fulfillment')
        .set('Content-Type', 'application/json')
        .set('x-apliiq-hmac', fulfillmentSignature(payload))
        .send(payload)
        .expect(200);
    expect(pending.body.pendingReconciliation).toBe(true);

    const order = await MerchOrder.create({
        _id: orderId,
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        status: 'confirmed'
    });
    expect(await reconcilePendingFulfillmentsForOrder(order)).toBe(1);

    const updated = await MerchOrder.findById(orderId);
    expect(updated.status).toBe('shipped');
    expect(updated.trackingNumber).toBe('DELAYED');
    expect((await ApliiqEvent.findOne({ type: 'fulfillment' })).status).toBe('processed');
});

test('atomically leases simultaneous identical fulfillment callbacks', async () => {
    await MerchOrder.create({
        userId: new mongoose.Types.ObjectId(),
        product: 'tshirt',
        productName: 'T-Shirt',
        color: 'black',
        size: 'M',
        quantity: 1,
        unitPrice: 29.99,
        totalPrice: 29.99,
        status: 'confirmed',
        apliiq: { orderId: 'APLIIQ-ORDER-400' }
    });
    const payload = JSON.stringify({
        fulfillment: {
            order_id: 'APLIIQ-ORDER-400',
            tracking_numbers: ['CONCURRENT'],
            tracking_urls: []
        }
    });
    const send = () => request(app)
        .post('/api/apliiq/fulfillment')
        .set('Content-Type', 'application/json')
        .set('x-apliiq-hmac', fulfillmentSignature(payload))
        .send(payload);

    const responses = await Promise.all([send(), send(), send()]);
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    expect(responses.every(response => response.body.matched)).toBe(true);
    expect((await ApliiqEvent.findOne({ type: 'fulfillment' })).attempts).toBe(3);
});

test('records warehouse shipment completion and discrepancies', async () => {
    const response = await request(app)
        .post('/api/apliiq/warehouse/shipments/complete')
        .set('x-apliiq-appId', process.env.APLIIQ_APP_KEY)
        .send([{
            Id: 1175,
            Name: 'SH 1175 04',
            Items: [{
                ID: 1186,
                InventoryId: 'PI 1186 3',
                Name: 'Wordeth insert',
                Type: 'pack-in',
                Quantity: 12,
                Quantity_Received: 10,
                IsActivated: true,
                Receiving_Errors: 'Two items damaged'
            }]
        }])
        .expect(200);

    expect(response.body.shipmentsProcessed).toBe(1);
    const shipment = await ApliiqWarehouseShipment.findOne({ shipmentId: '1175' });
    expect(shipment.hasDiscrepancies).toBe(true);
    expect(shipment.items[0].quantityReceived).toBe(10);
});

test('rejects warehouse completion with the wrong app ID', async () => {
    await request(app)
        .post('/api/apliiq/warehouse/shipments/complete')
        .set('x-apliiq-appId', 'wrong-key')
        .send([{ Id: 1175, Items: [] }])
        .expect(401);
});

test('atomically leases simultaneous identical warehouse callbacks', async () => {
    const payload = [{
        Id: 2000,
        Name: 'SH 2000',
        Items: [{ ID: 1, Quantity: 1, Quantity_Received: 1 }]
    }];
    const send = () => request(app)
        .post('/api/apliiq/warehouse/shipments/complete')
        .set('x-apliiq-appId', process.env.APLIIQ_APP_KEY)
        .send(payload);

    const responses = await Promise.all([send(), send(), send()]);
    expect(responses.map(response => response.status)).toEqual([200, 200, 200]);
    expect(await ApliiqWarehouseShipment.countDocuments({ shipmentId: '2000' })).toBe(1);
});