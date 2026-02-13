const axios = require('axios');
const InkSoftSync = require('../models/InkSoftSync');
const Label = require('../models/Label');
const { recordSale } = require('./payoutService');

const STORE_URL = 'https://stores.inksoft.com/knewcleus_marketing_media';
const POLL_INTERVAL_MS_DEFAULT = 15 * 60 * 1000;

let globalPollerTimer = null;

function getApiKey() {
    const key = process.env.INKSOFT_API_KEY;
    if (!key) {
        throw new Error('INKSOFT_API_KEY environment variable is required');
    }
    return key;
}

async function fetchOrdersPage(baseUrl, apiKey, params) {
    const res = await axios.get(`${baseUrl}/Api2/GetOrders`, {
        params: { ...params, IntegrationKey: apiKey, Format: 'JSON' },
        timeout: 30000
    });

    if (res.data && res.data.OK) {
        return res.data.Data || [];
    }

    if (res.data && !res.data.OK) {
        const msg = res.data.Messages?.[0]?.Content || 'Unknown error';
        throw new Error(`GetOrders failed: ${msg}`);
    }

    return [];
}

async function fetchOrders(syncState) {
    const apiKey = getApiKey();
    const baseUrl = syncState.storeUrl.replace(/\/$/, '');
    const pageSize = 100;
    const maxPages = 10;

    const params = { MaxResults: pageSize };
    if (syncState.lastPollAt) {
        params.StartDate = syncState.lastPollAt.toISOString();
    }

    let allOrders = [];
    let page = 0;

    while (page < maxPages) {
        params.Skip = page * pageSize;
        const orders = await fetchOrdersPage(baseUrl, apiKey, params);
        allOrders = allOrders.concat(orders);
        if (orders.length < pageSize) break;
        page++;
    }

    return allOrders;
}

async function matchOrderToLabel(order) {
    const items = order.Items || order.OrderItems || [];
    const storeName = order.StoreName || order.Store || '';
    const brandName = order.BrandName || '';

    const searchTerms = new Set();
    if (storeName) searchTerms.add(storeName.toLowerCase().trim());
    if (brandName) searchTerms.add(brandName.toLowerCase().trim());

    for (const item of items) {
        const designer = item.Designer || item.BrandName || item.ArtistName || '';
        if (designer) searchTerms.add(designer.toLowerCase().trim());
    }

    if (searchTerms.size === 0) return null;

    const labels = await Label.find({ status: 'active' });

    for (const label of labels) {
        const labelName = label.name.toLowerCase().trim();
        const labelSlug = label.slug.toLowerCase().trim();

        for (const term of searchTerms) {
            if (term === labelName || term === labelSlug ||
                term.includes(labelName) || labelName.includes(term) ||
                term.includes(labelSlug) || labelSlug.includes(term)) {
                return label;
            }
        }

        for (const artist of label.artists) {
            if (!artist.active) continue;
            const artistName = artist.name.toLowerCase().trim();
            const artistSlug = artist.slug.toLowerCase().trim();

            for (const term of searchTerms) {
                if (term === artistName || term === artistSlug ||
                    term.includes(artistName) || artistName.includes(term)) {
                    return label;
                }
            }
        }
    }

    return null;
}

function matchArtistOnLabel(order, label) {
    const items = order.Items || order.OrderItems || [];

    for (const item of items) {
        const designer = (item.Designer || item.BrandName || item.ArtistName || '').toLowerCase().trim();
        if (!designer) continue;

        for (const artist of label.artists) {
            if (!artist.active) continue;
            const artistName = artist.name.toLowerCase().trim();
            const artistSlug = artist.slug.toLowerCase().trim();
            if (designer === artistName || designer === artistSlug ||
                designer.includes(artistName) || artistName.includes(designer)) {
                return { name: artist.name, slug: artist.slug };
            }
        }
    }

    return { name: label.name, slug: label.slug };
}

function mapInkSoftOrder(order, label) {
    const items = order.Items || order.OrderItems || [];
    const mapped = [];

    const orderId = String(order.OrderId || order.Id || order.OrderNumber || '');
    if (!orderId) return mapped;

    const orderDate = order.OrderDate || order.DateCreated || order.CreatedDate || new Date().toISOString();
    const orderStatus = (order.Status || order.OrderStatus || 'confirmed').toLowerCase();
    const customer = order.Customer || order.ShipTo || {};
    const artist = matchArtistOnLabel(order, label);

    for (const item of items) {
        const sku = String(item.Sku || item.SKU || item.ProductSku || item.ItemId || '');
        if (!sku) continue;

        const productName = item.ProductName || item.Name || item.Description || 'Unknown Product';
        const quantity = parseInt(item.Quantity || item.Qty || 1);
        const unitPrice = parseFloat(item.UnitPrice || item.Price || 0);
        const totalAmount = parseFloat(item.TotalPrice || item.Total || item.LineTotal || (unitPrice * quantity));
        const productType = detectProductType(productName, item.Category || item.ProductType || '');

        mapped.push({
            orderId: `IS-${orderId}`,
            sellerType: 'label',
            sellerId: label._id,
            labelId: label._id,
            artistName: artist.name,
            artistSlug: artist.slug,
            sku,
            productName,
            productType,
            songTitle: item.SongTitle || '',
            albumTitle: item.AlbumTitle || '',
            lyricsSnippet: item.LyricsSnippet || item.CustomText || '',
            quantity: isNaN(quantity) ? 1 : quantity,
            unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
            totalAmount: isNaN(totalAmount) ? 0 : totalAmount,
            currency: order.Currency || 'USD',
            geo: {
                country: customer.Country || '',
                countryCode: customer.CountryCode || '',
                region: customer.State || customer.Region || '',
                city: customer.City || ''
            },
            status: mapOrderStatus(orderStatus),
            saleDate: orderDate
        });
    }

    return mapped;
}

