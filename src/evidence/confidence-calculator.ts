import { Evidence, EvidenceType, EvidenceSource } from './evidence-store.js';

export interface ConfidenceWeights {
  human_approval: number;
  human_rejection: number;
  statistical_match: number;
  schema_consistency: number;
  temporal_stability: number;
  cross_validation: number;
  source_multipliers: Record<EvidenceSource, number>;
  decay_factor: number;
}

export interface ConfidenceResult {
  confidence: number;
  components: ConfidenceComponents;
  evidence_count: number;
  last_updated: string;
}

export interface ConfidenceComponents {
  positive_signals: number;
  negative_signals: number;
  temporal_decay: number;
  source_reliability: number;
  consistency_score: number;
}

export class ConfidenceCalculator {
  private weights: ConfidenceWeights;

  constructor(weights?: Partial<ConfidenceWeights>) {
    this.weights = {
      human_approval: 0.8,
      human_rejection: -0.9,
      statistical_match: 0.4,
      schema_consistency: 0.3,
      temporal_stability: 0.2,
      cross_validation: 0.5,
      source_multipliers: {
        [EvidenceSource.HUMAN_FEEDBACK]: 1.0,
        [EvidenceSource.AUTOMATED_ANALYSIS]: 0.7,
        [EvidenceSource.CROSS_REFERENCE]: 0.8,
        [EvidenceSource.STATISTICAL_MODEL]: 0.6,
        [EvidenceSource.SYSTEM_VALIDATION]: 0.5
      },
      decay_factor: 0.95,
      ...weights
    };
  }

  calculateConfidence(evidence: Evidence[]): ConfidenceResult {
    if (evidence.length === 0) {
      return {
        confidence: 0.5,
        components: {
          positive_signals: 0,
          negative_signals: 0,
          temporal_decay: 1.0,
          source_reliability: 0.5,
          consistency_score: 0.5
        },
        evidence_count: 0,
        last_updated: new Date().toISOString()
      };
    }

    const sortedEvidence = [...evidence].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    const components = this.calculateComponents(sortedEvidence);
    const confidence = this.computeFinalConfidence(components);

    return {
      confidence: Math.max(0, Math.min(1, confidence)),
      components,
      evidence_count: evidence.length,
      last_updated: sortedEvidence[sortedEvidence.length - 1]?.timestamp || new Date().toISOString()
    };
  }

  private calculateComponents(evidence: Evidence[]): ConfidenceComponents {
    let positiveSignals = 0;
    let negativeSignals = 0;
    let totalWeight = 0;
    let weightedSourceReliability = 0;
    const typeConsistency = new Map<EvidenceType, number>();

    const now = Date.now();

    for (const ev of evidence) {
      const typeWeight = this.getTypeWeight(ev.type);
      const sourceMultiplier = this.weights.source_multipliers[ev.source] || 0.5;
      const temporalDecay = this.calculateTemporalDecay(ev.timestamp, now);

      const effectiveWeight = Math.abs(typeWeight) * sourceMultiplier * temporalDecay;

      if (typeWeight > 0) {
        positiveSignals += effectiveWeight;
      } else {
        negativeSignals += Math.abs(effectiveWeight);
      }

      totalWeight += effectiveWeight;
      weightedSourceReliability += sourceMultiplier * effectiveWeight;

      typeConsistency.set(ev.type, (typeConsistency.get(ev.type) || 0) + 1);
    }

    const avgTemporalDecay = evidence.length > 0
      ? evidence.reduce((sum, ev) => sum + this.calculateTemporalDecay(ev.timestamp, now), 0) / evidence.length
      : 1.0;

    const sourceReliability = totalWeight > 0 ? weightedSourceReliability / totalWeight : 0.5;

    const consistencyScore = this.calculateConsistencyScore(typeConsistency, evidence.length);

    return {
      positive_signals: positiveSignals,
      negative_signals: negativeSignals,
      temporal_decay: avgTemporalDecay,
      source_reliability: sourceReliability,
      consistency_score: consistencyScore
    };
  }

