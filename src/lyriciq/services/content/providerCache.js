'use strict';

const config = require('../../config');

/**
 * Namespaced in-memory cache with TTL and LRU eviction.
 *
 * Namespaces have independent TTLs so lyric content (licence-limited) can be
 * held far more briefly than track metadata. The interface is deliberately
 * small so a Redis-backed implementation can replace it without touching
 * callers.
 */
const NAMESPACE_TTL = {
    trackMetadata: () => config.cache.trackMetadataTtlMs,
    lyricContent: () => config.cache.lyricContentTtlMs,
    question: () => config.cache.questionTtlMs,
    dailyChallenge: () => config.cache.dailyChallengeTtlMs,
    restrictions: () => config.cache.restrictionsTtlMs,
    featureFlags: () => config.cache.featureFlagsTtlMs
};

class ProviderCache {
    constructor({ maxEntries = config.cache.maxEntriesPerNamespace, now = Date.now } = {}) {
        this.maxEntries = maxEntries;
        this.now = now;
        this.stores = new Map();
        this.stats = { hits: 0, misses: 0 };
    }

    _store(ns) {
        if (!this.stores.has(ns)) this.stores.set(ns, new Map());
        return this.stores.get(ns);
    }

    _ttl(ns, ttlMs) {
        if (typeof ttlMs === 'number') return ttlMs;
        const fn = NAMESPACE_TTL[ns];
        return fn ? fn() : 60 * 1000;
    }

    get(ns, key) {
        const store = this._store(ns);
        const entry = store.get(key);
        if (!entry) { this.stats.misses++; return undefined; }
        if (entry.expiresAt <= this.now()) { store.delete(key); this.stats.misses++; return undefined; }
        // LRU: refresh insertion order
        store.delete(key);
        store.set(key, entry);
        this.stats.hits++;
        return entry.value;
    }

    set(ns, key, value, ttlMs) {
        const store = this._store(ns);
        const ttl = this._ttl(ns, ttlMs);
        if (ttl <= 0) return value;
        if (store.has(key)) store.delete(key);
        store.set(key, { value, expiresAt: this.now() + ttl });
        while (store.size > this.maxEntries) {
            const oldest = store.keys().next().value;
            store.delete(oldest);
        }
        return value;
    }

    /** Memoise an async loader. */
    async wrap(ns, key, loader, ttlMs) {
        const hit = this.get(ns, key);
        if (hit !== undefined) return hit;
        const value = await loader();
        if (value !== undefined && value !== null) this.set(ns, key, value, ttlMs);
        return value;
    }

    del(ns, key) { this._store(ns).delete(key); }
    clear(ns) { if (ns) this._store(ns).clear(); else this.stores.clear(); }
    size(ns) { return this._store(ns).size; }
}

const shared = new ProviderCache();

module.exports = { ProviderCache, cache: shared };
