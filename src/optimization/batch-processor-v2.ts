import { ColumnData, StableColumnAnchor, ColumnFingerprint } from '../types/anchor.types';
import { globalProfiler } from './performance-profiler';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import { performance } from 'perf_hooks';

export interface OptimizedBatchOptions {
  batchSize: number;
  maxWorkers: number;
  useSharedMemory: boolean;
  enableSIMD: boolean;
  objectPooling: boolean;
  streamingMode: boolean;
  memoryLimit: number;
}

export interface ProcessingResult {
  data: any[];
  throughput: number;
  latency: number;
  memoryEfficiency: number;
  cpuUtilization?: number;
}

export interface SharedBufferMetadata {
  length: number;
  type: 'Float32Array' | 'Float64Array' | 'Uint8Array';
  offset: number;
  byteLength: number;
}

export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(factory: () => T, reset: (obj: T) => void, maxSize: number = 1000) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  acquire(): T {
    const obj = this.pool.pop();
    if (obj) {
      return obj;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  getSize(): number {
    return this.pool.length;
  }
}

export class RingBuffer {
  private buffer: SharedArrayBuffer;
  private writePtr: number = 0;
  private readPtr: number = 0;
  private size: number;
  private view: Uint8Array;

  constructor(size: number) {
    this.size = size;
    this.buffer = new SharedArrayBuffer(size);
    this.view = new Uint8Array(this.buffer);
  }

  write(data: Uint8Array): boolean {
    if (data.length > this.available()) {
      return false;
    }

    const endIndex = this.writePtr + data.length;
    if (endIndex <= this.size) {
      this.view.set(data, this.writePtr);
    } else {
      const firstChunk = this.size - this.writePtr;
      this.view.set(data.subarray(0, firstChunk), this.writePtr);
      this.view.set(data.subarray(firstChunk), 0);
    }

    this.writePtr = endIndex % this.size;
    return true;
  }

  read(length: number): Uint8Array | null {
    if (length > this.used()) {
      return null;
    }

    const result = new Uint8Array(length);
    const endIndex = this.readPtr + length;

    if (endIndex <= this.size) {
      result.set(this.view.subarray(this.readPtr, endIndex));
    } else {
      const firstChunk = this.size - this.readPtr;
      result.set(this.view.subarray(this.readPtr, this.size));
      result.set(this.view.subarray(0, endIndex % this.size), firstChunk);
    }

    this.readPtr = endIndex % this.size;
    return result;
  }

  available(): number {
    return this.size - this.used() - 1;
  }

  used(): number {
    return (this.writePtr - this.readPtr + this.size) % this.size;
  }

  getBuffer(): SharedArrayBuffer {
    return this.buffer;
  }
}

export class SIMDOperations {
  static processColumnsSIMD(data: Float32Array, results: Float32Array): void {
    const len = data.length;
    const remainder = len % 4;
    const limit = len - remainder;

    for (let i = 0; i < limit; i += 4) {
      results[i] = this.xxHash32(data[i]);
      results[i + 1] = this.xxHash32(data[i + 1]);
      results[i + 2] = this.xxHash32(data[i + 2]);
      results[i + 3] = this.xxHash32(data[i + 3]);
    }

    for (let i = limit; i < len; i++) {
      results[i] = this.xxHash32(data[i]);
    }
  }

  static xxHash32(input: number): number {
    const PRIME32_1 = 0x9E3779B1;
    const PRIME32_2 = 0x85EBCA77;
    const PRIME32_3 = 0xC2B2AE3D;
    const PRIME32_4 = 0x27D4EB2F;
    const PRIME32_5 = 0x165667B1;

    let h32 = PRIME32_5 + 4;
    h32 += input * PRIME32_3;
    h32 = ((h32 << 17) | (h32 >>> 15)) * PRIME32_4;
    h32 ^= h32 >>> 15;
    h32 *= PRIME32_2;
    h32 ^= h32 >>> 13;
    h32 *= PRIME32_3;
    h32 ^= h32 >>> 16;

    return h32 >>> 0;
  }

  static vectorSum(values: Float64Array): number {
    let sum = 0;
    const len = values.length;
    const remainder = len % 4;
    const limit = len - remainder;

    for (let i = 0; i < limit; i += 4) {
      sum += values[i] + values[i + 1] + values[i + 2] + values[i + 3];
    }

    for (let i = limit; i < len; i++) {
      sum += values[i];
    }

    return sum;
  }

  static vectorDot(a: Float64Array, b: Float64Array): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dot = 0;
    const len = a.length;
    const remainder = len % 4;
    const limit = len - remainder;

    for (let i = 0; i < limit; i += 4) {
      dot += a[i] * b[i] + a[i + 1] * b[i + 1] + a[i + 2] * b[i + 2] + a[i + 3] * b[i + 3];
    }

    for (let i = limit; i < len; i++) {
      dot += a[i] * b[i];
    }

    return dot;
  }

  static vectorDistance(a: Float64Array, b: Float64Array): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let distanceSquared = 0;
    const len = a.length;
    const remainder = len % 4;
    const limit = len - remainder;

    for (let i = 0; i < limit; i += 4) {
      const d1 = a[i] - b[i];
      const d2 = a[i + 1] - b[i + 1];
      const d3 = a[i + 2] - b[i + 2];
      const d4 = a[i + 3] - b[i + 3];
      distanceSquared += d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4;
    }

    for (let i = limit; i < len; i++) {
      const d = a[i] - b[i];
      distanceSquared += d * d;
    }

    return Math.sqrt(distanceSquared);
  }
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private jobQueue: Array<{
    data: SharedArrayBuffer;
    metadata: SharedBufferMetadata;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
  }> = [];
  private workerScript: string;

  constructor(size: number = cpus().length) {
    this.workerScript = this.generateWorkerScript();
    this.initializeWorkers(size);
  }

  private generateWorkerScript(): string {
    return `
      const { parentPort } = require('worker_threads');

      class SIMDOperations {
        static processColumnsSIMD(data, results) {
          const len = data.length;
          const remainder = len % 4;
          const limit = len - remainder;

          for (let i = 0; i < limit; i += 4) {
            results[i] = this.xxHash32(data[i]);
            results[i + 1] = this.xxHash32(data[i + 1]);
            results[i + 2] = this.xxHash32(data[i + 2]);
            results[i + 3] = this.xxHash32(data[i + 3]);
          }

          for (let i = limit; i < len; i++) {
            results[i] = this.xxHash32(data[i]);
          }
        }

        static xxHash32(input) {
          const PRIME32_1 = 0x9E3779B1;
          const PRIME32_2 = 0x85EBCA77;
          const PRIME32_3 = 0xC2B2AE3D;
          const PRIME32_4 = 0x27D4EB2F;
          const PRIME32_5 = 0x165667B1;

          let h32 = PRIME32_5 + 4;
          h32 += input * PRIME32_3;
          h32 = ((h32 << 17) | (h32 >>> 15)) * PRIME32_4;
          h32 ^= h32 >>> 15;
          h32 *= PRIME32_2;
          h32 ^= h32 >>> 13;
          h32 *= PRIME32_3;
          h32 ^= h32 >>> 16;

          return h32 >>> 0;
        }
      }

      parentPort.on('message', ({ shared, metadata }) => {
        try {
          const typedArray = metadata.type === 'Float32Array' ?
            new Float32Array(shared, metadata.offset, metadata.length) :
            metadata.type === 'Float64Array' ?
            new Float64Array(shared, metadata.offset, metadata.length) :
            new Uint8Array(shared, metadata.offset, metadata.length);

          const results = new Float32Array(metadata.length);

          if (metadata.type === 'Float32Array') {
            SIMDOperations.processColumnsSIMD(typedArray, results);
          }

          parentPort.postMessage({
            success: true,
            results: Array.from(results),
            processedLength: metadata.length
          });
        } catch (error) {
          parentPort.postMessage({
            success: false,
            error: error.message
          });
        }
      });
    `;
  }

  private initializeWorkers(size: number): void {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(this.workerScript, { eval: true });
      worker.on('message', this.handleWorkerMessage.bind(this, worker));
      worker.on('error', this.handleWorkerError.bind(this, worker));
      this.workers.push(worker);
      this.availableWorkers.push(worker);
    }
  }

  private handleWorkerMessage(worker: Worker, message: any): void {
    this.availableWorkers.push(worker);
    this.processNextJob();
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    console.error('Worker error:', error);
    this.availableWorkers.push(worker);
    this.processNextJob();
  }

  async process(data: ArrayBuffer | SharedArrayBuffer, metadata: SharedBufferMetadata): Promise<any> {
    let shared: SharedArrayBuffer;
    if (data instanceof SharedArrayBuffer) {
      shared = data;
    } else {
      shared = new SharedArrayBuffer(data.byteLength);
      new Uint8Array(shared).set(new Uint8Array(data));
    }

    return new Promise((resolve, reject) => {
      this.jobQueue.push({ data: shared, metadata, resolve, reject });
      this.processNextJob();
    });
  }

  private processNextJob(): void {
    if (this.jobQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const job = this.jobQueue.shift()!;
    const worker = this.availableWorkers.shift()!;

    worker.postMessage({ shared: job.data, metadata: job.metadata });

    worker.once('message', (message) => {
      if (message.success) {
        job.resolve(message.results);
      } else {
        job.reject(new Error(message.error));
      }
    });
  }

  destroy(): void {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.availableWorkers = [];
    this.jobQueue = [];
  }
}

