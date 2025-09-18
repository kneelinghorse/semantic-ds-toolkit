import { DriftDetector, PerformanceOptimizedDriftDetector } from './index';
import { StableColumnAnchor, ColumnData, ColumnFingerprint } from '../types/anchor.types';

/**
 * Example usage of the drift detection system
 * This demonstrates how to use the various components for semantic drift detection
 */

// Example historical anchor
const historicalAnchor: StableColumnAnchor = {
  dataset: 'customer_data',
  column_name: 'customer_id',
  anchor_id: 'anchor_001',
  fingerprint: JSON.stringify({
    dtype: 'string',
    cardinality: 1000,
    regex_patterns: ['^CUST_[0-9]{6}$'],
    null_ratio: 0.01,
    unique_ratio: 0.99,
    sample_values: ['CUST_000001', 'CUST_000002', 'CUST_000003'],
    min: undefined,
    max: undefined
  } as ColumnFingerprint),
  first_seen: '2023-01-01T00:00:00Z',
  last_seen: '2023-12-01T00:00:00Z',
  confidence: 0.95
};

// Example current data showing drift
const currentColumn: ColumnData = {
  name: 'customer_id',
  values: [
    'CUSTOMER_001', 'CUSTOMER_002', 'CUSTOMER_003', // Format change!
    'CUST_000004', 'CUST_000005', // Original format
    null, // Increased nulls
    'CUST_000006'
  ],
  data_type: 'string'
};

const currentFingerprint: ColumnFingerprint = {
  dtype: 'string',
  cardinality: 6,
  regex_patterns: ['^CUSTOMER_[0-9]{3}$', '^CUST_[0-9]{6}$'],
  null_ratio: 0.14, // Increased null ratio
  unique_ratio: 0.86,
  sample_values: ['CUSTOMER_001', 'CUSTOMER_002', 'CUST_000004'],
  min: undefined,
  max: undefined
};

/**
 * Example 1: Basic drift detection
 */
export async function basicDriftDetectionExample() {
  console.log('=== Basic Drift Detection Example ===');

  const detector = new DriftDetector({
    ks_test_threshold: 0.05,
    psi_threshold: 0.1,
    pattern_similarity_threshold: 0.8,
    confidence_degradation_threshold: 0.1
  });

  const result = await detector.detectDrift(
    historicalAnchor,
    currentColumn,
    currentFingerprint
  );

  console.log('Drift Detection Result:');
  console.log(`- Drift detected: ${result.drift_detected}`);
  console.log(`- Overall severity: ${result.severity}`);
  console.log(`- Confidence score: ${result.confidence_score.toFixed(3)}`);
  console.log(`- Detection time: ${result.performance_metrics.detection_time_ms}ms`);

  if (result.drift_types.length > 0) {
    console.log('\nDetected drift types:');
    result.drift_types.forEach((drift, index) => {
      console.log(`  ${index + 1}. ${drift.type}: ${drift.description} (${drift.severity})`);
    });
  }

  if (result.recommended_actions.length > 0) {
    console.log('\nRecommended actions:');
    result.recommended_actions.forEach((action, index) => {
      console.log(`  ${index + 1}. ${action}`);
    });
  }

  return result;
}

/**
 * Example 2: Performance-optimized drift detection for large datasets
 */
