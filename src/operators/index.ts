/**
 * Semantic Data Science Operators
 *
 * This module provides comprehensive operators for semantic data processing:
 * - Unit conversion with multi-category support (currency, temperature, distance, time, mass)
 * - Time alignment with timezone conversion and granularity adjustment
 * - Semantic join operations for intelligent data joining
 *
 * Key Features:
 * - Multi-unit conversion with FX rate caching
 * - Temporal alignment with statistical preservation
 * - Timezone-aware data processing
 * - Performance optimized (<50ms per operation)
 * - Batch processing support
 *
 * Performance Targets:
 * - <50ms per unit conversion
 * - <100ms for timezone batch conversions
 * - <2s for 10K timestamp grain adjustments
 */

// Core semantic join operator
export {
  SemanticJoinOperator,
  JoinMatchResult,
  NormalizerFunction,
  NormalizerRegistry
} from './semantic-join';
export type { SemanticJoinOptions, SemanticJoinResult } from './semantic-join';

// Import types for use within this file
import type { SemanticJoinOptions, SemanticJoinResult } from './semantic-join';
import { SemanticJoinOperator } from './semantic-join';
import { getJoinAdapter } from './dataframe-join-adapters';

// Query optimization and planning
export {
  SemanticJoinPlanner,
  JoinPlan,
  NormalizationPlan,
  ColumnNormalizationPlan,
  DataFrameStatistics,
  JoinSelectivityEstimate,
  JoinCostModel
} from './join-planner';

// Confidence scoring system
export {
  JoinConfidenceCalculator,
  ConfidenceScore,
  ConfidenceComponents,
  ConfidenceFactor,
  MatchEvidence,
  ConfidenceWeightingScheme
} from './join-confidence';

// DataFrame adapter support
export {
  DataFrameJoinAdapter,
  PandasJoinAdapter,
  PolarsJoinAdapter,
  DataFrameJoinAdapterRegistry,
  getJoinAdapter,
  registerJoinAdapter,
  getSupportedJoinTypes,
  joinAdapterRegistry
} from './dataframe-join-adapters';

// Utility functions for creating and configuring semantic joins
export class SemanticJoinFactory {
  /**
   * Creates a pre-configured semantic join operator optimized for common use cases
   */
  static createOptimized(cidRegistry: any, options: {
    enableHighPerformance?: boolean;
    enableHighAccuracy?: boolean;
    enableLargeDatasets?: boolean;
  } = {}): SemanticJoinOperator {
    const joinOperator = new SemanticJoinOperator(cidRegistry);

    // Configure based on optimization preferences
    if (options.enableHighPerformance) {
      // Optimize for speed
      joinOperator.addNormalizer('default', (value: any) => String(value || '').toLowerCase().trim());
    }

    if (options.enableHighAccuracy) {
      // Add more sophisticated normalizers
      // This would be implemented with more complex normalization logic
    }

    return joinOperator;
  }

  /**
   * Creates default join options optimized for specific scenarios
   */
  static getDefaultOptions(scenario: 'customer_matching' | 'product_catalog' | 'general'): Partial<SemanticJoinOptions> {
    switch (scenario) {
      case 'customer_matching':
        return {
          confidenceThreshold: 0.8,
          enableFuzzyMatching: true,
          fuzzyThreshold: 0.7,
          autoSelectNormalizers: true,
          cacheNormalizedValues: true,
          batchSize: 25000
        };

      case 'product_catalog':
        return {
          confidenceThreshold: 0.9,
          enableFuzzyMatching: false, // Exact matches preferred for products
          autoSelectNormalizers: true,
          cacheNormalizedValues: true,
          batchSize: 50000
        };

      case 'general':
      default:
        return {
          confidenceThreshold: 0.7,
          enableFuzzyMatching: true,
          fuzzyThreshold: 0.8,
          autoSelectNormalizers: true,
          cacheNormalizedValues: true,
          batchSize: 10000
        };
    }
  }

