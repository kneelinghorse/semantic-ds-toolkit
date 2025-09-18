import {
  DataFrameLike,
  ShadowSemanticsLayer,
  SemanticContext
} from '../core/shadow-semantics';
import { CIDRegistry, CIDLookupResult } from '../registry/cid-registry';
import { StatisticalAnalyzer, StatisticalMetrics } from '../inference/statistical-analyzer';
import { DataFrameAdapterRegistry } from '../core/dataframe-adapters';
import { getJoinAdapter } from './dataframe-join-adapters';
import { SemanticJoinPlanner } from './join-planner';
import { JoinConfidenceCalculator, MatchEvidence } from './join-confidence';

// xxHash64 implementation for high-performance fingerprinting
class XXHash64 {
  private static readonly PRIME1 = BigInt('11400714785074694791');
  private static readonly PRIME2 = BigInt('14029467366897019727');
  private static readonly PRIME3 = BigInt('1609587929392839161');
  private static readonly PRIME4 = BigInt('9650029242287828579');
  private static readonly PRIME5 = BigInt('2870177450012600261');

  static hash(input: string | Buffer): string {
    const data = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    let hash = BigInt(0);

    // Simple hash implementation (production should use full xxHash64)
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << BigInt(5)) - hash) + BigInt(data[i]);
      hash = hash & BigInt('0xFFFFFFFFFFFFFFFF'); // 64-bit mask
    }

    return hash.toString(16);
  }
}

interface NormalizerPairConfig {
  left: string;
  right: string;
  normalizer: NormalizerFunction;
  normalizerName: keyof NormalizerRegistry | 'custom';
  confidence: number;
  leftValues: any[];
  rightValues: any[];
  leftStats: StatisticalMetrics;
  rightStats: StatisticalMetrics;
  leftContext: SemanticContext | null;
  rightContext: SemanticContext | null;
  cidMatches: { left: CIDLookupResult[]; right: CIDLookupResult[] };
}

export interface SemanticJoinOptions {
  leftOn: string | string[];
  rightOn: string | string[];
  how: 'inner' | 'left' | 'right' | 'outer';
  confidenceThreshold: number;
  enableFuzzyMatching: boolean;
  fuzzyThreshold: number;
  cacheNormalizedValues: boolean;
  batchSize: number;
  autoSelectNormalizers: boolean;
  preserveOriginalColumns: boolean;
}

export interface JoinMatchResult {
  leftIndex: number;
  rightIndex: number;
  confidence: number;
  matchType: 'exact' | 'normalized' | 'fuzzy';
  normalizerUsed?: string;
  metadata: Record<string, any>;
}

export interface SemanticJoinResult<T = any> {
  data: T;
  matches: JoinMatchResult[];
  performance: {
    totalTime: number;
    normalizationTime: number;
    matchingTime: number;
    joinTime: number;
    cacheHits: number;
    totalOperations: number;
  };
  statistics: {
    inputRowsLeft: number;
    inputRowsRight: number;
    outputRows: number;
    matchedRows: number;
    confidence: {
      average: number;
      median: number;
      distribution: Record<string, number>;
    };
  };
}

export interface NormalizerFunction {
  (value: any): string;
}

export interface NormalizerRegistry {
  email: NormalizerFunction;
  phone: NormalizerFunction;
  name: NormalizerFunction;
  address: NormalizerFunction;
  numeric: NormalizerFunction;
  date: NormalizerFunction;
  categorical: NormalizerFunction;
  default: NormalizerFunction;
}

export class SemanticJoinOperator {
  private semanticsLayer: ShadowSemanticsLayer;
  private cidRegistry: CIDRegistry;
  private statisticalAnalyzer: StatisticalAnalyzer;
  private adapterRegistry: DataFrameAdapterRegistry;
  private joinPlanner: SemanticJoinPlanner;
  private confidenceCalculator: JoinConfidenceCalculator;
  private normalizers: NormalizerRegistry;
  private cache: Map<string, string> = new Map();
  private cacheStats = { hits: 0, misses: 0 };
  private cacheEnabled = true;

