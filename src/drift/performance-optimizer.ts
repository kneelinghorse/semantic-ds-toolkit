import { StableColumnAnchor, ColumnData, ColumnFingerprint, DataType } from '../types/anchor.types';
import { DriftDetector, DriftDetectionConfig, DriftDetectionResult, DriftType } from './drift-detector';

export interface PerformanceMetrics {
  detection_time_ms: number;
  samples_processed: number;
  optimization_applied?: boolean;
  compression_ratio?: number;
}

/**
 * Performance-optimized drift detection for large datasets
 * Targets <1s detection time for 1M+ rows
 */
export class PerformanceOptimizedDriftDetector {
  private detector: DriftDetector;
  private readonly CHUNK_SIZE = 100000; // Process in 100k row chunks
  private readonly SAMPLE_SIZE = 50000;  // Use sampling for very large datasets
  private readonly PARALLEL_WORKERS = 4; // Simulated parallel processing

  constructor(config?: Partial<DriftDetectionConfig>) {
    this.detector = new DriftDetector({
      enable_performance_mode: true,
      sample_size_limit: this.SAMPLE_SIZE,
      ...config
    });
  }

  /**
   * High-performance drift detection optimized for 1M+ rows
   * Target: <1s detection time for 1M rows
   */
  async detectDriftFast(
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData,
    currentFingerprint: ColumnFingerprint
  ): Promise<DriftDetectionResult> {
    const startTime = Date.now();

    // Step 1: Early exit checks (< 1ms)
    const quickCheck = this.performQuickCheck(historicalAnchor, currentFingerprint);
    if (!quickCheck.needsDetailedAnalysis) {
      return this.createQuickResult(historicalAnchor, currentColumn, quickCheck);
    }

    // Step 2: Intelligent sampling for large datasets
    const optimizedColumn = this.intelligentSampling(currentColumn);

    // Step 3: Parallel processing simulation for different drift types
    const driftPromises = [
      this.fastDistributionCheck(historicalAnchor, optimizedColumn),
      this.fastPatternCheck(historicalAnchor, currentFingerprint),
      this.fastScaleCheck(historicalAnchor, currentFingerprint),
      this.fastJoinabilityCheck(historicalAnchor, currentFingerprint)
    ];

    const driftResults = await Promise.all(driftPromises);

    // Step 4: Aggregate results
    const detectionTime = Date.now() - startTime;
    const result = await this.detector.detectDrift(
      historicalAnchor,
      optimizedColumn,
      currentFingerprint
    );

    // Enhance with performance metrics
    result.performance_metrics = {
      detection_time_ms: detectionTime,
      samples_processed: optimizedColumn.values.length,
      optimization_applied: currentColumn.values.length > this.SAMPLE_SIZE,
      compression_ratio: optimizedColumn.values.length / currentColumn.values.length
    };

    return result;
  }

