import { SemanticContext } from '../core/shadow-semantics';
import { CIDLookupResult } from '../registry/cid-registry';
import { StatisticalMetrics } from '../inference/statistical-analyzer';

export interface ConfidenceComponents {
  semanticTypeMatch: number;
  statisticalSimilarity: number;
  valuePatternMatch: number;
  cardinalityAlignment: number;
  domainCompatibility: number;
  dataQualityScore: number;
  normalizationEffectiveness: number;
}

export interface ConfidenceScore {
  overall: number;
  components: ConfidenceComponents;
  factors: ConfidenceFactor[];
  confidence_level: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
  reliability: number;
  explanation: string;
  warnings: string[];
  recommendations: string[];
}

export interface ConfidenceFactor {
  factor: string;
  impact: number; // -1 to 1
  weight: number; // 0 to 1
  evidence: string;
  confidence: number; // 0 to 1
}

export interface MatchEvidence {
  leftValue: any;
  rightValue: any;
  normalizedLeft: string;
  normalizedRight: string;
  similarity: number;
  matchType: 'exact' | 'normalized' | 'fuzzy';
  semanticAlignment: number;
  contextualRelevance: number;
}

export interface ConfidenceCalibrationData {
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  precisionByConfidenceLevel: Record<string, number>;
  recallByConfidenceLevel: Record<string, number>;
}

export class JoinConfidenceCalculator {
  private calibrationData: Map<string, ConfidenceCalibrationData> = new Map();
  private weightingScheme: ConfidenceWeightingScheme;

  constructor(weightingScheme?: Partial<ConfidenceWeightingScheme>) {
    this.weightingScheme = {
      semanticTypeMatch: 0.25,
      statisticalSimilarity: 0.20,
      valuePatternMatch: 0.15,
      cardinalityAlignment: 0.10,
      domainCompatibility: 0.10,
      dataQualityScore: 0.10,
      normalizationEffectiveness: 0.10,
      ...weightingScheme
    };
  }

  calculateMatchConfidence(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null,
    leftValues: any[],
    rightValues: any[],
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics,
    matchEvidence: MatchEvidence[],
    cidCompatibility?: { left: CIDLookupResult[]; right: CIDLookupResult[] }
  ): ConfidenceScore {
    const components = this.calculateConfidenceComponents(
      leftContext,
      rightContext,
      leftValues,
      rightValues,
      leftStats,
      rightStats,
      matchEvidence,
      cidCompatibility
    );

    const factors = this.generateConfidenceFactors(
      leftContext,
      rightContext,
      leftStats,
      rightStats,
      matchEvidence,
      components
    );

    const overall = this.aggregateOverallConfidence(components, factors);
    const reliability = this.calculateReliability(components, factors, matchEvidence);
    const confidenceLevel = this.classifyConfidenceLevel(overall);

    const { explanation, warnings, recommendations } = this.generateExplanations(
      components,
      factors,
      overall,
      matchEvidence
    );

    return {
      overall,
      components,
      factors,
      confidence_level: confidenceLevel,
      reliability,
      explanation,
      warnings,
      recommendations
    };
  }

  private calculateConfidenceComponents(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null,
    leftValues: any[],
    rightValues: any[],
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics,
    matchEvidence: MatchEvidence[],
    cidCompatibility?: { left: CIDLookupResult[]; right: CIDLookupResult[] }
  ): ConfidenceComponents {
    return {
      semanticTypeMatch: this.calculateSemanticTypeMatch(leftContext, rightContext),
      statisticalSimilarity: this.calculateStatisticalSimilarity(leftStats, rightStats),
      valuePatternMatch: this.calculateValuePatternMatch(matchEvidence),
      cardinalityAlignment: this.calculateCardinalityAlignment(leftStats, rightStats),
      domainCompatibility: this.calculateDomainCompatibility(leftContext, rightContext, cidCompatibility),
      dataQualityScore: this.calculateDataQualityScore(leftStats, rightStats),
      normalizationEffectiveness: this.calculateNormalizationEffectiveness(matchEvidence)
    };
  }

