import { describe, it, expect, beforeEach } from '@jest/globals';

import { FXCache, OfflineMode } from '../src/operators/fx-cache';

describe('FXCache offline modes', () => {
  let cache: FXCache;

  beforeEach(() => {
    cache = new FXCache(500, {
      fallbackRates: {
        'USD_EUR': 0.9,
        'EUR_USD': 1.1
      },
      dataSources: []
    });
  });

  it('returns fallback rates when no network sources are configured', async () => {
    const result = await cache.getExchangeRate('USD', 'EUR');
    expect(result.rate).toBeCloseTo(0.9, 5);
    expect(result.source).toBe('fallback');
    expect(result.confidence).toBeLessThan(1);
  });

  it('throws in strict offline mode when no cache exists', async () => {
    await expect(
      cache.getExchangeRate('EUR', 'GBP', { mode: OfflineMode.STRICT_OFFLINE })
    ).rejects.toThrow('No cached rate');
  });

  it('serves stale cache in strict offline mode when available', async () => {
    // Populate cache using fallback
    await cache.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });

    const cacheKey = (cache as any).getCacheKey('USD', 'EUR');
    const memoryCache = (cache as any).memoryCache as Map<string, any>;
    const cached = memoryCache.get(cacheKey);
    cached.timestamp = Date.now() - 3600 * 1000; // force staleness
    memoryCache.set(cacheKey, cached);

    const result = await cache.getExchangeRate('USD', 'EUR', { mode: OfflineMode.STRICT_OFFLINE });
    expect(result.source).toBe('cache');
    expect(result.stale).toBeTruthy();
    expect(result.rate).toBeCloseTo(0.9, 5);
  });
});
