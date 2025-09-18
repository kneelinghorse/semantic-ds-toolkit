import { FXCache, OfflineMode } from '../../src/operators/fx-cache';

declare const global: any;

describe('Operators: FXCache', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (String(url).includes('exchangerate')) {
          return { rates: { EUR: 0.9, USD: 1 } };
        }
        return { observations: [{ value: '1.1' }] };
      }
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = realFetch;
  });

  it('STRICT_OFFLINE throws when cache is empty', async () => {
    const fx = new FXCache(1000);
    await expect(fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.STRICT_OFFLINE })).rejects.toBeTruthy();
  });

  it('CACHE_FIRST returns cached value when present and fresh', async () => {
    const fx = new FXCache(60_000);
    // First call will fetch and store
    const first = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(first.source === 'ecb' || first.source === 'fed' || first.source === 'fallback').toBe(true);
    // Second call should hit cache
    const second = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(second.source).toBe('cache');
    expect(second.stale).toBe(false);
  });

  it('NETWORK_FIRST falls back to cache or fallback when fetch fails', async () => {
    const fx = new FXCache(60_000);
    // Prime cache
    await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    // Break fetch
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const res = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.NETWORK_FIRST });
    expect(['cache','fallback']).toContain(res.source);
  });

  it('uses fallback rate when all sources fail', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500 }));
    const fx = new FXCache(1000, { dataSources: [], fallbackRates: { 'USD_EUR': 0.85 } });
    const res = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(res.rate).toBeCloseTo(0.85, 5);
    expect(res.source).toBe('fallback');
  });
});