  private calculateSemanticTypeMatch(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null
  ): number {
    if (!leftContext || !rightContext) {
      return 0.3; // Neutral score when no semantic context
    }

    const leftType = leftContext.semantic_type;
    const rightType = rightContext.semantic_type;

    // Exact semantic type match
    if (leftType === rightType) {
      const avgConfidence = (leftContext.confidence + rightContext.confidence) / 2;
      return Math.min(0.95, avgConfidence * 1.1); // Boost for exact match
    }

    // Check for compatible semantic types
    const compatibility = this.getSemanticTypeCompatibility(leftType, rightType);
    if (compatibility > 0) {
      const avgConfidence = (leftContext.confidence + rightContext.confidence) / 2;
      return avgConfidence * compatibility * 0.8;
    }

    // Check for domain-related types
    const domainSimilarity = this.calculateDomainSimilarity(
      leftContext.domain_specific_tags,
      rightContext.domain_specific_tags
    );

    if (domainSimilarity > 0.3) {
      return domainSimilarity * 0.6;
    }

    // Incompatible semantic types
    return Math.max(0.1, (leftContext.confidence + rightContext.confidence) / 4);
  }

  private calculateStatisticalSimilarity(
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics
  ): number {
    let similarity = 0;
    let componentCount = 0;

    // Data type similarity
    if (leftStats.dataType === rightStats.dataType) {
      similarity += 0.3;
    } else if (this.areDataTypesCompatible(leftStats.dataType, rightStats.dataType)) {
      similarity += 0.15;
    }
    componentCount++;

    // Cardinality similarity
    const cardinalityRatio = Math.min(leftStats.uniqueCount, rightStats.uniqueCount) /
                            Math.max(leftStats.uniqueCount, rightStats.uniqueCount);
    similarity += cardinalityRatio * 0.25;
    componentCount++;

    // Null percentage similarity
    const nullDiff = Math.abs(leftStats.nullPercentage - rightStats.nullPercentage) / 100;
    similarity += (1 - nullDiff) * 0.15;
    componentCount++;

    // Length similarity (for strings)
    if (leftStats.avgLength && rightStats.avgLength) {
      const lengthRatio = Math.min(leftStats.avgLength, rightStats.avgLength) /
                         Math.max(leftStats.avgLength, rightStats.avgLength);
      similarity += lengthRatio * 0.2;
      componentCount++;
    }

    // Numeric statistics similarity
    if (leftStats.numericStats && rightStats.numericStats) {
      const rangeOverlap = this.calculateNumericRangeOverlap(leftStats.numericStats, rightStats.numericStats);
      similarity += rangeOverlap * 0.1;
      componentCount++;
    }

    return componentCount > 0 ? similarity : 0;
  }

  private calculateValuePatternMatch(matchEvidence: MatchEvidence[]): number {
    if (matchEvidence.length === 0) return 0;

    let totalSimilarity = 0;
    let exactMatches = 0;
    let normalizedMatches = 0;
    let fuzzyMatches = 0;

    for (const evidence of matchEvidence) {
      totalSimilarity += evidence.similarity;

      switch (evidence.matchType) {
        case 'exact':
          exactMatches++;
          break;
        case 'normalized':
          normalizedMatches++;
          break;
        case 'fuzzy':
          fuzzyMatches++;
          break;
      }
    }

    const avgSimilarity = totalSimilarity / matchEvidence.length;

    // Boost exact matches, moderate normalized matches, lower fuzzy matches
    const matchTypeScore = (exactMatches * 1.0 + normalizedMatches * 0.8 + fuzzyMatches * 0.6) / matchEvidence.length;

    return avgSimilarity * matchTypeScore;
  }

  private calculateCardinalityAlignment(
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics
  ): number {
    const leftCardinality = leftStats.uniqueCount;
    const rightCardinality = rightStats.uniqueCount;

    if (leftCardinality === 0 || rightCardinality === 0) {
      return 0;
    }

    // Calculate alignment based on cardinality ratio
    const ratio = Math.min(leftCardinality, rightCardinality) / Math.max(leftCardinality, rightCardinality);

    // Penalize extreme mismatches
    if (ratio < 0.1) {
      return ratio * 0.5;
    }

    // Reward good alignment
    if (ratio > 0.8) {
      return Math.min(0.95, ratio * 1.1);
    }

    return ratio;
  }

