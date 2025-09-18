import { OptimizedBatchProcessorV2, OptimizedBatchOptions, ProcessingResult } from './batch-processor-v2';
import { ColumnData } from '../types/anchor.types';
import { performance } from 'perf_hooks';
import { cpus } from 'os';

export interface BenchmarkResult {
  testName: string;
  rowCount: number;
  duration: number;
  throughput: number;
  latency: number;
  memoryUsage: number;
  p50Latency: number;
  p99Latency: number;
  success: boolean;
  errorMessage?: string;
}

export interface PerformanceTargets {
  throughput: number;
  latency_p50: number;
  latency_p99: number;
  memory_stable: boolean;
  cpu_utilization: number;
}

export const PERFORMANCE_REQUIREMENTS: PerformanceTargets = {
  throughput: 1000000,
  latency_p50: 10,
  latency_p99: 100,
  memory_stable: true,
  cpu_utilization: 0.8
};

export class PerformanceBenchmark {
  private processor: OptimizedBatchProcessorV2;
  private testResults: BenchmarkResult[] = [];

  constructor(options?: Partial<OptimizedBatchOptions>) {
    const defaultOptions: OptimizedBatchOptions = {
      batchSize: 10000,
      maxWorkers: Math.max(1, cpus().length),
      useSharedMemory: true,
      enableSIMD: true,
      objectPooling: true,
      streamingMode: true,
      memoryLimit: 512 * 1024 * 1024
    };

    this.processor = new OptimizedBatchProcessorV2({
      ...defaultOptions,
      ...options
    });
  }

  generateTestData(rowCount: number): ColumnData[] {
    const columns: ColumnData[] = [];

    for (let i = 0; i < rowCount; i++) {
      const valueCount = Math.floor(Math.random() * 1000) + 100;
      const values = Array.from({ length: valueCount }, () => Math.random() * 1000);

      columns.push({
        name: `column_${i}`,
        data_type: Math.random() > 0.5 ? 'int64' : 'string',
        values
      });
    }

    return columns;
  }

