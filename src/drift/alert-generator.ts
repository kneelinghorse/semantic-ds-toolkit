import { StableColumnAnchor, ColumnData } from '../types/anchor.types';
import { DriftType, DriftDetails } from './drift-detector';

export interface DriftAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'distribution' | 'format' | 'unit' | 'joinability' | 'confidence';
  title: string;
  description: string;
  context: AlertContext;
  remediation: RemediationPlan;
  monitoring: MonitoringRecommendations;
  business_impact: BusinessImpactAssessment;
  technical_details: TechnicalDetails;
}

export interface AlertContext {
  anchor_id: string;
  column_name: string;
  dataset_name?: string;
  affected_rows: number;
  detection_confidence: number;
  historical_baseline: string;
  drift_magnitude: number;
  trend_analysis: TrendAnalysis;
}

export interface RemediationPlan {
  immediate_actions: Action[];
  investigative_steps: Action[];
  long_term_solutions: Action[];
  automation_opportunities: string[];
  rollback_strategy?: string;
}

export interface Action {
  action: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  effort_estimate: string;
  prerequisites: string[];
  expected_outcome: string;
  automation_available: boolean;
}

export interface MonitoringRecommendations {
  increased_frequency: boolean;
  alert_thresholds: {
    warning: number;
    critical: number;
  };
  additional_metrics: string[];
  escalation_path: string[];
  dashboard_updates: string[];
}

export interface BusinessImpactAssessment {
  severity_score: number;
  affected_processes: string[];
  data_quality_impact: 'none' | 'minor' | 'moderate' | 'severe';
  downstream_systems: string[];
  customer_impact: 'none' | 'potential' | 'confirmed';
  compliance_implications: string[];
}

export interface TechnicalDetails {
  metric_values: Record<string, number>;
  statistical_tests: Record<string, any>;
  sample_comparisons: {
    before: string[];
    after: string[];
  };
  confidence_intervals: Record<string, [number, number]>;
  historical_trends: HistoricalTrend[];
}

export interface TrendAnalysis {
  direction: 'improving' | 'degrading' | 'stable' | 'volatile';
  velocity: number;
  acceleration: number;
  prediction: {
    next_period: number;
    confidence: number;
  };
}

export interface HistoricalTrend {
  timestamp: string;
  metric_value: number;
  context: string;
}

export class AlertGenerator {
  private readonly ALERT_TEMPLATES = {
    distribution: {
      title: "Distribution Drift Detected",
      base_description: "Statistical distribution has shifted significantly"
    },
    format: {
      title: "Format Pattern Drift Detected",
      base_description: "Data format patterns have changed"
    },
    unit: {
      title: "Unit/Scale Drift Detected",
      base_description: "Numeric scale or units have changed"
    },
    joinability: {
      title: "Joinability Degradation Detected",
      base_description: "Data uniqueness or key integrity has deteriorated"
    },
    confidence: {
      title: "Mapping Confidence Drift Detected",
      base_description: "Semantic mapping confidence has decreased"
    }
  };

  async generateAlert(
    drift: DriftType,
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData,
    details: DriftDetails
  ): Promise<DriftAlert> {
    const alertId = this.generateAlertId(drift, historicalAnchor);
    const timestamp = new Date().toISOString();

    const context = this.buildAlertContext(drift, historicalAnchor, currentColumn, details);
    const remediation = this.generateRemediationPlan(drift, context);
    const monitoring = this.generateMonitoringRecommendations(drift, context);
    const businessImpact = this.assessBusinessImpact(drift, context);
    const technicalDetails = this.compileTechnicalDetails(drift, details);

    const template = this.ALERT_TEMPLATES[drift.type];

    return {
      id: alertId,
      timestamp: timestamp,
      severity: drift.severity,
      type: drift.type,
      title: this.customizeTitle(template.title, drift, context),
      description: this.generateDescription(drift, template.base_description, context),
      context: context,
      remediation: remediation,
      monitoring: monitoring,
      business_impact: businessImpact,
      technical_details: technicalDetails
    };
  }

