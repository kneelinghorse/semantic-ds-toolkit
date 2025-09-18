import { PerformanceProfiler } from './performance-profiler';
import { MultiTierCacheManager } from './cache-manager';
import { LazyEvaluator } from './lazy-evaluator';
import { HighPerformanceBatchProcessor } from './batch-processor';
import { ProductQuantizer, ColumnFingerprintCompressor } from './vector-compression';
import { HierarchicalNavigableSmallWorld, ColumnAnchorHNSW } from './hnsw-index';
import { ConnectionPool, WarehouseConnectionPool } from './connection-pool';
import { ColumnData, StableColumnAnchor, ColumnFingerprint } from '../types/anchor.types';

interface BenchmarkResult {
  testName: string;
  throughput: number; // operations per second
  latency: number; // milliseconds
  memoryUsage: number; // bytes
  successRate: number; // 0-1
  duration: number; // milliseconds
  metadata: Record<string, any>;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    averageThroughput: number;
    averageLatency: number;
    totalMemoryDelta: number;
  };
}

interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  targetThroughput: number;
  maxLatency: number;
  maxMemoryIncrease: number;
}

export class OptimizationBenchmarkSuite {
  private profiler: PerformanceProfiler;
  private cacheManager: MultiTierCacheManager;
  private lazyEvaluator: LazyEvaluator;
  private batchProcessor: HighPerformanceBatchProcessor;
  private productQuantizer: ProductQuantizer;
  private fingerprintCompressor: ColumnFingerprintCompressor;
  private hnswIndex: HierarchicalNavigableSmallWorld;
  private anchorHNSW: ColumnAnchorHNSW;

  private config: BenchmarkConfig = {
    iterations: 1000,
    warmupIterations: 100,
    targetThroughput: 1000000, // 1M ops/sec
    maxLatency: 100, // 100ms
    maxMemoryIncrease: 100 * 1024 * 1024 // 100MB
  };

  constructor(config?: Partial<BenchmarkConfig>) {
    this.config = { ...this.config, ...config };

    this.profiler = new PerformanceProfiler();
    this.cacheManager = new MultiTierCacheManager({
      l1MaxSize: 10000,
      l2MaxSize: 100000,
      l3MaxSize: 1000000,
      maxMemoryMB: 512
    });
    this.lazyEvaluator = new LazyEvaluator(20);
    this.batchProcessor = new HighPerformanceBatchProcessor();
    this.productQuantizer = new ProductQuantizer({
      subspaceCount: 8,
      bitsPerCode: 8
    });
    this.fingerprintCompressor = new ColumnFingerprintCompressor(16);
    this.hnswIndex = new HierarchicalNavigableSmallWorld({
      maxConnections: 16,
      efConstruction: 200
    });
    this.anchorHNSW = new ColumnAnchorHNSW();
  }

  async runFullBenchmarkSuite(): Promise<BenchmarkSuite[]> {
    console.log('🚀 Starting Optimization Benchmark Suite...');
    console.log(`Target: ${this.config.targetThroughput.toLocaleString()} ops/sec, <${this.config.maxLatency}ms latency`);

    const suites = await Promise.all([
      this.benchmarkPerformanceProfiler(),
      this.benchmarkCacheManager(),
      this.benchmarkLazyEvaluator(),
      this.benchmarkBatchProcessor(),
      this.benchmarkVectorCompression(),
      this.benchmarkHNSWIndex(),
      this.benchmarkIntegratedWorkflow()
    ]);

    this.printBenchmarkSummary(suites);
    return suites;
  }

