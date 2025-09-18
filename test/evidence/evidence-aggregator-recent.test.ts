jest.mock('fs', () => ({
  __esModule: true,
  promises: { appendFile: jest.fn(async () => {}) },
  existsSync: jest.fn(() => false),
  createReadStream: jest.fn(),
}));

import { EvidenceStore, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';
import { EvidenceAggregator } from '../../src/evidence/evidence-aggregator';
import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';

describe('Evidence: EvidenceAggregator aggregateRecent/multi', () => {
  it('aggregates recent evidence summary and handles per-anchor aggregation', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const calc = new ConfidenceCalculator();
    const agg = new EvidenceAggregator(store, calc);

    // Two anchors with recent activity
    await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'R1', details: {} } });
    await store.append({ type: EvidenceType.CROSS_VALIDATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'R1', details: {} } });

    await store.append({ type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL, data: { anchor_id: 'R2', details: {} } });

    const res = await agg.aggregateRecent(24);
    expect(res.summary.total_anchors_affected).toBeGreaterThanOrEqual(2);
    expect(res.summary.human_interactions).toBeGreaterThanOrEqual(1);
    // system_validations increments when cross_validated indicator is true
    expect(res.summary.system_validations).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.anchors_with_new_evidence)).toBe(true);
  });

  it('aggregateForMultipleAnchors continues on error and warns', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const calc = new ConfidenceCalculator();
    const agg = new EvidenceAggregator(store, calc);

    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Monkey-patch to throw for one id to exercise catch-and-warn path
    const original = agg.aggregateForAnchor.bind(agg);
    (agg as any).aggregateForAnchor = async (id: string) => {
      if (id === 'bad') throw new Error('boom');
      return original(id);
    };

    await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'ok', details: {} } });
    const out = await agg.aggregateForMultipleAnchors(['ok', 'bad']);
    expect(out.length).toBe(1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

