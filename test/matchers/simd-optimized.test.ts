import { SimdOptimizedMatcher } from '../../src/matchers/simd-optimized';

describe('Matchers: SimdOptimizedMatcher', () => {
  it('falls back to scalar path or handles simd path without error', () => {
    const m = new SimdOptimizedMatcher();
    const dist = m.optimizedLevenshteinDistance('kitten', 'sitting');
    expect(dist).toBeGreaterThan(0);
    const batch = m.batchLevenshteinDistance(['a','bb','ccc'], ['a','bbb']);
    expect(batch.length).toBe(3);
  });
});