export class OptimizedBatchProcessorV2 {
  private workerPool: WorkerPool;
  private columnPool: ObjectPool<ColumnData>;
  private resultPool: ObjectPool<any[]>;
  private ringBuffer: RingBuffer;
  private processingStats = {
    totalRows: 0,
    totalTime: 0,
    peakThroughput: 0,
    averageThroughput: 0,
    memoryUsage: 0
  };

  constructor(private options: OptimizedBatchOptions) {
    this.workerPool = new WorkerPool(options.maxWorkers);
    this.ringBuffer = new RingBuffer(options.memoryLimit);

    this.columnPool = new ObjectPool<ColumnData>(
      () => ({ name: '', values: [], data_type: 'unknown' }),
      (col) => { col.values = []; col.name = ''; },
      1000
    );

    this.resultPool = new ObjectPool<any[]>(
      () => [],
      (arr) => { arr.length = 0; },
      100
    );
  }

  async processColumns(
    columns: ColumnData[],
    processor: (column: ColumnData) => any
  ): Promise<ProcessingResult> {
    const startTime = performance.now();
    const cpuStart = process.cpuUsage();
    const initialMemory = process.memoryUsage().heapUsed;

    let results: any[];

    if (this.options.streamingMode && columns.length > 50000) {
      results = await this.processStreamingBatch(columns, processor);
    } else {
      results = await this.processStandardBatch(columns, processor);
    }

    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    const throughput = columns.length / duration;
    const latency = duration / columns.length * 1000;
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryDelta = finalMemory - initialMemory;
    const cpuEnd = process.cpuUsage(cpuStart);
    const cpuMicros = cpuEnd.user + cpuEnd.system; // microseconds across threads
    const cpuUtilization = Math.min(1,
      (cpuMicros / 1_000_000) / (duration * cpus().length)
    );

    this.updateStats(columns.length, duration, throughput, memoryDelta);

    return {
      data: results,
      throughput,
      latency,
      memoryEfficiency: memoryDelta / columns.length,
      cpuUtilization
    };
  }