export async function performanceOptimizedExample() {
  console.log('\n=== Performance-Optimized Drift Detection Example ===');

  const optimizer = new PerformanceOptimizedDriftDetector({
    enable_performance_mode: true,
    sample_size_limit: 50000
  });

  // Generate large dataset for testing
  const largeDataset: ColumnData = {
    name: 'large_customer_id',
    values: Array.from({ length: 100000 }, (_, i) =>
      i % 100 === 0 ? null : `CUST_${String(i).padStart(6, '0')}`
    ),
    data_type: 'string'
  };

  const largeFp: ColumnFingerprint = {
    dtype: 'string',
    cardinality: 99900,
    regex_patterns: ['^CUST_[0-9]{6}$'],
    null_ratio: 0.01,
    unique_ratio: 0.999,
    sample_values: ['CUST_000000', 'CUST_000001', 'CUST_000002']
  };

  const result = await optimizer.detectDriftFast(
    historicalAnchor,
    largeDataset,
    largeFp
  );

  console.log('Performance-Optimized Results:');
  console.log(`- Processing time: ${result.performance_metrics.detection_time_ms}ms`);
  console.log(`- Samples processed: ${result.performance_metrics.samples_processed}`);
  console.log(`- Optimization applied: ${result.performance_metrics.optimization_applied}`);
  console.log(`- Compression ratio: ${result.performance_metrics.compression_ratio?.toFixed(3)}`);

  return result;
}

/**
 * Example 3: Batch processing multiple columns
 */
export async function batchProcessingExample() {
  console.log('\n=== Batch Processing Example ===');

  const optimizer = new PerformanceOptimizedDriftDetector();

  // Multiple columns to process
  const anchors = [historicalAnchor];
  const columns = [currentColumn];
  const fingerprints = [currentFingerprint];

  const results = await optimizer.detectDriftBatchOptimized(
    anchors,
    columns,
    fingerprints
  );

  console.log(`Processed ${results.length} columns`);
  results.forEach((result, index) => {
    console.log(`Column ${index + 1}: ${result.drift_detected ? 'DRIFT DETECTED' : 'STABLE'} (${result.performance_metrics.detection_time_ms}ms)`);
  });

  return results;
}

/**
 * Example 4: Performance benchmarking
 */
export async function performanceBenchmarkExample() {
  console.log('\n=== Performance Benchmark Example ===');

  const optimizer = new PerformanceOptimizedDriftDetector();

  const benchmarks = await optimizer.benchmarkPerformance([1000, 10000, 100000]);

  console.log('Performance Benchmarks:');
  Object.entries(benchmarks).forEach(([size, metrics]) => {
    console.log(`${size} rows: ${metrics.avgTime.toFixed(1)}ms (${metrics.throughput.toFixed(0)} rows/sec)`);
  });

  return benchmarks;
}

/**
 * Example 5: Statistical tests demonstration
 */
export async function statisticalTestsExample() {
  console.log('\n=== Statistical Tests Example ===');

  const { StatisticalTests } = await import('./statistical-tests');
  const stats = new StatisticalTests();

  // Example datasets with distribution shift
  const historical = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const current = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // Clear shift

  // Kolmogorov-Smirnov test
  const ksResult = stats.kolmogorovSmirnovTest(historical, current);
  console.log(`KS Test: statistic=${ksResult.statistic.toFixed(4)}, p-value=${ksResult.p_value.toFixed(4)}, significant=${ksResult.is_significant}`);

  // Population Stability Index
  const psiScore = stats.populationStabilityIndex(historical, current);
  console.log(`PSI Score: ${psiScore.toFixed(4)} (${psiScore > 0.1 ? 'DRIFT' : 'STABLE'})`);

  // Comprehensive comparison
  const comparison = stats.compareDistributions(historical, current, {
    includePSI: true,
    includeWasserstein: true
  });

  console.log(`Overall Assessment: ${comparison.summary.drift_detected ? 'DRIFT DETECTED' : 'STABLE'}`);
  console.log(`Severity: ${comparison.summary.severity}`);
  console.log(`Primary Indicator: ${comparison.summary.primary_indicator}`);

  return { ksResult, psiScore, comparison };
}

/**
 * Run all examples
 */
export async function runAllExamples() {
  try {
    await basicDriftDetectionExample();
    await performanceOptimizedExample();
    await batchProcessingExample();
    await performanceBenchmarkExample();
    await statisticalTestsExample();

    console.log('\n=== All Examples Completed Successfully ===');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export for testing
export {
  historicalAnchor,
  currentColumn,
  currentFingerprint
};