  mockProcessor = (column: ColumnData): any => {
    return {
      name: column.name,
      hash: this.simpleHash(column.name + column.values.length),
      valueCount: column.values.length,
      processed: true
    };
  };

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  async runProgressivePerformanceTests(): Promise<BenchmarkResult[]> {
    const tests = [
      { rows: 1000, target: 0.001, name: "Small Dataset (1K rows)" },
      { rows: 10000, target: 0.01, name: "Medium Dataset (10K rows)" },
      { rows: 100000, target: 0.1, name: "Large Dataset (100K rows)" },
      { rows: 1000000, target: 1.0, name: "Enterprise Dataset (1M rows)" },
      { rows: 10000000, target: 10.0, name: "Massive Dataset (10M rows)" }
    ];

    console.log('Starting Progressive Performance Validation...\n');

    for (const test of tests) {
      console.log(`Testing ${test.name}...`);

      try {
        const result = await this.runSingleTest(test.name, test.rows, test.target);
        this.testResults.push(result);

        if (result.success) {
          console.log(`✅ ${test.name}: ${result.throughput.toFixed(0)} rows/sec (${result.duration.toFixed(3)}s)`);
        } else {
          console.log(`❌ ${test.name}: ${result.errorMessage}`);
          if (test.rows >= 1000000) {
            console.log('⚠️  Failed at enterprise scale - continuing with fallback targets');
          }
        }
      } catch (error) {
        const failedResult: BenchmarkResult = {
          testName: test.name,
          rowCount: test.rows,
          duration: 0,
          throughput: 0,
          latency: 0,
          memoryUsage: 0,
          p50Latency: 0,
          p99Latency: 0,
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error'
        };
        this.testResults.push(failedResult);
        console.log(`❌ ${test.name}: ${failedResult.errorMessage}`);
      }

      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return this.testResults;
  }

  private async runSingleTest(
    testName: string,
    rowCount: number,
    targetDuration: number
  ): Promise<BenchmarkResult> {
    const testData = this.generateTestData(rowCount);
    const initialMemory = process.memoryUsage().heapUsed;

    const startTime = performance.now();
    const result = await this.processor.processColumns(testData, this.mockProcessor);
    const endTime = performance.now();

    const duration = (endTime - startTime) / 1000;
    const throughput = rowCount / duration;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDelta = finalMemory - initialMemory;

    const success = duration <= targetDuration && throughput >= PERFORMANCE_REQUIREMENTS.throughput * 0.8;

    return {
      testName,
      rowCount,
      duration,
      throughput,
      latency: result.latency,
      memoryUsage: memoryDelta,
      p50Latency: result.latency,
      p99Latency: result.latency * 2,
      success,
      errorMessage: success ? undefined : `Duration ${duration.toFixed(3)}s > target ${targetDuration}s`
    };
  }

  async runThroughputBenchmark(iterations: number = 5): Promise<{
    averageThroughput: number;
    peakThroughput: number;
    consistencyScore: number;
    meetsTarget: boolean;
    averageCpuUtilization?: number;
  }> {
    console.log('\n🚀 Running Throughput Benchmark...');

    const throughputs: number[] = [];
    const cpuUtils: number[] = [];
    const testData = this.generateTestData(100000);

    for (let i = 0; i < iterations; i++) {
      console.log(`  Iteration ${i + 1}/${iterations}...`);

      if (global.gc) global.gc();

      const startTime = performance.now();
      const res = await this.processor.processColumns(testData, this.mockProcessor);
      const endTime = performance.now();

      const duration = (endTime - startTime) / 1000;
      const throughput = testData.length / duration;
      throughputs.push(throughput);
      if (typeof res.cpuUtilization === 'number') cpuUtils.push(res.cpuUtilization);

      console.log(`    ${throughput.toFixed(0)} rows/sec`);
    }

    const averageThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
    const peakThroughput = Math.max(...throughputs);
    const minThroughput = Math.min(...throughputs);
    const consistencyScore = minThroughput / peakThroughput;
    const meetsTarget = averageThroughput >= PERFORMANCE_REQUIREMENTS.throughput;
    const averageCpuUtilization = cpuUtils.length ? cpuUtils.reduce((a, b) => a + b, 0) / cpuUtils.length : undefined;

    console.log(`\n📊 Throughput Results:`);
    console.log(`  Average: ${averageThroughput.toFixed(0)} rows/sec`);
    console.log(`  Peak: ${peakThroughput.toFixed(0)} rows/sec`);
    console.log(`  Consistency: ${(consistencyScore * 100).toFixed(1)}%`);
    console.log(`  Target: ${meetsTarget ? '✅' : '❌'} (${PERFORMANCE_REQUIREMENTS.throughput.toLocaleString()} rows/sec)`);
    if (averageCpuUtilization !== undefined) {
      console.log(`  CPU Utilization (avg): ${(averageCpuUtilization * 100).toFixed(1)}%`);
    }

    return {
      averageThroughput,
      peakThroughput,
      consistencyScore,
      meetsTarget,
      averageCpuUtilization
    };
  }

  async runLatencyBenchmark(): Promise<{
    p50Latency: number;
    p99Latency: number;
    averageLatency: number;
    meetsP50Target: boolean;
    meetsP99Target: boolean;
  }> {
    console.log('\n⏱️  Running Latency Benchmark...');

    const latencies: number[] = [];
    const batchSizes = [100, 500, 1000, 2000, 5000];

    for (const batchSize of batchSizes) {
      const testData = this.generateTestData(batchSize);

      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        await this.processor.processColumns(testData, this.mockProcessor);
        const endTime = performance.now();

        const latency = (endTime - startTime);
        latencies.push(latency);
      }
    }

    latencies.sort((a, b) => a - b);
    const p50Index = Math.floor(latencies.length * 0.5);
    const p99Index = Math.floor(latencies.length * 0.99);

    const p50Latency = latencies[p50Index];
    const p99Latency = latencies[p99Index];
    const averageLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

    const meetsP50Target = p50Latency <= PERFORMANCE_REQUIREMENTS.latency_p50;
    const meetsP99Target = p99Latency <= PERFORMANCE_REQUIREMENTS.latency_p99;

    console.log(`📊 Latency Results:`);
    console.log(`  P50: ${p50Latency.toFixed(2)}ms ${meetsP50Target ? '✅' : '❌'}`);
    console.log(`  P99: ${p99Latency.toFixed(2)}ms ${meetsP99Target ? '✅' : '❌'}`);
    console.log(`  Average: ${averageLatency.toFixed(2)}ms`);

    return {
      p50Latency,
      p99Latency,
      averageLatency,
      meetsP50Target,
      meetsP99Target
    };
  }

  async runMemoryStabilityTest(): Promise<{
    initialMemory: number;
    peakMemory: number;
    finalMemory: number;
    memoryGrowth: number;
    isStable: boolean;
  }> {
    console.log('\n🧠 Running Memory Stability Test...');

    const initialMemory = process.memoryUsage().heapUsed;
    let peakMemory = initialMemory;
    const memorySnapshots: number[] = [];

    // Stream in smaller chunks to reflect pipeline behavior and avoid bulk allocation
    const batches = 10;
    const chunkSize = 10000;
    for (let batch = 0; batch < batches; batch++) {
      const testData = this.generateTestData(chunkSize);
      await this.processor.processColumns(testData, this.mockProcessor);

      const currentMemory = process.memoryUsage().heapUsed;
      peakMemory = Math.max(peakMemory, currentMemory);
      memorySnapshots.push(currentMemory);

      if (batch % 3 === 0 && global.gc) {
        global.gc();
      }

      console.log(`  Batch ${batch + 1}/${batches}: ${(currentMemory / 1024 / 1024).toFixed(1)}MB`);
    }

    if (global.gc) global.gc();
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = (finalMemory - initialMemory) / initialMemory;
    const isStable = memoryGrowth < 0.2;

    console.log(`📊 Memory Results:`);
    console.log(`  Initial: ${(initialMemory / 1024 / 1024).toFixed(1)}MB`);
    console.log(`  Peak: ${(peakMemory / 1024 / 1024).toFixed(1)}MB`);
    console.log(`  Final: ${(finalMemory / 1024 / 1024).toFixed(1)}MB`);
    console.log(`  Growth: ${(memoryGrowth * 100).toFixed(1)}% ${isStable ? '✅' : '❌'}`);

    return {
      initialMemory,
      peakMemory,
      finalMemory,
      memoryGrowth,
      isStable
    };
  }

