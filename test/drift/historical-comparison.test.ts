import { HistoricalComparisonEngine, HistoricalDataPoint } from '../../src/drift/historical-comparison';
import { ColumnFingerprint, ColumnData, StableColumnAnchor } from '../../src/types/anchor.types';

describe('Drift: HistoricalComparisonEngine (smoke)', () => {
  function fpFromRange(min: number, max: number): ColumnFingerprint {
    const sample = Array.from({ length: 10 }, (_, i) => String(min + i * ((max - min) / 9)));
    return {
      dtype: 'float64',
      cardinality: sample.length,
      regex_patterns: [],
      null_ratio: 0,
      unique_ratio: 1,
      sample_values: sample,
      min,
      max
    };
  }

  function anchorFor(fp: ColumnFingerprint): StableColumnAnchor {
    const now = new Date().toISOString();
    return {
      dataset: 'baseline',
      column_name: 'amount',
      anchor_id: 'sca_hist',
      fingerprint: JSON.stringify(fp),
      first_seen: now,
      last_seen: now
    };
  }

  function makeHistory(points: Array<{ ts: string; min: number; max: number }>): HistoricalDataPoint[] {
    return points.map(({ ts, min, max }) => ({
      timestamp: ts,
      anchor_snapshot: anchorFor(fpFromRange(min, max)),
      fingerprint: fpFromRange(min, max),
      column_data: { name: 'amount', data_type: 'float64', values: Array.from({ length: 50 }, (_, i) => min + (i * (max - min)) / 49) },
      metadata: {
        data_source: 'test',
        processing_version: '1.0',
        sample_size: 50,
        quality_score: 1
      }
    }));
  }

  it('produces a complete comparison structure with trends and stability', async () => {
    const engine = new HistoricalComparisonEngine();

    const history = makeHistory([
      { ts: '2024-01-01T00:00:00Z', min: 0, max: 100 },
      { ts: '2024-02-01T00:00:00Z', min: 0, max: 120 },
      { ts: '2024-03-01T00:00:00Z', min: 10, max: 140 },
      { ts: '2024-04-01T00:00:00Z', min: 20, max: 200 }
    ]);

    const currentData: ColumnData = {
      name: 'amount',
      data_type: 'float64',
      values: Array.from({ length: 60 }, (_, i) => 50 + i)
    };
    const currentFp: ColumnFingerprint = fpFromRange(50, 110);

    const comparison = await engine.compareWithHistory(currentData, currentFp, history, {
      baseline_days: 45,
      include_seasonality: true,
      anomaly_detection: true,
      forecasting: false
    });

    // Structural assertions
    expect(comparison).toBeDefined();
    // Baseline/comparison windows may be empty depending on current date; just ensure structure
    expect(Array.isArray(comparison.baseline_period.data_points)).toBe(true);
    expect(Array.isArray(comparison.comparison_period.data_points)).toBe(true);
    expect(Array.isArray(comparison.drift_evolution.drift_trajectory)).toBe(true);
    expect(['accelerating', 'decelerating', 'stable']).toContain(comparison.drift_evolution.velocity_analysis.velocity_trend);
    expect(comparison.stability_metrics.overall_stability_score).toBeGreaterThanOrEqual(0);
    expect(comparison.stability_metrics.overall_stability_score).toBeLessThanOrEqual(1);
    expect(['improving', 'degrading', 'stable']).toContain(comparison.stability_metrics.stability_trend);
    expect(['improving', 'degrading', 'stable', 'cyclical']).toContain(comparison.trend_analysis.long_term_trend);
    // Optional sections exist
    expect(comparison.anomaly_detection.anomaly_periods).toBeDefined();
    expect(comparison.seasonality_patterns.seasonal_patterns).toBeDefined();
  });
});
