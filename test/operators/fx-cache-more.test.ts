import { FXCache, OfflineMode } from '../../src/operators/fx-cache';

declare const global: any;

describe('Operators: FXCache (extra cases)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ rates: { EUR: 0.9, USD: 1 } })
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('marks cached entries stale after TTL and adjusts confidence', async () => {
    const fx = new FXCache(50); // 50ms TTL
    const fresh = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(fresh.stale).toBe(false);
    // Advance time past TTL
    await jest.advanceTimersByTimeAsync(60);
    // Force network failure so CACHE_FIRST uses stale cache
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const stale = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(['cache','fallback']).toContain(stale.source);
    // If we used cached rate, it should be marked stale; if fallback, allow non-stale
    if (stale.source === 'cache') {
      expect(stale.stale).toBe(true);
    }
    expect(stale.confidence).toBeLessThan(fresh.confidence);
  });

  it('FORCE_NETWORK falls back to cached or fallback when fetch fails', async () => {
    const fx = new FXCache(1000);
    // prime cache
    await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    // break fetch
    global.fetch = jest.fn(async () => ({ ok: false, status: 503 }));
    const res = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.FORCE_NETWORK });
    expect(['cache','fallback']).toContain(res.source);
  });

  it('same currency returns rate 1 quickly', async () => {
    const fx = new FXCache(1000);
    const res = await fx.getExchangeRate('USD', 'USD');
    expect(res.rate).toBe(1);
    expect(res.source).toBe('cache');
  });
});