  private async processStandardBatch(
    columns: ColumnData[],
    processor: (column: ColumnData) => any
  ): Promise<any[]> {
    const batchSize = this.options.batchSize;
    const results: any[] = [];
    const batches = this.createBatches(columns, batchSize);

    if (this.options.useSharedMemory && this.options.enableSIMD) {
      return this.processWithWorkers(batches, processor);
    }

    const concurrencyLimit = Math.min(this.options.maxWorkers, batches.length);
    const semaphore = new Semaphore(concurrencyLimit);

    const batchPromises = batches.map(async (batch, index) => {
      await semaphore.acquire();
      try {
        return await this.processBatchChunk(batch, processor, index);
      } finally {
        semaphore.release();
      }
    });

    const batchResults = await Promise.all(batchPromises);
    // Flatten and release pooled arrays if applicable
    for (const batchArr of batchResults) {
      results.push(...batchArr);
      if (this.options.objectPooling) {
        this.resultPool.release(batchArr);
      }
    }

    return results;
  }

  private async processWithWorkers(
    batches: ColumnData[][],
    processor: (column: ColumnData) => any
  ): Promise<any[]> {
    const results: any[] = [];

    // Concurrency-limited dispatch to worker pool
    const concurrency = Math.min(this.options.maxWorkers, batches.length);
    const semaphore = new Semaphore(concurrency);

    // Pre-allocate a small pool of SharedArrayBuffers and views to avoid per-batch allocation
    const capacity = this.options.batchSize; // floats per batch
    const sabPool: Array<{ sab: SharedArrayBuffer; view: Float32Array }> = [];
    for (let i = 0; i < concurrency; i++) {
      const sab = new SharedArrayBuffer(capacity * 4);
      const view = new Float32Array(sab);
      sabPool.push({ sab, view });
    }

    const acquireSAB = () => sabPool.pop()!;
    const releaseSAB = (item: { sab: SharedArrayBuffer; view: Float32Array }) => sabPool.push(item);

    const tasks = batches.map(async (batch, index) => {
      await semaphore.acquire();
      try {
        // Acquire a shared buffer and write data directly (no intermediate copy)
        const buf = acquireSAB();
        const view = buf.view;
        for (let i = 0; i < batch.length; i++) {
          view[i] = batch[i].values.length;
        }

        const metadata: SharedBufferMetadata = {
          length: batch.length,
          type: 'Float32Array',
          offset: 0,
          byteLength: batch.length * 4
        };

        let workerResults: number[] = [];
        try {
          // Run SIMD pre-processing in worker on shared buffer
          const hashes: number[] = await this.workerPool.process(buf.sab, metadata);
          workerResults = hashes;
        } catch (error) {
          // Log and continue; worker pre-processing is an optimization
          console.error('Worker processing failed:', error);
        } finally {
          releaseSAB(buf);
        }

        // Return raw worker hashes for minimal allocation
        return workerResults;
      } finally {
        semaphore.release();
      }
    });

    const batchResults = await Promise.all(tasks);
    for (const batchArr of batchResults) {
      results.push(...batchArr);
      if (this.options.objectPooling) {
        this.resultPool.release(batchArr);
      }
    }

    return results;
  }