  /**
   * Analyzes two datasets and suggests optimal join configuration
   */
  static async analyzeAndSuggestJoinConfig(
    left: any,
    right: any,
    leftColumns: string[],
    rightColumns: string[],
    cidRegistry: any
  ): Promise<{
    suggestedOptions: Partial<SemanticJoinOptions>;
    confidence: number;
    reasoning: string[];
    warnings: string[];
  }> {
    const joinOperator = new SemanticJoinOperator(cidRegistry);

    // Get basic adapter info
    const leftAdapter = getJoinAdapter(left);
    const rightAdapter = getJoinAdapter(right);

    const reasoning: string[] = [];
    const warnings: string[] = [];
    let confidence = 0.8;

    // Analyze data sizes
    const leftDf = leftAdapter ? leftAdapter.toDataFrameLike(left) : null;
    const rightDf = rightAdapter ? rightAdapter.toDataFrameLike(right) : null;

    if (!leftDf || !rightDf) {
      return {
        suggestedOptions: this.getDefaultOptions('general'),
        confidence: 0.3,
        reasoning: ['Unable to analyze data structure'],
        warnings: ['Using default configuration due to analysis failure']
      };
    }

    const leftRows = leftDf.shape[0];
    const rightRows = rightDf.shape[0];
    const totalRows = leftRows + rightRows;

    const suggestedOptions: Partial<SemanticJoinOptions> = {
      confidenceThreshold: 0.7,
      enableFuzzyMatching: true,
      fuzzyThreshold: 0.8,
      autoSelectNormalizers: true,
      cacheNormalizedValues: true
    };

    // Adjust batch size based on data size
    if (totalRows < 10000) {
      suggestedOptions.batchSize = totalRows;
      reasoning.push('Small dataset - using single batch processing');
    } else if (totalRows < 100000) {
      suggestedOptions.batchSize = 25000;
      reasoning.push('Medium dataset - using 25K batch size');
    } else {
      suggestedOptions.batchSize = 50000;
      reasoning.push('Large dataset - using 50K batch size for optimal performance');
    }

    // Analyze column types for fuzzy matching recommendations
    for (let i = 0; i < leftColumns.length && i < rightColumns.length; i++) {
      const leftCol = leftColumns[i];
      const rightCol = rightColumns[i];

      const leftValues = leftDf.getColumn(leftCol);
      const rightValues = rightDf.getColumn(rightCol);

      // Check for high cardinality (likely identifiers)
      const leftCardinality = new Set(leftValues).size / leftValues.length;
      const rightCardinality = new Set(rightValues).size / rightValues.length;

      if (leftCardinality > 0.9 && rightCardinality > 0.9) {
        suggestedOptions.enableFuzzyMatching = false;
        reasoning.push(`High cardinality columns detected (${leftCol}/${rightCol}) - disabling fuzzy matching`);
        suggestedOptions.confidenceThreshold = 0.9;
        confidence += 0.1;
      }
    }

    // Performance hints from adapters
    if (leftAdapter && rightAdapter) {
      const leftHints = leftAdapter.getPerformanceHints();
      const rightHints = rightAdapter.getPerformanceHints();

      if (leftHints.memoryEfficient && rightHints.memoryEfficient) {
        suggestedOptions.cacheNormalizedValues = true;
        reasoning.push('Memory-efficient adapters detected - enabling value caching');
      }
    }

    return {
      suggestedOptions,
      confidence,
      reasoning,
      warnings
    };
  }
}

/**
 * Performance monitoring utilities
 */
export class SemanticJoinMetrics {
  private static metrics: Map<string, any> = new Map();

  static recordJoinPerformance(joinId: string, result: SemanticJoinResult): void {
    this.metrics.set(joinId, {
      timestamp: new Date(),
      performance: result.performance,
      statistics: result.statistics,
      inputRows: result.statistics.inputRowsLeft + result.statistics.inputRowsRight,
      outputRows: result.statistics.outputRows,
      throughput: (result.statistics.inputRowsLeft + result.statistics.inputRowsRight) / (result.performance.totalTime / 1000)
    });
  }

  static getPerformanceReport(): {
    averageThroughput: number;
    averageConfidence: number;
    totalJoins: number;
    performanceBreakdown: any;
  } {
    const allMetrics = Array.from(this.metrics.values());

    if (allMetrics.length === 0) {
      return {
        averageThroughput: 0,
        averageConfidence: 0,
        totalJoins: 0,
        performanceBreakdown: {}
      };
    }

    const averageThroughput = allMetrics.reduce((sum, m) => sum + m.throughput, 0) / allMetrics.length;
    const averageConfidence = allMetrics.reduce((sum, m) => sum + m.statistics.confidence.average, 0) / allMetrics.length;

    return {
      averageThroughput,
      averageConfidence,
      totalJoins: allMetrics.length,
      performanceBreakdown: {
        totalTime: allMetrics.reduce((sum, m) => sum + m.performance.totalTime, 0) / allMetrics.length,
        normalizationTime: allMetrics.reduce((sum, m) => sum + m.performance.normalizationTime, 0) / allMetrics.length,
        joinTime: allMetrics.reduce((sum, m) => sum + m.performance.joinTime, 0) / allMetrics.length
      }
    };
  }

  static clearMetrics(): void {
    this.metrics.clear();
  }
}

// Unit Conversion & Time Alignment Operators
export { UnitConverter } from './unit-convert.js';
export type {
  ConversionResult,
  ConversionMetadata,
  UnitConversionConfig,
  UnitCategory,
  UnitDefinition
} from './unit-convert.js';

export { FXCache, OfflineMode } from './fx-cache.js';
export type {
  ExchangeRateResult,
  ExchangeRateSource,
  FXCacheConfig,
  RedisLikeClient
} from './fx-cache.js';

export { TimeAligner } from './align-time.js';
export type { TimeAlignmentConfig, TimeSeriesData, AlignmentResult } from './align-time.js';

export { TimezoneHandler } from './timezone-handler.js';
export type { TimezoneConversionResult, TimezoneInfo } from './timezone-handler.js';

export { GrainAdjuster } from './grain-adjuster.js';
export type { TimeGrain, AdjustmentStrategy, GrainAdjustmentResult, GrainStatistics } from './grain-adjuster.js';

// Version and metadata
export const SEMANTIC_JOIN_VERSION = '1.0.0';
export const UNIT_CONVERSION_VERSION = '1.0.0';
export const PERFORMANCE_TARGETS = {
  MAX_TIME_100K_ROWS: 100, // milliseconds
  MIN_JOIN_ACCURACY: 0.92, // 92%
  TARGET_CACHE_HIT_RATE: 0.90, // 90%
  JOIN_FAILURE_REDUCTION: 0.30, // 30% vs standard joins
  MAX_UNIT_CONVERSION_TIME: 50, // milliseconds
  MAX_TIMEZONE_BATCH_TIME: 100, // milliseconds for 1000 timestamps
  MAX_GRAIN_ADJUSTMENT_TIME: 2000 // milliseconds for 10K timestamps
} as const;