  private calculateDomainCompatibility(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null,
    cidCompatibility?: { left: CIDLookupResult[]; right: CIDLookupResult[] }
  ): number {
    let domainScore = 0.5; // Default neutral score

    // Use CID compatibility if available
    if (cidCompatibility) {
      const leftCids = new Set(cidCompatibility.left.map(c => c.concept.cid));
      const rightCids = new Set(cidCompatibility.right.map(c => c.concept.cid));
      const intersection = new Set([...leftCids].filter(x => rightCids.has(x)));

      if (intersection.size > 0) {
        domainScore = Math.max(domainScore, 0.8);
      } else if (leftCids.size > 0 && rightCids.size > 0) {
        // Check for related concepts
        const relatedness = this.calculateCIDRelatedness(
          cidCompatibility.left,
          cidCompatibility.right
        );
        domainScore = Math.max(domainScore, relatedness);
      }
    }

    // Use semantic context domain tags
    if (leftContext && rightContext) {
      const domainSimilarity = this.calculateDomainSimilarity(
        leftContext.domain_specific_tags,
        rightContext.domain_specific_tags
      );
      domainScore = Math.max(domainScore, domainSimilarity);
    }

    return domainScore;
  }

  private calculateDataQualityScore(
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics
  ): number {
    let qualityScore = 1.0;

    // Penalize high null rates
    const avgNullRate = (leftStats.nullPercentage + rightStats.nullPercentage) / 2;
    qualityScore *= Math.max(0.2, 1 - avgNullRate / 100);

    // Reward reasonable uniqueness
    const leftUniqueness = leftStats.uniquePercentage;
    const rightUniqueness = rightStats.uniquePercentage;

    // Penalize very low uniqueness (likely not useful for joining)
    if (leftUniqueness < 5 || rightUniqueness < 5) {
      qualityScore *= 0.5;
    }

    // Penalize extremely high uniqueness (might indicate identifiers that won't match)
    if (leftUniqueness > 99 && rightUniqueness > 99) {
      qualityScore *= 0.7;
    }

    return Math.max(0.1, qualityScore);
  }

  private calculateNormalizationEffectiveness(matchEvidence: MatchEvidence[]): number {
    if (matchEvidence.length === 0) return 0.5;

    let improvementCount = 0;
    let totalImprovement = 0;

    for (const evidence of matchEvidence) {
      if (evidence.matchType === 'normalized' || evidence.matchType === 'fuzzy') {
        // Compare raw vs normalized similarity
        const rawSimilarity = this.calculateStringSimilarity(
          String(evidence.leftValue || ''),
          String(evidence.rightValue || '')
        );

        const normalizedSimilarity = evidence.similarity;

        if (normalizedSimilarity > rawSimilarity) {
          improvementCount++;
          totalImprovement += (normalizedSimilarity - rawSimilarity);
        }
      }
    }

    if (improvementCount === 0) {
      // If no normalization was beneficial, but we have exact matches, that's still good
      const exactMatchCount = matchEvidence.filter(e => e.matchType === 'exact').length;
      return exactMatchCount > 0 ? 0.8 : 0.5;
    }

    const avgImprovement = totalImprovement / improvementCount;
    const improvementRate = improvementCount / matchEvidence.length;

    return Math.min(0.95, avgImprovement * improvementRate + 0.3);
  }

  private generateConfidenceFactors(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null,
    leftStats: StatisticalMetrics,
    rightStats: StatisticalMetrics,
    matchEvidence: MatchEvidence[],
    components: ConfidenceComponents
  ): ConfidenceFactor[] {
    const factors: ConfidenceFactor[] = [];

    // Semantic type factor
    if (leftContext && rightContext) {
      if (leftContext.semantic_type === rightContext.semantic_type) {
        factors.push({
          factor: 'semantic_type_exact_match',
          impact: 0.3,
          weight: 0.9,
          evidence: `Both columns have semantic type: ${leftContext.semantic_type}`,
          confidence: Math.min(leftContext.confidence, rightContext.confidence)
        });
      } else {
        factors.push({
          factor: 'semantic_type_mismatch',
          impact: -0.2,
          weight: 0.7,
          evidence: `Left: ${leftContext.semantic_type}, Right: ${rightContext.semantic_type}`,
          confidence: 0.8
        });
      }
    }

    // Data quality factor
    const avgNullRate = (leftStats.nullPercentage + rightStats.nullPercentage) / 2;
    if (avgNullRate > 20) {
      factors.push({
        factor: 'high_null_rate',
        impact: -0.3,
        weight: 0.8,
        evidence: `Average null rate: ${avgNullRate.toFixed(1)}%`,
        confidence: 0.9
      });
    }

    // Match quality factor
    if (matchEvidence.length > 0) {
      const exactMatches = matchEvidence.filter(e => e.matchType === 'exact').length;
      const exactMatchRate = exactMatches / matchEvidence.length;

      if (exactMatchRate > 0.8) {
        factors.push({
          factor: 'high_exact_match_rate',
          impact: 0.25,
          weight: 0.9,
          evidence: `${(exactMatchRate * 100).toFixed(1)}% exact matches`,
          confidence: 0.95
        });
      } else if (exactMatchRate < 0.2) {
        factors.push({
          factor: 'low_exact_match_rate',
          impact: -0.15,
          weight: 0.7,
          evidence: `Only ${(exactMatchRate * 100).toFixed(1)}% exact matches`,
          confidence: 0.85
        });
      }
    }

    // Cardinality factor
    const cardinalityRatio = Math.min(leftStats.uniqueCount, rightStats.uniqueCount) /
                            Math.max(leftStats.uniqueCount, rightStats.uniqueCount);

    if (cardinalityRatio < 0.1) {
      factors.push({
        factor: 'extreme_cardinality_mismatch',
        impact: -0.4,
        weight: 0.8,
        evidence: `Cardinality ratio: ${cardinalityRatio.toFixed(3)}`,
        confidence: 0.9
      });
    }

    return factors;
  }