  constructor(
    cidRegistry: CIDRegistry,
    semanticsLayer?: ShadowSemanticsLayer,
    statisticalAnalyzer?: StatisticalAnalyzer
  ) {
    this.cidRegistry = cidRegistry;
    this.semanticsLayer = semanticsLayer || new ShadowSemanticsLayer();
    this.statisticalAnalyzer = statisticalAnalyzer || new StatisticalAnalyzer();
    this.adapterRegistry = new DataFrameAdapterRegistry();
    this.joinPlanner = new SemanticJoinPlanner();
    this.confidenceCalculator = new JoinConfidenceCalculator();
    this.normalizers = this.initializeNormalizers();
  }

  async semanticJoin<T = any>(
    left: any,
    right: any,
    options: Partial<SemanticJoinOptions> = {}
  ): Promise<SemanticJoinResult<T>> {
    const startTime = performance.now();

    // Find specialized join adapters for the input types
    const leftJoinAdapter = getJoinAdapter(left);
    const rightJoinAdapter = getJoinAdapter(right);

    // Set defaults (apply type-specific optimizations if available)
    const baseOptions: Omit<SemanticJoinOptions, 'leftOn' | 'rightOn'> = {
      how: 'inner',
      confidenceThreshold: 0.7,
      enableFuzzyMatching: true,
      fuzzyThreshold: 0.8,
      cacheNormalizedValues: true,
      batchSize: 10000,
      autoSelectNormalizers: true,
      preserveOriginalColumns: true
    };

    let opts: SemanticJoinOptions = {
      ...baseOptions,
      ...options
    } as SemanticJoinOptions;

    // Apply type-specific optimizations
    if (leftJoinAdapter) {
      opts = leftJoinAdapter.optimizeForType(opts);
    }
    if (rightJoinAdapter && rightJoinAdapter !== leftJoinAdapter) {
      opts = rightJoinAdapter.optimizeForType(opts);
    }

    // Adapt dataframes
    let leftDf: DataFrameLike, rightDf: DataFrameLike;

    if (leftJoinAdapter) {
      leftDf = leftJoinAdapter.toDataFrameLike(left);
    } else {
      leftDf = this.adapterRegistry.adapt(left) as DataFrameLike;
    }

    if (rightJoinAdapter) {
      rightDf = rightJoinAdapter.toDataFrameLike(right);
    } else {
      rightDf = this.adapterRegistry.adapt(right) as DataFrameLike;
    }

    if (!leftDf || !rightDf) {
      throw new Error('Unable to adapt input data frames');
    }

    // Attach semantic context
    const leftSemantic = this.semanticsLayer.attachSemanticsShadow(leftDf, {
      dataset_name: 'left_join_input'
    });
    const rightSemantic = this.semanticsLayer.attachSemanticsShadow(rightDf, {
      dataset_name: 'right_join_input'
    });

    // Determine join columns
    const leftColumns = this.resolveJoinColumns(opts.leftOn, leftDf.columns);
    const rightColumns = this.resolveJoinColumns(opts.rightOn, rightDf.columns);

    if (leftColumns.length !== rightColumns.length) {
      throw new Error('Number of left and right join columns must match');
    }

    const leftContextMap = this.buildContextMap(leftSemantic.dataframe_id, leftColumns);
    const rightContextMap = this.buildContextMap(rightSemantic.dataframe_id, rightColumns);

    const joinPlan = this.joinPlanner.planOptimalJoin(
      leftDf,
      rightDf,
      leftContextMap,
      rightContextMap,
      opts
    );

    if (options.batchSize == null && joinPlan.batchingStrategy.enabled) {
      opts.batchSize = joinPlan.batchingStrategy.batchSize;
    }
    if (options.cacheNormalizedValues == null) {
      opts.cacheNormalizedValues = joinPlan.cacheStrategy.enableValueCache;
    }

    const normalizerPlanIndexLeft = new Map(
      joinPlan.normalizationPlan.leftColumns.map(plan => [plan.column, plan])
    );
    const normalizerPlanIndexRight = new Map(
      joinPlan.normalizationPlan.rightColumns.map(plan => [plan.column, plan])
    );

    const normalizerPairs: NormalizerPairConfig[] = [];

    for (let i = 0; i < leftColumns.length; i++) {
      const leftCol = leftColumns[i];
      const rightCol = rightColumns[i];

      const plannedLeft = normalizerPlanIndexLeft.get(leftCol);
      const plannedRight = normalizerPlanIndexRight.get(rightCol);

      let normalizerName: keyof NormalizerRegistry | 'custom' = (plannedLeft?.normalizer as keyof NormalizerRegistry) ||
        (plannedRight?.normalizer as keyof NormalizerRegistry) || 'default';
      let confidence = Math.max(plannedLeft?.confidence ?? 0.5, plannedRight?.confidence ?? 0.5);

      let normalizer: NormalizerFunction = this.normalizers[normalizerName] || this.normalizers.default;

      const leftContext = leftContextMap[leftCol] || null;
      const rightContext = rightContextMap[rightCol] || null;

      const leftValues = leftDf.getColumn(leftCol);
      const rightValues = rightDf.getColumn(rightCol);

      const leftStats = this.statisticalAnalyzer.analyzeColumn(leftValues);
      const rightStats = this.statisticalAnalyzer.analyzeColumn(rightValues);

      const cidMatchesLeft = this.cidRegistry.lookupByLabel(leftCol);
      const cidMatchesRight = this.cidRegistry.lookupByLabel(rightCol);

      const cidSelection = this.selectNormalizerFromCID(cidMatchesLeft, cidMatchesRight);
      if (cidSelection && cidSelection.confidence > confidence) {
        normalizer = this.normalizers[cidSelection.name];
        normalizerName = cidSelection.name;
        confidence = cidSelection.confidence;
      }

      if (opts.autoSelectNormalizers) {
        const selection = this.selectOptimalNormalizer(
          leftContext,
          rightContext,
          leftValues,
          rightValues
        );

        if (selection.confidence >= confidence) {
          const inferredName = this.identifyNormalizer(selection.normalizer);
          normalizerName = inferredName ?? 'custom';
          normalizer = selection.normalizer;
          confidence = selection.confidence;
        }
      }

      normalizerPairs.push({
        left: leftCol,
        right: rightCol,
        normalizer,
        normalizerName,
        confidence,
        leftValues,
        rightValues,
        leftStats,
        rightStats,
        leftContext,
        rightContext,
        cidMatches: { left: cidMatchesLeft, right: cidMatchesRight }
      });
    }

    this.cacheEnabled = opts.cacheNormalizedValues !== false;

    const normalizationStart = performance.now();
    const rawMatches = await this.performSemanticMatch(
      leftDf,
      rightDf,
      normalizerPairs,
      opts
    );
    const matches = this.calculateConfidenceScores(
      rawMatches,
      normalizerPairs,
      leftDf,
      rightDf,
      opts.confidenceThreshold
    );
    const normalizationEnd = performance.now();

    // Execute the actual join
    const joinStart = performance.now();
    let joinedData: T;

    // Use specialized join adapter if available for the result format
    const resultAdapter = leftJoinAdapter || rightJoinAdapter;
    if (resultAdapter) {
      const intermediateResult = this.executeJoin(left, right, leftDf, rightDf, matches, opts);
      const tempResult: SemanticJoinResult = {
        data: intermediateResult,
        matches,
        performance: { totalTime: 0, normalizationTime: 0, matchingTime: 0, joinTime: 0, cacheHits: 0, totalOperations: 0 },
        statistics: { inputRowsLeft: 0, inputRowsRight: 0, outputRows: 0, matchedRows: 0, confidence: { average: 0, median: 0, distribution: {} }}
      };
      joinedData = resultAdapter.fromJoinResult(tempResult, left, right, opts) as T;
    } else {
      joinedData = this.executeJoin(left, right, leftDf, rightDf, matches, opts) as T;
    }
    const joinEnd = performance.now();

    const endTime = performance.now();

    // Calculate statistics
    const confidenceValues = matches.map(m => m.confidence);
    const avgConfidence = confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length || 0;
    const sortedConfidence = [...confidenceValues].sort((a, b) => a - b);
    const medianConfidence = sortedConfidence.length > 0
      ? sortedConfidence[Math.floor(sortedConfidence.length / 2)]
      : 0;

    const confidenceDistribution: Record<string, number> = {
      'high (0.9-1.0)': confidenceValues.filter(c => c >= 0.9).length,
      'medium (0.7-0.9)': confidenceValues.filter(c => c >= 0.7 && c < 0.9).length,
      'low (0.5-0.7)': confidenceValues.filter(c => c >= 0.5 && c < 0.7).length,
      'very_low (<0.5)': confidenceValues.filter(c => c < 0.5).length
    };

    return {
      data: joinedData,
      matches,
      performance: {
        totalTime: endTime - startTime,
        normalizationTime: normalizationEnd - normalizationStart,
        matchingTime: 0, // included in normalization
        joinTime: joinEnd - joinStart,
        cacheHits: this.cacheStats.hits,
        totalOperations: matches.length
      },
      statistics: {
        inputRowsLeft: leftDf.shape[0],
        inputRowsRight: rightDf.shape[0],
        outputRows: Array.isArray(joinedData) ? joinedData.length : 0,
        matchedRows: matches.length,
        confidence: {
          average: avgConfidence,
          median: medianConfidence,
          distribution: confidenceDistribution
        }
      }
    };
  }

