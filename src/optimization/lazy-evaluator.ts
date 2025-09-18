import { ColumnData, StableColumnAnchor, ColumnFingerprint } from '../types/anchor.types';

type LazyValue<T> = () => T;
type LazyPromise<T> = () => Promise<T>;

interface ComputationContext {
  priority: 'high' | 'medium' | 'low';
  timeout?: number;
  dependencies?: string[];
  cacheable?: boolean;
  retryAttempts?: number;
}

interface ComputationNode<T> {
  id: string;
  computation: LazyValue<T> | LazyPromise<T>;
  context: ComputationContext;
  state: 'pending' | 'running' | 'completed' | 'failed';
  result?: T;
  error?: Error;
  dependencies: Set<string>;
  dependents: Set<string>;
  startTime?: number;
  endTime?: number;
}

interface BatchComputationJob {
  id: string;
  computations: string[];
  priority: 'high' | 'medium' | 'low';
  parallelism: number;
  state: 'queued' | 'running' | 'completed' | 'failed';
}

export class LazyEvaluator {
  private computations = new Map<string, ComputationNode<any>>();
  private evaluationQueue: string[] = [];
  private runningComputations = new Set<string>();
  private batchJobs = new Map<string, BatchComputationJob>();
  private maxConcurrency: number;
  private resultCache = new Map<string, { value: any; timestamp: number; ttl?: number }>();

  constructor(maxConcurrency: number = 10) {
    this.maxConcurrency = maxConcurrency;
  }

  // Register a lazy computation
  lazy<T>(
    id: string,
    computation: LazyValue<T> | LazyPromise<T>,
    context: ComputationContext = { priority: 'medium' }
  ): LazyComputation<T> {
    const node: ComputationNode<T> = {
      id,
      computation,
      context,
      state: 'pending',
      dependencies: new Set(),
      dependents: new Set()
    };

    // Handle dependencies
    if (context.dependencies) {
      context.dependencies.forEach(depId => {
        node.dependencies.add(depId);
        const depNode = this.computations.get(depId);
        if (depNode) {
          depNode.dependents.add(id);
        }
      });
    }

    this.computations.set(id, node);
    return new LazyComputation(this, id);
  }

  // Lazy column fingerprinting
  lazyFingerprint(
    columnId: string,
    column: ColumnData,
    fingerprintFn: (col: ColumnData) => ColumnFingerprint
  ): LazyComputation<ColumnFingerprint> {
    return this.lazy(
      `fingerprint:${columnId}`,
      () => fingerprintFn(column),
      {
        priority: 'high',
        cacheable: true,
        timeout: 5000
      }
    );
  }

  // Lazy anchor creation
  lazyAnchor(
    anchorId: string,
    datasetName: string,
    column: ColumnData,
    anchorFn: (dataset: string, col: ColumnData) => StableColumnAnchor
  ): LazyComputation<StableColumnAnchor> {
    const fingerprintId = `fingerprint:${anchorId}`;

    return this.lazy(
      `anchor:${anchorId}`,
      () => anchorFn(datasetName, column),
      {
        priority: 'medium',
        dependencies: [fingerprintId],
        cacheable: true,
        timeout: 10000
      }
    );
  }

