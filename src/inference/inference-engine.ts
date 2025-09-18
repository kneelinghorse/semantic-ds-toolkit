import { PatternMatcher, PatternMatch } from './pattern-matcher';
import { StatisticalAnalyzer, StatisticalMetrics, DataTypeInference } from './statistical-analyzer';

export interface InferenceResult {
  columnName: string;
  semanticType: string;
  confidence: number;
  subtype?: string;
  evidence: Evidence[];
  alternatives: Alternative[];
  metrics: StatisticalMetrics;
}

export interface Evidence {
  type: 'pattern' | 'statistical' | 'contextual' | 'structural';
  description: string;
  confidence: number;
  weight: number;
  details?: any;
}

export interface Alternative {
  semanticType: string;
  confidence: number;
  reasoning: string;
}

export interface InferenceOptions {
  sampleSize?: number;
  minConfidence?: number;
  enablePatternMatching?: boolean;
  enableStatisticalAnalysis?: boolean;
  enableContextualAnalysis?: boolean;
  performanceMode?: 'fast' | 'accurate';
}

export class InferenceEngine {
  private patternMatcher: PatternMatcher;
  private statisticalAnalyzer: StatisticalAnalyzer;

  constructor() {
    this.patternMatcher = new PatternMatcher();
    this.statisticalAnalyzer = new StatisticalAnalyzer();
  }

  public async inferColumnType(
    columnName: string,
    values: any[],
    options: InferenceOptions = {}
  ): Promise<InferenceResult> {
    const opts = this.getDefaultOptions(options);
    const startTime = performance.now();

    // Sample data for performance
    const sampleValues = this.sampleData(values, opts.sampleSize!);
    const stringValues = sampleValues.map(v => String(v)).filter(v => v !== 'null' && v !== 'undefined');

    // Collect evidence
    const evidence: Evidence[] = [];
    let primaryType = 'unknown';
    let confidence = 0;
    let subtype: string | undefined;

    // 1. Pattern-based analysis
    if (opts.enablePatternMatching) {
      const patternMatches = this.patternMatcher.analyzeColumn(stringValues);
      const patternEvidence = this.createPatternEvidence(patternMatches);
      evidence.push(...patternEvidence);

      if (patternMatches.length > 0) {
        const bestPattern = patternMatches[0];
        // Give more weight to pattern matches with high accuracy
        const patternConfidence = bestPattern.confidence;
        if (patternConfidence > 0.5) {
          const mappedType = this.mapPatternToSemanticType(bestPattern.pattern);
          if (mappedType !== 'unknown') {
            primaryType = mappedType;
            confidence = patternConfidence;
            subtype = bestPattern.pattern;
          }
        }
      }
    }

    // 2. Statistical analysis
    const metrics = this.statisticalAnalyzer.analyzeColumn(sampleValues);
    const dataTypeInference = this.statisticalAnalyzer.inferDataType(sampleValues);

    if (opts.enableStatisticalAnalysis) {
      const statisticalEvidence = this.createStatisticalEvidence(metrics, dataTypeInference);
      evidence.push(...statisticalEvidence);

      const statConfidence = this.calculateStatisticalConfidence(metrics, dataTypeInference);
      // Only override pattern matches if statistical confidence is significantly higher
      // and the pattern match confidence is low
      if ((statConfidence > confidence * 1.5 && confidence < 0.7) || (confidence === 0 && statConfidence > 0.3)) {
        primaryType = this.mapDataTypeToSemanticType(dataTypeInference.primaryType, metrics);
        confidence = statConfidence;
      }
    }

    // 3. Contextual analysis (column name hints)
    if (opts.enableContextualAnalysis) {
      const contextualEvidence = this.createContextualEvidence(columnName, metrics);
      evidence.push(...contextualEvidence);

      const contextType = this.inferFromColumnName(columnName);
      // Only use contextual hints if they strongly support the pattern match or no pattern found
      if (contextType.confidence > 0.7 &&
          (contextType.type === primaryType || confidence < 0.5)) {
        if (contextType.type === primaryType) {
          // Boost confidence if context matches pattern
          confidence = Math.min(confidence * 1.2, 1.0);
        } else if (confidence < 0.5) {
          // Use context if no strong pattern found
          primaryType = contextType.type;
          confidence = contextType.confidence;
        }
      }
    }

    // 4. Generate alternatives
    const alternatives = this.generateAlternatives(evidence, primaryType);

    // 5. Final confidence calculation
    const finalConfidence = this.calculateFinalConfidence(evidence, metrics);

    const endTime = performance.now();
    const processingTime = endTime - startTime;

    // Add performance evidence
    evidence.push({
      type: 'structural',
      description: `Processing completed in ${processingTime.toFixed(2)}ms`,
      confidence: 1.0,
      weight: 0.1,
      details: { processingTime, sampleSize: stringValues.length }
    });

    return {
      columnName,
      semanticType: primaryType,
      confidence: finalConfidence,
      subtype,
      evidence,
      alternatives,
      metrics
    };
  }

