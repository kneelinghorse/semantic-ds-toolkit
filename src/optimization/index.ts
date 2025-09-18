// Performance Optimization Module
// High-performance components for Semantic Data Science Toolkit

// Core performance components
export { PerformanceProfiler, globalProfiler } from './performance-profiler';
export { MultiTierCacheManager, globalCacheManager } from './cache-manager';
export { LazyEvaluator, LazyComputation, globalLazyEvaluator } from './lazy-evaluator';
export { HighPerformanceBatchProcessor, globalBatchProcessor } from './batch-processor';
export {
  OptimizedBatchProcessorV2,
  optimizedBatchProcessor,
  ObjectPool as BatchObjectPool,
  RingBuffer as BatchRingBuffer,
  WorkerPool as BatchWorkerPool
} from './batch-processor-v2';

// Vector operations and compression
export {
  ProductQuantizer,
  ColumnFingerprintCompressor,
  globalProductQuantizer,
  globalFingerprintCompressor
} from './vector-compression';

// Similarity search and indexing
export {
  HierarchicalNavigableSmallWorld,
  ColumnAnchorHNSW,
  globalHNSW,
  globalAnchorHNSW
} from './hnsw-index';

// Database connection management
export {
  ConnectionPool,
  WarehouseConnectionPool,
  createOptimizedPool,
  createGlobalPools
} from './connection-pool';

// Benchmarking and testing
export {
  OptimizationBenchmarkSuite,
  runPerformanceBenchmark,
  globalBenchmarkSuite
} from './benchmark-suite';

// Performance targets and constants
export const PERFORMANCE_TARGETS = {
  // From strategic analysis
  SCA_PROCESSING: "1M+ rows/second",
  INFERENCE_LATENCY: "<100ms for 1M rows",
  CACHE_HIT_RATE: ">90%",
  MEMORY_FOOTPRINT: "<10MB per million rows",
  CONCURRENT_OPERATIONS: "100+ parallel scans",

  // Competitive benchmarks
  METADATA_SCALE: "100K+ SCAs like DataHub",
  QUERY_RESPONSE: "<200ms like Elasticsearch catalogs",
  TIME_TO_VALUE: "<15 minutes (market expects)",

  // Technical benchmarks
  HASH_THROUGHPUT: "13.2 GB/s (xxHash64)",
  VECTOR_COMPRESSION: "4x+ compression ratio",
  SEARCH_PERFORMANCE: "1K+ searches/sec"
} as const;

// Optimization configuration presets
export const OPTIMIZATION_CONFIGS = {
  // Development environment
  DEVELOPMENT: {
    profiler: { maxConcurrency: 4 },
    cache: { l1MaxSize: 1000, l2MaxSize: 10000, l3MaxSize: 100000 },
    batchProcessor: { maxWorkers: 2 },
    connectionPool: { minConnections: 2, maxConnections: 10 }
  },

  // Production environment
  PRODUCTION: {
    profiler: { maxConcurrency: 20 },
    cache: { l1MaxSize: 5000, l2MaxSize: 50000, l3MaxSize: 500000 },
    batchProcessor: { maxWorkers: 16 },
    connectionPool: { minConnections: 10, maxConnections: 100 }
  },

  // Enterprise environment
  ENTERPRISE: {
    profiler: { maxConcurrency: 50 },
    cache: { l1MaxSize: 10000, l2MaxSize: 100000, l3MaxSize: 1000000 },
    batchProcessor: { maxWorkers: 32 },
    connectionPool: { minConnections: 20, maxConnections: 200 }
  }
} as const;

// Utility functions
export function getOptimizationConfig(environment: keyof typeof OPTIMIZATION_CONFIGS) {
  return OPTIMIZATION_CONFIGS[environment];
}

export function validatePerformanceTargets(metrics: any): {
  passed: number;
  total: number;
  details: Array<{ metric: string; value: any; target: string; passed: boolean }>;
} {
  const results = [];
  let passed = 0;

  // Hash operations
  if (metrics.hashThroughput) {
    const hashPassed = metrics.hashThroughput > 1000000; // 1M ops/sec
    results.push({
      metric: 'Hash Throughput',
      value: `${metrics.hashThroughput.toLocaleString()} ops/sec`,
      target: '1M+ ops/sec',
      passed: hashPassed
    });
    if (hashPassed) passed++;
  }

  // Cache hit rate
  if (metrics.cacheHitRate !== undefined) {
    const cachePassed = metrics.cacheHitRate >= 0.9;
    results.push({
      metric: 'Cache Hit Rate',
      value: `${(metrics.cacheHitRate * 100).toFixed(1)}%`,
      target: '90%+',
      passed: cachePassed
    });
    if (cachePassed) passed++;
  }

  // Batch processing
  if (metrics.batchThroughput) {
    const batchPassed = metrics.batchThroughput > 1000000; // 1M rows/sec
    results.push({
      metric: 'Batch Throughput',
      value: `${metrics.batchThroughput.toLocaleString()} rows/sec`,
      target: '1M+ rows/sec',
      passed: batchPassed
    });
    if (batchPassed) passed++;
  }

  // Vector compression
  if (metrics.compressionRatio) {
    const compressionPassed = metrics.compressionRatio >= 4;
    results.push({
      metric: 'Compression Ratio',
      value: `${metrics.compressionRatio.toFixed(1)}x`,
      target: '4x+',
      passed: compressionPassed
    });
    if (compressionPassed) passed++;
  }

  // Search performance
  if (metrics.searchThroughput) {
    const searchPassed = metrics.searchThroughput > 1000; // 1K searches/sec
    results.push({
      metric: 'Search Throughput',
      value: `${metrics.searchThroughput.toLocaleString()} searches/sec`,
      target: '1K+ searches/sec',
      passed: searchPassed
    });
    if (searchPassed) passed++;
  }

  return {
    passed,
    total: results.length,
    details: results
  };
}
