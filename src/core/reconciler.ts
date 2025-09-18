import {
  StableColumnAnchor,
  ColumnData,
  AnchorReconciliationResult,
  AnchorMatchScore,
  ReconciliationOptions
} from '../types/anchor.types';
import { StableColumnAnchorSystem } from './anchors';

export interface ConfidenceMetrics {
  overall_confidence: number;
  semantic_confidence: number;
  structural_confidence: number;
  statistical_confidence: number;
  name_confidence: number;
  breakdown: {
    strong_matches: number;
    weak_matches: number;
    no_matches: number;
    new_columns: number;
  };
}

export interface ReconciliationStrategy {
  name: string;
  confidence_threshold: number;
  drift_tolerance: number;
  semantic_weight: number;
  structural_weight: number;
  enable_fuzzy_matching: boolean;
}

export interface EnhancedReconciliationResult extends AnchorReconciliationResult {
  confidence_metrics: ConfidenceMetrics;
  strategy_used: string;
  reconciliation_time_ms: number;
  potential_issues: string[];
  recommendations: string[];
}

export interface AnchorDrift {
  anchor_id: string;
  column_name: string;
  drift_type: 'statistical' | 'semantic' | 'structural';
  severity: 'low' | 'medium' | 'high';
  details: Record<string, any>;
  suggested_action: 'accept' | 'investigate' | 'reject';
}

export class SmartAnchorReconciler {
  private anchorSystem: StableColumnAnchorSystem;
  private strategies: Map<string, ReconciliationStrategy> = new Map();

  constructor() {
    this.anchorSystem = new StableColumnAnchorSystem();
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    this.strategies.set('conservative', {
      name: 'conservative',
      confidence_threshold: 0.9,
      drift_tolerance: 0.1,
      semantic_weight: 0.4,
      structural_weight: 0.6,
      enable_fuzzy_matching: false
    });

    this.strategies.set('balanced', {
      name: 'balanced',
      confidence_threshold: 0.8,
      drift_tolerance: 0.2,
      semantic_weight: 0.3,
      structural_weight: 0.7,
      enable_fuzzy_matching: true
    });

    this.strategies.set('aggressive', {
      name: 'aggressive',
      confidence_threshold: 0.7,
      drift_tolerance: 0.3,
      semantic_weight: 0.2,
      structural_weight: 0.8,
      enable_fuzzy_matching: true
    });

    this.strategies.set('semantic_first', {
      name: 'semantic_first',
      confidence_threshold: 0.75,
      drift_tolerance: 0.25,
      semantic_weight: 0.6,
      structural_weight: 0.4,
      enable_fuzzy_matching: true
    });
  }

  reconcileAnchorsAdvanced(
    datasetName: string,
    newColumns: ColumnData[],
    existingAnchors: StableColumnAnchor[],
    strategyName: string = 'balanced',
    customOptions?: Partial<ReconciliationOptions>
  ): EnhancedReconciliationResult {
    const startTime = Date.now();
    const strategy = this.strategies.get(strategyName) || this.strategies.get('balanced')!;

    const reconciliationOptions: ReconciliationOptions = {
      confidence_threshold: strategy.confidence_threshold,
      allow_multiple_matches: false,
      create_new_anchors: true,
      drift_tolerance: strategy.drift_tolerance,
      ...customOptions
    };

    const baseResult = this.anchorSystem.reconcileAnchors(
      datasetName,
      newColumns,
      existingAnchors,
      reconciliationOptions
    );

    const enhancedMatches = this.enhanceMatches(
      newColumns,
      existingAnchors,
      baseResult,
      strategy
    );

    const confidenceMetrics = this.calculateConfidenceMetrics(
      enhancedMatches,
      newColumns.length
    );

    const driftAnalysis = this.analyzeDrift(enhancedMatches, existingAnchors, strategy);
    const issues = this.identifyPotentialIssues(enhancedMatches, confidenceMetrics, driftAnalysis);
    const recommendations = this.generateRecommendations(confidenceMetrics, driftAnalysis, issues);

    const reconciliationTime = Date.now() - startTime;

    return {
      matched_anchors: enhancedMatches.matched_anchors,
      unmatched_columns: enhancedMatches.unmatched_columns,
      new_anchors: enhancedMatches.new_anchors,
      confidence_metrics: confidenceMetrics,
      strategy_used: strategyName,
      reconciliation_time_ms: reconciliationTime,
      potential_issues: issues,
      recommendations: recommendations
    };
  }