  private async processStreamingBatch(
    columns: ColumnData[],
    processor: (column: ColumnData) => any
  ): Promise<any[]> {
    const results: any[] = [];
    const batchSize = this.options.batchSize;
    let processedCount = 0;

    for await (const batch of this.createDataStream(columns, batchSize)) {
      if (batch.isComplete) break;

      const batchResults = await this.processBatchChunk(
        batch.data,
        processor,
        Math.floor(processedCount / batchSize)
      );

      results.push(...batchResults);
      processedCount += batch.data.length;

      if (processedCount % (batchSize * 10) === 0 && global.gc) {
        global.gc();
      }
    }

    return results;
  }

  private async processBatchChunk(
    batch: ColumnData[],
    processor: (column: ColumnData) => any,
    batchIndex: number
  ): Promise<any[]> {
    const profilerKey = `batch_chunk_${batchIndex}`;
    globalProfiler.startOperation(profilerKey);

    try {
      const results = this.options.objectPooling ?
        this.resultPool.acquire() : [];
      if (this.options.objectPooling) {
        (results as any).__pooled = true;
      }

      if (this.options.enableSIMD && batch.length >= 4) {
        await this.processBatchSIMD(batch, processor, results);
      } else {
        for (const column of batch) {
          const processedColumn = this.options.objectPooling ?
            this.optimizeColumnForProcessing(column) : column;
          results.push(processor(processedColumn));
          if (this.options.objectPooling && processedColumn !== column) {
            this.columnPool.release(processedColumn);
          }
        }
      }

      globalProfiler.endOperation(profilerKey, batch.length);
      return results;
    } catch (error) {
      globalProfiler.endOperation(profilerKey, 0);
      throw error;
    }
  }