  private aggregateOverallConfidence(components: ConfidenceComponents, factors: ConfidenceFactor[]): number {
    // Weighted sum of components
    let baseConfidence = 0;
    for (const [component, score] of Object.entries(components)) {
      const weight = this.weightingScheme[component as keyof ConfidenceWeightingScheme] || 0;
      baseConfidence += score * weight;
    }

    // Apply factors
    let adjustedConfidence = baseConfidence;
    for (const factor of factors) {
      const adjustment = factor.impact * factor.weight * factor.confidence;
      adjustedConfidence += adjustment;
    }

    // Ensure bounds
    return Math.max(0, Math.min(1, adjustedConfidence));
  }

  private calculateReliability(
    components: ConfidenceComponents,
    factors: ConfidenceFactor[],
    matchEvidence: MatchEvidence[]
  ): number {
    let reliability = 0.5;

    // Evidence quantity boosts reliability
    if (matchEvidence.length > 10) {
      reliability += 0.2;
    } else if (matchEvidence.length > 5) {
      reliability += 0.1;
    }

    // Consistent components boost reliability
    const componentValues = Object.values(components);
    const componentStdDev = this.calculateStandardDeviation(componentValues);
    reliability += Math.max(0, 0.3 - componentStdDev);

    // High-confidence factors boost reliability
    const highConfidenceFactors = factors.filter(f => f.confidence > 0.8).length;
    reliability += highConfidenceFactors * 0.05;

    return Math.max(0, Math.min(1, reliability));
  }

  private classifyConfidenceLevel(confidence: number): 'very_high' | 'high' | 'medium' | 'low' | 'very_low' {
    if (confidence >= 0.9) return 'very_high';
    if (confidence >= 0.75) return 'high';
    if (confidence >= 0.5) return 'medium';
    if (confidence >= 0.25) return 'low';
    return 'very_low';
  }

  private generateExplanations(
    components: ConfidenceComponents,
    factors: ConfidenceFactor[],
    overall: number,
    matchEvidence: MatchEvidence[]
  ): { explanation: string; warnings: string[]; recommendations: string[] } {
    const explanation = `Overall confidence: ${(overall * 100).toFixed(1)}% based on ` +
      `semantic alignment (${(components.semanticTypeMatch * 100).toFixed(1)}%), ` +
      `statistical similarity (${(components.statisticalSimilarity * 100).toFixed(1)}%), ` +
      `and ${matchEvidence.length} sample matches.`;

    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Generate warnings
    if (components.semanticTypeMatch < 0.3) {
      warnings.push('Semantic types may be incompatible - verify column meanings match');
    }

    if (components.dataQualityScore < 0.5) {
      warnings.push('Data quality issues detected - high null rates or poor uniqueness');
    }

    if (overall < 0.3) {
      warnings.push('Very low confidence - manual verification strongly recommended');
    }

    // Generate recommendations
    if (components.normalizationEffectiveness < 0.6) {
      recommendations.push('Consider using different normalization strategies');
    }

    if (components.cardinalityAlignment < 0.3) {
      recommendations.push('Large cardinality differences - consider pre-filtering or sampling');
    }

    if (matchEvidence.length < 5) {
      recommendations.push('Limited sample evidence - test with larger sample for better assessment');
    }

    return { explanation, warnings, recommendations };
  }