  /**
   * Batch processing with automatic load balancing
   */
  async detectDriftBatchOptimized(
    anchors: StableColumnAnchor[],
    columns: ColumnData[],
    fingerprints: ColumnFingerprint[]
  ): Promise<DriftDetectionResult[]> {
    const startTime = Date.now();
    const results: DriftDetectionResult[] = [];

    // Process in optimized chunks
    const chunkSize = Math.ceil(anchors.length / this.PARALLEL_WORKERS);

    for (let i = 0; i < anchors.length; i += chunkSize) {
      const chunkAnchors = anchors.slice(i, i + chunkSize);
      const chunkColumns = columns.slice(i, i + chunkSize);
      const chunkFingerprints = fingerprints.slice(i, i + chunkSize);

      // Process chunk
      const chunkPromises = chunkAnchors.map((anchor, index) =>
        this.detectDriftFast(anchor, chunkColumns[index], chunkFingerprints[index])
      );

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    const totalTime = Date.now() - startTime;
    console.log(`Batch processing completed: ${results.length} columns in ${totalTime}ms`);

    return results;
  }

  private performQuickCheck(
    historicalAnchor: StableColumnAnchor,
    currentFingerprint: ColumnFingerprint
  ): { needsDetailedAnalysis: boolean; quickDrifts: string[] } {
    const historical = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;
    const quickDrifts: string[] = [];

    // Type change detection (critical)
    if (historical.dtype !== currentFingerprint.dtype) {
      quickDrifts.push('critical_type_change');
      return { needsDetailedAnalysis: true, quickDrifts };
    }

    // Cardinality dramatic change
    const cardinalityRatio = currentFingerprint.cardinality / historical.cardinality;
    if (cardinalityRatio > 10 || cardinalityRatio < 0.1) {
      quickDrifts.push('critical_cardinality_change');
    }

    // Null ratio dramatic change
    if (Math.abs(currentFingerprint.null_ratio - historical.null_ratio) > 0.5) {
      quickDrifts.push('critical_null_ratio_change');
    }

    // If no critical changes detected, we need detailed analysis
    return {
      needsDetailedAnalysis: quickDrifts.length === 0 || quickDrifts.some(d => !d.startsWith('critical')),
      quickDrifts
    };
  }

  private createQuickResult(
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData,
    quickCheck: { quickDrifts: string[] }
  ): DriftDetectionResult {
    const driftTypes: DriftType[] = quickCheck.quickDrifts.map(drift => ({
      type: 'format' as const,
      severity: 'critical' as const,
      metric_value: 1.0,
      threshold: 0.1,
      description: `Quick detection: ${drift}`
    }));

    return {
      anchor_id: historicalAnchor.anchor_id,
      column_name: currentColumn.name,
      drift_detected: driftTypes.length > 0,
      drift_types: driftTypes,
      severity: 'critical',
      confidence_score: 0.95,
      details: {},
      alerts: [],
      recommended_actions: ['Immediate investigation required for critical changes'],
      performance_metrics: {
        detection_time_ms: 1,
        samples_processed: 0
      }
    };
  }

  private intelligentSampling(column: ColumnData): ColumnData {
    if (column.values.length <= this.SAMPLE_SIZE) {
      return column;
    }

    // Stratified sampling to preserve distribution characteristics
    const sampleIndices = this.generateStratifiedSample(column.values, this.SAMPLE_SIZE);
    const sampledValues = sampleIndices.map(i => column.values[i]);

    return {
      ...column,
      values: sampledValues
    };
  }

  private generateStratifiedSample(values: any[], sampleSize: number): number[] {
    const indices: number[] = [];
    const step = values.length / sampleSize;

    // Systematic sampling with random start
    const randomStart = Math.floor(Math.random() * step);

    for (let i = 0; i < sampleSize; i++) {
      const index = Math.floor(randomStart + i * step);
      if (index < values.length) {
        indices.push(index);
      }
    }

    // Add some random samples to improve representation
    const randomSampleSize = Math.min(1000, Math.floor(sampleSize * 0.1));
    for (let i = 0; i < randomSampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * values.length);
      if (!indices.includes(randomIndex)) {
        indices.push(randomIndex);
      }
    }

    return indices.slice(0, sampleSize);
  }

  private async fastDistributionCheck(
    historicalAnchor: StableColumnAnchor,
    currentColumn: ColumnData
  ): Promise<DriftType | null> {
    // Fast numerical check
    if (!this.isNumericColumn(currentColumn)) {
      return null;
    }

    const historical = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;
    const numericValues = currentColumn.values.map(v => parseFloat(v)).filter(v => !isNaN(v));

    if (numericValues.length === 0) return null;

    // Fast statistical comparison using moments
    const currentMean = numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    const currentStd = Math.sqrt(
      numericValues.reduce((sum, val) => sum + Math.pow(val - currentMean, 2), 0) / numericValues.length
    );

    // Extract historical statistics (simplified)
    const historicalMean = historical.sample_values
      .map(v => parseFloat(v))
      .filter(v => !isNaN(v))
      .reduce((a, b) => a + b, 0) / historical.sample_values.length;

    const meanDiff = Math.abs(currentMean - historicalMean) / historicalMean;

    if (meanDiff > 0.2) { // 20% change threshold
      return {
        type: 'distribution',
        severity: meanDiff > 0.5 ? 'critical' : 'high',
        metric_value: meanDiff,
        threshold: 0.2,
        description: `Fast distribution check: ${(meanDiff * 100).toFixed(1)}% mean change`
      };
    }

    return null;
  }

