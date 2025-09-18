import { describe, it, expect, beforeEach } from '@jest/globals';

import { UnitConverter } from '../src/operators/unit-convert';
import { OfflineMode } from '../src/operators/fx-cache';

describe('UnitConverter YAML hydration', () => {
  let converter: UnitConverter;

  beforeEach(() => {
    converter = new UnitConverter({
      cacheTTL: 1000,
      offlineMode: OfflineMode.STRICT_OFFLINE,
      fallbackRates: {
        'USD_EUR': 0.92,
        'EUR_USD': 1.09
      }
    });
  });

  it('loads currency definitions from YAML', async () => {
    const btcInfo = converter.getUnitInfo('BTC');
    expect(btcInfo).toBeDefined();
    expect(btcInfo?.category).toBe('currency');
  });

  it('supports aliases defined in YAML', async () => {
    const result = await converter.convert(1, 'meter', 'kilometer');
    expect(result.value).toBeCloseTo(0.001, 6);
  });

  it('handles additional categories like volume via YAML definitions', async () => {
    const result = await converter.convert(1, 'l', 'ml');
    expect(result.value).toBeCloseTo(1000, 6);
  });
});