function detectProductType(productName, category) {
    const name = (productName + ' ' + category).toLowerCase();
    if (name.includes('t-shirt') || name.includes('tee') || name.includes('tshirt')) return 't-shirt';
    if (name.includes('hoodie') || name.includes('sweatshirt')) return 'hoodie';
    if (name.includes('hat') || name.includes('cap') || name.includes('beanie')) return 'hat';
    if (name.includes('jacket') || name.includes('windbreaker')) return 'jacket';
    if (name.includes('tank')) return 'tank-top';
    if (name.includes('poster') || name.includes('print')) return 'poster';
    if (name.includes('sticker')) return 'sticker';
    if (name.includes('mug') || name.includes('cup')) return 'mug';
    if (name.includes('bag') || name.includes('tote')) return 'bag';
    if (name.includes('phone') || name.includes('case')) return 'phone-case';
    return 'other';
}

function mapOrderStatus(status) {
    const s = status.toLowerCase();
    if (s.includes('complete') || s.includes('deliver') || s.includes('fulfilled')) return 'delivered';
    if (s.includes('ship')) return 'shipped';
    if (s.includes('cancel') || s.includes('void') || s.includes('refund')) return 'cancelled';
    if (s.includes('process') || s.includes('production')) return 'processing';
    return 'confirmed';
}

async function getOrCreateSyncState() {
    let syncState = await InkSoftSync.findOne({});
    if (!syncState) {
        syncState = new InkSoftSync({
            storeUrl: STORE_URL,
            status: 'active',
            enabled: true
        });
        await syncState.save();
    }
    return syncState;
}

async function pollOrders() {
    const syncState = await getOrCreateSyncState();
    if (!syncState.enabled) {
        console.log('[InkSoft] Polling is disabled');
        return null;
    }

    const startTime = Date.now();
    console.log('[InkSoft] Polling orders...');

    try {
        const orders = await fetchOrders(syncState);
        console.log(`[InkSoft] Fetched ${orders.length} orders from InkSoft`);

        let recorded = 0;
        let duplicates = 0;
        let errors = 0;
        let unmatched = 0;

        for (const order of orders) {
            const label = await matchOrderToLabel(order);

            if (!label) {
                unmatched++;
                const orderId = order.OrderId || order.Id || order.OrderNumber || 'unknown';
                console.log(`[InkSoft] No matching label for order ${orderId} — skipping`);
                continue;
            }

            const saleItems = mapInkSoftOrder(order, label);

            for (const saleData of saleItems) {
                try {
                    const result = await recordSale(saleData, 'inksoft');
                    if (result.duplicate) {
                        duplicates++;
                    } else {
                        recorded++;
                    }
                } catch (err) {
                    errors++;
                    console.error(`[InkSoft] Error recording sale for order ${saleData.orderId}:`, err.message);
                }
            }
        }

        syncState.lastPollAt = new Date();
        syncState.lastError = null;
        syncState.status = 'active';
        syncState.stats.totalOrdersSynced += orders.length;
        syncState.stats.totalItemsSynced += recorded;
        syncState.stats.totalUnmatched += unmatched;
        syncState.stats.duplicatesSkipped += duplicates;
        syncState.stats.lastSyncDuration = Date.now() - startTime;
        await syncState.save();

        console.log(`[InkSoft] Poll complete: ${recorded} recorded, ${duplicates} duplicates, ${unmatched} unmatched, ${errors} errors (${Date.now() - startTime}ms)`);

        return { recorded, duplicates, unmatched, errors, ordersChecked: orders.length };
    } catch (err) {
        console.error('[InkSoft] Poll error:', err.message);

        syncState.lastError = err.message;
        syncState.lastErrorAt = new Date();
        syncState.status = 'error';
        await syncState.save();

        return { error: err.message };
    }
}

function startGlobalPoller(intervalMs) {
    stopGlobalPoller();

    const interval = intervalMs || POLL_INTERVAL_MS_DEFAULT;

    if (!process.env.INKSOFT_API_KEY) {
        console.log('[InkSoft] INKSOFT_API_KEY not set — poller not started');
        return;
    }

    console.log(`[InkSoft] Starting global poller (every ${interval / 60000} min)`);

    pollOrders().catch(err => {
        console.error('[InkSoft] Initial poll error:', err.message);
    });

    globalPollerTimer = setInterval(() => {
        pollOrders().catch(err => {
            console.error('[InkSoft] Poll error:', err.message);
        });
    }, interval);
}

function stopGlobalPoller() {
    if (globalPollerTimer) {
        clearInterval(globalPollerTimer);
        globalPollerTimer = null;
        console.log('[InkSoft] Global poller stopped');
    }
}

async function getSyncStatus() {
    const syncState = await InkSoftSync.findOne({});
    if (!syncState) {
        return {
            configured: false,
            hasApiKey: !!process.env.INKSOFT_API_KEY
        };
    }

    return {
        configured: true,
        hasApiKey: !!process.env.INKSOFT_API_KEY,
        enabled: syncState.enabled,
        status: syncState.status,
        storeUrl: syncState.storeUrl,
        lastPollAt: syncState.lastPollAt,
        lastError: syncState.lastError,
        lastErrorAt: syncState.lastErrorAt,
        pollIntervalMinutes: syncState.pollIntervalMinutes,
        stats: syncState.stats,
        isPolling: !!globalPollerTimer
    };
}

module.exports = {
    pollOrders,
    startGlobalPoller,
    stopGlobalPoller,
    getSyncStatus,
    matchOrderToLabel,
    mapInkSoftOrder,
    fetchOrders,
    getOrCreateSyncState
};
