import { PerformanceOptimizedDriftDetector } from '../../src/drift/performance-optimizer';
import { StableColumnAnchor, ColumnFingerprint, ColumnData } from '../../src/types/anchor.types';

function makeAnchor(dtype: string, sample: any[], extras: Partial<ColumnFingerprint> = {}): StableColumnAnchor {
  const fp: ColumnFingerprint = {
    dtype,
    cardinality: new Set(sample).size,
    regex_patterns: [],
    null_ratio: 0,
    unique_ratio: new Set(sample).size / sample.length,
    sample_values: sample.slice(0, 20).map(String),
    ...extras
  };
  const now = new Date().toISOString();
  return {
    dataset: 'perf',
    column_name: 'col',
    anchor_id: 'perf:col',
    fingerprint: JSON.stringify(fp),
    first_seen: now,
    last_seen: now
  };
}

describe('Drift: PerformanceOptimizedDriftDetector', () => {
  it('detectDriftFast adds performance metrics and sampling flags', async () => {
    const det = new PerformanceOptimizedDriftDetector();
    const values = Array.from({ length: 200_000 }, () => Math.random() * 1000);
    const anchor = makeAnchor('float64', values);
    const column: ColumnData = { name: 'col', values, data_type: 'float64' };
    const fp: ColumnFingerprint = JSON.parse(anchor.fingerprint);

    const res = await det.detectDriftFast(anchor, column, fp);
    expect(res.performance_metrics).toBeDefined();
    expect(res.performance_metrics!.samples_processed).toBeGreaterThan(0);
    expect(res.performance_metrics!.optimization_applied).toBe(true);
    expect(res.performance_metrics!.compression_ratio).toBeGreaterThan(0);
    expect(res.performance_metrics!.compression_ratio).toBeLessThanOrEqual(1);
  });

  it('detectDriftStreaming early-exits on critical type change', async () => {
    const det = new PerformanceOptimizedDriftDetector();
    const histAnchor = makeAnchor('string', ['a', 'b', 'c']);

    async function* stream() {
      for (let i = 0; i < 3000; i++) {
        yield i * 1.0; // numeric -> dtype float64
      }
    }

    const res = await det.detectDriftStreaming(histAnchor, stream(), { earlyExit: true, maxSamples: 5000 });
    expect(res.drift_detected).toBe(true);
    expect(res.severity).toBe('critical');
  });

  it('benchmarkPerformance returns metrics for sizes', async () => {
    const det = new PerformanceOptimizedDriftDetector();
    const out = await det.benchmarkPerformance([1000, 5000]);
    expect(Object.keys(out).length).toBe(2);
    expect(out[1000].avgTime).toBeGreaterThanOrEqual(0);
    expect(out[1000].throughput).toBeGreaterThan(0);
  });
});