  public async inferDatasetTypes(
    data: Record<string, any[]>,
    options: InferenceOptions = {}
  ): Promise<Record<string, InferenceResult>> {
    const results: Record<string, InferenceResult> = {};
    const columns = Object.keys(data);

    // Process columns in parallel for better performance
    const promises = columns.map(async (columnName) => {
      const result = await this.inferColumnType(columnName, data[columnName], options);
      return { columnName, result };
    });

    const resolvedResults = await Promise.all(promises);

    resolvedResults.forEach(({ columnName, result }) => {
      results[columnName] = result;
    });

    return results;
  }

  private getDefaultOptions(options: InferenceOptions): Required<InferenceOptions> {
    return {
      sampleSize: options.sampleSize || 1000,
      minConfidence: options.minConfidence || 0.5,
      enablePatternMatching: options.enablePatternMatching !== false,
      enableStatisticalAnalysis: options.enableStatisticalAnalysis !== false,
      enableContextualAnalysis: options.enableContextualAnalysis !== false,
      performanceMode: options.performanceMode || 'accurate'
    };
  }

  private sampleData(values: any[], sampleSize: number): any[] {
    if (values.length <= sampleSize) {
      return values;
    }

    // Stratified sampling to ensure we get representative data
    const step = Math.floor(values.length / sampleSize);
    const sample = [];

    for (let i = 0; i < values.length; i += step) {
      sample.push(values[i]);
      if (sample.length >= sampleSize) break;
    }

    return sample;
  }

  private createPatternEvidence(matches: PatternMatch[]): Evidence[] {
    return matches.map(match => ({
      type: 'pattern' as const,
      description: `Matches ${match.pattern} pattern (${match.matchCount}/${match.totalCount} values)`,
      confidence: match.confidence,
      weight: 0.8,
      details: {
        pattern: match.pattern,
        examples: match.examples,
        matchRatio: match.matchCount / match.totalCount
      }
    }));
  }

  private createStatisticalEvidence(
    metrics: StatisticalMetrics,
    inference: DataTypeInference
  ): Evidence[] {
    const evidence: Evidence[] = [];

    evidence.push({
      type: 'statistical',
      description: `Statistical analysis suggests ${inference.primaryType} type`,
      confidence: inference.confidence / 100,
      weight: 0.6,
      details: {
        dataType: inference.primaryType,
        reasoning: inference.reasoning,
        uniqueness: metrics.uniquePercentage,
        nulls: metrics.nullPercentage
      }
    });

    // Add specific evidence based on data characteristics
    if (metrics.uniquePercentage > 95) {
      evidence.push({
        type: 'statistical',
        description: 'High uniqueness indicates identifier or key column',
        confidence: 0.8,
        weight: 0.7,
        details: { uniquePercentage: metrics.uniquePercentage }
      });
    }

    if (metrics.nullPercentage > 50) {
      evidence.push({
        type: 'statistical',
        description: 'High null percentage indicates optional field',
        confidence: 0.6,
        weight: 0.4,
        details: { nullPercentage: metrics.nullPercentage }
      });
    }

    return evidence;
  }

  private createContextualEvidence(columnName: string, metrics: StatisticalMetrics): Evidence[] {
    const evidence: Evidence[] = [];
    const normalizedName = columnName.toLowerCase();

    const namePatterns = [
      { pattern: /id$|_id$|^id_/, type: 'identifier', confidence: 0.9 },
      { pattern: /email|mail/, type: 'email', confidence: 0.95 },
      { pattern: /phone|tel|mobile/, type: 'phone', confidence: 0.9 },
      { pattern: /date|time|created|updated/, type: 'timestamp', confidence: 0.85 },
      { pattern: /price|cost|amount|salary|revenue/, type: 'currency', confidence: 0.8 },
      { pattern: /name|title|label/, type: 'text', confidence: 0.7 },
      { pattern: /url|link|href/, type: 'url', confidence: 0.9 },
      { pattern: /zip|postal/, type: 'postal_code', confidence: 0.9 },
      { pattern: /status|state|flag/, type: 'categorical', confidence: 0.8 },
      { pattern: /count|number|qty|quantity/, type: 'numeric', confidence: 0.8 }
    ];

    for (const { pattern, type, confidence } of namePatterns) {
      if (pattern.test(normalizedName)) {
        evidence.push({
          type: 'contextual',
          description: `Column name '${columnName}' suggests ${type} type`,
          confidence,
          weight: 0.5,
          details: { columnName, suggestedType: type }
        });
      }
    }

    return evidence;
  }

