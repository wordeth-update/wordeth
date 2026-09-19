const { ProviderCache } = require('../../../src/lyriciq/services/content/providerCache');

describe('ProviderCache', () => {
    test('namespaced TTL and LRU eviction', async () => {
        let now = 1000;
        const cache = new ProviderCache({ maxEntries: 2, now: () => now });
        cache.set('lyricContent', 'a', 1, 100);
        cache.set('trackMetadata', 'a', 2, 100);
        expect(cache.get('lyricContent', 'a')).toBe(1);
        expect(cache.get('trackMetadata', 'a')).toBe(2);
        now = 1200;
        expect(cache.get('lyricContent', 'a')).toBeUndefined();
        cache.set('q', 'x', 1, 1000); cache.set('q', 'y', 2, 1000); cache.get('q', 'x'); cache.set('q', 'z', 3, 1000);
        expect(cache.get('q', 'y')).toBeUndefined(); // least recently used evicted
        expect(cache.get('q', 'x')).toBe(1);
        let loads = 0;
        const loader = async () => { loads++; return 'v'; };
        expect(await cache.wrap('q', 'w', loader, 1000)).toBe('v');
        expect(await cache.wrap('q', 'w', loader, 1000)).toBe('v');
        expect(loads).toBe(1);
        expect(cache.stats.hits).toBeGreaterThan(0);
    });
});
