import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';
import { Evidence, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';

describe('Evidence: ConfidenceCalculator', () => {
  const baseNow = new Date('2024-01-20T00:00:00Z').getTime();
  beforeAll(() => {
    jest.spyOn(Date, 'now').mockReturnValue(baseNow);
  });
  afterAll(() => {
    (Date.now as jest.Mock).mockRestore?.();
  });

  const mkEvidence = (overrides: Partial<Evidence>): Evidence => ({
    id: overrides.id || 'e',
    timestamp: overrides.timestamp || new Date(baseNow).toISOString(),
    type: overrides.type || EvidenceType.HUMAN_APPROVAL,
    source: overrides.source || EvidenceSource.HUMAN_FEEDBACK,
    data: overrides.data || { anchor_id: 'CC', details: {} },
  });

  it('calculates components and applies temporal decay and source reliability', () => {
    const calc = new ConfidenceCalculator();

    const tenDays = 10 * 24 * 3600_000;
    const ev: Evidence[] = [
      mkEvidence({ id: 'p1', type: EvidenceType.HUMAN_APPROVAL, source: EvidenceSource.HUMAN_FEEDBACK, timestamp: new Date(baseNow - tenDays).toISOString() }),
      mkEvidence({ id: 'p2', type: EvidenceType.CROSS_VALIDATION, source: EvidenceSource.SYSTEM_VALIDATION, timestamp: new Date(baseNow).toISOString() }),
      mkEvidence({ id: 'n1', type: EvidenceType.ANCHOR_DEPRECATION, source: EvidenceSource.SYSTEM_VALIDATION, timestamp: new Date(baseNow).toISOString() }),
    ];

    const result = calc.calculateConfidence(ev);
    expect(result.evidence_count).toBe(3);
    expect(result.components.temporal_decay).toBeLessThan(1);
    expect(result.components.source_reliability).toBeGreaterThan(0); // within 0..1
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('updateWeights influences computed confidence', () => {
    const calc = new ConfidenceCalculator();
    const ev: Evidence[] = [
      mkEvidence({ id: 'a', type: EvidenceType.HUMAN_APPROVAL }),
      mkEvidence({ id: 'b', type: EvidenceType.STATISTICAL_MATCH, source: EvidenceSource.STATISTICAL_MODEL }),
    ];

    const base = calc.calculateConfidence(ev).confidence;
    calc.updateWeights({ human_approval: 1.2, statistical_match: 0.8 });
    const boosted = calc.calculateConfidence(ev).confidence;
    expect(boosted).toBeGreaterThan(base);
  });
});

