const crypto = require('crypto');
const ApliiqProduct = require('../models/ApliiqProduct');

const PRODUCT_FIELDS = [
    'shippingProfileId', 'taxonomyId', 'type', 'name', 'currency', 'description',
    'imageUrls', 'sizes', 'colors', 'variants', 'replaceProduct'
];

function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
    }, {});
}

function sortedStrings(values) {
    return [...new Set((values || []).map(value => String(value)))].sort();
}

function canonicalProduct(product) {
    const variants = (product.variants || []).map(variant => ({
        sku: variant.sku || '',
        price: Number(variant.price) || 0,
        color: variant.color || '',
        size: variant.size || '',
        imageUrl: variant.imageUrl || '',
        weight: Number(variant.weight) || 0,
        weightUnit: variant.weightUnit || '',
        isDefault: Boolean(variant.isDefault),
        width: Number(variant.width) || 0,
        height: Number(variant.height) || 0,
        length: Number(variant.length) || 0,
        dimensionUnit: variant.dimensionUnit || ''
    })).sort((left, right) =>
        left.sku.localeCompare(right.sku) ||
        JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

    return {
        shippingProfileId: product.shippingProfileId || '',
        taxonomyId: product.taxonomyId || '',
        type: product.type || '',
        name: product.name || '',
        currency: (product.currency || 'USD').toUpperCase(),
        description: product.description || '',
        imageUrls: sortedStrings(product.imageUrls),
        sizes: sortedStrings(product.sizes),
        colors: sortedStrings(product.colors),
        variants,
        replaceProduct: Boolean(product.replaceProduct)
    };
}

function materialReviewHash(product) {
    return crypto
        .createHash('sha256')
        .update(JSON.stringify(stableValue(canonicalProduct(product))))
        .digest('hex');
}

function approvedSnapshot(product) {
    const source = typeof product.toObject === 'function'
        ? product.toObject({ depopulate: true })
        : product;
    return PRODUCT_FIELDS.reduce((snapshot, field) => {
        snapshot[field] = source[field];
        return snapshot;
    }, {});
}

async function registerWordethProductIntent({
    storeProductId,
    wordethProduct,
    productData
}) {
    const expectedReviewHash = materialReviewHash(productData);
    const existing = await ApliiqProduct.findOne({ storeProductId });
    if (existing && existing.status !== 'pending') {
        const error = new Error('Only pending product intents can be replaced');
        error.code = 'INTENT_CONFLICT';
        throw error;
    }

    const intentData = {
        ...productData,
        reviewHash: expectedReviewHash,
        wordethProduct,
        wordethIntent: {
            verified: true,
            expectedReviewHash,
            wordethProduct,
            createdAt: new Date()
        }
    };
    let product;
    if (existing) {
        const existingReviewFilter = existing.reviewHash
            ? { reviewHash: existing.reviewHash }
            : { $or: [{ reviewHash: '' }, { reviewHash: { $exists: false } }] };
        product = await ApliiqProduct.findOneAndUpdate({
            $and: [
                { _id: existing._id, status: 'pending' },
                existingReviewFilter
            ]
        }, {
            $set: intentData
        }, { new: true, runValidators: true });
        if (!product) {
            const error = new Error('The product intent changed while it was being replaced');
            error.code = 'INTENT_CONFLICT';
            throw error;
        }
    } else {
        try {
            product = await ApliiqProduct.create({
                identityKey: `store:${storeProductId}`,
                storeProductId,
                status: 'pending',
                ...intentData
            });
        } catch (error) {
            if (error?.code === 11000) error.code = 'INTENT_CONFLICT';
            throw error;
        }
    }

    return { product, expectedReviewHash, created: !existing };
}

module.exports = {
    PRODUCT_FIELDS,
    approvedSnapshot,
    canonicalProduct,
    materialReviewHash,
    registerWordethProductIntent
};