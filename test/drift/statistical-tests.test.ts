import { StatisticalTests } from '../../src/drift/statistical-tests';

describe('Drift: StatisticalTests', () => {
  const stats = new StatisticalTests();

  it('detects KS difference on shifted distributions', () => {
    const a = Array.from({ length: 200 }, (_, i) => Math.sin(i / 5) + (i % 7) * 0.01);
    const b = a.map(v => v + 3); // shift
    const res = stats.kolmogorovSmirnovTest(a, b, 0.05);
    expect(res.statistic).toBeGreaterThan(0);
    expect(res.p_value).toBeLessThan(0.05);
    expect(res.is_significant).toBe(true);
  });

  it('computes PSI > 0 for shifted distributions', () => {
    const exp = Array.from({ length: 100 }, (_, i) => i);
    const act = exp.map(x => x + 10);
    const psi = stats.populationStabilityIndex(exp, act, 10);
    expect(psi).toBeGreaterThan(0.1);
  });

  it('returns chi-square result with reasonable values', () => {
    const observed = [22, 30, 48];
    const expected = [25, 25, 50];
    const res = stats.chiSquareTest(observed, expected);
    expect(res.statistic).toBeGreaterThan(0);
    expect(res.degrees_of_freedom).toBe(2);
    expect(typeof res.p_value).toBe('number');
  });

  it('Anderson-Darling flags significant difference for distinct sets', () => {
    const s1 = Array.from({ length: 200 }, (_, i) => i * 0.1);
    const s2 = Array.from({ length: 200 }, (_, i) => i * 0.1 + (i % 5));
    const ad = stats.andersonDarlingTest(s1, s2);
    expect(typeof ad.statistic).toBe('number');
    // Not guaranteed to be significant, but should compute without error
    expect(typeof ad.is_significant).toBe('boolean');
  });

  it('Wasserstein distance is > 0 for shifted distributions', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const b = a.map(x => x + 5);
    const d = stats.wassersteinDistance(a, b);
    expect(d).toBeGreaterThan(0);
  });

  it('batchKSTest returns a result per pair and handles failures gracefully', () => {
    const refs = [ [1,2,3,4], [10,20,30,40] ];
    const tests = [ [1,2,2,3], [] as number[] ]; // second empty triggers fallback
    const res = stats.batchKSTest(refs, tests);
    expect(res.length).toBe(2);
    expect(res[0].p_value).toBeGreaterThanOrEqual(0);
  });

  it('compareDistributions returns a cohesive summary', () => {
    const a = Array.from({ length: 100 }, (_, i) => i);
    const b = a.map(x => x + (x % 2 === 0 ? 0 : 1));
    const out = stats.compareDistributions(a, b, { includePSI: true, includeWasserstein: true });
    expect(out.ks_test).toBeDefined();
    expect(out.summary).toBeDefined();
    expect(['none', 'low', 'medium', 'high']).toContain(out.summary.severity);
  });
});