  private getTypeWeight(type: EvidenceType): number {
    switch (type) {
      case EvidenceType.HUMAN_APPROVAL:
        return this.weights.human_approval;
      case EvidenceType.HUMAN_REJECTION:
        return this.weights.human_rejection;
      case EvidenceType.STATISTICAL_MATCH:
        return this.weights.statistical_match;
      case EvidenceType.SCHEMA_CONSISTENCY:
        return this.weights.schema_consistency;
      case EvidenceType.TEMPORAL_STABILITY:
        return this.weights.temporal_stability;
      case EvidenceType.CROSS_VALIDATION:
        return this.weights.cross_validation;
      case EvidenceType.ANCHOR_CREATION:
        return 0.1;
      case EvidenceType.ANCHOR_DEPRECATION:
        return -0.3;
      default:
        return 0.1;
    }
  }

  private calculateTemporalDecay(timestamp: string, now: number): number {
    const evidenceTime = new Date(timestamp).getTime();
    const ageInDays = (now - evidenceTime) / (1000 * 60 * 60 * 24);

    return Math.pow(this.weights.decay_factor, ageInDays);
  }

  private calculateConsistencyScore(typeConsistency: Map<EvidenceType, number>, totalEvidence: number): number {
    if (totalEvidence <= 1) {
      return 0.5;
    }

    const positiveTypes = [
      EvidenceType.HUMAN_APPROVAL,
      EvidenceType.STATISTICAL_MATCH,
      EvidenceType.SCHEMA_CONSISTENCY,
      EvidenceType.TEMPORAL_STABILITY,
      EvidenceType.CROSS_VALIDATION
    ];

    const negativeTypes = [
      EvidenceType.HUMAN_REJECTION,
      EvidenceType.ANCHOR_DEPRECATION
    ];

    let positiveCount = 0;
    let negativeCount = 0;

    for (const [type, count] of typeConsistency) {
      if (positiveTypes.includes(type)) {
        positiveCount += count;
      } else if (negativeTypes.includes(type)) {
        negativeCount += count;
      }
    }

    if (positiveCount === 0 && negativeCount === 0) {
      return 0.5;
    }

    const totalSignals = positiveCount + negativeCount;
    const majorityThreshold = totalSignals * 0.6;

    if (positiveCount >= majorityThreshold) {
      return 0.8;
    } else if (negativeCount >= majorityThreshold) {
      return 0.2;
    } else {
      return 0.5;
    }
  }

  private computeFinalConfidence(components: ConfidenceComponents): number {
    const { positive_signals, negative_signals, temporal_decay, source_reliability, consistency_score } = components;

    const signalBalance = positive_signals - negative_signals;

    const baseConfidence = 0.5 + (signalBalance * 0.3);

    const adjustedConfidence = baseConfidence * temporal_decay * source_reliability;

    const finalConfidence = (adjustedConfidence + consistency_score) / 2;

    return finalConfidence;
  }

  updateWeights(newWeights: Partial<ConfidenceWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
  }

  getWeights(): ConfidenceWeights {
    return { ...this.weights };
  }

  explainConfidence(evidence: Evidence[]): string {
    const result = this.calculateConfidence(evidence);
    const { components } = result;

    const explanations: string[] = [];

    explanations.push(`Final Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    explanations.push(`Based on ${result.evidence_count} pieces of evidence`);
    explanations.push('');

    explanations.push('Component Breakdown:');
    explanations.push(`• Positive Signals: ${components.positive_signals.toFixed(3)}`);
    explanations.push(`• Negative Signals: ${components.negative_signals.toFixed(3)}`);
    explanations.push(`• Temporal Decay: ${(components.temporal_decay * 100).toFixed(1)}%`);
    explanations.push(`• Source Reliability: ${(components.source_reliability * 100).toFixed(1)}%`);
    explanations.push(`• Consistency Score: ${(components.consistency_score * 100).toFixed(1)}%`);

    return explanations.join('\n');
  }
}