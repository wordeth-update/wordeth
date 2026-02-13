const axios = require('axios');
const crypto = require('crypto');
const InkSoftSync = require('../models/InkSoftSync');
const Label = require('../models/Label');
const { recordSale } = require('./payoutService');

const POLL_INTERVAL_MS_DEFAULT = 15 * 60 * 1000;
const SESSION_REFRESH_BUFFER_MS = 30 * 60 * 1000;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

const activePollers = new Map();

function getEncryptionKey() {
    const secret = process.env.JWT_SECRET || 'default-inksoft-key';
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encrypted) {
    const key = getEncryptionKey();
    const [ivHex, authTagHex, encryptedData] = encrypted.split(':');
    if (!ivHex || !authTagHex || !encryptedData) {
        return encrypted;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function authenticateWithCredentials(syncConfig) {
    const { storeUrl, apiEmail, apiPasswordEncrypted } = syncConfig;
    const baseUrl = storeUrl.replace(/\/$/, '');
    const password = decrypt(apiPasswordEncrypted);

    try {
        const res = await axios.post(`${baseUrl}/Api2/SignIn`, null, {
            params: {
                Email: apiEmail,
                Password: password,
                Format: 'JSON'
            },
            timeout: 15000
        });

        if (res.data && res.data.OK && res.data.Data && res.data.Data.Token) {
            syncConfig.sessionToken = res.data.Data.Token;
            syncConfig.sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await syncConfig.save();
            return res.data.Data.Token;
        }

        throw new Error(res.data?.Messages?.[0]?.Content || 'Authentication failed');
    } catch (err) {
        const msg = err.response?.data?.Messages?.[0]?.Content || err.message;
        syncConfig.lastError = `Auth failed: ${msg}`;
        syncConfig.lastErrorAt = new Date();
        syncConfig.status = 'error';
        await syncConfig.save();
        throw new Error(`InkSoft auth failed: ${msg}`);
    }
}

async function validateApiKey(syncConfig) {
    const baseUrl = syncConfig.storeUrl.replace(/\/$/, '');
    const integrationKey = decrypt(syncConfig.integrationKeyEncrypted);

    try {
        const res = await axios.get(`${baseUrl}/Api2/GetOrders`, {
            params: {
                IntegrationKey: integrationKey,
                MaxResults: 1,
                Format: 'JSON'
            },
            timeout: 15000
        });

        if (res.data && res.data.OK) {
            return true;
        }

        const msg = res.data?.Messages?.[0]?.Content || 'API key validation failed';
        throw new Error(msg);
    } catch (err) {
        if (err.response?.status === 400) {
            const msg = err.response?.data?.Messages?.[0]?.Content || 'Invalid API key';
            throw new Error(`InkSoft API key validation failed: ${msg}`);
        }
        throw err;
    }
}

function getAuthParams(syncConfig) {
    if (syncConfig.authMode === 'api_key' && syncConfig.integrationKeyEncrypted) {
        return { IntegrationKey: decrypt(syncConfig.integrationKeyEncrypted) };
    }
    return { SessionToken: syncConfig.sessionToken };
}

async function ensureAuth(syncConfig) {
    if (syncConfig.authMode === 'api_key' && syncConfig.integrationKeyEncrypted) {
        return;
    }

    if (syncConfig.sessionToken && syncConfig.sessionExpiresAt &&
        new Date(syncConfig.sessionExpiresAt) > new Date(Date.now() + SESSION_REFRESH_BUFFER_MS)) {
        try {
            const baseUrl = syncConfig.storeUrl.replace(/\/$/, '');
            const res = await axios.get(`${baseUrl}/Api2/GetSession`, {
                params: { SessionToken: syncConfig.sessionToken, Format: 'JSON' },
                timeout: 10000
            });
            if (res.data && res.data.OK) {
                return;
            }
        } catch (e) {
        }
    }

    await authenticateWithCredentials(syncConfig);
}

async function fetchOrdersPage(baseUrl, authParams, params) {
    const res = await axios.get(`${baseUrl}/Api2/GetOrders`, {
        params: { ...params, ...authParams, Format: 'JSON' },
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

async function fetchOrders(syncConfig) {
    await ensureAuth(syncConfig);
    const baseUrl = syncConfig.storeUrl.replace(/\/$/, '');
    const authParams = getAuthParams(syncConfig);
    const pageSize = 100;
    const maxPages = 10;

    const params = { MaxResults: pageSize };
    if (syncConfig.lastPollAt) {
        params.StartDate = syncConfig.lastPollAt.toISOString();
    }

    let allOrders = [];
    let page = 0;

    while (page < maxPages) {
        params.Skip = page * pageSize;

        let orders;
        try {
            orders = await fetchOrdersPage(baseUrl, authParams, params);
        } catch (err) {
            if (page === 0 && syncConfig.authMode === 'credentials' &&
                (err.response?.status === 400 || err.response?.status === 401)) {
                syncConfig.sessionToken = null;
                await syncConfig.save();
                await authenticateWithCredentials(syncConfig);
                const newAuthParams = getAuthParams(syncConfig);
                orders = await fetchOrdersPage(baseUrl, newAuthParams, params);
            } else {
                throw err;
            }
        }

        allOrders = allOrders.concat(orders);

        if (orders.length < pageSize) break;
        page++;
    }

    return allOrders;
}

function mapInkSoftOrder(order, label) {
    const items = order.Items || order.OrderItems || [];
    const mapped = [];

    const orderId = String(order.OrderId || order.Id || order.OrderNumber || '');
    if (!orderId) return mapped;

    const orderDate = order.OrderDate || order.DateCreated || order.CreatedDate || new Date().toISOString();
    const orderStatus = (order.Status || order.OrderStatus || 'confirmed').toLowerCase();
    const customer = order.Customer || order.ShipTo || {};

    for (const item of items) {
        const sku = String(item.Sku || item.SKU || item.ProductSku || item.ItemId || '');
        if (!sku) continue;

        const productName = item.ProductName || item.Name || item.Description || 'Unknown Product';
        const quantity = parseInt(item.Quantity || item.Qty || 1);
        const unitPrice = parseFloat(item.UnitPrice || item.Price || 0);
        const totalAmount = parseFloat(item.TotalPrice || item.Total || item.LineTotal || (unitPrice * quantity));
        const artistName = item.ArtistName || item.Designer || item.BrandName || label.name;
        const artistSlug = artistName.toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        const productType = detectProductType(productName, item.Category || item.ProductType || '');

        mapped.push({
            orderId: `IS-${orderId}`,
            sellerType: 'label',
            sellerId: label._id,
            labelId: label._id,
            artistName,
            artistSlug,
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

async function pollOrders(labelId) {
    const syncConfig = await InkSoftSync.findOne({ labelId, enabled: true });
    if (!syncConfig) {
        console.log(`[InkSoft] No active sync config for label ${labelId}`);
        return null;
    }

    const startTime = Date.now();
    console.log(`[InkSoft] Polling orders for label ${labelId} (auth: ${syncConfig.authMode})...`);

    try {
        const label = await Label.findById(labelId);
        if (!label) throw new Error(`Label not found: ${labelId}`);

        const orders = await fetchOrders(syncConfig);
        console.log(`[InkSoft] Fetched ${orders.length} orders from InkSoft`);

        let recorded = 0;
        let duplicates = 0;
        let errors = 0;

        for (const order of orders) {
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

        syncConfig.lastPollAt = new Date();
        syncConfig.lastError = null;
        syncConfig.status = 'active';
        syncConfig.stats.totalOrdersSynced += orders.length;
        syncConfig.stats.totalItemsSynced += recorded;
        syncConfig.stats.duplicatesSkipped += duplicates;
        syncConfig.stats.lastSyncDuration = Date.now() - startTime;
        await syncConfig.save();

        console.log(`[InkSoft] Poll complete: ${recorded} recorded, ${duplicates} duplicates, ${errors} errors (${Date.now() - startTime}ms)`);

        return { recorded, duplicates, errors, ordersChecked: orders.length };
    } catch (err) {
        console.error(`[InkSoft] Poll error for label ${labelId}:`, err.message);

        syncConfig.lastError = err.message;
        syncConfig.lastErrorAt = new Date();
        syncConfig.status = 'error';
        await syncConfig.save();

        return { error: err.message };
    }
}

function startPoller(labelId, intervalMs) {
    stopPoller(labelId);

    const labelStr = labelId.toString();
    const interval = intervalMs || POLL_INTERVAL_MS_DEFAULT;

    console.log(`[InkSoft] Starting poller for label ${labelStr} (every ${interval / 60000} min)`);

    pollOrders(labelId).catch(err => {
        console.error(`[InkSoft] Initial poll error for ${labelStr}:`, err.message);
    });

    const timerId = setInterval(() => {
        pollOrders(labelId).catch(err => {
            console.error(`[InkSoft] Poll error for ${labelStr}:`, err.message);
        });
    }, interval);

    activePollers.set(labelStr, timerId);
}

function stopPoller(labelId) {
    const labelStr = labelId.toString();
    if (activePollers.has(labelStr)) {
        clearInterval(activePollers.get(labelStr));
        activePollers.delete(labelStr);
        console.log(`[InkSoft] Stopped poller for label ${labelStr}`);
    }
}

async function initAllPollers() {
    try {
        const configs = await InkSoftSync.find({ enabled: true, status: { $in: ['active', 'setup'] } });
        console.log(`[InkSoft] Initializing ${configs.length} poller(s)`);

        for (const config of configs) {
            startPoller(config.labelId, config.pollIntervalMinutes * 60 * 1000);
        }
    } catch (err) {
        console.error('[InkSoft] Failed to initialize pollers:', err.message);
    }
}

function stopAllPollers() {
    for (const [labelId] of activePollers) {
        stopPoller(labelId);
    }
}

async function getSyncStatus(labelId) {
    const config = await InkSoftSync.findOne({ labelId });
    if (!config) return null;

    return {
        enabled: config.enabled,
        status: config.status,
        authMode: config.authMode,
        lastPollAt: config.lastPollAt,
        lastError: config.lastError,
        lastErrorAt: config.lastErrorAt,
        pollIntervalMinutes: config.pollIntervalMinutes,
        stats: config.stats,
        isPolling: activePollers.has(labelId.toString())
    };
}

module.exports = {
    authenticateWithCredentials,
    validateApiKey,
    pollOrders,
    startPoller,
    stopPoller,
    initAllPollers,
    stopAllPollers,
    getSyncStatus,
    mapInkSoftOrder,
    fetchOrders,
    encrypt,
    decrypt
};