  // Helper methods
  private getSemanticTypeCompatibility(type1: string, type2: string): number {
    const compatibilityMatrix: Record<string, Record<string, number>> = {
      'identifier': { 'high_cardinality_attribute': 0.7 },
      'email_address': { 'contact_method': 0.8, 'user_identifier': 0.6 },
      'phone_number': { 'contact_method': 0.8 },
      'monetary_value': { 'numeric_value': 0.9, 'quantitative_measure': 0.7 },
      'temporal': { 'datetime': 0.95, 'timestamp': 0.9, 'event_timestamp': 0.8 },
      'display_name': { 'generic_attribute': 0.6, 'categorical_attribute': 0.4 },
      'categorical_attribute': { 'categorical_code': 0.8 }
    };

    return compatibilityMatrix[type1]?.[type2] ||
           compatibilityMatrix[type2]?.[type1] || 0;
  }

  private calculateDomainSimilarity(tags1: string[], tags2: string[]): number {
    if (!tags1.length || !tags2.length) return 0;

    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  private areDataTypesCompatible(type1: string, type2: string): boolean {
    const compatibleGroups = [
      ['numeric', 'mixed'],
      ['string', 'mixed'],
      ['date', 'string']
    ];

    return compatibleGroups.some(group =>
      group.includes(type1) && group.includes(type2)
    );
  }

  private calculateNumericRangeOverlap(stats1: any, stats2: any): number {
    const min1 = stats1.min, max1 = stats1.max;
    const min2 = stats2.min, max2 = stats2.max;

    const overlapStart = Math.max(min1, min2);
    const overlapEnd = Math.min(max1, max2);

    if (overlapStart >= overlapEnd) return 0;

    const overlapSize = overlapEnd - overlapStart;
    const totalRange = Math.max(max1, max2) - Math.min(min1, min2);

    return totalRange > 0 ? overlapSize / totalRange : 0;
  }

  private calculateCIDRelatedness(left: CIDLookupResult[], right: CIDLookupResult[]): number {
    // Check for parent-child relationships or shared parents
    let maxRelatedness = 0;

    for (const leftCid of left) {
      for (const rightCid of right) {
        if (leftCid.concept.parent_cid === rightCid.concept.cid ||
            rightCid.concept.parent_cid === leftCid.concept.cid) {
          maxRelatedness = Math.max(maxRelatedness, 0.7);
        } else if (leftCid.concept.parent_cid === rightCid.concept.parent_cid &&
                  leftCid.concept.parent_cid) {
          maxRelatedness = Math.max(maxRelatedness, 0.5);
        }
      }
    }

    return maxRelatedness;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const maxLen = Math.max(len1, len2);

    if (maxLen === 0) return 1;

    const editDistance = this.levenshteinDistance(str1, str2);
    return (maxLen - editDistance) / maxLen;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() =>
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + substitutionCost
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Public API for calibration
  updateCalibration(joinType: string, actualOutcome: boolean, predictedConfidence: number): void {
    if (!this.calibrationData.has(joinType)) {
      this.calibrationData.set(joinType, {
        truePositives: 0,
        falsePositives: 0,
        trueNegatives: 0,
        falseNegatives: 0,
        precisionByConfidenceLevel: {},
        recallByConfidenceLevel: {}
      });
    }

    const data = this.calibrationData.get(joinType)!;

    if (actualOutcome && predictedConfidence > 0.5) {
      data.truePositives++;
    } else if (actualOutcome && predictedConfidence <= 0.5) {
      data.falseNegatives++;
    } else if (!actualOutcome && predictedConfidence > 0.5) {
      data.falsePositives++;
    } else {
      data.trueNegatives++;
    }
  }

  getCalibratedConfidence(joinType: string, rawConfidence: number): number {
    const data = this.calibrationData.get(joinType);
    if (!data) return rawConfidence;

    // Simple calibration - can be made more sophisticated
    const precision = data.truePositives / (data.truePositives + data.falsePositives);
    const calibrationFactor = precision || 1;

    return Math.min(1, rawConfidence * calibrationFactor);
  }
}

interface ConfidenceWeightingScheme {
  semanticTypeMatch: number;
  statisticalSimilarity: number;
  valuePatternMatch: number;
  cardinalityAlignment: number;
  domainCompatibility: number;
  dataQualityScore: number;
  normalizationEffectiveness: number;
}

export { ConfidenceWeightingScheme };