  private generateAlertId(drift: DriftType, anchor: StableColumnAnchor): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(`${anchor.anchor_id}-${drift.type}-${timestamp}`);
    return `DRIFT_${drift.type.toUpperCase()}_${hash.substring(0, 8)}`;
  }

  private buildAlertContext(
    drift: DriftType,
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData,
    details: DriftDetails
  ): AlertContext {
    const affectedRows = currentColumn.values.length;
    const detectionConfidence = this.calculateDetectionConfidence(drift, details);
    const driftMagnitude = drift.metric_value;

    // Build trend analysis
    const trendAnalysis = this.analyzeTrend(drift, details);

    return {
      anchor_id: historicalAnchor.anchor_id,
      column_name: currentColumn.name,
      dataset_name: historicalAnchor.dataset,
      affected_rows: affectedRows,
      detection_confidence: detectionConfidence,
      historical_baseline: historicalAnchor.last_seen,
      drift_magnitude: driftMagnitude,
      trend_analysis: trendAnalysis
    };
  }

  private generateRemediationPlan(drift: DriftType, context: AlertContext): RemediationPlan {
    const immediateActions: Action[] = [];
    const investigativeSteps: Action[] = [];
    const longTermSolutions: Action[] = [];
    const automationOpportunities: string[] = [];

    switch (drift.type) {
      case 'distribution':
        immediateActions.push({
          action: "Verify data ingestion pipeline integrity",
          priority: drift.severity === 'critical' ? 'urgent' : 'high',
          effort_estimate: "2-4 hours",
          prerequisites: ["Access to data pipeline logs", "Historical data samples"],
          expected_outcome: "Identify source of distribution change",
          automation_available: true
        });

        investigativeSteps.push({
          action: "Compare upstream data sources for changes",
          priority: 'high',
          effort_estimate: "4-8 hours",
          prerequisites: ["Source system access", "Historical data"],
          expected_outcome: "Root cause identification",
          automation_available: false
        });

        longTermSolutions.push({
          action: "Implement distribution monitoring alerts",
          priority: 'medium',
          effort_estimate: "1-2 days",
          prerequisites: ["Monitoring infrastructure", "Alert configuration"],
          expected_outcome: "Early drift detection",
          automation_available: true
        });

        automationOpportunities.push("Automated pipeline validation");
        automationOpportunities.push("Real-time distribution monitoring");
        break;

      case 'format':
        immediateActions.push({
          action: "Validate data transformation rules",
          priority: 'urgent',
          effort_estimate: "1-2 hours",
          prerequisites: ["ETL pipeline access"],
          expected_outcome: "Identify format change source",
          automation_available: true
        });

        investigativeSteps.push({
          action: "Review schema evolution in upstream systems",
          priority: 'high',
          effort_estimate: "2-4 hours",
          prerequisites: ["Source system documentation"],
          expected_outcome: "Understand format evolution",
          automation_available: false
        });

        longTermSolutions.push({
          action: "Implement adaptive pattern recognition",
          priority: 'medium',
          effort_estimate: "3-5 days",
          prerequisites: ["Pattern matching infrastructure"],
          expected_outcome: "Automatic pattern adaptation",
          automation_available: true
        });

        automationOpportunities.push("Schema change detection");
        automationOpportunities.push("Pattern validation automation");
        break;

      case 'unit':
        immediateActions.push({
          action: "Check for unit conversion errors",
          priority: 'urgent',
          effort_estimate: "1-3 hours",
          prerequisites: ["Data transformation logs"],
          expected_outcome: "Identify unit change source",
          automation_available: true
        });

        investigativeSteps.push({
          action: "Audit measurement system changes",
          priority: 'high',
          effort_estimate: "4-6 hours",
          prerequisites: ["System change logs", "Calibration records"],
          expected_outcome: "Root cause of scale change",
          automation_available: false
        });

        longTermSolutions.push({
          action: "Implement unit normalization layer",
          priority: 'high',
          effort_estimate: "1-2 weeks",
          prerequisites: ["Unit conversion library", "Metadata management"],
          expected_outcome: "Consistent unit handling",
          automation_available: true
        });

        automationOpportunities.push("Automatic unit detection");
        automationOpportunities.push("Scale change alerts");
        break;

      case 'joinability':
        immediateActions.push({
          action: "Investigate duplicate key generation",
          priority: 'urgent',
          effort_estimate: "2-4 hours",
          prerequisites: ["Key generation logs", "Data samples"],
          expected_outcome: "Identify uniqueness degradation cause",
          automation_available: true
        });

        investigativeSteps.push({
          action: "Analyze data quality at source",
          priority: 'high',
          effort_estimate: "4-8 hours",
          prerequisites: ["Source system access", "Quality metrics"],
          expected_outcome: "Source quality assessment",
          automation_available: false
        });

        longTermSolutions.push({
          action: "Implement key integrity monitoring",
          priority: 'high',
          effort_estimate: "2-3 days",
          prerequisites: ["Data quality framework"],
          expected_outcome: "Proactive key integrity alerts",
          automation_available: true
        });

        automationOpportunities.push("Duplicate detection automation");
        automationOpportunities.push("Key uniqueness monitoring");
        break;

      case 'confidence':
        immediateActions.push({
          action: "Review semantic mapping rules",
          priority: 'high',
          effort_estimate: "2-4 hours",
          prerequisites: ["Mapping configuration", "Training data"],
          expected_outcome: "Identify confidence degradation cause",
          automation_available: false
        });

        investigativeSteps.push({
          action: "Evaluate training data quality",
          priority: 'medium',
          effort_estimate: "4-6 hours",
          prerequisites: ["Training datasets", "Validation metrics"],
          expected_outcome: "Training data assessment",
          automation_available: true
        });

        longTermSolutions.push({
          action: "Implement confidence threshold monitoring",
          priority: 'medium',
          effort_estimate: "1-2 days",
          prerequisites: ["ML model monitoring"],
          expected_outcome: "Confidence degradation alerts",
          automation_available: true
        });

        automationOpportunities.push("Confidence monitoring");
        automationOpportunities.push("Model retraining triggers");
        break;
    }

    let rollbackStrategy: string | undefined;
    if (drift.severity === 'critical') {
      rollbackStrategy = "Consider reverting to last known good configuration until drift is resolved";
    }

    return {
      immediate_actions: immediateActions,
      investigative_steps: investigativeSteps,
      long_term_solutions: longTermSolutions,
      automation_opportunities: automationOpportunities,
      rollback_strategy: rollbackStrategy
    };
  }

  private generateMonitoringRecommendations(
    drift: DriftType,
    context: AlertContext
  ): MonitoringRecommendations {
    const increasedFrequency = drift.severity === 'critical' || drift.severity === 'high';

    // Calculate dynamic thresholds based on current drift magnitude
    const baseThreshold = drift.threshold;
    const warningThreshold = baseThreshold * 0.7;
    const criticalThreshold = baseThreshold * 1.5;

    const additionalMetrics: string[] = [];
    const escalationPath: string[] = [];
    const dashboardUpdates: string[] = [];

    switch (drift.type) {
      case 'distribution':
        additionalMetrics.push("Population Stability Index (PSI)");
        additionalMetrics.push("Kolmogorov-Smirnov statistic");
        additionalMetrics.push("Distribution percentiles");
        dashboardUpdates.push("Distribution comparison charts");
        dashboardUpdates.push("PSI trend monitoring");
        break;

      case 'format':
        additionalMetrics.push("Pattern match rates");
        additionalMetrics.push("Format consistency score");
        additionalMetrics.push("New pattern detection rate");
        dashboardUpdates.push("Pattern evolution tracking");
        dashboardUpdates.push("Format stability heatmap");
        break;

      case 'unit':
        additionalMetrics.push("Scale factor tracking");
        additionalMetrics.push("Unit consistency score");
        additionalMetrics.push("Range shift magnitude");
        dashboardUpdates.push("Scale change visualization");
        dashboardUpdates.push("Unit drift trends");
        break;

      case 'joinability':
        additionalMetrics.push("Uniqueness ratio");
        additionalMetrics.push("Duplicate count");
        additionalMetrics.push("Key integrity score");
        dashboardUpdates.push("Key uniqueness monitoring");
        dashboardUpdates.push("Joinability health score");
        break;

      case 'confidence':
        additionalMetrics.push("Mapping confidence score");
        additionalMetrics.push("Semantic alignment strength");
        additionalMetrics.push("Uncertainty quantification");
        dashboardUpdates.push("Confidence trend analysis");
        dashboardUpdates.push("Semantic drift indicators");
        break;
    }

    // Standard escalation path
    escalationPath.push("Data Engineering Team");
    if (drift.severity === 'high' || drift.severity === 'critical') {
      escalationPath.push("Data Architecture Team");
      escalationPath.push("Product Owner");
    }
    if (drift.severity === 'critical') {
      escalationPath.push("Engineering Manager");
      escalationPath.push("VP of Engineering");
    }

    return {
      increased_frequency: increasedFrequency,
      alert_thresholds: {
        warning: warningThreshold,
        critical: criticalThreshold
      },
      additional_metrics: additionalMetrics,
      escalation_path: escalationPath,
      dashboard_updates: dashboardUpdates
    };
  }

  private assessBusinessImpact(drift: DriftType, context: AlertContext): BusinessImpactAssessment {
    let severityScore = 0;
    const affectedProcesses: string[] = [];
    let dataQualityImpact: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
    const downstreamSystems: string[] = [];
    let customerImpact: 'none' | 'potential' | 'confirmed' = 'none';
    const complianceImplications: string[] = [];

    // Calculate severity score
    switch (drift.severity) {
      case 'critical': severityScore = 4; break;
      case 'high': severityScore = 3; break;
      case 'medium': severityScore = 2; break;
      case 'low': severityScore = 1; break;
    }

    // Assess impact based on drift type
    switch (drift.type) {
      case 'distribution':
        affectedProcesses.push("Statistical analysis");
        affectedProcesses.push("Machine learning models");
        affectedProcesses.push("Reporting and analytics");
        dataQualityImpact = drift.severity === 'critical' ? 'severe' :
                           drift.severity === 'high' ? 'moderate' : 'minor';
        downstreamSystems.push("Analytics platform");
        downstreamSystems.push("ML training pipeline");
        customerImpact = drift.severity === 'critical' ? 'confirmed' : 'potential';
        break;

      case 'format':
        affectedProcesses.push("Data validation");
        affectedProcesses.push("ETL processes");
        affectedProcesses.push("API integrations");
        dataQualityImpact = drift.severity === 'critical' ? 'severe' : 'moderate';
        downstreamSystems.push("Integration APIs");
        downstreamSystems.push("Data consumers");
        customerImpact = drift.severity === 'critical' ? 'confirmed' : 'potential';
        complianceImplications.push("Data format compliance requirements");
        break;

      case 'unit':
        affectedProcesses.push("Measurement accuracy");
        affectedProcesses.push("Financial calculations");
        affectedProcesses.push("Performance metrics");
        dataQualityImpact = 'severe'; // Unit changes are always severe
        downstreamSystems.push("Financial systems");
        downstreamSystems.push("Measurement systems");
        customerImpact = 'confirmed';
        complianceImplications.push("Measurement accuracy standards");
        break;

      case 'joinability':
        affectedProcesses.push("Data joins");
        affectedProcesses.push("Relationship analysis");
        affectedProcesses.push("Data deduplication");
        dataQualityImpact = drift.severity === 'critical' ? 'severe' : 'moderate';
        downstreamSystems.push("Data warehouse");
        downstreamSystems.push("Analytics platforms");
        customerImpact = drift.severity === 'critical' ? 'confirmed' : 'potential';
        break;

      case 'confidence':
        affectedProcesses.push("Semantic matching");
        affectedProcesses.push("Data classification");
        affectedProcesses.push("Automated decisions");
        dataQualityImpact = drift.severity === 'critical' ? 'moderate' : 'minor';
        downstreamSystems.push("Semantic processing");
        downstreamSystems.push("Classification systems");
        customerImpact = 'potential';
        break;
    }

    // Scale up impact based on affected rows
    if (context.affected_rows > 1000000) {
      severityScore += 1;
      if (customerImpact === 'potential') {
        customerImpact = 'confirmed';
      }
    }

    return {
      severity_score: Math.min(5, severityScore),
      affected_processes: affectedProcesses,
      data_quality_impact: dataQualityImpact,
      downstream_systems: downstreamSystems,
      customer_impact: customerImpact,
      compliance_implications: complianceImplications
    };
  }

  private compileTechnicalDetails(drift: DriftType, details: DriftDetails): TechnicalDetails {
    const metricValues: Record<string, number> = {
      drift_magnitude: drift.metric_value,
      threshold: drift.threshold
    };

    const statisticalTests: Record<string, any> = {};
    const sampleComparisons = { before: [] as string[], after: [] as string[] };
    const confidenceIntervals: Record<string, [number, number]> = {};
    const historicalTrends: HistoricalTrend[] = [];

    // Populate based on drift type and available details
    switch (drift.type) {
      case 'distribution':
        if (details.distribution_drift) {
          metricValues['ks_statistic'] = details.distribution_drift.ks_statistic;
          metricValues['ks_p_value'] = details.distribution_drift.ks_p_value;
          metricValues['psi_score'] = details.distribution_drift.psi_score;
          statisticalTests['kolmogorov_smirnov'] = {
            statistic: details.distribution_drift.ks_statistic,
            p_value: details.distribution_drift.ks_p_value
          };
          statisticalTests['psi'] = {
            score: details.distribution_drift.psi_score,
            category: details.distribution_drift.distribution_change
          };
        }
        break;

      case 'format':
        if (details.format_drift) {
          metricValues['pattern_similarity'] = details.format_drift.pattern_similarity;
          metricValues['new_patterns_count'] = details.format_drift.new_patterns.length;
          metricValues['lost_patterns_count'] = details.format_drift.lost_patterns.length;
          sampleComparisons.after = details.format_drift.sample_changes.slice(0, 10);
        }
        break;

      case 'unit':
        if (details.unit_drift) {
          metricValues['scale_factor'] = details.unit_drift.scale_factor;
          metricValues['range_shift'] = Math.abs(
            (details.unit_drift.value_range_shift.new_range[1] - details.unit_drift.value_range_shift.new_range[0]) -
            (details.unit_drift.value_range_shift.old_range[1] - details.unit_drift.value_range_shift.old_range[0])
          );
        }
        break;

      case 'joinability':
        if (details.joinability_drift) {
          metricValues['uniqueness_change'] = details.joinability_drift.uniqueness_change;
          metricValues['duplicate_increase'] = details.joinability_drift.duplicate_increase;
          metricValues['key_integrity_score'] = details.joinability_drift.key_integrity_score;
        }
        break;

      case 'confidence':
        if (details.confidence_drift) {
          metricValues['confidence_change'] = details.confidence_drift.confidence_change;
          metricValues['uncertainty_increase'] = details.confidence_drift.mapping_uncertainty_increase;
          metricValues['alignment_degradation'] = details.confidence_drift.semantic_alignment_degradation;
        }
        break;
    }

    return {
      metric_values: metricValues,
      statistical_tests: statisticalTests,
      sample_comparisons: sampleComparisons,
      confidence_intervals: confidenceIntervals,
      historical_trends: historicalTrends
    };
  }

  private customizeTitle(baseTitle: string, drift: DriftType, context: AlertContext): string {
    const severityPrefix = drift.severity === 'critical' ? '[CRITICAL] ' :
                          drift.severity === 'high' ? '[HIGH] ' : '';

    return `${severityPrefix}${baseTitle} - ${context.column_name}`;
  }

  private generateDescription(
    drift: DriftType,
    baseDescription: string,
    context: AlertContext
  ): string {
    const magnitude = context.drift_magnitude;
    const confidenceText = `Detection confidence: ${(context.detection_confidence * 100).toFixed(1)}%`;
    const magnitudeText = `Drift magnitude: ${magnitude.toFixed(4)}`;
    const trendText = `Trend: ${context.trend_analysis.direction}`;

    return `${baseDescription} in column '${context.column_name}'. ${magnitudeText}. ${trendText}. ${confidenceText}. Affected rows: ${context.affected_rows.toLocaleString()}.`;
  }

  private calculateDetectionConfidence(drift: DriftType, details: DriftDetails): number {
    let confidence = 0.5; // Base confidence

    // Add confidence based on drift type and available evidence
    switch (drift.type) {
      case 'distribution':
        if (details.distribution_drift) {
          // High confidence if both KS test and PSI agree
          const ksConfidence = details.distribution_drift.ks_p_value < 0.01 ? 0.9 : 0.7;
          const psiConfidence = details.distribution_drift.psi_score > 0.2 ? 0.9 : 0.7;
          confidence = Math.max(ksConfidence, psiConfidence);
        }
        break;

      case 'format':
        if (details.format_drift) {
          confidence = details.format_drift.pattern_similarity;
        }
        break;

      case 'unit':
        // Unit drift is usually high confidence when detected
        confidence = 0.9;
        break;

      case 'joinability':
        if (details.joinability_drift) {
          confidence = 1 - details.joinability_drift.key_integrity_score;
        }
        break;

      case 'confidence':
        // Confidence drift detection has inherent uncertainty
        confidence = 0.7;
        break;
    }

    // Adjust based on severity
    const severityMultiplier = {
      'critical': 1.0,
      'high': 0.9,
      'medium': 0.8,
      'low': 0.7
    };

    return Math.min(1.0, confidence * severityMultiplier[drift.severity]);
  }

  private analyzeTrend(drift: DriftType, details: DriftDetails): TrendAnalysis {
    // Simplified trend analysis - in a real implementation, this would use historical data
    const direction = drift.metric_value > drift.threshold * 1.5 ? 'degrading' : 'stable';
    const velocity = Math.abs(drift.metric_value - drift.threshold);
    const acceleration = 0; // Would calculate from historical data

    return {
      direction: direction,
      velocity: velocity,
      acceleration: acceleration,
      prediction: {
        next_period: drift.metric_value * 1.1, // Simple prediction
        confidence: 0.6
      }
    };
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Batch alert generation
  async generateAlertsForBatch(
    drifts: DriftType[],
    anchors: StableColumnAnchor[],
    columns: ColumnData[],
    detailsList: DriftDetails[]
  ): Promise<DriftAlert[]> {
    const alerts: DriftAlert[] = [];

    for (let i = 0; i < Math.min(drifts.length, anchors.length, columns.length); i++) {
      const alert = await this.generateAlert(
        drifts[i],
        anchors[i],
        columns[i],
        detailsList[i] || {}
      );
      alerts.push(alert);
    }

    return alerts;
  }

  // Alert filtering and prioritization
  prioritizeAlerts(alerts: DriftAlert[]): DriftAlert[] {
    return alerts.sort((a, b) => {
      // Priority order: severity, business impact, affected rows
      const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
      const severityDiff = severityOrder[b.severity] - severityOrder[a.severity];

      if (severityDiff !== 0) return severityDiff;

      const impactDiff = b.business_impact.severity_score - a.business_impact.severity_score;
      if (impactDiff !== 0) return impactDiff;

      return b.context.affected_rows - a.context.affected_rows;
    });
  }

  // Alert summarization for executive reporting
  summarizeAlerts(alerts: DriftAlert[]): {
    total_alerts: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
    critical_items: string[];
    overall_health_score: number;
  } {
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const criticalItems: string[] = [];

    for (const alert of alerts) {
      bySeverity[alert.severity] = (bySeverity[alert.severity] || 0) + 1;
      byType[alert.type] = (byType[alert.type] || 0) + 1;

      if (alert.severity === 'critical') {
        criticalItems.push(`${alert.context.column_name}: ${alert.title}`);
      }
    }

    // Calculate overall health score (0-100)
    const severityWeights = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
    let totalWeight = 0;
    let maxWeight = 0;

    for (const [severity, count] of Object.entries(bySeverity)) {
      const weight = severityWeights[severity as keyof typeof severityWeights] * count;
      totalWeight += weight;
      maxWeight += 4 * count; // Maximum possible weight if all were critical
    }

    const healthScore = maxWeight > 0 ? Math.max(0, 100 - (totalWeight / maxWeight) * 100) : 100;

    return {
      total_alerts: alerts.length,
      by_severity: bySeverity,
      by_type: byType,
      critical_items: criticalItems,
      overall_health_score: Math.round(healthScore)
    };
  }
}