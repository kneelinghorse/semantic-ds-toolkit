import { FXCache, OfflineMode } from '../../src/operators/fx-cache';

describe('Operators: FXCache edge cases', () => {
  it('NETWORK_FIRST without cache and no fallback throws', async () => {
    const fx = new FXCache(1000, { dataSources: [] });
    await expect(fx.getExchangeRate('AAA', 'BBB', { mode: OfflineMode.NETWORK_FIRST }))
      .rejects.toBeTruthy();
  });
});