  // Lazy batch processing
  lazyBatch<T>(
    batchId: string,
    items: any[],
    processFn: (batch: any[]) => T[],
    batchSize: number = 100
  ): LazyComputation<T[]> {
    return this.lazy(
      `batch:${batchId}`,
      () => {
        const results: T[] = [];
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const batchResults = processFn(batch);
          results.push(...batchResults);
        }
        return results;
      },
      {
        priority: 'low',
        cacheable: true,
        timeout: 60000
      }
    );
  }

  // Execute a specific computation
  async evaluate<T>(computationId: string): Promise<T> {
    const node = this.computations.get(computationId);
    if (!node) {
      throw new Error(`Computation ${computationId} not found`);
    }

    if (node.state === 'completed') {
      return node.result as T;
    }

    if (node.state === 'failed') {
      throw node.error || new Error(`Computation ${computationId} failed`);
    }

    if (node.state === 'running') {
      // Wait for completion
      return this.waitForCompletion(computationId);
    }

    // Check cache first
    if (node.context.cacheable) {
      const cached = this.getCachedResult(computationId);
      if (cached !== undefined) {
        node.result = cached;
        node.state = 'completed';
        return cached as T;
      }
    }

    // Ensure dependencies are satisfied
    await this.resolveDependencies(computationId);

    // Execute the computation
    return this.executeComputation(computationId);
  }

  private async resolveDependencies(computationId: string): Promise<void> {
    const node = this.computations.get(computationId);
    if (!node) return;

    const depPromises = Array.from(node.dependencies).map(depId =>
      this.evaluate(depId)
    );

    await Promise.all(depPromises);
  }

  private async executeComputation<T>(computationId: string): Promise<T> {
    const node = this.computations.get(computationId) as ComputationNode<T>;
    if (!node) {
      throw new Error(`Computation ${computationId} not found`);
    }

    if (this.runningComputations.size >= this.maxConcurrency) {
      await this.waitForSlot();
    }

    node.state = 'running';
    node.startTime = Date.now();
    this.runningComputations.add(computationId);

    try {
      const result = await this.executeWithTimeout(node);

      node.result = result;
      node.state = 'completed';
      node.endTime = Date.now();

      // Cache result if configured
      if (node.context.cacheable) {
        this.cacheResult(computationId, result);
      }

      return result;
    } catch (error) {
      node.error = error as Error;
      node.state = 'failed';
      node.endTime = Date.now();

      // Retry logic
      if (node.context.retryAttempts && node.context.retryAttempts > 0) {
        node.context.retryAttempts--;
        node.state = 'pending';
        return this.executeComputation(computationId);
      }

      throw error;
    } finally {
      this.runningComputations.delete(computationId);
    }
  }

  private async executeWithTimeout<T>(node: ComputationNode<T>): Promise<T> {
    const computation = node.computation;
    const timeout = node.context.timeout;

    if (!timeout) {
      return this.isPromiseFunction(computation) ?
        await (computation as LazyPromise<T>)() :
        (computation as LazyValue<T>)();
    }

    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Computation ${node.id} timed out after ${timeout}ms`));
      }, timeout);

      const execute = async () => {
        try {
          const result = this.isPromiseFunction(computation) ?
            await (computation as LazyPromise<T>)() :
            (computation as LazyValue<T>)();

          clearTimeout(timeoutHandle);
          resolve(result);
        } catch (error) {
          clearTimeout(timeoutHandle);
          reject(error);
        }
      };

      execute();
    });
  }

  private isPromiseFunction(fn: any): boolean {
    const result = fn.constructor.name === 'AsyncFunction' ||
                  fn.toString().includes('async') ||
                  fn.toString().includes('Promise');
    return result;
  }

  private async waitForCompletion<T>(computationId: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const checkCompletion = () => {
        const node = this.computations.get(computationId);
        if (!node) {
          reject(new Error(`Computation ${computationId} not found`));
          return;
        }

        if (node.state === 'completed') {
          resolve(node.result as T);
        } else if (node.state === 'failed') {
          reject(node.error || new Error(`Computation ${computationId} failed`));
        } else {
          setTimeout(checkCompletion, 10);
        }
      };

      checkCompletion();
    });
  }

  private async waitForSlot(): Promise<void> {
    return new Promise(resolve => {
      const checkSlot = () => {
        if (this.runningComputations.size < this.maxConcurrency) {
          resolve();
        } else {
          setTimeout(checkSlot, 10);
        }
      };
      checkSlot();
    });
  }

  private getCachedResult(computationId: string): any {
    const cached = this.resultCache.get(computationId);
    if (!cached) return undefined;

    // Check TTL
    if (cached.ttl && Date.now() > cached.timestamp + cached.ttl) {
      this.resultCache.delete(computationId);
      return undefined;
    }

    return cached.value;
  }

  private cacheResult(computationId: string, result: any, ttl?: number): void {
    this.resultCache.set(computationId, {
      value: result,
      timestamp: Date.now(),
      ttl
    });
  }

  // Batch evaluation for improved performance
  async evaluateBatch(computationIds: string[]): Promise<Map<string, any>> {
    const batchId = `batch_${Date.now()}`;
    const job: BatchComputationJob = {
      id: batchId,
      computations: computationIds,
      priority: 'medium',
      parallelism: Math.min(computationIds.length, this.maxConcurrency),
      state: 'queued'
    };

    this.batchJobs.set(batchId, job);

    try {
      job.state = 'running';

      // Group computations by dependencies for optimal execution order
      const sortedIds = this.topologicalSort(computationIds);
      const results = new Map<string, any>();

      // Execute in parallel batches respecting dependencies
      for (let i = 0; i < sortedIds.length; i += job.parallelism) {
        const batch = sortedIds.slice(i, i + job.parallelism);
        const batchPromises = batch.map(async id => {
          try {
            const result = await this.evaluate(id);
            return { id, result, error: null };
          } catch (error) {
            return { id, result: null, error };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(({ id, result, error }) => {
          if (error) {
            results.set(id, { error });
          } else {
            results.set(id, result);
          }
        });
      }

      job.state = 'completed';
      return results;
    } catch (error) {
      job.state = 'failed';
      throw error;
    }
  }

  // Topological sort for dependency-aware execution
  private topologicalSort(computationIds: string[]): string[] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (recursionStack.has(id)) {
        throw new Error(`Circular dependency detected involving ${id}`);
      }

      if (visited.has(id)) {
        return;
      }

      visited.add(id);
      recursionStack.add(id);

      const node = this.computations.get(id);
      if (node) {
        node.dependencies.forEach(depId => {
          if (computationIds.includes(depId)) {
            visit(depId);
          }
        });
      }

      recursionStack.delete(id);
      result.push(id);
    };

    computationIds.forEach(id => {
      if (!visited.has(id)) {
        visit(id);
      }
    });

    return result;
  }

  // Cleanup and resource management
  cleanup(olderThanMs: number = 3600000): void { // Default 1 hour
    const cutoff = Date.now() - olderThanMs;

    // Clean completed computations
    for (const [id, node] of this.computations.entries()) {
      if (node.state === 'completed' && node.endTime && node.endTime < cutoff) {
        this.computations.delete(id);
      }
    }

    // Clean cache entries
    for (const [id, cached] of this.resultCache.entries()) {
      if (cached.timestamp < cutoff) {
        this.resultCache.delete(id);
      }
    }

    // Clean batch jobs
    for (const [id, job] of this.batchJobs.entries()) {
      if (job.state === 'completed' || job.state === 'failed') {
        this.batchJobs.delete(id);
      }
    }
  }

  getStats(): {
    totalComputations: number;
    completedComputations: number;
    failedComputations: number;
    runningComputations: number;
    cacheSize: number;
    averageExecutionTime: number;
  } {
    let completed = 0;
    let failed = 0;
    let totalExecutionTime = 0;

    for (const node of this.computations.values()) {
      if (node.state === 'completed') {
        completed++;
        if (node.startTime && node.endTime) {
          totalExecutionTime += node.endTime - node.startTime;
        }
      } else if (node.state === 'failed') {
        failed++;
      }
    }

    return {
      totalComputations: this.computations.size,
      completedComputations: completed,
      failedComputations: failed,
      runningComputations: this.runningComputations.size,
      cacheSize: this.resultCache.size,
      averageExecutionTime: completed > 0 ? totalExecutionTime / completed : 0
    };
  }
}

export class LazyComputation<T> {
  constructor(
    private evaluator: LazyEvaluator,
    private computationId: string
  ) {}

  async getValue(): Promise<T> {
    return this.evaluator.evaluate<T>(this.computationId);
  }

  // Transform the computation
  map<U>(fn: (value: T) => U): LazyComputation<U> {
    const newId = `${this.computationId}:map:${Date.now()}`;
    return this.evaluator.lazy<U>(
      newId,
      async () => {
        const value = await this.getValue();
        return fn(value);
      },
      {
        priority: 'medium',
        dependencies: [this.computationId],
        cacheable: true
      }
    );
  }

  // Chain computations
  flatMap<U>(fn: (value: T) => LazyComputation<U>): LazyComputation<U> {
    const newId = `${this.computationId}:flatMap:${Date.now()}`;
    return this.evaluator.lazy<U>(
      newId,
      async () => {
        const value = await this.getValue();
        const nextComputation = fn(value);
        return nextComputation.getValue();
      },
      {
        priority: 'medium',
        dependencies: [this.computationId],
        cacheable: true
      }
    );
  }

  // Combine with another computation
  combine<U, V>(
    other: LazyComputation<U>,
    combiner: (a: T, b: U) => V
  ): LazyComputation<V> {
    const newId = `${this.computationId}:combine:${Date.now()}`;
    return this.evaluator.lazy<V>(
      newId,
      async () => {
        const [valueA, valueB] = await Promise.all([
          this.getValue(),
          other.getValue()
        ]);
        return combiner(valueA, valueB);
      },
      {
        priority: 'medium',
        dependencies: [this.computationId],
        cacheable: true
      }
    );
  }
}

// Global lazy evaluator instance
export const globalLazyEvaluator = new LazyEvaluator(20);