  private async benchmarkPerformanceProfiler(): Promise<BenchmarkSuite> {
    console.log('📊 Benchmarking Performance Profiler...');

    const suite: BenchmarkSuite = {
      name: 'Performance Profiler',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // Test SIMD hash performance
    const hashResult = await this.benchmarkTest('SIMD Hash64', async () => {
      const testData = new ArrayBuffer(1024 * 1024); // 1MB
      const view = new Uint8Array(testData);
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.floor(Math.random() * 256);
      }
      return this.profiler.hashFunction(testData);
    });
    suite.results.push(hashResult);

    // Test vector operations
    const vectorResult = await this.benchmarkTest('Vector Operations', async () => {
      const size = 10000;
      const a = new Float64Array(size);
      const b = new Float64Array(size);
      for (let i = 0; i < size; i++) {
        a[i] = Math.random();
        b[i] = Math.random();
      }
      return this.profiler.vectorOps.dot(a, b);
    });
    suite.results.push(vectorResult);

    // Test column processing profiling
    const columnResult = await this.benchmarkTest('Column Processing Profiling', async () => {
      const testColumn = this.generateTestColumn('test_col', 10000);
      return this.profiler.profileColumnProcessing(testColumn, 'test_operation');
    });
    suite.results.push(columnResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkCacheManager(): Promise<BenchmarkSuite> {
    console.log('💾 Benchmarking Cache Manager...');

    const suite: BenchmarkSuite = {
      name: 'Multi-Tier Cache Manager',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // Populate cache with test data
    const testAnchors = this.generateTestAnchors(1000);
    for (const anchor of testAnchors) {
      this.cacheManager.set(`anchor:${anchor.anchor_id}`, anchor);
    }

    // Test cache hit performance
    const hitResult = await this.benchmarkTest('Cache Hit Performance', async () => {
      const randomAnchor = testAnchors[Math.floor(Math.random() * testAnchors.length)];
      return this.cacheManager.get(`anchor:${randomAnchor.anchor_id}`);
    });
    suite.results.push(hitResult);

    // Test cache miss and population
    const missResult = await this.benchmarkTest('Cache Miss and Population', async () => {
      const newAnchor = this.generateTestAnchors(1)[0];
      this.cacheManager.set(`anchor:${newAnchor.anchor_id}`, newAnchor);
      return this.cacheManager.get(`anchor:${newAnchor.anchor_id}`);
    });
    suite.results.push(missResult);

    // Test batch operations
    const batchResult = await this.benchmarkTest('Batch Cache Operations', async () => {
      const keys = testAnchors.slice(0, 100).map(a => `anchor:${a.anchor_id}`);
      return this.cacheManager.mget(keys);
    });
    suite.results.push(batchResult);

    // Verify hit rate target
    const stats = this.cacheManager.getStats();
    const hitRateResult: BenchmarkResult = {
      testName: 'Hit Rate Validation',
      throughput: 0,
      latency: 0,
      memoryUsage: stats.global.memoryUsage,
      successRate: stats.global.hitRate >= 0.9 ? 1 : 0,
      duration: 0,
      metadata: { hitRate: stats.global.hitRate, target: 0.9 }
    };
    suite.results.push(hitRateResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkLazyEvaluator(): Promise<BenchmarkSuite> {
    console.log('⏳ Benchmarking Lazy Evaluator...');

    const suite: BenchmarkSuite = {
      name: 'Lazy Evaluator',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // Test lazy computation creation and execution
    const lazyResult = await this.benchmarkTest('Lazy Computation Execution', async () => {
      const computation = this.lazyEvaluator.lazy(
        `test_${Date.now()}`,
        () => {
          // Simulate expensive computation
          let sum = 0;
          for (let i = 0; i < 10000; i++) {
            sum += Math.sqrt(i);
          }
          return sum;
        },
        { priority: 'high', cacheable: true }
      );
      return computation.getValue();
    });
    suite.results.push(lazyResult);

    // Test batch evaluation
    const batchEvalResult = await this.benchmarkTest('Batch Lazy Evaluation', async () => {
      const computationIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `batch_comp_${Date.now()}_${i}`;
        this.lazyEvaluator.lazy(
          id,
          () => Math.random() * 1000,
          { priority: 'medium' }
        );
        computationIds.push(id);
      }
      return this.lazyEvaluator.evaluateBatch(computationIds);
    });
    suite.results.push(batchEvalResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkBatchProcessor(): Promise<BenchmarkSuite> {
    console.log('⚡ Benchmarking Batch Processor...');

    const suite: BenchmarkSuite = {
      name: 'High-Performance Batch Processor',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    const testColumns = this.generateTestColumns(10000);

    // Test fingerprint generation throughput
    const fingerprintResult = await this.benchmarkTest('Batch Fingerprint Generation', async () => {
      return this.batchProcessor.generateFingerprints(
        testColumns,
        (column) => this.generateMockFingerprint(column)
      );
    }, testColumns.length);
    suite.results.push(fingerprintResult);

    // Test anchor creation throughput
    const anchorResult = await this.benchmarkTest('Batch Anchor Creation', async () => {
      return this.batchProcessor.createAnchors(
        'benchmark_dataset',
        testColumns.slice(0, 1000),
        (dataset, column) => this.generateMockAnchor(dataset, column)
      );
    }, 1000);
    suite.results.push(anchorResult);

    // Verify 1M+ rows/second target
    const throughputTest = await this.benchmarkThroughputTarget(
      'Million Rows/Second Target',
      testColumns,
      1000000 // 1M target
    );
    suite.results.push(throughputTest);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkVectorCompression(): Promise<BenchmarkSuite> {
    console.log('🗜️ Benchmarking Vector Compression...');

    const suite: BenchmarkSuite = {
      name: 'Product Quantization Vector Compression',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // Generate training vectors
    const trainingVectors = this.generateTestVectors(1000, 128);
    await this.productQuantizer.train(trainingVectors);

    // Test compression performance
    const compressionResult = await this.benchmarkTest('Vector Compression', async () => {
      const testVector = this.generateTestVectors(1, 128)[0];
      return this.productQuantizer.compress(testVector);
    });
    suite.results.push(compressionResult);

    // Test batch compression
    const batchCompressionResult = await this.benchmarkTest('Batch Vector Compression', async () => {
      const testVectors = this.generateTestVectors(100, 128);
      return this.productQuantizer.compressBatch(testVectors);
    }, 100);
    suite.results.push(batchCompressionResult);

    // Test compression ratio
    const compressionStats = this.productQuantizer.getCompressionStats();
    const compressionRatioResult: BenchmarkResult = {
      testName: 'Compression Ratio Validation',
      throughput: 0,
      latency: 0,
      memoryUsage: 0,
      successRate: compressionStats.memoryReduction > 2 ? 1 : 0, // At least 2x compression
      duration: 0,
      metadata: { compressionRatio: compressionStats.memoryReduction, target: 2 }
    };
    suite.results.push(compressionRatioResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkHNSWIndex(): Promise<BenchmarkSuite> {
    console.log('🔍 Benchmarking HNSW Index...');

    const suite: BenchmarkSuite = {
      name: 'Hierarchical Navigable Small World Index',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // Build index with test vectors
    const testVectors = this.generateTestVectors(10000, 128);
    for (let i = 0; i < testVectors.length; i++) {
      this.hnswIndex.addNode(`vector_${i}`, testVectors[i]);
    }

    // Test search performance
    const searchResult = await this.benchmarkTest('HNSW Search Performance', async () => {
      const queryVector = this.generateTestVectors(1, 128)[0];
      return this.hnswIndex.search(queryVector, 10);
    });
    suite.results.push(searchResult);

    // Test batch search
    const batchSearchResult = await this.benchmarkTest('Batch HNSW Search', async () => {
      const queries = this.generateTestVectors(100, 128);
      const results = [];
      for (const query of queries) {
        results.push(this.hnswIndex.search(query, 5));
      }
      return results;
    }, 100);
    suite.results.push(batchSearchResult);

    // Test anchor similarity search
    const anchorFeatures = this.generateTestVectors(1000, 256);
    for (let i = 0; i < anchorFeatures.length; i++) {
      this.anchorHNSW.addAnchor(`anchor_${i}`, anchorFeatures[i], { type: 'test' });
    }

    const anchorSearchResult = await this.benchmarkTest('Column Anchor Similarity Search', async () => {
      const queryFeatures = this.generateTestVectors(1, 256)[0];
      return this.anchorHNSW.findSimilarAnchors(queryFeatures, 10, 0.7);
    });
    suite.results.push(anchorSearchResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkIntegratedWorkflow(): Promise<BenchmarkSuite> {
    console.log('🔄 Benchmarking Integrated Workflow...');

    const suite: BenchmarkSuite = {
      name: 'Integrated Optimization Workflow',
      results: [],
      summary: { totalTests: 0, passedTests: 0, failedTests: 0, averageThroughput: 0, averageLatency: 0, totalMemoryDelta: 0 }
    };

    // End-to-end workflow: Column ingestion -> Fingerprinting -> Caching -> Similarity search
    const workflowResult = await this.benchmarkTest('End-to-End Workflow', async () => {
      const columns = this.generateTestColumns(1000);

      // 1. Batch fingerprint generation
      const fingerprints = await this.batchProcessor.generateFingerprints(
        columns,
        (column) => this.generateMockFingerprint(column)
      );

      // 2. Cache fingerprints
      for (let i = 0; i < fingerprints.length; i++) {
        this.cacheManager.set(`fingerprint:${columns[i].name}`, fingerprints[i]);
      }

      // 3. Build HNSW index for similarity search
      const features = this.generateTestVectors(fingerprints.length, 128);
      for (let i = 0; i < features.length; i++) {
        this.hnswIndex.addNode(`fp_${i}`, features[i]);
      }

      // 4. Perform similarity searches
      const queryFeature = this.generateTestVectors(1, 128)[0];
      const similar = this.hnswIndex.search(queryFeature, 10);

      return {
        processedColumns: columns.length,
        cachedFingerprints: fingerprints.length,
        similarResults: similar.length
      };
    }, 1000);
    suite.results.push(workflowResult);

    // Test memory efficiency under load
    const memoryResult = await this.benchmarkMemoryEfficiency();
    suite.results.push(memoryResult);

    this.calculateSuiteSummary(suite);
    return suite;
  }

  private async benchmarkTest(
    testName: string,
    testFn: () => Promise<any>,
    operationCount: number = 1
  ): Promise<BenchmarkResult> {
    const initialMemory = process.memoryUsage().heapUsed;

    // Warmup
    for (let i = 0; i < Math.min(this.config.warmupIterations, 10); i++) {
      try {
        await testFn();
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Actual benchmark
    const startTime = Date.now();
    let successCount = 0;
    let totalLatency = 0;

    for (let i = 0; i < this.config.iterations; i++) {
      const opStartTime = Date.now();
      try {
        await testFn();
        successCount++;
        totalLatency += Date.now() - opStartTime;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Test ${testName} iteration ${i} failed:`, msg);
      }
    }

    const endTime = Date.now();
    const finalMemory = process.memoryUsage().heapUsed;
    const duration = endTime - startTime;

    const throughput = (successCount * operationCount * 1000) / duration; // ops/sec
    const averageLatency = successCount > 0 ? totalLatency / successCount : 0;
    const successRate = successCount / this.config.iterations;

    return {
      testName,
      throughput,
      latency: averageLatency,
      memoryUsage: finalMemory - initialMemory,
      successRate,
      duration,
      metadata: {
        iterations: this.config.iterations,
        successfulIterations: successCount,
        operationCount
      }
    };
  }

  private async benchmarkThroughputTarget(
    testName: string,
    testData: ColumnData[],
    targetThroughput: number
  ): Promise<BenchmarkResult> {
    const processor = async (batch: ColumnData[]) => {
      return batch.map(col => this.generateMockFingerprint(col));
    };

    const startTime = Date.now();
    await this.batchProcessor.processColumns(testData, processor, {
      batchSize: 1000,
      maxConcurrency: 10,
      streamingMode: true
    });
    const duration = Date.now() - startTime;

    const actualThroughput = (testData.length * 1000) / duration;
    const successRate = actualThroughput >= targetThroughput ? 1 : 0;

    return {
      testName,
      throughput: actualThroughput,
      latency: duration / testData.length,
      memoryUsage: 0,
      successRate,
      duration,
      metadata: {
        targetThroughput,
        actualThroughput,
        rowsProcessed: testData.length
      }
    };
  }

  private async benchmarkMemoryEfficiency(): Promise<BenchmarkResult> {
    const initialMemory = process.memoryUsage().heapUsed;

    // Simulate heavy workload
    const columns = this.generateTestColumns(50000);
    const features = this.generateTestVectors(10000, 128);

    // Process data through all optimization components
    await this.batchProcessor.generateFingerprints(
      columns,
      (col) => this.generateMockFingerprint(col)
    );

    for (let i = 0; i < features.length; i++) {
      this.hnswIndex.addNode(`mem_test_${i}`, features[i]);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    const memoryPerItem = memoryIncrease / (columns.length + features.length);

    const successRate = memoryIncrease <= this.config.maxMemoryIncrease ? 1 : 0;

    return {
      testName: 'Memory Efficiency Under Load',
      throughput: 0,
      latency: 0,
      memoryUsage: memoryIncrease,
      successRate,
      duration: 0,
      metadata: {
        memoryIncrease,
        memoryPerItem,
        maxAllowed: this.config.maxMemoryIncrease,
        itemsProcessed: columns.length + features.length
      }
    };
  }

  private calculateSuiteSummary(suite: BenchmarkSuite): void {
    suite.summary.totalTests = suite.results.length;
    suite.summary.passedTests = suite.results.filter(r => r.successRate >= 0.95).length;
    suite.summary.failedTests = suite.summary.totalTests - suite.summary.passedTests;

    if (suite.results.length > 0) {
      suite.summary.averageThroughput = suite.results.reduce((sum, r) => sum + r.throughput, 0) / suite.results.length;
      suite.summary.averageLatency = suite.results.reduce((sum, r) => sum + r.latency, 0) / suite.results.length;
      suite.summary.totalMemoryDelta = suite.results.reduce((sum, r) => sum + r.memoryUsage, 0);
    }
  }

  private printBenchmarkSummary(suites: BenchmarkSuite[]): void {
    console.log('\n🎯 Benchmark Suite Summary');
    console.log('═'.repeat(60));

    let totalTests = 0;
    let totalPassed = 0;
    let overallThroughput = 0;
    let overallLatency = 0;

    for (const suite of suites) {
      console.log(`\n📊 ${suite.name}`);
      console.log(`   Tests: ${suite.summary.passedTests}/${suite.summary.totalTests} passed`);
      console.log(`   Throughput: ${suite.summary.averageThroughput.toLocaleString()} ops/sec`);
      console.log(`   Latency: ${suite.summary.averageLatency.toFixed(2)}ms`);
      console.log(`   Memory: ${(suite.summary.totalMemoryDelta / 1024 / 1024).toFixed(2)}MB`);

      totalTests += suite.summary.totalTests;
      totalPassed += suite.summary.passedTests;
      overallThroughput += suite.summary.averageThroughput;
      overallLatency += suite.summary.averageLatency;
    }

    console.log('\n🏆 Overall Results');
    console.log('─'.repeat(30));
    console.log(`Total Tests: ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`);
    console.log(`Average Throughput: ${(overallThroughput/suites.length).toLocaleString()} ops/sec`);
    console.log(`Average Latency: ${(overallLatency/suites.length).toFixed(2)}ms`);

    // Performance targets assessment
    const targetsMet = this.assessPerformanceTargets(suites);
    console.log(`\n🎯 Performance Targets: ${targetsMet.met}/${targetsMet.total} met`);
  }

  private assessPerformanceTargets(suites: BenchmarkSuite[]): { met: number; total: number } {
    let met = 0;
    let total = 0;

    for (const suite of suites) {
      for (const result of suite.results) {
        total++;
        if (result.successRate >= 0.95 &&
            result.throughput >= this.config.targetThroughput/10 && // Scale down target for individual tests
            result.latency <= this.config.maxLatency * 2) { // Allow 2x latency for complex operations
          met++;
        }
      }
    }

    return { met, total };
  }

  // Helper methods for generating test data
  private generateTestColumn(name: string, size: number): ColumnData {
    const values = [];
    for (let i = 0; i < size; i++) {
      if (Math.random() < 0.1) {
        values.push(null); // 10% nulls
      } else {
        values.push(`value_${i}_${Math.random().toString(36).substr(2, 5)}`);
      }
    }

    return {
      name,
      values,
      data_type: 'string'
    };
  }

  private generateTestColumns(count: number): ColumnData[] {
    const columns = [];
    for (let i = 0; i < count; i++) {
      columns.push(this.generateTestColumn(`col_${i}`, Math.floor(Math.random() * 1000) + 100));
    }
    return columns;
  }

  private generateTestAnchors(count: number): StableColumnAnchor[] {
    const anchors: StableColumnAnchor[] = [];
    for (let i = 0; i < count; i++) {
      const fp = this.generateMockFingerprint(this.generateTestColumn(`col_${i}`, 100));
      anchors.push({
        anchor_id: `anchor_${i}`,
        dataset: 'test_dataset',
        column_name: `col_${i}`,
        fingerprint: JSON.stringify(fp),
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        confidence: Math.random()
      });
    }
    return anchors;
  }

  private generateTestVectors(count: number, dimension: number): Float32Array[] {
    const vectors = [];
    for (let i = 0; i < count; i++) {
      const vector = new Float32Array(dimension);
      for (let d = 0; d < dimension; d++) {
        vector[d] = Math.random() * 2 - 1; // Range [-1, 1]
      }
      vectors.push(vector);
    }
    return vectors;
  }

  private generateMockFingerprint(column: ColumnData): ColumnFingerprint {
    const total = column.values.length;
    const nonNullValues = column.values.filter(v => v !== null && v !== undefined);
    const nullCount = total - nonNullValues.length;
    const cardinality = new Set(nonNullValues.map(v => String(v))).size;
    const uniqueRatio = nonNullValues.length > 0 ? cardinality / nonNullValues.length : 0;

    return {
      dtype: column.data_type,
      cardinality,
      regex_patterns: [],
      null_ratio: total > 0 ? nullCount / total : 0,
      unique_ratio: uniqueRatio,
      sample_values: nonNullValues.slice(0, 10).map(v => String(v))
    };
  }

  private generateMockAnchor(dataset: string, column: ColumnData): StableColumnAnchor {
    const fp = this.generateMockFingerprint(column);
    return {
      anchor_id: `anchor_${dataset}_${column.name}`,
      dataset,
      column_name: column.name,
      fingerprint: JSON.stringify(fp),
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      confidence: Math.random()
    };
  }

  // Export results for analysis
  exportResults(suites: BenchmarkSuite[]): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      config: this.config,
      suites,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        cpus: require('os').cpus().length,
        memory: process.memoryUsage()
      }
    }, null, 2);
  }
}

// Factory function for quick benchmarking
export async function runPerformanceBenchmark(
  config?: Partial<BenchmarkConfig>
): Promise<BenchmarkSuite[]> {
  const benchmarkSuite = new OptimizationBenchmarkSuite(config);
  return benchmarkSuite.runFullBenchmarkSuite();
}

// Global benchmark instance
export const globalBenchmarkSuite = new OptimizationBenchmarkSuite();
