import { StableColumnAnchor, ColumnData, ColumnFingerprint, DataType } from '../types/anchor.types';
import { AnchorDrift } from '../core/reconciler';
import { StatisticalTests } from './statistical-tests';
import { PatternDriftDetector } from './pattern-drift';
import { AlertGenerator, DriftAlert } from './alert-generator';

export interface DriftDetectionConfig {
  ks_test_threshold: number;
  psi_threshold: number;
  pattern_similarity_threshold: number;
  uniqueness_threshold: number;
  scale_change_threshold: number;
  confidence_degradation_threshold: number;
  sample_size_limit: number;
  enable_performance_mode: boolean;
}

export interface DriftDetectionResult {
  anchor_id: string;
  column_name: string;
  drift_detected: boolean;
  drift_types: DriftType[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  details: DriftDetails;
  alerts: DriftAlert[];
  recommended_actions: string[];
  performance_metrics: {
    detection_time_ms: number;
    samples_processed: number;
    optimization_applied?: boolean;
    compression_ratio?: number;
  };
}

export interface DriftType {
  type: 'distribution' | 'format' | 'unit' | 'joinability' | 'confidence';
  severity: 'low' | 'medium' | 'high' | 'critical';
  metric_value: number;
  threshold: number;
  description: string;
  meta?: Record<string, any>;
}

export interface DriftDetails {
  distribution_drift?: {
    ks_statistic: number;
    ks_p_value: number;
    psi_score: number;
    distribution_change: string;
  };
  format_drift?: {
    pattern_similarity: number;
    new_patterns: string[];
    lost_patterns: string[];
    sample_changes: string[];
  };
  unit_drift?: {
    scale_factor: number;
    magnitude_change: string;
    value_range_shift: { old_range: [number, number]; new_range: [number, number] };
  };
  joinability_drift?: {
    uniqueness_change: number;
    duplicate_increase: number;
    key_integrity_score: number;
  };
  confidence_drift?: {
    confidence_change: number;
    mapping_uncertainty_increase: number;
    semantic_alignment_degradation: number;
  };
}

export class DriftDetector {
  private config: DriftDetectionConfig;
  private statisticalTests: StatisticalTests;
  private patternDetector: PatternDriftDetector;
  private alertGenerator: AlertGenerator;

  constructor(config?: Partial<DriftDetectionConfig>) {
    this.config = {
      ks_test_threshold: 0.05,
      psi_threshold: 0.1,
      pattern_similarity_threshold: 0.8,
      uniqueness_threshold: 0.05,
      scale_change_threshold: 5.0,
      confidence_degradation_threshold: 0.1,
      sample_size_limit: 100000,
      enable_performance_mode: true,
      ...config
    };

    this.statisticalTests = new StatisticalTests();
    this.patternDetector = new PatternDriftDetector();
    this.alertGenerator = new AlertGenerator();
  }

