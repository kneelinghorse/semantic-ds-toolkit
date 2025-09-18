import {
  SemanticJoinOptions,
  SemanticJoinOperator,
  NormalizerFunction
} from './semantic-join';
import {
  DataFrameLike,
  SemanticContext
} from '../core/shadow-semantics';
import { StatisticalMetrics } from '../inference/statistical-analyzer';

export interface JoinPlan {
  strategy: 'hash_join' | 'nested_loop' | 'sort_merge' | 'broadcast_join';
  estimatedCost: number;
  estimatedRows: number;
  optimizations: string[];
  indexingStrategy: 'build_left' | 'build_right' | 'dual_index' | 'none';
  batchingStrategy: {
    enabled: boolean;
    batchSize: number;
    parallelism: number;
  };
  cacheStrategy: {
    enableValueCache: boolean;
    enableIndexCache: boolean;
    cacheSize: number;
  };
  normalizationPlan: NormalizationPlan;
}

export interface NormalizationPlan {
  leftColumns: ColumnNormalizationPlan[];
  rightColumns: ColumnNormalizationPlan[];
  precomputeNormalization: boolean;
  estimatedNormalizationCost: number;
}

export interface ColumnNormalizationPlan {
  column: string;
  normalizer: string;
  confidence: number;
  selectivityEstimate: number;
  cardinalityEstimate: number;
  costEstimate: number;
}

export interface DataFrameStatistics {
  rowCount: number;
  columnCount: number;
  avgRowSize: number;
  uniquenessRatios: Record<string, number>;
  nullRatios: Record<string, number>;
  dataTypes: Record<string, string>;
  estimatedSize: number;
}

export interface JoinSelectivityEstimate {
  expectedMatches: number;
  selectivity: number;
  confidence: number;
  reasoning: string[];
}

export class SemanticJoinPlanner {
  private costModel: JoinCostModel;

  constructor() {
    this.costModel = new JoinCostModel();
  }

  planOptimalJoin(
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    leftContext: Record<string, SemanticContext | null>,
    rightContext: Record<string, SemanticContext | null>,
    options: Partial<SemanticJoinOptions>
  ): JoinPlan {
    // Gather statistics
    const leftStats = this.analyzeDataFrameStatistics(leftDf);
    const rightStats = this.analyzeDataFrameStatistics(rightDf);

    // Resolve join columns
    const leftColumns = this.resolveJoinColumns(options.leftOn, leftDf.columns);
    const rightColumns = this.resolveJoinColumns(options.rightOn, rightDf.columns);

    // Estimate join selectivity
    const selectivity = this.estimateJoinSelectivity(
      leftDf,
      rightDf,
      leftColumns,
      rightColumns,
      leftContext,
      rightContext,
      options
    );

    // Plan normalization
    const normalizationPlan = this.planNormalization(
      leftDf,
      rightDf,
      leftColumns,
      rightColumns,
      leftContext,
      rightContext,
      options
    );

    // Choose optimal strategy
    const strategy = this.selectJoinStrategy(leftStats, rightStats, selectivity, options);

    // Plan indexing
    const indexingStrategy = this.planIndexing(leftStats, rightStats, strategy);

    // Plan batching and parallelism
    const batchingStrategy = this.planBatching(leftStats, rightStats, options);

    // Plan caching
    const cacheStrategy = this.planCaching(leftStats, rightStats, normalizationPlan);

    // Calculate total cost
    const estimatedCost = this.costModel.calculateTotalCost(
      leftStats,
      rightStats,
      strategy,
      selectivity,
      normalizationPlan,
      batchingStrategy
    );

    // Generate optimizations
    const optimizations = this.generateOptimizations(
      leftStats,
      rightStats,
      selectivity,
      normalizationPlan
    );

    return {
      strategy,
      estimatedCost,
      estimatedRows: selectivity.expectedMatches,
      optimizations,
      indexingStrategy,
      batchingStrategy,
      cacheStrategy,
      normalizationPlan
    };
  }

