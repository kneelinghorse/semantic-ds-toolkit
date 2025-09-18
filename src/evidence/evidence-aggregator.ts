import { Evidence, EvidenceStore, EvidenceType, EvidenceSource } from './evidence-store.js';
import { ConfidenceCalculator, ConfidenceResult } from './confidence-calculator.js';
import { StableColumnAnchor } from '../types/anchor.types.js';

export interface AggregationResult {
  anchor_id: string;
  confidence: ConfidenceResult;
  evidence_summary: EvidenceSummary;
  recommendation: AnchorRecommendation;
  last_aggregated: string;
}

export interface EvidenceSummary {
  total_evidence: number;
  recent_evidence: number;
  human_interactions: number;
  automated_signals: number;
  consistency_indicators: ConsistencyIndicators;
}

export interface ConsistencyIndicators {
  schema_stable: boolean;
  temporal_consistent: boolean;
  cross_validated: boolean;
  human_approved: boolean;
  conflicting_signals: boolean;
}

export enum AnchorRecommendation {
  ACCEPT = 'accept',
  REVIEW = 'review',
  REJECT = 'reject',
  DEPRECATE = 'deprecate',
  MONITOR = 'monitor'
}

export class EvidenceAggregator {
  private evidenceStore: EvidenceStore;
  private confidenceCalculator: ConfidenceCalculator;

  constructor(evidenceStore: EvidenceStore, confidenceCalculator?: ConfidenceCalculator) {
    this.evidenceStore = evidenceStore;
    this.confidenceCalculator = confidenceCalculator || new ConfidenceCalculator();
  }

  async aggregateForAnchor(anchorId: string): Promise<AggregationResult> {
    const evidence = await this.evidenceStore.getEvidenceForAnchor(anchorId);
    const confidence = this.confidenceCalculator.calculateConfidence(evidence);
    const evidenceSummary = this.summarizeEvidence(evidence);
    const recommendation = this.generateRecommendation(confidence, evidenceSummary);

    return {
      anchor_id: anchorId,
      confidence,
      evidence_summary: evidenceSummary,
      recommendation,
      last_aggregated: new Date().toISOString()
    };
  }

  async aggregateForMultipleAnchors(anchorIds: string[]): Promise<AggregationResult[]> {
    const results: AggregationResult[] = [];

    for (const anchorId of anchorIds) {
      try {
        const result = await this.aggregateForAnchor(anchorId);
        results.push(result);
      } catch (error) {
        console.warn(`Failed to aggregate evidence for anchor ${anchorId}:`, error);
      }
    }

    return results;
  }

  async aggregateRecent(hours: number = 24): Promise<{
    anchors_with_new_evidence: AggregationResult[];
    summary: {
      total_anchors_affected: number;
      high_confidence_changes: number;
      human_interactions: number;
      system_validations: number;
    };
  }> {
    const recentEvidence = await this.evidenceStore.getRecentEvidence(hours);
    const affectedAnchors = new Set(recentEvidence.map(e => e.data.anchor_id));

    const results: AggregationResult[] = [];
    let highConfidenceChanges = 0;
    let humanInteractions = 0;
    let systemValidations = 0;

    for (const anchorId of affectedAnchors) {
      const result = await this.aggregateForAnchor(anchorId);
      results.push(result);

      if (result.confidence.confidence > 0.8 || result.confidence.confidence < 0.2) {
        highConfidenceChanges++;
      }

      humanInteractions += result.evidence_summary.human_interactions;

      if (result.evidence_summary.consistency_indicators.cross_validated) {
        systemValidations++;
      }
    }

    return {
      anchors_with_new_evidence: results,
      summary: {
        total_anchors_affected: affectedAnchors.size,
        high_confidence_changes: highConfidenceChanges,
        human_interactions: humanInteractions,
        system_validations: systemValidations
      }
    };
  }

  private summarizeEvidence(evidence: Evidence[]): EvidenceSummary {
    const recentThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentEvidence = evidence.filter(e => e.timestamp >= recentThreshold);

    const humanSources = [EvidenceSource.HUMAN_FEEDBACK];
    const automatedSources = [
      EvidenceSource.AUTOMATED_ANALYSIS,
      EvidenceSource.STATISTICAL_MODEL,
      EvidenceSource.SYSTEM_VALIDATION
    ];

    const humanInteractions = evidence.filter(e => humanSources.includes(e.source)).length;
    const automatedSignals = evidence.filter(e => automatedSources.includes(e.source)).length;

    const consistencyIndicators = this.analyzeConsistency(evidence);

    return {
      total_evidence: evidence.length,
      recent_evidence: recentEvidence.length,
      human_interactions: humanInteractions,
      automated_signals: automatedSignals,
      consistency_indicators: consistencyIndicators
    };
  }