  async detectDrift(
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData,
    currentFingerprint: ColumnFingerprint
  ): Promise<DriftDetectionResult> {
    const startTime = Date.now();

    const historicalFingerprint = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;

    // Optimize data for performance if needed
    const optimizedData = this.config.enable_performance_mode
      ? this.optimizeForPerformance(currentColumn)
      : currentColumn;

    // Detect different types of drift
    const driftTypes: DriftType[] = [];
    const details: DriftDetails = {};
    const alerts: DriftAlert[] = [];

    // 1. Distribution Drift Detection
    const distributionDrift = await this.detectDistributionDrift(
      historicalFingerprint,
      currentFingerprint,
      optimizedData
    );
    if (distributionDrift) {
      driftTypes.push(distributionDrift);
      details.distribution_drift = this.getDistributionDetails(distributionDrift);
    }

    // 2. Format/Pattern Drift Detection
    const formatDrift = await this.detectFormatDrift(
      historicalFingerprint,
      currentFingerprint
    );
    if (formatDrift) {
      driftTypes.push(formatDrift);
      details.format_drift = this.getFormatDetails(formatDrift);
    }

    // 3. Unit/Scale Drift Detection
    const unitDrift = this.detectUnitDrift(
      historicalFingerprint,
      currentFingerprint
    );
    if (unitDrift) {
      driftTypes.push(unitDrift);
      details.unit_drift = this.getUnitDetails(unitDrift);
    }

    // 4. Joinability Drift Detection
    const joinabilityDrift = this.detectJoinabilityDrift(
      historicalFingerprint,
      currentFingerprint
    );
    if (joinabilityDrift) {
      driftTypes.push(joinabilityDrift);
      details.joinability_drift = this.getJoinabilityDetails(joinabilityDrift);
    }

    // 5. Confidence Drift Detection
    const confidenceDrift = this.detectConfidenceDrift(
      historicalAnchor,
      driftTypes,
      details
    );
    if (confidenceDrift) {
      driftTypes.push(confidenceDrift);
      details.confidence_drift = this.getConfidenceDetails(confidenceDrift);
    }

    // Calculate overall severity and confidence
    const severity = this.calculateOverallSeverity(driftTypes);
    const confidenceScore = this.calculateConfidenceScore(driftTypes, details);

    // Generate alerts
    for (const drift of driftTypes) {
      const alert = await this.alertGenerator.generateAlert(
        drift,
        historicalAnchor,
        currentColumn,
        details
      );
      alerts.push(alert);
    }

    // Generate recommendations
    const recommendedActions = this.generateRecommendations(driftTypes, severity);

    const detectionTime = Date.now() - startTime;

    return {
      anchor_id: historicalAnchor.anchor_id,
      column_name: currentColumn.name,
      drift_detected: driftTypes.length > 0,
      drift_types: driftTypes,
      severity: severity,
      confidence_score: confidenceScore,
      details: details,
      alerts: alerts,
      recommended_actions: recommendedActions,
      performance_metrics: {
        detection_time_ms: detectionTime,
        samples_processed: optimizedData.values.length
      }
    };
  }

  private optimizeForPerformance(column: ColumnData): ColumnData {
    if (column.values.length <= this.config.sample_size_limit) {
      return column;
    }

    // Stratified sampling to maintain distribution characteristics
    const sampleSize = this.config.sample_size_limit;
    const step = Math.floor(column.values.length / sampleSize);
    const sampledValues = [];

    for (let i = 0; i < column.values.length; i += step) {
      sampledValues.push(column.values[i]);
      if (sampledValues.length >= sampleSize) break;
    }

    return {
      ...column,
      values: sampledValues
    };
  }

  private async detectDistributionDrift(
    historical: ColumnFingerprint,
    current: ColumnFingerprint,
    currentColumn: ColumnData
  ): Promise<DriftType | null> {
    if (this.isNumericType(historical.dtype) && this.isNumericType(current.dtype)) {
      // Extract historical numeric data from sample_values
      const historicalValues = historical.sample_values
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

      let currentValues = currentColumn.values
        .map(v => parseFloat(v))
        .filter(v => !isNaN(v));

      if (historicalValues.length === 0 || currentValues.length === 0) {
        return null;
      }

      // If historical sample is very small, use robust mean-shift heuristic
      if (historicalValues.length > 0 && historicalValues.length < 50) {
        const mean = (arr: number[]) => arr.reduce((a,b)=>a+b,0)/arr.length;
        const hMean = mean(historicalValues);
        const cMean = mean(currentValues);
        const rel = Math.abs(cMean - hMean) / Math.max(1, Math.abs(hMean));
        if (rel > 0.2) {
          return {
            type: 'distribution',
            severity: rel > 1 ? 'high' : 'medium',
            metric_value: rel,
            threshold: 0.2,
            description: `Distribution mean shift ~${(rel*100).toFixed(1)}% (small baseline sample)`
          };
        }
        return null;
      }

      // Kolmogorov-Smirnov test
      const ksResult = this.statisticalTests.kolmogorovSmirnovTest(
        historicalValues,
        currentValues
      );

      // Population Stability Index
      const psiScore = this.statisticalTests.populationStabilityIndex(historicalValues, currentValues);

      const largeSample = (historicalValues.length + currentValues.length) >= 12000;
      const ksTriggered = ksResult.p_value < this.config.ks_test_threshold;
      const psiTriggered = psiScore > this.config.psi_threshold;

      // For large samples, KS can flag tiny shifts; require PSI confirmation
      const driftTriggered = largeSample ? psiTriggered : (ksTriggered || psiTriggered);

      if (driftTriggered) {
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

        if (psiScore > 0.25 || ksResult.p_value < 0.001) {
          severity = 'critical';
        } else if (psiScore > 0.15 || ksResult.p_value < 0.01) {
          severity = 'high';
        } else if (psiScore > 0.1 || ksResult.p_value < 0.05) {
          severity = 'medium';
        }

        return {
          type: 'distribution',
          severity: severity,
          metric_value: Math.max(psiScore, 1 - ksResult.p_value),
          threshold: Math.min(this.config.psi_threshold, this.config.ks_test_threshold),
          description: `Distribution shift detected: PSI=${psiScore.toFixed(4)}, KS p-value=${ksResult.p_value.toFixed(4)}`,
          meta: {
            ks_statistic: ksResult.statistic,
            ks_p_value: ksResult.p_value,
            ks_critical_value: ksResult.critical_value,
            psi_score: psiScore
          }
        };
      }
    }

    return null;
  }