  private analyzeDataFrameStatistics(df: DataFrameLike): DataFrameStatistics {
    const rowCount = df.shape[0];
    const columnCount = df.shape[1];

    const uniquenessRatios: Record<string, number> = {};
    const nullRatios: Record<string, number> = {};
    const dataTypes: Record<string, string> = {};

    let totalSize = 0;

    for (const column of df.columns) {
      const values = df.getColumn(column);
      const nonNullValues = values.filter(v => v != null && v !== '');

      // Calculate uniqueness ratio
      const uniqueCount = new Set(nonNullValues).size;
      uniquenessRatios[column] = nonNullValues.length > 0 ? uniqueCount / nonNullValues.length : 0;

      // Calculate null ratio
      nullRatios[column] = (values.length - nonNullValues.length) / values.length;

      // Infer data type
      dataTypes[column] = df.dtypes[column] || this.inferDataType(values);

      // Estimate column size
      const avgValueSize = this.estimateAverageValueSize(values.slice(0, 100));
      totalSize += avgValueSize * rowCount;
    }

    return {
      rowCount,
      columnCount,
      avgRowSize: totalSize / rowCount,
      uniquenessRatios,
      nullRatios,
      dataTypes,
      estimatedSize: totalSize
    };
  }

  private estimateJoinSelectivity(
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    leftColumns: string[],
    rightColumns: string[],
    leftContext: Record<string, SemanticContext | null>,
    rightContext: Record<string, SemanticContext | null>,
    options: Partial<SemanticJoinOptions>
  ): JoinSelectivityEstimate {
    let totalSelectivity = 1.0;
    let totalConfidence = 1.0;
    const reasoning: string[] = [];

    for (let i = 0; i < leftColumns.length; i++) {
      const leftCol = leftColumns[i];
      const rightCol = rightColumns[i];

      const leftValues = leftDf.getColumn(leftCol);
      const rightValues = rightDf.getColumn(rightCol);

      const leftUnique = new Set(leftValues).size;
      const rightUnique = new Set(rightValues).size;

      // Calculate basic selectivity
      let columnSelectivity = Math.min(leftUnique, rightUnique) / Math.max(leftValues.length, rightValues.length);

      // Adjust for semantic context
      const leftCtx = leftContext[leftCol];
      const rightCtx = rightContext[rightCol];

      if (leftCtx && rightCtx) {
        if (leftCtx.semantic_type === rightCtx.semantic_type) {
          columnSelectivity *= 1.2; // Boost for same semantic type
          totalConfidence *= Math.max(leftCtx.confidence, rightCtx.confidence);
          reasoning.push(`Semantic match: ${leftCtx.semantic_type}`);
        } else if (this.areTypesCompatible(leftCtx.semantic_type, rightCtx.semantic_type)) {
          columnSelectivity *= 0.8; // Slight reduction for compatible types
          totalConfidence *= 0.8;
          reasoning.push(`Compatible types: ${leftCtx.semantic_type} ↔ ${rightCtx.semantic_type}`);
        } else {
          columnSelectivity *= 0.3; // Major reduction for incompatible types
          totalConfidence *= 0.5;
          reasoning.push(`Incompatible types: ${leftCtx.semantic_type} ↔ ${rightCtx.semantic_type}`);
        }
      }

      // Adjust for fuzzy matching
      if (options.enableFuzzyMatching) {
        columnSelectivity *= 1.5; // Fuzzy matching increases matches
        reasoning.push('Fuzzy matching enabled');
      }

      // Adjust for data quality
      const leftNullRatio = leftValues.filter(v => v == null).length / leftValues.length;
      const rightNullRatio = rightValues.filter(v => v == null).length / rightValues.length;
      const avgNullRatio = (leftNullRatio + rightNullRatio) / 2;

      columnSelectivity *= (1 - avgNullRatio); // Reduce for nulls
      if (avgNullRatio > 0.1) {
        reasoning.push(`High null ratio: ${(avgNullRatio * 100).toFixed(1)}%`);
      }

      totalSelectivity *= columnSelectivity;
    }

    // Cap selectivity to reasonable bounds
    totalSelectivity = Math.max(0.001, Math.min(1.0, totalSelectivity));

    const expectedMatches = Math.ceil(
      leftDf.shape[0] * rightDf.shape[0] * totalSelectivity
    );

    return {
      expectedMatches,
      selectivity: totalSelectivity,
      confidence: totalConfidence,
      reasoning
    };
  }

