import { JoinConfidenceCalculator, MatchEvidence } from '../../src/operators/join-confidence';
import { type SemanticContext } from '../../src/core/shadow-semantics';

describe('Operators: JoinConfidenceCalculator', () => {
  const calc = new JoinConfidenceCalculator();

  function ctx(type: string, conf = 0.9): SemanticContext {
    return { anchor_id: '', semantic_type: type, confidence: conf, metadata: {}, inferred_relations: [], domain_specific_tags: ['customer_domain'] };
  }

  const statsA = { dataType: 'string', uniqueCount: 90, nullPercentage: 1, uniquePercentage: 90 } as any;
  const statsB = { dataType: 'string', uniqueCount: 85, nullPercentage: 2, uniquePercentage: 85 } as any;

  it('computes high confidence for matching types and strong evidence', () => {
    const evidence: MatchEvidence[] = [
      { leftValue: 'A', rightValue: 'A', normalizedLeft: 'A', normalizedRight: 'A', similarity: 1, matchType: 'exact', semanticAlignment: 1, contextualRelevance: 1 },
      { leftValue: 'B', rightValue: 'B', normalizedLeft: 'B', normalizedRight: 'B', similarity: 1, matchType: 'exact', semanticAlignment: 1, contextualRelevance: 1 }
    ];

    const score = calc.calculateMatchConfidence(ctx('email_address'), ctx('email_address'), ['A','B'], ['A','B'], statsA, statsB, evidence);
    expect(score.overall).toBeGreaterThan(0.75);
    expect(['high','very_high']).toContain(score.confidence_level);
    expect(score.explanation).toContain('Overall confidence');
  });

  it('downgrades confidence for incompatible types', () => {
    const evidence: MatchEvidence[] = [
      { leftValue: '100', rightValue: 'XYZ', normalizedLeft: '100', normalizedRight: 'XYZ', similarity: 0.1, matchType: 'fuzzy', semanticAlignment: 0, contextualRelevance: 0 }
    ];
    const score = calc.calculateMatchConfidence(ctx('identifier', 0.6), ctx('display_name', 0.6), ['100'], ['XYZ'], statsA, statsB, evidence);
    expect(['low','very_low','medium']).toContain(score.confidence_level);
  });
});

