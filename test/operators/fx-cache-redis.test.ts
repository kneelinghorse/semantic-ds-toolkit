import { FXCache, OfflineMode } from '../../src/operators/fx-cache';

declare const global: any;

describe('Operators: FXCache with Redis-like client', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ rates: { EUR: 0.91, USD: 1 } })
    }));
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('writes entries to Redis (setEx) with TTL and reads back after clearCache', async () => {
    const store = new Map<string, string>();
    const redisStub = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      setEx: jest.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return 'OK';
      }),
      expire: jest.fn(async () => 'OK')
    };

    const fx = new FXCache(1000, { enableRedis: true, redisClient: redisStub as any, dataSources: ['ecb'] });

    // First fetch should go to network and write to Redis
    const first = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.NETWORK_FIRST });
    expect(['ecb','fed','fallback']).toContain(first.source);
    expect(redisStub.setEx).toHaveBeenCalled();
    // ttlSeconds should be floor(ttlMs/1000) = 1
    for (const call of redisStub.setEx.mock.calls) {
      expect(call[1]).toBe(1);
    }

    // Clear in-memory cache and ensure we can read from Redis
    fx.clearCache();
    const second = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(second.source).toBe('cache');
    expect(second.stale).toBe(false);
    expect(redisStub.get).toHaveBeenCalled();
  });

  it('uses set+expire path when setEx is unavailable', async () => {
    const store = new Map<string, string>();
    const redisStub = {
      get: jest.fn(async (key: string) => store.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
      expire: jest.fn(async (_key: string, _ttl: number) => 'OK')
    };

    const fx = new FXCache(2500, { enableRedis: true, redisClient: redisStub as any, dataSources: ['ecb'] });
    const first = await fx.getExchangeRate('USD', 'EUR');
    expect(['ecb','fed','fallback']).toContain(first.source);
    expect(redisStub.set).toHaveBeenCalledTimes(2);
    expect(redisStub.expire).toHaveBeenCalledTimes(2);
    // ttlSeconds should be floor(2500/1000) = 2
    for (const call of (redisStub.expire as any).mock.calls) {
      expect(call[1]).toBe(2);
    }
    fx.clearCache();
    const second = await fx.getExchangeRate('USD', 'EUR', { mode: OfflineMode.CACHE_FIRST });
    expect(second.source).toBe('cache');
  });
});