  private planNormalization(
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    leftColumns: string[],
    rightColumns: string[],
    leftContext: Record<string, SemanticContext | null>,
    rightContext: Record<string, SemanticContext | null>,
    options: Partial<SemanticJoinOptions>
  ): NormalizationPlan {
    const leftPlans: ColumnNormalizationPlan[] = [];
    const rightPlans: ColumnNormalizationPlan[] = [];

    let totalCost = 0;

    for (let i = 0; i < leftColumns.length; i++) {
      const leftCol = leftColumns[i];
      const rightCol = rightColumns[i];

      // Plan left column normalization
      const leftPlan = this.planColumnNormalization(
        leftCol,
        leftDf,
        leftContext[leftCol],
        'left'
      );
      leftPlans.push(leftPlan);
      totalCost += leftPlan.costEstimate;

      // Plan right column normalization
      const rightPlan = this.planColumnNormalization(
        rightCol,
        rightDf,
        rightContext[rightCol],
        'right'
      );
      rightPlans.push(rightPlan);
      totalCost += rightPlan.costEstimate;
    }

    // Decide whether to precompute normalization
    const precomputeNormalization = this.shouldPrecomputeNormalization(
      leftDf.shape[0] + rightDf.shape[0],
      totalCost,
      options
    );

    return {
      leftColumns: leftPlans,
      rightColumns: rightPlans,
      precomputeNormalization,
      estimatedNormalizationCost: totalCost
    };
  }

  private planColumnNormalization(
    column: string,
    df: DataFrameLike,
    context: SemanticContext | null,
    side: 'left' | 'right'
  ): ColumnNormalizationPlan {
    const values = df.getColumn(column);
    const uniqueValues = new Set(values);

    let normalizer = 'default';
    let confidence = 0.5;

    if (context) {
      const normalizerMapping: Record<string, string> = {
        'email_address': 'email',
        'phone_number': 'phone',
        'display_name': 'name',
        'monetary_value': 'numeric',
        'temporal': 'date',
        'categorical_attribute': 'categorical',
        'categorical_code': 'categorical'
      };

      normalizer = normalizerMapping[context.semantic_type] || 'default';
      confidence = context.confidence;
    }

    const selectivityEstimate = uniqueValues.size / values.length;
    const cardinalityEstimate = uniqueValues.size;

    // Estimate normalization cost based on complexity
    const normalizerCosts: Record<string, number> = {
      'default': 1,
      'email': 2,
      'phone': 3,
      'name': 4,
      'address': 5,
      'numeric': 2,
      'date': 3,
      'categorical': 1
    };

    const costEstimate = (normalizerCosts[normalizer] || 1) * values.length;

    return {
      column,
      normalizer,
      confidence,
      selectivityEstimate,
      cardinalityEstimate,
      costEstimate
    };
  }

  private selectJoinStrategy(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    selectivity: JoinSelectivityEstimate,
    options: Partial<SemanticJoinOptions>
  ): 'hash_join' | 'nested_loop' | 'sort_merge' | 'broadcast_join' {
    const leftRows = leftStats.rowCount;
    const rightRows = rightStats.rowCount;
    const expectedMatches = selectivity.expectedMatches;

    // Very small datasets - use nested loop
    if (leftRows < 1000 && rightRows < 1000) {
      return 'nested_loop';
    }

    // One side is very small - broadcast join
    if (leftRows < 10000 || rightRows < 10000) {
      return 'broadcast_join';
    }

    // High selectivity - sort merge might be efficient
    if (selectivity.selectivity > 0.1 && expectedMatches > 100000) {
      return 'sort_merge';
    }

    // Default to hash join for most cases
    return 'hash_join';
  }