  private analyzeConsistency(evidence: Evidence[]): ConsistencyIndicators {
    const typeMap = new Map<EvidenceType, Evidence[]>();

    for (const ev of evidence) {
      if (!typeMap.has(ev.type)) {
        typeMap.set(ev.type, []);
      }
      typeMap.get(ev.type)!.push(ev);
    }

    const schemaConsistency = typeMap.get(EvidenceType.SCHEMA_CONSISTENCY)?.length || 0;
    const temporalStability = typeMap.get(EvidenceType.TEMPORAL_STABILITY)?.length || 0;
    const crossValidation = typeMap.get(EvidenceType.CROSS_VALIDATION)?.length || 0;
    const humanApproval = typeMap.get(EvidenceType.HUMAN_APPROVAL)?.length || 0;
    const humanRejection = typeMap.get(EvidenceType.HUMAN_REJECTION)?.length || 0;

    const conflictingSignals = this.detectConflictingSignals(evidence);

    return {
      schema_stable: schemaConsistency > 0,
      temporal_consistent: temporalStability > 0,
      cross_validated: crossValidation > 0,
      human_approved: humanApproval > 0,
      conflicting_signals: conflictingSignals
    };
  }

  private detectConflictingSignals(evidence: Evidence[]): boolean {
    const recentThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentEvidence = evidence.filter(e => e.timestamp >= recentThreshold);

    const positiveTypes = new Set([
      EvidenceType.HUMAN_APPROVAL,
      EvidenceType.STATISTICAL_MATCH,
      EvidenceType.SCHEMA_CONSISTENCY,
      EvidenceType.TEMPORAL_STABILITY,
      EvidenceType.CROSS_VALIDATION
    ]);

    const negativeTypes = new Set([
      EvidenceType.HUMAN_REJECTION,
      EvidenceType.ANCHOR_DEPRECATION
    ]);

    const hasPositive = recentEvidence.some(e => positiveTypes.has(e.type));
    const hasNegative = recentEvidence.some(e => negativeTypes.has(e.type));

    return hasPositive && hasNegative;
  }

  private generateRecommendation(
    confidence: ConfidenceResult,
    summary: EvidenceSummary
  ): AnchorRecommendation {
    const { confidence: score } = confidence;
    const { consistency_indicators, human_interactions } = summary;

    if (consistency_indicators.conflicting_signals && human_interactions === 0) {
      return AnchorRecommendation.REVIEW;
    }

    if (score >= 0.9 && consistency_indicators.human_approved) {
      return AnchorRecommendation.ACCEPT;
    }

    if (score >= 0.8 && (
      consistency_indicators.cross_validated ||
      consistency_indicators.temporal_consistent
    )) {
      return AnchorRecommendation.ACCEPT;
    }

    if (score <= 0.2 || (
      consistency_indicators.conflicting_signals &&
      human_interactions > 0
    )) {
      return AnchorRecommendation.REJECT;
    }

    if (score <= 0.3 && summary.total_evidence > 10) {
      return AnchorRecommendation.DEPRECATE;
    }

    if (score >= 0.4 && score <= 0.7) {
      return AnchorRecommendation.MONITOR;
    }

    return AnchorRecommendation.REVIEW;
  }

  async generateReport(anchorId?: string): Promise<string> {
    const results = anchorId
      ? [await this.aggregateForAnchor(anchorId)]
      : await this.aggregateForMultipleAnchors([]);

    const lines: string[] = [];
    lines.push('Evidence Aggregation Report');
    lines.push('========================');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    for (const result of results) {
      lines.push(`Anchor: ${result.anchor_id}`);
      lines.push(`Confidence: ${(result.confidence.confidence * 100).toFixed(1)}%`);
      lines.push(`Recommendation: ${result.recommendation.toUpperCase()}`);
      lines.push(`Evidence Count: ${result.evidence_summary.total_evidence}`);
      lines.push(`Recent Activity: ${result.evidence_summary.recent_evidence} items`);
      lines.push(`Human Interactions: ${result.evidence_summary.human_interactions}`);
      lines.push('');

      const indicators = result.evidence_summary.consistency_indicators;
      lines.push('Consistency Indicators:');
      lines.push(`  • Schema Stable: ${indicators.schema_stable ? 'Yes' : 'No'}`);
      lines.push(`  • Temporal Consistent: ${indicators.temporal_consistent ? 'Yes' : 'No'}`);
      lines.push(`  • Cross Validated: ${indicators.cross_validated ? 'Yes' : 'No'}`);
      lines.push(`  • Human Approved: ${indicators.human_approved ? 'Yes' : 'No'}`);
      lines.push(`  • Conflicting Signals: ${indicators.conflicting_signals ? 'Yes' : 'No'}`);
      lines.push('');

      lines.push('Confidence Breakdown:');
      lines.push(`  • Positive Signals: ${result.confidence.components.positive_signals.toFixed(3)}`);
      lines.push(`  • Negative Signals: ${result.confidence.components.negative_signals.toFixed(3)}`);
      lines.push(`  • Temporal Decay: ${(result.confidence.components.temporal_decay * 100).toFixed(1)}%`);
      lines.push(`  • Source Reliability: ${(result.confidence.components.source_reliability * 100).toFixed(1)}%`);
      lines.push(`  • Consistency Score: ${(result.confidence.components.consistency_score * 100).toFixed(1)}%`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }
}