  private async fastPatternCheck(
    historicalAnchor: StableColumnAnchor,
    currentFingerprint: ColumnFingerprint
  ): Promise<DriftType | null> {
    const historical = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;

    // Quick pattern similarity check
    const historicalPatterns = new Set(historical.regex_patterns);
    const currentPatterns = new Set(currentFingerprint.regex_patterns);

    const intersection = new Set([...historicalPatterns].filter(x => currentPatterns.has(x)));
    const union = new Set([...historicalPatterns, ...currentPatterns]);

    const similarity = union.size === 0 ? 1 : intersection.size / union.size;

    if (similarity < 0.7) {
      return {
        type: 'format',
        severity: similarity < 0.3 ? 'critical' : 'high',
        metric_value: 1 - similarity,
        threshold: 0.3,
        description: `Fast pattern check: ${((1 - similarity) * 100).toFixed(1)}% pattern change`
      };
    }

    return null;
  }

  private async fastScaleCheck(
    historicalAnchor: StableColumnAnchor,
    currentFingerprint: ColumnFingerprint
  ): Promise<DriftType | null> {
    const historical = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;

    if (!this.isNumericType(historical.dtype) || !this.isNumericType(currentFingerprint.dtype)) {
      return null;
    }

    const historicalRange = this.parseNumeric(historical.max) - this.parseNumeric(historical.min);
    const currentRange = this.parseNumeric(currentFingerprint.max) - this.parseNumeric(currentFingerprint.min);

    if (historicalRange === 0 || currentRange === 0) return null;

    const scaleFactor = currentRange / historicalRange;

    if (scaleFactor > 5 || scaleFactor < 0.2) {
      return {
        type: 'unit',
        severity: scaleFactor > 10 || scaleFactor < 0.1 ? 'critical' : 'high',
        metric_value: scaleFactor,
        threshold: 5,
        description: `Fast scale check: ${scaleFactor.toFixed(2)}x scale change`
      };
    }

    return null;
  }

  private async fastJoinabilityCheck(
    historicalAnchor: StableColumnAnchor,
    currentFingerprint: ColumnFingerprint
  ): Promise<DriftType | null> {
    const historical = JSON.parse(historicalAnchor.fingerprint) as ColumnFingerprint;

    const uniquenessChange = Math.abs(historical.unique_ratio - currentFingerprint.unique_ratio);

    if (uniquenessChange > 0.3) {
      return {
        type: 'joinability',
        severity: uniquenessChange > 0.5 ? 'critical' : 'medium',
        metric_value: uniquenessChange,
        threshold: 0.3,
        description: `Fast joinability check: ${(uniquenessChange * 100).toFixed(1)}% uniqueness change`
      };
    }

    return null;
  }

  private isNumericColumn(column: ColumnData): boolean {
    return ['int64', 'float64', 'number'].includes(column.data_type);
  }

  private isNumericType(dtype: string): boolean {
    return ['int64', 'float64', 'number'].includes(dtype.toLowerCase());
  }

  private parseNumeric(value: string | number | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return parseFloat(value);
    return 0;
  }

  /**
   * Memory-efficient streaming drift detection for very large datasets
   */
  async detectDriftStreaming(
    historicalAnchor: StableColumnAnchor,
    dataStream: AsyncIterable<any>,
    options: {
      maxSamples?: number;
      earlyExit?: boolean;
      progressCallback?: (progress: number) => void;
    } = {}
  ): Promise<DriftDetectionResult> {
    const { maxSamples = 1000000, earlyExit = true, progressCallback } = options;

    const samples: any[] = [];
    let processedCount = 0;
    const samplingRate = maxSamples / 1000000; // Adaptive sampling

    for await (const chunk of dataStream) {
      if (Math.random() < samplingRate || samples.length < 10000) {
        samples.push(chunk);
      }

      processedCount++;

      if (progressCallback && processedCount % 100000 === 0) {
        progressCallback(processedCount);
      }

      if (samples.length >= maxSamples) {
        break;
      }

      // Early exit for critical drift
      if (earlyExit && samples.length > 1000 && samples.length % 1000 === 0) {
        const quickResult = await this.checkForCriticalDrift(historicalAnchor, samples);
        if (quickResult) {
          return quickResult;
        }
      }
    }

    // Create column data from samples
    const columnData: ColumnData = {
      name: 'streaming_column',
      values: samples,
      data_type: this.inferDataType(samples)
    };

    // Generate fingerprint
    const fingerprint = this.generateStreamingFingerprint(samples);

    return this.detectDriftFast(historicalAnchor, columnData, fingerprint);
  }

