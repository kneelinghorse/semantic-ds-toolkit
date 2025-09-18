import { describe, it, expect } from '@jest/globals';

import { TimeAligner } from '../src/operators/align-time';

const sampleSeries = [
  { timestamp: new Date('2024-01-01T00:15:00Z'), value: 10 },
  { timestamp: new Date('2024-01-01T01:45:00Z'), value: 12 },
  { timestamp: new Date('2024-01-01T03:02:00Z'), value: 18 }
];

describe('TimeAligner integration', () => {
  it('converts timezone and aligns grain while preserving metadata', async () => {
    const aligner = new TimeAligner();

    const result = await aligner.alignTimeSeries(sampleSeries, {
      targetTimezone: 'America/New_York',
      targetGrain: 'hour',
      fillMethod: 'interpolate'
    });

    expect(result.alignedData.length).toBeGreaterThanOrEqual(result.statistics.originalCount);
    expect(result.alignment.targetTimezone).toBe('America/New_York');
    expect(result.alignment.targetGrain).toBe('hour');
    expect(result.statistics.gapsfilled).toBeGreaterThanOrEqual(1);
  });
});