  async runComprehensiveValidation(): Promise<{
    overallScore: number;
    passedTests: number;
    totalTests: number;
    recommendations: string[];
    meetsEnterpriseTargets: boolean;
  }> {
    console.log('🎯 Starting Comprehensive Performance Validation\n');
    console.log('='.repeat(60));

    const progressiveResults = await this.runProgressivePerformanceTests();
    const throughputResults = await this.runThroughputBenchmark();
    const latencyResults = await this.runLatencyBenchmark();
    const memoryResults = await this.runMemoryStabilityTest();

    const testsPassed = [
      throughputResults.meetsTarget,
      latencyResults.meetsP50Target,
      latencyResults.meetsP99Target,
      memoryResults.isStable,
      progressiveResults.some(r => r.rowCount >= 1000000 && r.success)
    ];

    const passedCount = testsPassed.filter(t => t).length;
    const totalCount = testsPassed.length;
    const overallScore = passedCount / totalCount;
    const meetsEnterpriseTargets = passedCount >= 4;

    const recommendations: string[] = [];

    if (!throughputResults.meetsTarget) {
      recommendations.push(`Increase worker count to ${cpus().length * 2} for higher throughput`);
      recommendations.push('Enable aggressive SIMD optimizations');
    }

    if (!latencyResults.meetsP50Target) {
      recommendations.push('Reduce batch size to 1000 for lower latency');
    }

    if (!latencyResults.meetsP99Target) {
      recommendations.push('Implement batch prioritization for consistent latency');
    }

    if (!memoryResults.isStable) {
      recommendations.push('Enable more aggressive garbage collection');
      recommendations.push('Increase object pool sizes');
    }

    console.log('\n' + '='.repeat(60));
    console.log('🏆 FINAL VALIDATION RESULTS');
    console.log('='.repeat(60));
    console.log(`Overall Score: ${(overallScore * 100).toFixed(1)}%`);
    console.log(`Tests Passed: ${passedCount}/${totalCount}`);
    console.log(`Enterprise Ready: ${meetsEnterpriseTargets ? '✅ YES' : '❌ NO'}`);

    if (throughputResults.averageThroughput >= 1000000) {
      console.log('\n🎉 CRITICAL SUCCESS: 1M+ rows/sec throughput achieved!');
    } else {
      console.log(`\n⚠️  PERFORMANCE GAP: ${throughputResults.averageThroughput.toFixed(0)} rows/sec (target: 1M+)`);
    }

    if (recommendations.length > 0) {
      console.log('\n📝 Recommendations:');
      recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
    }

    return {
      overallScore,
      passedTests: passedCount,
      totalTests: totalCount,
      recommendations,
      meetsEnterpriseTargets
    };
  }

  getTestResults(): BenchmarkResult[] {
    return [...this.testResults];
  }

  cleanup(): void {
    this.processor.cleanup();
  }
}

export async function validatePerformanceTargets(): Promise<boolean> {
  const benchmark = new PerformanceBenchmark();

  try {
    const results = await benchmark.runComprehensiveValidation();
    return results.meetsEnterpriseTargets;
  } finally {
    benchmark.cleanup();
  }
}

export async function quickPerformanceCheck(): Promise<{
  throughput: number;
  meetsTarget: boolean;
  timeToProcess1M: number;
}> {
  const benchmark = new PerformanceBenchmark();

  try {
    const testData = benchmark.generateTestData(100000);
    const startTime = performance.now();
    await benchmark['processor'].processColumns(testData, benchmark.mockProcessor);
    const endTime = performance.now();

    const duration = (endTime - startTime) / 1000;
    const throughput = testData.length / duration;
    const timeToProcess1M = 1000000 / throughput;
    const meetsTarget = throughput >= PERFORMANCE_REQUIREMENTS.throughput;

    return {
      throughput,
      meetsTarget,
      timeToProcess1M
    };
  } finally {
    benchmark.cleanup();
  }
}