  private async detectFormatDrift(
    historical: ColumnFingerprint,
    current: ColumnFingerprint
  ): Promise<DriftType | null> {
    // Skip format drift for numeric types to avoid false positives on numeric string patterns
    if (this.isNumericType(historical.dtype) && this.isNumericType(current.dtype)) {
      return null;
    }
    // Run full analysis to attach actionable details
    const analysis = await this.patternDetector.analyzePatternDrift(historical, current);

    if (analysis.similarity_score >= this.config.pattern_similarity_threshold) {
      return null;
    }

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    switch (analysis.format_stability) {
      case 'format_shift': severity = 'critical'; break;
      case 'major_change': severity = 'high'; break;
      case 'minor_change': severity = 'medium'; break;
      case 'stable': severity = 'low'; break;
    }

    const semanticPatternLoss = analysis.lost_patterns.filter(p => p.semantic_type).length;
    if (semanticPatternLoss > 0) {
      severity = severity === 'low' ? 'medium' : severity === 'medium' ? 'high' : severity;
    }

    return {
      type: 'format',
      severity,
      metric_value: 1 - analysis.similarity_score,
      threshold: 1 - this.config.pattern_similarity_threshold,
      description: `Format drift detected: ${(100 * (1 - analysis.similarity_score)).toFixed(1)}% pattern change`,
      meta: { analysis }
    };
  }

  private detectUnitDrift(
    historical: ColumnFingerprint,
    current: ColumnFingerprint
  ): DriftType | null {
    if (!this.isNumericType(historical.dtype) || !this.isNumericType(current.dtype)) {
      return null;
    }

    const historicalMin = typeof historical.min === 'number' ? historical.min : parseFloat(historical.min || '0');
    const historicalMax = typeof historical.max === 'number' ? historical.max : parseFloat(historical.max || '0');
    const currentMin = typeof current.min === 'number' ? current.min : parseFloat(current.min || '0');
    const currentMax = typeof current.max === 'number' ? current.max : parseFloat(current.max || '0');

    const historicalRange = historicalMax - historicalMin;
    const currentRange = currentMax - currentMin;

    if (historicalRange === 0 || currentRange === 0) {
      return null;
    }

    const scaleFactor = currentRange / historicalRange;
    const avgMagnitudeChange = Math.abs(Math.log10(scaleFactor));

    if (scaleFactor > this.config.scale_change_threshold ||
        scaleFactor < 1 / this.config.scale_change_threshold) {

      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (scaleFactor > 100 || scaleFactor < 0.01) {
        severity = 'critical';
      } else if (scaleFactor > 50 || scaleFactor < 0.02) {
        severity = 'high';
      } else if (scaleFactor > 10 || scaleFactor < 0.1) {
        severity = 'medium';
      }

      return {
        type: 'unit',
        severity: severity,
        metric_value: scaleFactor,
        threshold: this.config.scale_change_threshold,
        description: `Unit/scale change detected: ${scaleFactor.toFixed(2)}x magnitude change`,
        meta: {
          scale_factor: scaleFactor,
          old_range: [historicalMin, historicalMax],
          new_range: [currentMin, currentMax]
        }
      };
    }

    return null;
  }

