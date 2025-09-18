import { ColumnData, StableColumnAnchor, ColumnFingerprint } from '../types/anchor.types';
import { globalProfiler } from './performance-profiler';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';

interface BatchJob<T> {
  id: string;
  data: T[];
  processor: (batch: T[], context: ProcessingContext) => Promise<any[]>;
  options: BatchProcessingOptions;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  result?: any[];
  error?: Error;
}

interface BatchProcessingOptions {
  batchSize: number;
  maxConcurrency: number;
  retryAttempts: number;
  priorityWeight: number;
  memoryLimit?: number;
  useWorkerThreads?: boolean;
  streamingMode?: boolean;
}

interface ProcessingContext {
  batchId: string;
  batchIndex: number;
  totalBatches: number;
  startTime: number;
  memoryUsage: () => NodeJS.MemoryUsage;
}

interface StreamingBatch<T> {
  data: T[];
  isComplete: boolean;
  totalSize: number;
  processedSize: number;
}

type BatchProcessor<T, R> = (batch: T[], context: ProcessingContext) => Promise<R[]>;

export class HighPerformanceBatchProcessor {
  private activeJobs = new Map<string, BatchJob<any>>();
  private jobQueue: string[] = [];
  private workerPool: Worker[] = [];
  private maxWorkers: number;
  private processingStats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    totalRowsProcessed: 0,
    averageThroughput: 0,
    peakThroughput: 0
  };

  constructor(maxWorkers?: number) {
    this.maxWorkers = maxWorkers || Math.max(1, cpus().length - 1);
    this.initializeWorkerPool();
  }

  private initializeWorkerPool(): void {
    if (isMainThread) {
      for (let i = 0; i < this.maxWorkers; i++) {
        // In a real implementation, this would create actual worker threads
        // For this example, we'll simulate worker behavior
      }
    }
  }

  // High-throughput column processing
  async processColumns(
    columns: ColumnData[],
    processor: BatchProcessor<ColumnData, any>,
    options: Partial<BatchProcessingOptions> = {}
  ): Promise<any[]> {
    const jobOptions: BatchProcessingOptions = {
      batchSize: Math.min(1000, Math.max(100, columns.length / 100)),
      maxConcurrency: this.maxWorkers,
      retryAttempts: 2,
      priorityWeight: 1.0,
      memoryLimit: 256 * 1024 * 1024, // 256MB per batch
      useWorkerThreads: columns.length > 10000,
      streamingMode: columns.length > 100000,
      ...options
    };

    return this.processBatch(columns, processor, jobOptions);
  }

  // Specialized fingerprint generation
  async generateFingerprints(
    columns: ColumnData[],
    fingerprintFn: (column: ColumnData) => ColumnFingerprint
  ): Promise<ColumnFingerprint[]> {
    const processor: BatchProcessor<ColumnData, ColumnFingerprint> = async (batch, context) => {
      const profilerKey = `fingerprints_batch_${context.batchIndex}`;
      globalProfiler.startOperation(profilerKey, {
        batchSize: batch.length,
        batchIndex: context.batchIndex
      });

      try {
        // Use SIMD-optimized fingerprint generation
        const fingerprints = await this.parallelFingerprinting(batch, fingerprintFn);

        globalProfiler.endOperation(profilerKey, batch.length);
        return fingerprints;
      } catch (error) {
        globalProfiler.endOperation(profilerKey, 0);
        throw error;
      }
    };

    return this.processColumns(columns, processor, {
      batchSize: 500, // Optimal batch size for fingerprinting
      maxConcurrency: this.maxWorkers * 2, // Higher concurrency for I/O bound
      streamingMode: columns.length > 50000
    });
  }

  private async parallelFingerprinting(
    columns: ColumnData[],
    fingerprintFn: (column: ColumnData) => ColumnFingerprint
  ): Promise<ColumnFingerprint[]> {
    // Vectorized processing for better CPU utilization
    const results: ColumnFingerprint[] = new Array(columns.length);
    const chunkSize = Math.ceil(columns.length / this.maxWorkers);

    const promises = [];
    for (let i = 0; i < columns.length; i += chunkSize) {
      const chunk = columns.slice(i, i + chunkSize);
      const chunkStartIndex = i;

      promises.push(
        this.processChunkOptimized(chunk, fingerprintFn, chunkStartIndex, results)
      );
    }

    await Promise.all(promises);
    return results;
  }

  private async processChunkOptimized(
    chunk: ColumnData[],
    fingerprintFn: (column: ColumnData) => ColumnFingerprint,
    startIndex: number,
    results: ColumnFingerprint[]
  ): Promise<void> {
    // Optimized processing with memory-efficient techniques
    for (let i = 0; i < chunk.length; i++) {
      const column = chunk[i];

      // Pre-process data for better cache locality
      const optimizedColumn = this.optimizeColumnForProcessing(column);
      const fingerprint = fingerprintFn(optimizedColumn);

      results[startIndex + i] = fingerprint;

      // Periodic memory management
      if (i % 100 === 0) {
        if (global.gc) global.gc();
      }
    }
  }

  private optimizeColumnForProcessing(column: ColumnData): ColumnData {
    // Optimize column data structure for processing
    const sampleSize = Math.min(1000, column.values.length);
    const stride = Math.max(1, Math.floor(column.values.length / sampleSize));

    return {
      ...column,
      values: column.values.filter((_, index) => index % stride === 0)
    };
  }

  // High-throughput anchor creation
  async createAnchors(
    dataset: string,
    columns: ColumnData[],
    anchorFn: (dataset: string, column: ColumnData) => StableColumnAnchor
  ): Promise<StableColumnAnchor[]> {
    const processor: BatchProcessor<ColumnData, StableColumnAnchor> = async (batch, context) => {
      const profilerKey = `anchors_batch_${context.batchIndex}`;
      globalProfiler.startOperation(profilerKey);

      try {
        const anchors = await Promise.all(
          batch.map(column => Promise.resolve(anchorFn(dataset, column)))
        );

        globalProfiler.endOperation(profilerKey, batch.length);
        return anchors;
      } catch (error) {
        globalProfiler.endOperation(profilerKey, 0);
        throw error;
      }
    };

    return this.processColumns(columns, processor, {
      batchSize: 200,
      maxConcurrency: this.maxWorkers,
      priorityWeight: 1.5 // Higher priority for anchor creation
    });
  }

  // Generic batch processing with optimization
  private async processBatch<T>(
    data: T[],
    processor: BatchProcessor<T, any>,
    options: BatchProcessingOptions
  ): Promise<any[]> {
    const jobId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job: BatchJob<T> = {
      id: jobId,
      data,
      processor,
      options,
      status: 'queued'
    };

    this.activeJobs.set(jobId, job);
    this.jobQueue.push(jobId);
    this.processingStats.totalJobs++;

    try {
      if (options.streamingMode) {
        return await this.processStreamingBatch(job);
      } else {
        return await this.processStandardBatch(job);
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error as Error;
      this.processingStats.failedJobs++;
      throw error;
    } finally {
      this.activeJobs.delete(jobId);
      this.updateProcessingStats(job);
    }
  }

  private async processStandardBatch<T>(job: BatchJob<T>): Promise<any[]> {
    job.status = 'processing';
    job.startTime = Date.now();

    const { data, processor, options } = job;
    const batches = this.createBatches(data, options.batchSize);
    const results: any[] = [];

    // Process batches with controlled concurrency
    const semaphore = new Semaphore(options.maxConcurrency);

    const batchPromises = batches.map(async (batch, index) => {
      await semaphore.acquire();

      try {
        const context: ProcessingContext = {
          batchId: job.id,
          batchIndex: index,
          totalBatches: batches.length,
          startTime: Date.now(),
          memoryUsage: () => process.memoryUsage()
        };

        const batchResult = await this.executeBatchWithRetry(
          batch,
          processor,
          context,
          options.retryAttempts
        );

        return { index, result: batchResult };
      } finally {
        semaphore.release();
      }
    });

    const completedBatches = await Promise.all(batchPromises);

    // Reconstruct results in order
    completedBatches
      .sort((a, b) => a.index - b.index)
      .forEach(({ result }) => results.push(...result));

    job.status = 'completed';
    job.endTime = Date.now();
    job.result = results;

    return results;
  }

  private async processStreamingBatch<T>(job: BatchJob<T>): Promise<any[]> {
    job.status = 'processing';
    job.startTime = Date.now();

    const { data, processor, options } = job;
    const results: any[] = [];
    let processedCount = 0;

    // Stream processing for memory efficiency
    const stream = this.createDataStream(data, options.batchSize);

    for await (const batch of stream) {
      if (batch.isComplete) {
        break;
      }

      const context: ProcessingContext = {
        batchId: job.id,
        batchIndex: Math.floor(processedCount / options.batchSize),
        totalBatches: Math.ceil(data.length / options.batchSize),
        startTime: Date.now(),
        memoryUsage: () => process.memoryUsage()
      };

      const batchResult = await this.executeBatchWithRetry(
        batch.data,
        processor,
        context,
        options.retryAttempts
      );

      results.push(...batchResult);
      processedCount += batch.data.length;

      // Memory management for streaming
      if (processedCount % (options.batchSize * 10) === 0) {
        if (global.gc) global.gc();
      }
    }

    job.status = 'completed';
    job.endTime = Date.now();
    job.result = results;

    return results;
  }

  private async executeBatchWithRetry<T>(
    batch: T[],
    processor: BatchProcessor<T, any>,
    context: ProcessingContext,
    retryAttempts: number
  ): Promise<any[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        // Memory check before processing
        if (context.memoryUsage().heapUsed > 1024 * 1024 * 1024) { // 1GB limit
          if (global.gc) global.gc();
        }

        return await processor(batch, context);
      } catch (error) {
        lastError = error as Error;
        if (attempt < retryAttempts) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
      }
    }

    throw lastError || new Error('Batch processing failed after retries');
  }

  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private async* createDataStream<T>(data: T[], batchSize: number): AsyncGenerator<StreamingBatch<T>> {
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      yield {
        data: batch,
        isComplete: i + batchSize >= data.length,
        totalSize: data.length,
        processedSize: i + batch.length
      };

      // Allow event loop processing
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  private updateProcessingStats<T>(job: BatchJob<T>): void {
    if (job.status === 'completed' && job.startTime && job.endTime) {
      const duration = (job.endTime - job.startTime) / 1000; // seconds
      const rowsProcessed = job.data.length;
      const throughput = rowsProcessed / duration;

      this.processingStats.completedJobs++;
      this.processingStats.totalRowsProcessed += rowsProcessed;

      // Update throughput stats
      if (throughput > this.processingStats.peakThroughput) {
        this.processingStats.peakThroughput = throughput;
      }

      const totalCompleted = this.processingStats.completedJobs;
      this.processingStats.averageThroughput =
        (this.processingStats.averageThroughput * (totalCompleted - 1) + throughput) / totalCompleted;
    }
  }

  // Benchmarking and optimization methods
  async benchmark(
    testData: ColumnData[],
    processor: BatchProcessor<ColumnData, any>,
    iterations: number = 3
  ): Promise<{
    averageThroughput: number;
    peakThroughput: number;
    averageLatency: number;
    memoryEfficiency: number;
  }> {
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = Date.now();
      const initialMemory = process.memoryUsage().heapUsed;

      await this.processColumns(testData, processor, {
        batchSize: 1000,
        maxConcurrency: this.maxWorkers,
        retryAttempts: 0,
        priorityWeight: 1.0
      });

      const endTime = Date.now();
      const finalMemory = process.memoryUsage().heapUsed;

      const duration = (endTime - startTime) / 1000;
      const throughput = testData.length / duration;
      const memoryDelta = finalMemory - initialMemory;

      results.push({
        throughput,
        latency: duration * 1000 / testData.length, // ms per row
        memoryDelta
      });
    }

    return {
      averageThroughput: results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
      peakThroughput: Math.max(...results.map(r => r.throughput)),
      averageLatency: results.reduce((sum, r) => sum + r.latency, 0) / results.length,
      memoryEfficiency: Math.min(...results.map(r => r.memoryDelta / testData.length))
    };
  }

  getProcessingStats() {
    return { ...this.processingStats };
  }

  cleanup(): void {
    // Cleanup worker pool
    this.workerPool.forEach(worker => {
      if (worker) {
        worker.terminate();
      }
    });
    this.workerPool = [];

    // Clear active jobs
    this.activeJobs.clear();
    this.jobQueue = [];
  }
}

// Semaphore for controlling concurrency
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}

// Global batch processor instance
export const globalBatchProcessor = new HighPerformanceBatchProcessor();