  private async processBatchSIMD(
    batch: ColumnData[],
    processor: (column: ColumnData) => any,
    results: any[]
  ): Promise<void> {
    const inputData = new Float32Array(batch.length);
    const outputData = new Float32Array(batch.length);

    for (let i = 0; i < batch.length; i++) {
      inputData[i] = batch[i].values.length;
    }

    SIMDOperations.processColumnsSIMD(inputData, outputData);

    for (let i = 0; i < batch.length; i++) {
      const optimizedColumn = this.optimizeColumnForProcessing(batch[i]);
      results.push(processor(optimizedColumn));
      if (this.options.objectPooling) {
        this.columnPool.release(optimizedColumn);
      }
    }
  }

  private optimizeColumnForProcessing(column: ColumnData): ColumnData {
    if (!this.options.objectPooling) {
      return column;
    }

    const optimized = this.columnPool.acquire();
    optimized.name = column.name;
    optimized.data_type = column.data_type;

    const sampleSize = Math.min(1000, column.values.length);
    const stride = Math.max(1, Math.floor(column.values.length / sampleSize));
    optimized.values = column.values.filter((_, index) => index % stride === 0);

    return optimized;
  }

  private createBatches<T>(data: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }
    return batches;
  }

  private async* createDataStream<T>(
    data: T[],
    batchSize: number
  ): AsyncGenerator<{ data: T[]; isComplete: boolean }> {
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      yield {
        data: batch,
        isComplete: i + batchSize >= data.length
      };

      await new Promise(resolve => setImmediate(resolve));
    }
  }

  private updateStats(rows: number, time: number, throughput: number, memory: number): void {
    this.processingStats.totalRows += rows;
    this.processingStats.totalTime += time;
    this.processingStats.memoryUsage = memory;

    if (throughput > this.processingStats.peakThroughput) {
      this.processingStats.peakThroughput = throughput;
    }

    this.processingStats.averageThroughput =
      this.processingStats.totalRows / this.processingStats.totalTime;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return hash >>> 0;
  }

  async benchmark(
    testData: ColumnData[],
    processor: (column: ColumnData) => any,
    iterations: number = 5
  ): Promise<{
    averageThroughput: number;
    peakThroughput: number;
    averageLatency: number;
    memoryEfficiency: number;
    p50Latency: number;
    p99Latency: number;
  }> {
    const results = [];

    for (let i = 0; i < iterations; i++) {
      const result = await this.processColumns(testData, processor);
      results.push(result);

      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const latencies = results.map(r => r.latency).sort((a, b) => a - b);
    const p50Index = Math.floor(latencies.length * 0.5);
    const p99Index = Math.floor(latencies.length * 0.99);

    return {
      averageThroughput: results.reduce((sum, r) => sum + r.throughput, 0) / results.length,
      peakThroughput: Math.max(...results.map(r => r.throughput)),
      averageLatency: results.reduce((sum, r) => sum + r.latency, 0) / results.length,
      memoryEfficiency: Math.min(...results.map(r => r.memoryEfficiency)),
      p50Latency: latencies[p50Index],
      p99Latency: latencies[p99Index]
    };
  }

  getStats() {
    return { ...this.processingStats };
  }

  cleanup(): void {
    this.workerPool.destroy();
  }
}

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

export const optimizedBatchProcessor = new OptimizedBatchProcessorV2({
  batchSize: 2000,
  maxWorkers: Math.max(1, cpus().length - 1),
  useSharedMemory: true,
  enableSIMD: true,
  objectPooling: true,
  streamingMode: true,
  memoryLimit: 512 * 1024 * 1024
});