  private enhanceMatches(
    newColumns: ColumnData[],
    existingAnchors: StableColumnAnchor[],
    baseResult: AnchorReconciliationResult,
    strategy: ReconciliationStrategy
  ): AnchorReconciliationResult {
    if (!strategy.enable_fuzzy_matching) {
      return baseResult;
    }

    const unmatchedColumns = [...baseResult.unmatched_columns];
    const enhancedMatches = [...baseResult.matched_anchors];
    const remainingAnchors = existingAnchors.filter(anchor =>
      !enhancedMatches.some(match => match.anchor_id === anchor.anchor_id)
    );

    for (const columnName of unmatchedColumns) {
      const column = newColumns.find(col => col.name === columnName);
      if (!column) continue;

      const fuzzyMatch = this.findFuzzyMatch(column, remainingAnchors, strategy);
      if (fuzzyMatch) {
        enhancedMatches.push(fuzzyMatch);
        const index = unmatchedColumns.indexOf(columnName);
        if (index > -1) unmatchedColumns.splice(index, 1);
      }
    }

    return {
      matched_anchors: enhancedMatches,
      unmatched_columns: unmatchedColumns,
      new_anchors: baseResult.new_anchors
    };
  }

  private findFuzzyMatch(
    column: ColumnData,
    anchors: StableColumnAnchor[],
    strategy: ReconciliationStrategy
  ): { anchor_id: string; column_name: string; confidence: number; match_reason: string[] } | null {
    let bestMatch: { anchor: StableColumnAnchor; score: AnchorMatchScore } | null = null;

    for (const anchor of anchors) {
      const fingerprint = this.anchorSystem.generateFingerprint(column);
      const score = this.anchorSystem.calculateMatchScore(
        fingerprint,
        anchor,
        column.name,
        strategy.drift_tolerance
      );

      const adjustedConfidence = this.calculateAdjustedConfidence(score, strategy);

      if (adjustedConfidence >= strategy.confidence_threshold * 0.8) {
        if (!bestMatch || adjustedConfidence > bestMatch.score.confidence) {
          bestMatch = { anchor, score: { ...score, confidence: adjustedConfidence } };
        }
      }
    }

    if (bestMatch) {
      return {
        anchor_id: bestMatch.anchor.anchor_id,
        column_name: column.name,
        confidence: bestMatch.score.confidence,
        match_reason: [...this.getMatchReasons(bestMatch.score), 'fuzzy_match']
      };
    }

    return null;
  }

  private calculateAdjustedConfidence(
    score: AnchorMatchScore,
    strategy: ReconciliationStrategy
  ): number {
    const semanticScore = (
      score.component_scores.regex_match +
      score.component_scores.name_similarity
    ) / 2;

    const structuralScore = (
      score.component_scores.dtype_match +
      score.component_scores.cardinality_similarity +
      score.component_scores.statistical_similarity
    ) / 3;

    return (
      semanticScore * strategy.semantic_weight +
      structuralScore * strategy.structural_weight
    );
  }

  private getMatchReasons(score: AnchorMatchScore): string[] {
    const reasons: string[] = [];

    if (score.component_scores.dtype_match === 1.0) {
      reasons.push('data_type_match');
    }
    if (score.component_scores.cardinality_similarity > 0.8) {
      reasons.push('cardinality_similar');
    }
    if (score.component_scores.regex_match > 0.5) {
      reasons.push('pattern_match');
    }
    if (score.component_scores.statistical_similarity > 0.8) {
      reasons.push('statistical_similarity');
    }
    if (score.component_scores.name_similarity > 0.7) {
      reasons.push('name_similarity');
    }

    return reasons;
  }

