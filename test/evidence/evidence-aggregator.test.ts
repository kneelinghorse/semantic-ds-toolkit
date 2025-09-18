jest.mock('fs', () => ({
  __esModule: true,
  promises: {
    appendFile: jest.fn(async () => {}),
  },
  existsSync: jest.fn(() => false),
  createReadStream: jest.fn(),
}));

import { EvidenceStore, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';
import { EvidenceAggregator, AnchorRecommendation } from '../../src/evidence/evidence-aggregator';
import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';

describe('Evidence: EvidenceAggregator', () => {
  it('produces recommendations across branches', async () => {
    const store = new EvidenceStore('test/.tmp-evidence.jsonl');
    const strongCalc = new ConfidenceCalculator({
      human_approval: 2,
      cross_validation: 2,
      source_multipliers: {
        [EvidenceSource.HUMAN_FEEDBACK]: 1.0,
        [EvidenceSource.AUTOMATED_ANALYSIS]: 1.0,
        [EvidenceSource.CROSS_REFERENCE]: 1.0,
        [EvidenceSource.STATISTICAL_MODEL]: 1.0,
        [EvidenceSource.SYSTEM_VALIDATION]: 1.0
      },
      decay_factor: 1.0
    });
    const aggStrong = new EvidenceAggregator(store, strongCalc);

    // ACCEPT: very high confidence + human approved + cross validated
    await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'acc', details: {} } });
    await store.append({ type: EvidenceType.CROSS_VALIDATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'acc', details: {} } });
    const acc = await aggStrong.aggregateForAnchor('acc');
    expect(acc.recommendation).toBe(AnchorRecommendation.ACCEPT);

    const defaultAgg = new EvidenceAggregator(store, new ConfidenceCalculator());

    // REJECT: conflicting signals with human interactions present
    await store.append({ type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, data: { anchor_id: 'rej', details: {} } });
    await store.append({ type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'rej', details: {} } });
    const rej = await defaultAgg.aggregateForAnchor('rej');
    expect(rej.recommendation).toBe(AnchorRecommendation.REJECT);

    // MONITOR: moderate score (single statistical match)
    await store.append({ type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL, data: { anchor_id: 'mon', details: {} } });
    const mon = await defaultAgg.aggregateForAnchor('mon');
    expect(mon.recommendation).toBe(AnchorRecommendation.MONITOR);

    // REVIEW: conflicting signals without human interactions
    await store.append({ type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL, data: { anchor_id: 'rev', details: {} } });
    await store.append({ type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'rev', details: {} } });
    const rev = await defaultAgg.aggregateForAnchor('rev');
    expect(rev.recommendation).toBe(AnchorRecommendation.REVIEW);

    // DEPRECATE: low score (non-human negatives) and many events
    for (let i = 0; i < 12; i++) {
      await store.append({ type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, data: { anchor_id: 'dep', details: {} } });
    }
    const dep = await defaultAgg.aggregateForAnchor('dep');
    expect([AnchorRecommendation.DEPRECATE, AnchorRecommendation.REJECT]).toContain(dep.recommendation);
  });
});