  private mapPatternToSemanticType(pattern: string): string {
    const mappings: Record<string, string> = {
      'email': 'email',
      'currency_usd': 'currency',
      'currency_euro': 'currency',
      'currency_generic': 'currency',
      'iso_datetime': 'timestamp',
      'iso_date': 'date',
      'us_date': 'date',
      'unix_timestamp': 'timestamp',
      'unix_timestamp_ms': 'timestamp',
      'uuid': 'identifier',
      'auto_increment_id': 'identifier',
      'alphanumeric_id': 'identifier',
      'prefixed_id': 'identifier',
      'us_zip_code': 'postal_code',
      'us_zip_plus4': 'postal_code',
      'postal_code_ca': 'postal_code',
      'postal_code_uk': 'postal_code',
      'phone_us': 'phone',
      'phone_international': 'phone',
      'ipv4': 'ip_address',
      'ipv6': 'ip_address',
      'url': 'url',
      'ssn': 'ssn',
      'credit_card': 'credit_card',
      'percentage': 'percentage',
      'boolean': 'boolean'
    };

    return mappings[pattern] || 'unknown';
  }

  private mapDataTypeToSemanticType(dataType: string, metrics: StatisticalMetrics): string {
    switch (dataType) {
      case 'numeric':
        if (metrics.numericStats?.isInteger && metrics.uniquePercentage > 95) {
          return 'identifier';
        }
        return 'numeric';
      case 'string':
        if (metrics.uniquePercentage > 95) {
          return 'text';
        } else if (metrics.uniquePercentage < 20) {
          return 'categorical';
        }
        return 'text';
      case 'date':
        return 'timestamp';
      case 'boolean':
        return 'boolean';
      default:
        return 'unknown';
    }
  }

  private inferFromColumnName(columnName: string): { type: string; confidence: number } {
    const normalizedName = columnName.toLowerCase();

    const patterns = [
      { pattern: /^id$|_id$|^id_/, type: 'identifier', confidence: 0.95 },
      { pattern: /email/, type: 'email', confidence: 0.9 },
      { pattern: /phone|tel/, type: 'phone', confidence: 0.85 },
      { pattern: /date|time/, type: 'timestamp', confidence: 0.8 },
      { pattern: /price|cost|amount/, type: 'currency', confidence: 0.8 }
    ];

    for (const { pattern, type, confidence } of patterns) {
      if (pattern.test(normalizedName)) {
        return { type, confidence };
      }
    }

    return { type: 'unknown', confidence: 0 };
  }

  private calculateStatisticalConfidence(
    metrics: StatisticalMetrics,
    inference: DataTypeInference
  ): number {
    let baseConfidence = inference.confidence / 100;

    // Adjust based on data quality indicators
    if (metrics.nullPercentage < 10) baseConfidence += 0.1;
    if (metrics.uniquePercentage > 90) baseConfidence += 0.05;
    if (metrics.totalCount > 1000) baseConfidence += 0.05;

    return Math.min(baseConfidence, 1.0);
  }

  private generateAlternatives(evidence: Evidence[], primaryType: string): Alternative[] {
    const typeScores = new Map<string, number>();

    // Aggregate scores for each potential type
    evidence.forEach(e => {
      if (e.details?.suggestedType) {
        const type = e.details.suggestedType;
        const score = e.confidence * e.weight;
        typeScores.set(type, (typeScores.get(type) || 0) + score);
      }
    });

    // Convert to alternatives, excluding primary type
    const alternatives: Alternative[] = [];
    typeScores.forEach((score, type) => {
      if (type !== primaryType && score > 0.3) {
        alternatives.push({
          semanticType: type,
          confidence: Math.min(score, 1.0),
          reasoning: `Alternative suggested by evidence analysis`
        });
      }
    });

    return alternatives.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  }

  private calculateFinalConfidence(evidence: Evidence[], metrics: StatisticalMetrics): number {
    // Give priority to pattern evidence
    const patternEvidence = evidence.filter(e => e.type === 'pattern');
    const otherEvidence = evidence.filter(e => e.type !== 'pattern');

    let confidence = 0;

    if (patternEvidence.length > 0) {
      // Use the best pattern match as base confidence
      const bestPattern = patternEvidence.sort((a, b) => b.confidence - a.confidence)[0];
      confidence = bestPattern.confidence;
    } else {
      // Fall back to weighted average of other evidence
      const weightedScores = otherEvidence.map(e => e.confidence * e.weight);
      const totalWeight = otherEvidence.reduce((sum, e) => sum + e.weight, 0);
      const weightedSum = weightedScores.reduce((sum, score) => sum + score, 0);
      confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    // Apply quality adjustments
    if (metrics.totalCount < 100) confidence *= 0.95;
    if (metrics.nullPercentage > 50) confidence *= 0.9;
    if (metrics.uniquePercentage < 5) confidence *= 0.95;

    // Boost confidence for strong pattern matches
    if (patternEvidence.length > 0 && confidence > 0.8) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    return Math.min(Math.max(confidence, 0), 1);
  }
}