  private calculateConfidenceMetrics(
    result: AnchorReconciliationResult,
    totalColumns: number
  ): ConfidenceMetrics {
    const matches = result.matched_anchors;
    const strongMatches = matches.filter(m => m.confidence >= 0.9).length;
    const weakMatches = matches.filter(m => m.confidence >= 0.7 && m.confidence < 0.9).length;
    const noMatches = result.unmatched_columns.length;
    const newColumns = result.new_anchors.length;

    const overallConfidence = matches.length > 0
      ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
      : 0;

    const semanticMatches = matches.filter(m =>
      m.match_reason.includes('pattern_match') || m.match_reason.includes('name_similarity')
    );
    const semanticConfidence = semanticMatches.length > 0
      ? semanticMatches.reduce((sum, m) => sum + m.confidence, 0) / semanticMatches.length
      : 0;

    const structuralMatches = matches.filter(m =>
      m.match_reason.includes('data_type_match') || m.match_reason.includes('statistical_similarity')
    );
    const structuralConfidence = structuralMatches.length > 0
      ? structuralMatches.reduce((sum, m) => sum + m.confidence, 0) / structuralMatches.length
      : 0;

    const statisticalMatches = matches.filter(m =>
      m.match_reason.includes('statistical_similarity')
    );
    const statisticalConfidence = statisticalMatches.length > 0
      ? statisticalMatches.reduce((sum, m) => sum + m.confidence, 0) / statisticalMatches.length
      : 0;

    const nameMatches = matches.filter(m =>
      m.match_reason.includes('name_similarity')
    );
    const nameConfidence = nameMatches.length > 0
      ? nameMatches.reduce((sum, m) => sum + m.confidence, 0) / nameMatches.length
      : 0;

    return {
      overall_confidence: overallConfidence,
      semantic_confidence: semanticConfidence,
      structural_confidence: structuralConfidence,
      statistical_confidence: statisticalConfidence,
      name_confidence: nameConfidence,
      breakdown: {
        strong_matches: strongMatches,
        weak_matches: weakMatches,
        no_matches: noMatches,
        new_columns: newColumns
      }
    };
  }

  private analyzeDrift(
    result: AnchorReconciliationResult,
    existingAnchors: StableColumnAnchor[],
    strategy: ReconciliationStrategy
  ): AnchorDrift[] {
    const drifts: AnchorDrift[] = [];

    for (const match of result.matched_anchors) {
      const anchor = existingAnchors.find(a => a.anchor_id === match.anchor_id);
      if (!anchor) continue;

      if (match.confidence < strategy.confidence_threshold * 1.1 && match.confidence >= strategy.confidence_threshold) {
        let driftType: 'statistical' | 'semantic' | 'structural' = 'statistical';
        let severity: 'low' | 'medium' | 'high' = 'low';

        if (match.confidence < strategy.confidence_threshold * 1.05) {
          severity = 'medium';
        }

        if (!match.match_reason.includes('pattern_match') && match.match_reason.includes('statistical_similarity')) {
          driftType = 'semantic';
          severity = 'high';
        }

        drifts.push({
          anchor_id: match.anchor_id,
          column_name: match.column_name,
          drift_type: driftType,
          severity: severity,
          details: {
            confidence: match.confidence,
            match_reasons: match.match_reason,
            threshold: strategy.confidence_threshold
          },
          suggested_action: severity === 'high' ? 'investigate' : 'accept'
        });
      }
    }

    return drifts;
  }

