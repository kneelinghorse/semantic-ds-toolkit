import { PatternDriftDetector } from '../../src/drift/pattern-drift';
import { ColumnFingerprint } from '../../src/types/anchor.types';

describe('Drift: PatternDriftDetector', () => {
  const detector = new PatternDriftDetector();

  function fp(sample: string[], regex: string[] = []): ColumnFingerprint {
    return {
      dtype: 'string',
      cardinality: new Set(sample).size,
      regex_patterns: regex,
      null_ratio: 0,
      unique_ratio: 0.9,
      sample_values: sample
    };
  }

  it('detects pattern drift when formats change significantly', async () => {
    const historical = fp([
      'john.smith@example.com',
      'jane.doe@company.org',
      'user+1@service.io',
      'alpha.beta@test.net',
      'person@example.co'
    ]);

    const current = fp([
      '2024-01-01',
      '2024-02-15',
      '2023-12-31',
      '2022-07-04',
      '2024-06-30'
    ]);

    const drift = await detector.detectPatternDrift(historical, current, 0.85);
    expect(drift).not.toBeNull();
    expect(drift!.type).toBe('format');
  });
});