  private async checkForCriticalDrift(
    historicalAnchor: StableColumnAnchor,
    samples: any[]
  ): Promise<DriftDetectionResult | null> {
    // Quick critical drift check on sample
    const fingerprint = this.generateStreamingFingerprint(samples);
    const quickCheck = this.performQuickCheck(historicalAnchor, fingerprint);

    if (quickCheck.quickDrifts.some(d => d.startsWith('critical'))) {
      const columnData: ColumnData = {
        name: 'streaming_sample',
        values: samples,
        data_type: this.inferDataType(samples)
      };

      return this.createQuickResult(historicalAnchor, columnData, quickCheck);
    }

    return null;
  }

  private inferDataType(samples: any[]): DataType {
    if (samples.length === 0) return 'unknown';

    const sample = samples[0];
    if (typeof sample === 'number') return 'float64';
    if (typeof sample === 'boolean') return 'boolean';
    if (sample instanceof Date) return 'datetime';
    if (typeof sample === 'string') {
      // Try to parse as number
      if (!isNaN(parseFloat(sample))) return 'float64';
    }
    return 'string';
  }

  private generateStreamingFingerprint(samples: any[]): ColumnFingerprint {
    const uniqueValues = new Set(samples);
    const nullCount = samples.filter(v => v === null || v === undefined || v === '').length;

    return {
      dtype: this.inferDataType(samples),
      cardinality: uniqueValues.size,
      regex_patterns: [], // Simplified for streaming
      null_ratio: nullCount / samples.length,
      unique_ratio: uniqueValues.size / samples.length,
      sample_values: Array.from(uniqueValues).slice(0, 20).map(v => String(v))
    };
  }

  /**
   * Get performance benchmarks
   */
  async benchmarkPerformance(
    dataSizes: number[] = [1000, 10000, 100000, 1000000]
  ): Promise<Record<number, { avgTime: number; throughput: number }>> {
    const results: Record<number, { avgTime: number; throughput: number }> = {};

    for (const size of dataSizes) {
      const benchmarks: number[] = [];
      const runs = size > 100000 ? 3 : 5;

      for (let i = 0; i < runs; i++) {
        const testData = this.generateTestData(size);
        const startTime = Date.now();

        await this.detectDriftFast(
          testData.anchor,
          testData.column,
          testData.fingerprint
        );

        const endTime = Date.now();
        benchmarks.push(endTime - startTime);
      }

      const avgTime = benchmarks.reduce((a, b) => a + b, 0) / benchmarks.length;
      const throughput = size / avgTime * 1000; // rows per second

      results[size] = { avgTime, throughput };
    }

    return results;
  }

  private generateTestData(size: number): {
    anchor: StableColumnAnchor;
    column: ColumnData;
    fingerprint: ColumnFingerprint;
  } {
    const values = Array.from({ length: size }, (_, i) => Math.random() * 1000);

    const column: ColumnData = {
      name: 'test_column',
      values: values,
      data_type: 'float64'
    };

    const fingerprint: ColumnFingerprint = {
      dtype: 'float64',
      cardinality: new Set(values).size,
      regex_patterns: [],
      null_ratio: 0,
      unique_ratio: new Set(values).size / values.length,
      sample_values: values.slice(0, 20).map(v => String(v))
    };

    const anchor: StableColumnAnchor = {
      dataset: 'test',
      column_name: 'test_column',
      anchor_id: 'test_anchor',
      fingerprint: JSON.stringify(fingerprint),
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString()
    };

    return { anchor, column, fingerprint };
  }
}