  private detectJoinabilityDrift(
    historical: ColumnFingerprint,
    current: ColumnFingerprint
  ): DriftType | null {
    const uniquenessChange = Math.abs(historical.unique_ratio - current.unique_ratio);

    if (uniquenessChange > this.config.uniqueness_threshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';

      if (uniquenessChange > 0.5) {
        severity = 'critical';
      } else if (uniquenessChange > 0.25) {
        severity = 'high';
      } else if (uniquenessChange > 0.1) {
        severity = 'medium';
      }

      return {
        type: 'joinability',
        severity: severity,
        metric_value: uniquenessChange,
        threshold: this.config.uniqueness_threshold,
        description: `Joinability degradation: uniqueness changed by ${(uniquenessChange * 100).toFixed(1)}%`,
        meta: {
          old_unique_ratio: historical.unique_ratio,
          new_unique_ratio: current.unique_ratio,
          duplicate_increase: (1 - current.unique_ratio) - (1 - historical.unique_ratio),
          key_integrity_score: 1 - uniquenessChange
        }
      };
    }

    return null;
  }

  private detectConfidenceDrift(
    historical: StableColumnAnchor,
    driftTypes: DriftType[],
    details: DriftDetails
  ): DriftType | null {
    if (historical.confidence === undefined) return null;

    const weights: Record<DriftType['type'], number> = {
      distribution: 0.2,
      format: 0.3,
      unit: 0.3,
      joinability: 0.2,
      confidence: 0
    };

    const severityPenalty: Record<DriftType['severity'], number> = {
      low: 0.05,
      medium: 0.10,
      high: 0.20,
      critical: 0.35
    };

    const degradation = driftTypes
      .filter(d => d.type !== 'confidence')
      .reduce((sum, d) => sum + (weights[d.type] || 0) * severityPenalty[d.severity], 0);

    const oldConf = historical.confidence;
    const newConf = Math.max(0, Math.min(1, oldConf * (1 - degradation)));
    const confidenceChange = Math.max(0, oldConf - newConf);

    if (confidenceChange > this.config.confidence_degradation_threshold) {
      let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (confidenceChange > 0.4) severity = 'critical';
      else if (confidenceChange > 0.25) severity = 'high';
      else if (confidenceChange > 0.15) severity = 'medium';

      return {
        type: 'confidence',
        severity: severity,
        metric_value: confidenceChange,
        threshold: this.config.confidence_degradation_threshold,
        description: `Confidence degradation: ${(confidenceChange * 100).toFixed(1)}% decrease in mapping certainty`,
        meta: { old_confidence: oldConf, new_confidence: newConf, inferred_degradation: degradation }
      };
    }

    return null;
  }

  private calculateOverallSeverity(driftTypes: DriftType[]): 'low' | 'medium' | 'high' | 'critical' {
    if (driftTypes.length === 0) return 'low';

    const severityScores = driftTypes.map(drift => {
      switch (drift.severity) {
        case 'critical': return 4;
        case 'high': return 3;
        case 'medium': return 2;
        case 'low': return 1;
        default: return 0;
      }
    });

    const maxSeverity = severityScores.length > 0 ? Math.max(...severityScores) : 0;
    const avgSeverity = severityScores.length > 0 ? severityScores.reduce((a: number, b: number) => a + b, 0) / severityScores.length : 0;

    if (maxSeverity >= 4 || avgSeverity >= 3.5) return 'critical';
    if (maxSeverity >= 3 || avgSeverity >= 2.5) return 'high';
    if (maxSeverity >= 2 || avgSeverity >= 1.5) return 'medium';
    return 'low';
  }

  private calculateConfidenceScore(driftTypes: DriftType[], details: DriftDetails): number {
    if (driftTypes.length === 0) return 1.0;

    const baseConfidence = 0.5;
    const evidenceWeight = Math.min(driftTypes.length / 3, 1.0);
    const severityPenalty = driftTypes.reduce((penalty, drift) => {
      switch (drift.severity) {
        case 'critical': return penalty + 0.3;
        case 'high': return penalty + 0.2;
        case 'medium': return penalty + 0.1;
        case 'low': return penalty + 0.05;
        default: return penalty;
      }
    }, 0);

    return Math.max(0.1, Math.min(1.0, baseConfidence + evidenceWeight - severityPenalty));
  }

