import { ConfidenceCalculator } from '../../src/evidence/confidence-calculator';
import { Evidence, EvidenceType, EvidenceSource } from '../../src/evidence/evidence-store';

const mk = (id: string, type: EvidenceType): Evidence => ({
  id,
  timestamp: new Date('2024-01-01T00:00:00Z').toISOString(),
  type,
  source: EvidenceSource.SYSTEM_VALIDATION,
  data: { anchor_id: 'TH', details: {} }
});

describe('Evidence: ConfidenceCalculator thresholds', () => {
  it('consistency_score favors majority positive (≈0.8)', () => {
    const calc = new ConfidenceCalculator();
    const ev = [
      mk('p1', EvidenceType.SCHEMA_CONSISTENCY),
      mk('p2', EvidenceType.TEMPORAL_STABILITY),
      mk('p3', EvidenceType.CROSS_VALIDATION),
      mk('n1', EvidenceType.ANCHOR_DEPRECATION),
    ];
    const res = calc.calculateConfidence(ev);
    expect(res.components.consistency_score).toBeGreaterThan(0.6);
  });

  it('consistency_score favors majority negative (≈0.2)', () => {
    const calc = new ConfidenceCalculator();
    const ev = [
      mk('n1', EvidenceType.ANCHOR_DEPRECATION),
      mk('n2', EvidenceType.HUMAN_REJECTION),
      mk('p1', EvidenceType.SCHEMA_CONSISTENCY),
    ];
    const res = calc.calculateConfidence(ev);
    expect(res.components.consistency_score).toBeLessThan(0.4);
  });

  it('consistency_score mixed stays around neutral (≈0.5)', () => {
    const calc = new ConfidenceCalculator();
    const ev = [
      mk('p1', EvidenceType.SCHEMA_CONSISTENCY),
      mk('n1', EvidenceType.ANCHOR_DEPRECATION),
    ];
    const res = calc.calculateConfidence(ev);
    expect(res.components.consistency_score).toBeGreaterThan(0.45);
    expect(res.components.consistency_score).toBeLessThan(0.55);
  });
});