  private async performSemanticMatch(
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    normalizerPairs: NormalizerPairConfig[],
    opts: SemanticJoinOptions
  ): Promise<JoinMatchResult[]> {
    const matches: JoinMatchResult[] = [];

    // Create normalized indices using raw normalized keys so fuzzy matching operates on real tokens
    const leftIndices: Map<string, { indices: number[]; metadata: { normalizedValues: string[] } }> = new Map();

    // Build left indices
    const leftRows = leftDf.shape[0];
    for (let i = 0; i < leftRows; i++) {
      const { compositeKey, normalizedValues } = this.createCompositeKey(
        leftDf,
        i,
        normalizerPairs.map(p => ({ column: p.left, normalizer: p.normalizer }))
      );

      if (!leftIndices.has(compositeKey)) {
        leftIndices.set(compositeKey, { indices: [], metadata: { normalizedValues } });
      }
      leftIndices.get(compositeKey)!.indices.push(i);
    }

    // Build right indices and find matches
    const rightRows = rightDf.shape[0];
    const batchSize = Math.max(1, opts.batchSize || rightRows);

    for (let batchStart = 0; batchStart < rightRows; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, rightRows);

      for (let j = batchStart; j < batchEnd; j++) {
        const { compositeKey, normalizedValues } = this.createCompositeKey(
          rightDf,
          j,
          normalizerPairs.map(p => ({ column: p.right, normalizer: p.normalizer }))
        );

        // Exact match
        const exactMatches = leftIndices.get(compositeKey);
        if (exactMatches) {
          for (const leftIndex of exactMatches.indices) {
            matches.push({
              leftIndex,
              rightIndex: j,
              confidence: Math.min(...normalizerPairs.map(p => p.confidence)),
              matchType: 'exact',
              normalizerUsed: this.describeNormalizers(normalizerPairs),
              metadata: {
                compositeKey,
                normalizedLeft: exactMatches.metadata.normalizedValues,
                normalizedRight: normalizedValues
              }
            });
          }
        } else if (opts.enableFuzzyMatching) {
          // Fuzzy matching
          const fuzzyMatches = this.findFuzzyMatches(
            { key: compositeKey, normalizedValues },
            leftIndices,
            opts.fuzzyThreshold
          );

          for (const fuzzyMatch of fuzzyMatches) {
            matches.push({
              leftIndex: fuzzyMatch.index,
              rightIndex: j,
              confidence: fuzzyMatch.similarity * Math.min(...normalizerPairs.map(p => p.confidence)),
              matchType: 'fuzzy',
              normalizerUsed: this.describeNormalizers(normalizerPairs),
              metadata: {
                compositeKey,
                fuzzyKey: fuzzyMatch.key,
                similarity: fuzzyMatch.similarity,
                normalizedLeft: fuzzyMatch.normalizedValues,
                normalizedRight: normalizedValues
              }
            });
          }
        }
      }
    }