  private identifyPotentialIssues(
    result: AnchorReconciliationResult,
    metrics: ConfidenceMetrics,
    drifts: AnchorDrift[]
  ): string[] {
    const issues: string[] = [];

    if (metrics.overall_confidence < 0.7) {
      issues.push('Low overall confidence in reconciliation results');
    }

    if (metrics.breakdown.weak_matches > metrics.breakdown.strong_matches) {
      issues.push('More weak matches than strong matches detected');
    }

    if (metrics.breakdown.no_matches > result.matched_anchors.length) {
      issues.push('High number of unmatched columns');
    }

    const highSeverityDrifts = drifts.filter(d => d.severity === 'high').length;
    if (highSeverityDrifts > 0) {
      issues.push(`${highSeverityDrifts} high-severity anchor drift(s) detected`);
    }

    if (metrics.semantic_confidence < 0.6 && metrics.structural_confidence > 0.8) {
      issues.push('Structural matches found but semantic alignment is weak');
    }

    return issues;
  }

  private generateRecommendations(
    metrics: ConfidenceMetrics,
    drifts: AnchorDrift[],
    issues: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.overall_confidence < 0.7) {
      recommendations.push('Consider using a more conservative reconciliation strategy');
      recommendations.push('Review column naming conventions and data types');
    }

    if (metrics.breakdown.no_matches > 0) {
      recommendations.push('Verify that unmatched columns are genuinely new');
      recommendations.push('Consider manual semantic annotation for unmatched columns');
    }

    const semanticDrifts = drifts.filter(d => d.drift_type === 'semantic');
    if (semanticDrifts.length > 0) {
      recommendations.push('Review semantic patterns for drifted anchors');
      recommendations.push('Consider updating anchor fingerprints to reflect schema evolution');
    }

    if (metrics.semantic_confidence < 0.6) {
      recommendations.push('Enhance semantic pattern detection rules');
      recommendations.push('Consider domain-specific semantic vocabularies');
    }

    if (issues.includes('High number of unmatched columns')) {
      recommendations.push('Enable auto-inference for new semantic patterns');
      recommendations.push('Review data ingestion pipeline for schema changes');
    }

    return recommendations;
  }

  getReconciliationStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  addCustomStrategy(name: string, strategy: ReconciliationStrategy): void {
    this.strategies.set(name, strategy);
  }

  getStrategy(name: string): ReconciliationStrategy | undefined {
    return this.strategies.get(name);
  }

  analyzeAnchorEvolution(
    anchorHistory: StableColumnAnchor[][],
    windowSize: number = 5
  ): {
    stability_score: number;
    trending_patterns: string[];
    evolution_summary: Record<string, any>;
  } {
    if (anchorHistory.length < 2) {
      return {
        stability_score: 1.0,
        trending_patterns: [],
        evolution_summary: { message: 'Insufficient history for analysis' }
      };
    }

    let stabilityScore = 1.0;
    const trendingPatterns: string[] = [];
    const anchorChanges: Record<string, number> = {};

    for (let i = 1; i < Math.min(anchorHistory.length, windowSize + 1); i++) {
      const prev = new Set(anchorHistory[i - 1].map(a => a.anchor_id));
      const curr = new Set(anchorHistory[i].map(a => a.anchor_id));

      const added = new Set([...curr].filter(id => !prev.has(id)));
      const removed = new Set([...prev].filter(id => !curr.has(id)));

      const changeRate = (added.size + removed.size) / Math.max(prev.size, curr.size);
      stabilityScore *= (1 - changeRate);

      if (added.size > 0) {
        anchorChanges['additions'] = (anchorChanges['additions'] || 0) + added.size;
      }
      if (removed.size > 0) {
        anchorChanges['removals'] = (anchorChanges['removals'] || 0) + removed.size;
      }
    }

    if (anchorChanges['additions'] > anchorChanges['removals']) {
      trendingPatterns.push('schema_expansion');
    } else if (anchorChanges['removals'] > anchorChanges['additions']) {
      trendingPatterns.push('schema_consolidation');
    }

    return {
      stability_score: Math.max(0, stabilityScore),
      trending_patterns: trendingPatterns,
      evolution_summary: {
        total_changes: Object.values(anchorChanges).reduce((a, b) => a + b, 0),
        change_breakdown: anchorChanges,
        analysis_window: Math.min(anchorHistory.length - 1, windowSize)
      }
    };
  }
}