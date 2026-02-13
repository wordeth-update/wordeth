const MerchSale = require('../models/MerchSale');
const EventsLedger = require('../models/EventsLedger');
const Label = require('../models/Label');
const User = require('../models/User');

const DEFAULT_PLATFORM_FEE_RATE = 0.10;
const DEFAULT_LABEL_PAYOUT_RATE = 0.15;
const DEFAULT_CREATOR_PAYOUT_RATE = 0.85;

async function getSellerPayoutRate(sellerType, sellerId) {
    if (sellerType === 'label') {
        const label = await Label.findById(sellerId);
        if (!label) throw new Error(`Label not found: ${sellerId}`);
        return {
            payoutRate: label.revenueShare || DEFAULT_LABEL_PAYOUT_RATE,
            sellerName: label.name
        };
    }

    const user = await User.findById(sellerId);
    if (!user) throw new Error(`User not found: ${sellerId}`);
    if (!['designer', 'artist'].includes(user.accountType)) {
        throw new Error(`User ${sellerId} is not a designer or artist`);
    }

    return {
        payoutRate: user.creatorProfile?.revenueShare ?? DEFAULT_CREATOR_PAYOUT_RATE,
        sellerName: user.creatorProfile?.displayName || user.name
    };
}

function computePayout(totalAmount, payoutRate) {
    const platformFeeRate = roundTo(1 - payoutRate, 4);
    const payoutAmount = roundTo(totalAmount * payoutRate, 2);
    const platformFeeAmount = roundTo(totalAmount - payoutAmount, 2);

    return {
        payoutRate: roundTo(payoutRate, 4),
        payoutAmount,
        platformFeeRate,
        platformFeeAmount
    };
}

function roundTo(num, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(num * factor) / factor;
}

async function recordSale(saleData, source = 'manual') {
    const {
        orderId, sellerType, sellerId, labelId,
        artistName, artistSlug, sku, productName, productType,
        songTitle, albumTitle, lyricsSnippet,
        quantity, unitPrice, totalAmount,
        currency, geo, status, saleDate
    } = saleData;

    if (!orderId || !sellerType || !sellerId || !artistName || !artistSlug || !sku || !productName) {
        throw new Error('Missing required sale fields: orderId, sellerType, sellerId, artistName, artistSlug, sku, productName');
    }
    if (!quantity || quantity < 1) throw new Error('Quantity must be at least 1');
    if (totalAmount == null || totalAmount < 0) throw new Error('totalAmount is required and must be >= 0');

    const existing = await MerchSale.findOne({ orderId, sku });
    if (existing) {
        return { duplicate: true, sale: existing };
    }

    const { payoutRate, sellerName } = await getSellerPayoutRate(sellerType, sellerId);
    const payout = computePayout(totalAmount, payoutRate);

    const sale = new MerchSale({
        orderId,
        sellerType,
        sellerId,
        labelId: labelId || (sellerType === 'label' ? sellerId : null),
        artistName,
        artistSlug,
        sku,
        productName,
        productType: productType || 'other',
        songTitle: songTitle || '',
        albumTitle: albumTitle || '',
        lyricsSnippet: lyricsSnippet || '',
        quantity,
        unitPrice: unitPrice || roundTo(totalAmount / quantity, 2),
        totalAmount,
        payoutRate: payout.payoutRate,
        payoutAmount: payout.payoutAmount,
        platformFeeRate: payout.platformFeeRate,
        platformFeeAmount: payout.platformFeeAmount,
        revenueShare: payout.payoutAmount,
        currency: currency || 'USD',
        source,
        geo: geo || {},
        status: status || 'confirmed',
        saleDate: saleDate ? new Date(saleDate) : new Date()
    });

    await sale.save();

    const actorId = sellerType === 'label' ? sellerId : sellerId;
    const actorType = sellerType === 'label' ? 'partner' : 'user';

    await EventsLedger.create([
        {
            actorId,
            actorType,
            eventType: 'gmv_order',
            resourceType: 'MerchSale',
            resourceId: sale._id,
            amount: totalAmount,
            currency: sale.currency,
            metadata: {
                orderId,
                sku,
                sellerType,
                sellerName,
                artistName,
                productName,
                quantity,
                payoutRate: payout.payoutRate,
                payoutAmount: payout.payoutAmount,
                source
            },
            description: `Sale recorded: ${productName} x${quantity} for ${artistName} (${sellerType})`
        },
        {
            actorId,
            actorType: 'system',
            eventType: 'platform_fee_recorded',
            resourceType: 'MerchSale',
            resourceId: sale._id,
            amount: payout.platformFeeAmount,
            currency: sale.currency,
            metadata: {
                orderId,
                sku,
                sellerType,
                sellerName,
                platformFeeRate: payout.platformFeeRate,
                grossAmount: totalAmount,
                payoutAmount: payout.payoutAmount
            },
            description: `Platform fee: $${payout.platformFeeAmount} (${(payout.platformFeeRate * 100).toFixed(1)}%) on order ${orderId}`
        }
    ]);

    if (sellerType !== 'label') {
        await User.findByIdAndUpdate(sellerId, {
            $inc: {
                'creatorProfile.totalEarnings': payout.payoutAmount,
                'creatorProfile.totalSales': quantity
            }
        });
    }

    return { duplicate: false, sale, payout };
}

async function recordBulkSales(salesArray, source = 'csv') {
    const results = {
        recorded: 0,
        duplicates: 0,
        errors: [],
        sales: []
    };

    for (let i = 0; i < salesArray.length; i++) {
        try {
            const result = await recordSale(salesArray[i], source);
            if (result.duplicate) {
                results.duplicates++;
            } else {
                results.recorded++;
                results.sales.push(result.sale);
            }
        } catch (err) {
            results.errors.push({ row: i + 1, message: err.message, data: salesArray[i]?.orderId });
        }
    }

    return results;
}

async function getPayoutSummary(sellerType, sellerId, startDate, endDate) {
    const match = { sellerType, sellerId };
    if (startDate || endDate) {
        match.saleDate = {};
        if (startDate) match.saleDate.$gte = new Date(startDate);
        if (endDate) match.saleDate.$lte = new Date(endDate);
    }

    const [summary] = await MerchSale.aggregate([
        { $match: match },
        { $group: {
            _id: null,
            totalGross: { $sum: '$totalAmount' },
            totalPayout: { $sum: '$payoutAmount' },
            totalPlatformFee: { $sum: '$platformFeeAmount' },
            totalOrders: { $sum: 1 },
            totalUnits: { $sum: '$quantity' },
            avgPayoutRate: { $avg: '$payoutRate' }
        }}
    ]);

    return summary || {
        totalGross: 0,
        totalPayout: 0,
        totalPlatformFee: 0,
        totalOrders: 0,
        totalUnits: 0,
        avgPayoutRate: 0
    };
}

module.exports = {
    recordSale,
    recordBulkSales,
    getSellerPayoutRate,
    computePayout,
    getPayoutSummary,
    DEFAULT_PLATFORM_FEE_RATE,
    DEFAULT_LABEL_PAYOUT_RATE,
    DEFAULT_CREATOR_PAYOUT_RATE
};