    // Filter by confidence threshold
    return matches.filter(m => m.confidence >= opts.confidenceThreshold);
  }

  private calculateConfidenceScores(
    matches: JoinMatchResult[],
    normalizerPairs: NormalizerPairConfig[],
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    threshold: number
  ): JoinMatchResult[] {
    if (matches.length === 0 || normalizerPairs.length === 0) {
      return matches;
    }

    const aggregatedCid = {
      left: normalizerPairs.flatMap(pair => pair.cidMatches.left),
      right: normalizerPairs.flatMap(pair => pair.cidMatches.right)
    };

    const representativeLeftContext = this.resolveDominantContext(normalizerPairs, 'left');
    const representativeRightContext = this.resolveDominantContext(normalizerPairs, 'right');
    const representativeLeftStats = this.resolveRepresentativeStats(normalizerPairs, 'left');
    const representativeRightStats = this.resolveRepresentativeStats(normalizerPairs, 'right');
    const representativeLeftValues = normalizerPairs[0].leftValues;
    const representativeRightValues = normalizerPairs[0].rightValues;

    const enhancedMatches = matches.map(match => {
      const normalizedLeftValues = Array.isArray((match.metadata || {}).normalizedLeft)
        ? (match.metadata as any).normalizedLeft as string[]
        : [];
      const normalizedRightValues = Array.isArray((match.metadata || {}).normalizedRight)
        ? (match.metadata as any).normalizedRight as string[]
        : [];

      const evidence: MatchEvidence[] = normalizerPairs.map((pair, idx) => {
        const leftValue = pair.leftValues[match.leftIndex];
        const rightValue = pair.rightValues[match.rightIndex];
        const normalizedLeft = normalizedLeftValues[idx] || String(leftValue ?? '');
        const normalizedRight = normalizedRightValues[idx] || String(rightValue ?? '');
        const similarity = match.matchType === 'exact'
          ? 1
          : ((match.metadata as any)?.similarity as number | undefined) ??
            this.calculateStringSimilarity(normalizedLeft, normalizedRight);

        return {
          leftValue,
          rightValue,
          normalizedLeft,
          normalizedRight,
          similarity,
          matchType: match.matchType,
          semanticAlignment: this.computeSemanticAlignment(pair.leftContext, pair.rightContext),
          contextualRelevance: this.computeContextualRelevance(pair.leftContext, pair.rightContext)
        };
      });

      const confidenceScore = this.confidenceCalculator.calculateMatchConfidence(
        representativeLeftContext,
        representativeRightContext,
        representativeLeftValues,
        representativeRightValues,
        representativeLeftStats,
        representativeRightStats,
        evidence,
        aggregatedCid
      );

      return {
        ...match,
        confidence: confidenceScore.overall,
        metadata: {
          ...match.metadata,
          confidenceScore,
          matchEvidence: evidence
        }
      };
    });

    return enhancedMatches.filter(m => m.confidence >= threshold);
  }

  private buildContextMap(
    dataframeId: string,
    columns: string[]
  ): Record<string, SemanticContext | null> {
    const contextMap: Record<string, SemanticContext | null> = {};
    for (const column of columns) {
      contextMap[column] = this.semanticsLayer.getSemanticContext(dataframeId, column);
    }
    return contextMap;
  }

  private identifyNormalizer(normalizer: NormalizerFunction): keyof NormalizerRegistry | null {
    for (const [name, fn] of Object.entries(this.normalizers) as Array<[
      keyof NormalizerRegistry,
      NormalizerFunction
    ]>) {
      if (fn === normalizer) {
        return name;
      }
    }
    return null;
  }

  private selectNormalizerFromCID(
    leftMatches: CIDLookupResult[],
    rightMatches: CIDLookupResult[]
  ): { name: keyof NormalizerRegistry; confidence: number } | null {
    const leftCandidates = leftMatches
      .map(match => ({
        name: this.inferNormalizerFromConcept(match),
        confidence: match.confidence
      }))
      .filter((candidate): candidate is { name: keyof NormalizerRegistry; confidence: number } => candidate.name != null);

    const rightCandidates = rightMatches
      .map(match => ({
        name: this.inferNormalizerFromConcept(match),
        confidence: match.confidence
      }))
      .filter((candidate): candidate is { name: keyof NormalizerRegistry; confidence: number } => candidate.name != null);

    if (leftCandidates.length === 0 && rightCandidates.length === 0) {
      return null;
    }

    for (const leftCandidate of leftCandidates) {
      const rightCandidate = rightCandidates.find(candidate => candidate.name === leftCandidate.name);
      if (rightCandidate) {
        return {
          name: leftCandidate.name,
          confidence: Math.min(0.95, (leftCandidate.confidence + rightCandidate.confidence) / 2 + 0.2)
        };
      }
    }

    if (leftCandidates.length > 0) {
      return {
        name: leftCandidates[0].name,
        confidence: Math.min(0.85, leftCandidates[0].confidence + 0.2)
      };
    }

    if (rightCandidates.length > 0) {
      return {
        name: rightCandidates[0].name,
        confidence: Math.min(0.85, rightCandidates[0].confidence + 0.2)
      };
    }

    return null;
  }

  private inferNormalizerFromConcept(match: CIDLookupResult): keyof NormalizerRegistry | null {
    const concept = match.concept;
    const cid = concept.cid.toLowerCase();
    const labelString = concept.labels.map(label => label.toLowerCase()).join(' ');

    if (cid.includes('email') || labelString.includes('email')) {
      return 'email';
    }
    if (cid.includes('phone') || labelString.includes('phone')) {
      return 'phone';
    }
    if (cid.includes('name') || labelString.includes('name')) {
      return 'name';
    }
    if (cid.includes('address') || labelString.includes('address')) {
      return 'address';
    }
    if (concept.facets?.temporal) {
      return 'date';
    }
    if (concept.facets?.numerical || concept.facets?.identifier) {
      return 'numeric';
    }
    if (concept.facets?.categorical) {
      return 'categorical';
    }

    return null;
  }

  private resolveDominantContext(
    normalizerPairs: NormalizerPairConfig[],
    side: 'left' | 'right'
  ): SemanticContext | null {
    let bestContext: SemanticContext | null = null;
    let bestConfidence = -1;

    for (const pair of normalizerPairs) {
      const context = side === 'left' ? pair.leftContext : pair.rightContext;
      if (context && context.confidence > bestConfidence) {
        bestContext = context;
        bestConfidence = context.confidence;
      }
    }

    return bestContext;
  }

  private resolveRepresentativeStats(
    normalizerPairs: NormalizerPairConfig[],
    side: 'left' | 'right'
  ): StatisticalMetrics {
    let bestStats = side === 'left' ? normalizerPairs[0].leftStats : normalizerPairs[0].rightStats;
    let bestConfidence = side === 'left'
      ? normalizerPairs[0].leftContext?.confidence ?? 0
      : normalizerPairs[0].rightContext?.confidence ?? 0;

    for (const pair of normalizerPairs) {
      const context = side === 'left' ? pair.leftContext : pair.rightContext;
      if (context && context.confidence > bestConfidence) {
        bestConfidence = context.confidence;
        bestStats = side === 'left' ? pair.leftStats : pair.rightStats;
      }
    }

    return bestStats;
  }

  private computeSemanticAlignment(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null
  ): number {
    if (leftContext && rightContext) {
      if (leftContext.semantic_type === rightContext.semantic_type) {
        return 1;
      }
      if (this.areTypesCompatible(leftContext.semantic_type, rightContext.semantic_type)) {
        return 0.75;
      }
      return 0.3;
    }
    return 0.5;
  }

  private computeContextualRelevance(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null
  ): number {
    const leftConfidence = leftContext?.confidence ?? 0.5;
    const rightConfidence = rightContext?.confidence ?? 0.5;
    return Math.min(1, (leftConfidence + rightConfidence) / 2);
  }

  private createCompositeKey(
    df: DataFrameLike,
    rowIndex: number,
    columnNormalizers: Array<{ column: string; normalizer: NormalizerFunction }>
  ): { compositeKey: string; normalizedValues: string[] } {
    const keyParts: string[] = [];

    for (const { column, normalizer } of columnNormalizers) {
      const values = df.getColumn(column);
      const value = values[rowIndex];
      const normalized = this.normalizeWithCache(value, normalizer);
      keyParts.push(normalized);
    }

    const normalizedKey = keyParts.join('|');
    return {
      compositeKey: XXHash64.hash(normalizedKey),
      normalizedValues: keyParts
    };
  }

  private normalizeWithCache(value: any, normalizer: NormalizerFunction): string {
    if (value == null) return '';

    if (!this.cacheEnabled) {
      return normalizer(value);
    }

    const key = `${String(value)}_${normalizer.name || 'unknown'}`;

    if (this.cache.has(key)) {
      this.cacheStats.hits++;
      return this.cache.get(key)!;
    }

    this.cacheStats.misses++;
    const normalized = normalizer(value);

    // Cache management - keep cache size reasonable
    if (this.cache.size > 100000) {
      // Remove oldest entries (simple LRU simulation)
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 10000);
      oldestKeys.forEach(key => this.cache.delete(key));
    }

    this.cache.set(key, normalized);
    return normalized;
  }

  private findFuzzyMatches(
    target: { key: string; normalizedValues: string[] },
    index: Map<string, { indices: number[]; metadata: { normalizedValues: string[] } }> ,
    threshold: number
  ): Array<{ key: string; index: number; similarity: number; normalizedValues: string[] }> {
    const results: Array<{ key: string; index: number; similarity: number; normalizedValues: string[] }> = [];

    for (const [key, entry] of index.entries()) {
      const similarity = this.calculateStringSimilarity(target.normalizedValues.join('|'), entry.metadata.normalizedValues.join('|'));
      if (similarity >= threshold) {
        for (const idx of entry.indices) {
          results.push({ key, index: idx, similarity, normalizedValues: entry.metadata.normalizedValues });
        }
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity);
  }

  private describeNormalizers(normalizerPairs: NormalizerPairConfig[]): string {
    return normalizerPairs
      .map(pair => `${pair.left}:${pair.right}:${pair.normalizerName}`)
      .join(',');
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

  private executeJoin(
    originalLeft: any,
    originalRight: any,
    leftDf: DataFrameLike,
    rightDf: DataFrameLike,
    matches: JoinMatchResult[],
    opts: SemanticJoinOptions
  ): any {
    // For now, return array of objects - can be extended for different output formats
    const result: any[] = [];

    // Create mapping of matched indices
    const leftMatched = new Set(matches.map(m => m.leftIndex));
    const rightMatched = new Set(matches.map(m => m.rightIndex));

    const leftColumnSet = new Set(leftDf.columns);
    const mapLeftColumn = (col: string) => opts.preserveOriginalColumns ? `left_${col}` : col;
    const mapRightColumn = (col: string) => {
      if (opts.preserveOriginalColumns) {
        return `right_${col}`;
      }
      return leftColumnSet.has(col) ? `${col}_right` : col;
    };

    // Add matched rows
    for (const match of matches) {
      const leftRow: Record<string, any> = {};
      const rightRow: Record<string, any> = {};

      // Get left row data
      for (const col of leftDf.columns) {
        const values = leftDf.getColumn(col);
        leftRow[mapLeftColumn(col)] = values[match.leftIndex];
      }

      // Get right row data
      for (const col of rightDf.columns) {
        const values = rightDf.getColumn(col);
        rightRow[mapRightColumn(col)] = values[match.rightIndex];
      }

      result.push({
        ...leftRow,
        ...rightRow,
        _semantic_join_meta: {
          confidence: match.confidence,
          matchType: match.matchType,
          normalizerUsed: match.normalizerUsed
        }
      });
    }

    // Handle unmatched rows based on join type
    if (opts.how === 'left' || opts.how === 'outer') {
      for (let i = 0; i < leftDf.shape[0]; i++) {
        if (!leftMatched.has(i)) {
          const leftRow: Record<string, any> = {};

          for (const col of leftDf.columns) {
            const values = leftDf.getColumn(col);
            leftRow[mapLeftColumn(col)] = values[i];
          }

          // Add null right columns
          for (const col of rightDf.columns) {
            leftRow[mapRightColumn(col)] = null;
          }

          leftRow._semantic_join_meta = {
            confidence: 0,
            matchType: 'no_match',
            normalizerUsed: null
          };

          result.push(leftRow);
        }
      }
    }

    if (opts.how === 'right' || opts.how === 'outer') {
      for (let j = 0; j < rightDf.shape[0]; j++) {
        if (!rightMatched.has(j)) {
          const rightRow: Record<string, any> = {};

          // Add null left columns
          for (const col of leftDf.columns) {
            rightRow[mapLeftColumn(col)] = null;
          }

          for (const col of rightDf.columns) {
            const values = rightDf.getColumn(col);
            rightRow[mapRightColumn(col)] = values[j];
          }

          rightRow._semantic_join_meta = {
            confidence: 0,
            matchType: 'no_match',
            normalizerUsed: null
          };

          result.push(rightRow);
        }
      }
    }

    return result;
  }

  private selectOptimalNormalizer(
    leftContext: SemanticContext | null,
    rightContext: SemanticContext | null,
    leftValues: any[],
    rightValues: any[]
  ): { normalizer: NormalizerFunction; confidence: number } {
    // Default fallback
    let bestNormalizer = this.normalizers.default;
    let bestConfidence = 0.5;

    // Use semantic types to select normalizer
    if (leftContext && rightContext) {
      const leftType = leftContext.semantic_type;
      const rightType = rightContext.semantic_type;

      if (leftType === rightType) {
        bestConfidence = 0.9;

        switch (leftType) {
          case 'email_address':
            bestNormalizer = this.normalizers.email;
            break;
          case 'phone_number':
            bestNormalizer = this.normalizers.phone;
            break;
          case 'display_name':
            bestNormalizer = this.normalizers.name;
            break;
          case 'monetary_value':
          case 'high_cardinality_attribute':
            bestNormalizer = this.normalizers.numeric;
            break;
          case 'temporal':
            bestNormalizer = this.normalizers.date;
            break;
          case 'categorical_attribute':
          case 'categorical_code':
            bestNormalizer = this.normalizers.categorical;
            break;
        }
      } else if (this.areTypesCompatible(leftType, rightType)) {
        bestConfidence = 0.7;
        bestNormalizer = this.normalizers.default;
      }
    }

    // Statistical analysis as fallback
    if (bestConfidence < 0.7) {
      const leftStats = this.statisticalAnalyzer.analyzeColumn(leftValues.slice(0, 100));
      const rightStats = this.statisticalAnalyzer.analyzeColumn(rightValues.slice(0, 100));

      if (leftStats.dataType === rightStats.dataType) {
        bestConfidence = 0.6;

        switch (leftStats.dataType) {
          case 'numeric':
            bestNormalizer = this.normalizers.numeric;
            break;
          case 'date':
            bestNormalizer = this.normalizers.date;
            break;
          case 'string':
            if (leftStats.uniquePercentage < 20 && rightStats.uniquePercentage < 20) {
              bestNormalizer = this.normalizers.categorical;
            } else {
              bestNormalizer = this.normalizers.default;
            }
            break;
        }
      }
    }

    return { normalizer: bestNormalizer, confidence: bestConfidence };
  }

  private areTypesCompatible(type1: string, type2: string): boolean {
    const compatibilityGroups = [
      ['identifier', 'high_cardinality_attribute'],
      ['monetary_value', 'numeric_value'],
      ['display_name', 'generic_attribute'],
      ['categorical_attribute', 'categorical_code']
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

    // Validate columns exist
    for (const col of cols) {
      if (!availableColumns.includes(col)) {
        throw new Error(`Column '${col}' not found in dataframe. Available: ${availableColumns.join(', ')}`);
      }
    }

    return cols;
  }

  private initializeNormalizers(): NormalizerRegistry {
    return {
      email: (value: any): string => {
        const str = String(value || '').toLowerCase().trim();
        return str.replace(/\s+/g, '');
      },

      phone: (value: any): string => {
        const str = String(value || '');
        return str.replace(/[^\d]/g, '');
      },

      name: (value: any): string => {
        const str = String(value || '').toLowerCase().trim();
        return str.replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
      },

      address: (value: any): string => {
        const str = String(value || '').toLowerCase().trim();
        return str
          .replace(/[^\w\s\d]/g, ' ')
          .replace(/\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|ct|court)\b/g, '')
          .replace(/\s+/g, ' ');
      },

      numeric: (value: any): string => {
        const num = parseFloat(String(value || '0'));
        return isNaN(num) ? '0' : num.toFixed(2);
      },

      date: (value: any): string => {
        try {
          const date = new Date(value);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        } catch {
          return '';
        }
      },

      categorical: (value: any): string => {
        return String(value || '').toLowerCase().trim();
      },

      default: (value: any): string => {
        return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
      }
    };
  }

  // Public API for cache management
  clearCache(): void {
    this.cache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
  }

  getCacheStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.cacheStats.hits + this.cacheStats.misses;
    return {
      ...this.cacheStats,
      hitRate: total > 0 ? this.cacheStats.hits / total : 0
    };
  }

  // Public API for adding custom normalizers
  addNormalizer(name: keyof NormalizerRegistry, normalizer: NormalizerFunction): void {
    this.normalizers[name] = normalizer;
  }
}