  private planIndexing(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    strategy: string
  ): 'build_left' | 'build_right' | 'dual_index' | 'none' {
    if (strategy === 'nested_loop') {
      return 'none';
    }

    if (strategy === 'broadcast_join') {
      return leftStats.rowCount < rightStats.rowCount ? 'build_left' : 'build_right';
    }

    if (strategy === 'hash_join') {
      // Build index on smaller side
      return leftStats.rowCount < rightStats.rowCount ? 'build_left' : 'build_right';
    }

    if (strategy === 'sort_merge') {
      // Dual indexing beneficial for sort-merge
      return 'dual_index';
    }

    return 'none';
  }

  private planBatching(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    options: Partial<SemanticJoinOptions>
  ): { enabled: boolean; batchSize: number; parallelism: number } {
    const totalRows = leftStats.rowCount + rightStats.rowCount;

    // Enable batching for large datasets
    if (totalRows > 100000) {
      const batchSize = options.batchSize || Math.min(50000, Math.max(10000, totalRows / 10));
      const parallelism = Math.min(4, Math.ceil(totalRows / batchSize));

      return {
        enabled: true,
        batchSize,
        parallelism
      };
    }

    return {
      enabled: false,
      batchSize: totalRows,
      parallelism: 1
    };
  }

  private planCaching(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    normalizationPlan: NormalizationPlan
  ): { enableValueCache: boolean; enableIndexCache: boolean; cacheSize: number } {
    const totalRows = leftStats.rowCount + rightStats.rowCount;
    const normalizationCost = normalizationPlan.estimatedNormalizationCost;

    // Enable value caching if normalization is expensive
    const enableValueCache = normalizationCost > totalRows * 2;

    // Enable index caching for large datasets
    const enableIndexCache = totalRows > 50000;

    // Size cache based on memory constraints
    const cacheSize = Math.min(100000, Math.max(10000, totalRows / 5));

    return {
      enableValueCache,
      enableIndexCache,
      cacheSize
    };
  }

  private generateOptimizations(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    selectivity: JoinSelectivityEstimate,
    normalizationPlan: NormalizationPlan
  ): string[] {
    const optimizations: string[] = [];

    // Suggest column ordering
    if (leftStats.columnCount > 5 || rightStats.columnCount > 5) {
      optimizations.push('Consider column pruning to reduce memory usage');
    }

    // Suggest filtering
    if (selectivity.selectivity < 0.01) {
      optimizations.push('Low selectivity detected - consider pre-filtering data');
    }

    // Suggest normalization strategy
    if (normalizationPlan.estimatedNormalizationCost > (leftStats.rowCount + rightStats.rowCount) * 5) {
      optimizations.push('High normalization cost - consider simpler normalizers');
    }

    // Suggest indexing
    const totalRows = leftStats.rowCount + rightStats.rowCount;
    if (totalRows > 1000000) {
      optimizations.push('Large dataset - consider pre-building persistent indices');
    }

    // Memory optimization
    const estimatedMemoryUsage = (leftStats.estimatedSize + rightStats.estimatedSize) / (1024 * 1024); // MB
    if (estimatedMemoryUsage > 1000) {
      optimizations.push('High memory usage - consider streaming or disk-based processing');
    }

    return optimizations;
  }

  private shouldPrecomputeNormalization(
    totalRows: number,
    normalizationCost: number,
    options: Partial<SemanticJoinOptions>
  ): boolean {
    // Precompute if normalization is expensive relative to dataset size
    const costPerRow = normalizationCost / totalRows;

    // Precompute for expensive normalizers or when caching is enabled
    return costPerRow > 3 || (options.cacheNormalizedValues !== false);
  }

  private inferDataType(values: any[]): string {
    if (values.length === 0) return 'unknown';

    const sample = values.slice(0, 100);
    let numericCount = 0;
    let dateCount = 0;

    for (const value of sample) {
      if (value != null) {
        if (typeof value === 'number' || (!isNaN(parseFloat(String(value))) && isFinite(parseFloat(String(value))))) {
          numericCount++;
        }
        if (!isNaN(new Date(String(value)).getTime()) && String(value).length > 6) {
          dateCount++;
        }
      }
    }

    if (numericCount / sample.length > 0.8) return 'numeric';
    if (dateCount / sample.length > 0.7) return 'date';
    return 'string';
  }

