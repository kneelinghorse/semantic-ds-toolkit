import { FXCache } from '../../src/operators/fx-cache';

declare const global: any;

describe('Operators: FXCache preload & warmup', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    jest.useRealTimers();
    const tmpFx = new FXCache(1000);
    const codes = tmpFx.getSupportedCurrencies();
    global.fetch = jest.fn(async (_url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        rates: Object.fromEntries(codes.map((c) => [c, 1 + (c.charCodeAt(0) % 7) / 10]))
      })
    }));
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('preloadRates populates cache and produces stats', async () => {
    const fx = new FXCache(5_000, { dataSources: ['ecb'] });
    await fx.preloadRates([
      { from: 'USD', to: 'EUR' },
      { from: 'USD', to: 'GBP' },
      { from: 'EUR', to: 'USD' }
    ]);
    const stats = fx.getCacheStats();
    expect(stats.size).toBeGreaterThanOrEqual(3);
    expect(stats.oldestEntry).not.toBeNull();
    expect(stats.newestEntry).not.toBeNull();
  });

  it('warmupCache populates many entries from ECB', async () => {
    const fx = new FXCache(5_000, { dataSources: ['ecb'] });
    await fx.warmupCache('USD');
    const stats = fx.getCacheStats();
    expect(stats.size).toBeGreaterThan(20);
    expect(stats.newestEntry).toBeInstanceOf(Date);
  });
});

