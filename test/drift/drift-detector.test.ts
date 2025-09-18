import { DriftDetector } from '../../src/drift/drift-detector';
import { StableColumnAnchor, ColumnData, ColumnFingerprint } from '../../src/types/anchor.types';

describe('Drift: DriftDetector', () => {
  function makeAnchor(fp: ColumnFingerprint): StableColumnAnchor {
    const now = new Date().toISOString();
    return {
      dataset: 'baseline',
      column_name: 'amount',
      anchor_id: 'sca_test',
      fingerprint: JSON.stringify(fp),
      first_seen: now,
      last_seen: now
    };
  }

  it('detects distribution drift on numeric column', async () => {
    const historicalFp: ColumnFingerprint = {
      dtype: 'float64',
      cardinality: 100,
      regex_patterns: [],
      null_ratio: 0,
      unique_ratio: 0.9,
      sample_values: Array.from({ length: 100 }, (_, i) => (i + 1).toString()),
      min: 1,
      max: 100
    };

    const currentColumn: ColumnData = {
      name: 'amount',
      data_type: 'float64',
      values: Array.from({ length: 200 }, (_, i) => (i + 500)) // shifted
    };

    const currentFp: ColumnFingerprint = {
      dtype: 'float64',
      cardinality: 200,
      regex_patterns: [],
      null_ratio: 0,
      unique_ratio: 0.95,
      sample_values: currentColumn.values.slice(0, 100).map(v => String(v)),
      min: currentColumn.values[0],
      max: currentColumn.values[currentColumn.values.length - 1]
    };

    const detector = new DriftDetector({ psi_threshold: 0.1, ks_test_threshold: 0.05 });
    const result = await detector.detectDrift(makeAnchor(historicalFp), currentColumn, currentFp);
    expect(result.drift_detected).toBe(true);
    expect(result.drift_types.some(d => d.type === 'distribution')).toBe(true);
    expect(['low','medium','high','critical']).toContain(result.severity);
  });
});