  private estimateAverageValueSize(values: any[]): number {
    if (values.length === 0) return 0;

    const sample = values.slice(0, Math.min(100, values.length));
    let totalSize = 0;

    for (const value of sample) {
      if (value != null) {
        if (typeof value === 'string') {
          totalSize += value.length * 2; // Unicode characters
        } else if (typeof value === 'number') {
          totalSize += 8; // 64-bit number
        } else {
          totalSize += String(value).length * 2;
        }
      }
    }

    return sample.length > 0 ? totalSize / sample.length : 0;
  }

  private areTypesCompatible(type1: string, type2: string): boolean {
    const compatibilityGroups = [
      ['identifier', 'high_cardinality_attribute'],
      ['monetary_value', 'numeric_value'],
      ['display_name', 'generic_attribute'],
      ['categorical_attribute', 'categorical_code'],
      ['temporal', 'datetime', 'timestamp']
    ];

    return compatibilityGroups.some(group =>
      group.includes(type1) && group.includes(type2)
    );
  }

  private resolveJoinColumns(columns: string | string[] | undefined, availableColumns: string[]): string[] {
    if (!columns) {
      throw new Error('Join columns must be specified');
    }

    const cols = Array.isArray(columns) ? columns : [columns];

    for (const col of cols) {
      if (!availableColumns.includes(col)) {
        throw new Error(`Column '${col}' not found. Available: ${availableColumns.join(', ')}`);
      }
    }

    return cols;
  }
}

class JoinCostModel {
  // Cost constants (adjust based on profiling)
  private readonly NESTED_LOOP_COST = 1.0;
  private readonly HASH_BUILD_COST = 0.5;
  private readonly HASH_PROBE_COST = 0.3;
  private readonly SORT_COST = 0.8;
  private readonly MERGE_COST = 0.4;
  private readonly NORMALIZATION_BASE_COST = 2.0;

  calculateTotalCost(
    leftStats: DataFrameStatistics,
    rightStats: DataFrameStatistics,
    strategy: string,
    selectivity: JoinSelectivityEstimate,
    normalizationPlan: NormalizationPlan,
    batchingStrategy: { enabled: boolean; batchSize: number; parallelism: number }
  ): number {
    const leftRows = leftStats.rowCount;
    const rightRows = rightStats.rowCount;

    let joinCost = 0;

    switch (strategy) {
      case 'nested_loop':
        joinCost = leftRows * rightRows * this.NESTED_LOOP_COST;
        break;

      case 'hash_join':
        const buildCost = Math.min(leftRows, rightRows) * this.HASH_BUILD_COST;
        const probeCost = Math.max(leftRows, rightRows) * this.HASH_PROBE_COST;
        joinCost = buildCost + probeCost;
        break;

      case 'sort_merge':
        const sortCostLeft = leftRows * Math.log2(leftRows) * this.SORT_COST;
        const sortCostRight = rightRows * Math.log2(rightRows) * this.SORT_COST;
        const mergeCost = (leftRows + rightRows) * this.MERGE_COST;
        joinCost = sortCostLeft + sortCostRight + mergeCost;
        break;

      case 'broadcast_join':
        const broadcastCost = Math.min(leftRows, rightRows) * 0.1; // Broadcasting overhead
        const hashJoinCost = Math.max(leftRows, rightRows) * this.HASH_PROBE_COST;
        joinCost = broadcastCost + hashJoinCost;
        break;

      default:
        joinCost = leftRows * rightRows * this.NESTED_LOOP_COST;
    }

    // Add normalization cost
    const normalizationCost = normalizationPlan.estimatedNormalizationCost * this.NORMALIZATION_BASE_COST;

    // Apply batching discount
    let batchingMultiplier = 1.0;
    if (batchingStrategy.enabled && batchingStrategy.parallelism > 1) {
      batchingMultiplier = 0.8; // 20% efficiency gain from parallelism
    }

    return (joinCost + normalizationCost) * batchingMultiplier;
  }
}

export { JoinCostModel };