  private generateRecommendations(driftTypes: DriftType[], severity: string): string[] {
    const recommendations: string[] = [];

    if (severity === 'critical') {
      recommendations.push('Immediate investigation required - critical drift detected');
      recommendations.push('Consider halting automated processes until drift is resolved');
    }

    for (const drift of driftTypes) {
      switch (drift.type) {
        case 'distribution':
          recommendations.push('Review data ingestion pipeline for upstream changes');
          recommendations.push('Validate data quality and preprocessing steps');
          break;
        case 'format':
          recommendations.push('Check for schema changes or data format updates');
          recommendations.push('Update regex patterns and validation rules');
          break;
        case 'unit':
          recommendations.push('Verify unit consistency across data sources');
          recommendations.push('Implement unit conversion or normalization');
          break;
        case 'joinability':
          recommendations.push('Check for duplicate key generation or data quality issues');
          recommendations.push('Review primary key constraints and uniqueness rules');
          break;
        case 'confidence':
          recommendations.push('Re-evaluate semantic mapping rules');
          recommendations.push('Consider additional training data or pattern updates');
          break;
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue monitoring - no immediate action required');
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  private isNumericType(dtype: string): boolean {
    return ['int64', 'float64', 'number'].includes(dtype.toLowerCase());
  }

  // Helper methods for extracting details
  private getDistributionDetails(drift: DriftType): any {
    return {
      ks_statistic: drift.meta?.ks_statistic ?? 0,
      ks_p_value: drift.meta?.ks_p_value ?? 0,
      psi_score: drift.meta?.psi_score ?? drift.metric_value,
      distribution_change: drift.description
    };
  }

  private getFormatDetails(drift: DriftType): any {
    const analysis = drift.meta?.analysis;
    return {
      pattern_similarity: 1 - drift.metric_value,
      new_patterns: analysis?.new_patterns?.map((p: any) => p.pattern) ?? [],
      lost_patterns: analysis?.lost_patterns?.map((p: any) => p.pattern) ?? [],
      sample_changes: analysis?.sample_analysis?.character_set_changes ?? []
    };
  }

  private getUnitDetails(drift: DriftType): any {
    return {
      scale_factor: drift.meta?.scale_factor ?? drift.metric_value,
      magnitude_change: drift.description,
      value_range_shift: { old_range: drift.meta?.old_range ?? [0, 0], new_range: drift.meta?.new_range ?? [0, 0] }
    };
  }

  private getJoinabilityDetails(drift: DriftType): any {
    return {
      uniqueness_change: drift.metric_value,
      duplicate_increase: drift.meta?.duplicate_increase ?? 0,
      key_integrity_score: drift.meta?.key_integrity_score ?? (1 - drift.metric_value)
    };
  }

  private getConfidenceDetails(drift: DriftType): any {
    return {
      confidence_change: drift.metric_value,
      mapping_uncertainty_increase: drift.metric_value,
      semantic_alignment_degradation: drift.metric_value * 0.5
    };
  }

  // Batch processing for multiple columns
  async detectDriftBatch(
    historicalAnchors: StableColumnAnchor[],
    currentColumns: ColumnData[],
    currentFingerprints: ColumnFingerprint[]
  ): Promise<DriftDetectionResult[]> {
    const results: DriftDetectionResult[] = [];

    for (let i = 0; i < Math.min(historicalAnchors.length, currentColumns.length); i++) {
      const result = await this.detectDrift(
        historicalAnchors[i],
        currentColumns[i],
        currentFingerprints[i]
      );
      results.push(result);
    }

    return results;
  }

  // Performance monitoring
  getPerformanceMetrics(): {
    average_detection_time: number;
    total_detections: number;
    cache_hit_rate: number;
  } {
    // This would track actual performance metrics in a real implementation
    return {
      average_detection_time: 0,
      total_detections: 0,
      cache_hit_rate: 0
    };
  }
}
