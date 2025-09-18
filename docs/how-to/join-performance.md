# How-to: Optimize Join Performance

*Task: Your semantic joins are too slow and you need better performance*

## Quick Wins

### 1. Enable Batch Processing
```typescript
import { BatchProcessor } from '@semantic-toolkit/anchor';

const batchProcessor = new BatchProcessor({
  batchSize: 5000,      // Process 5k records at a time
  maxConcurrency: 4,    // Use 4 CPU cores
  enableMemoryOptimization: true
});

// Before: Sequential processing (slow)
const results = await dataset.map(record => processRecord(record));

// After: Batch processing (fast)
const results = await batchProcessor.processBatches(dataset, processRecord);
```

### 2. Use Index-Based Matching
```typescript
import { HNSWIndex } from '@semantic-toolkit/anchor';

// Create index for fast similarity search
const index = new HNSWIndex({
  dimension: 64,        // Fingerprint dimension
  maxElements: 100000,  // Expected dataset size
  M: 16,               // Connectivity parameter
  efConstruction: 200  // Index quality
});

// Build index once
await index.buildIndex(anchors);

// Fast lookups
const matches = await index.findSimilar(queryAnchor, { topK: 10, threshold: 0.8 });
```

### 3. Cache Normalized Values
```typescript
import { CacheManager } from '@semantic-toolkit/anchor';

const cache = new CacheManager({
  maxSize: 10000,      // Cache 10k normalized values
  ttl: 3600000        // 1 hour TTL
});

class CachedNormalizer {
  normalize(value: string): string {
    const cached = cache.get(value);
    if (cached) return cached;

    const normalized = this.doNormalization(value);
    cache.set(value, normalized);
    return normalized;
  }
}
```

## Performance Monitoring

### Benchmark Your Joins
```typescript
import { PerformanceBenchmark } from '@semantic-toolkit/anchor';

const benchmark = new PerformanceBenchmark();

benchmark.measure('semantic_join', async () => {
  const result = await semanticJoin.join(leftDataset, rightDataset, {
    confidence_threshold: 0.8
  });
  return result;
});

// Results
console.log(benchmark.getResults());
// {
//   semantic_join: {
//     duration: 1250,     // ms
//     memory: 45.2,       // MB
//     throughput: 8000    // records/second
//   }
// }
```

### Set Performance Targets
```typescript
const performanceTargets = {
  small_dataset: {   // < 1k records
    maxDuration: 100,     // ms
    maxMemory: 10        // MB
  },
  medium_dataset: {  // 1k - 100k records
    maxDuration: 2000,   // ms
    maxMemory: 100      // MB
  },
  large_dataset: {   // > 100k records
    maxDuration: 30000,  // ms
    maxMemory: 500      // MB
  }
};

if (benchmark.duration > performanceTargets.medium_dataset.maxDuration) {
  console.warn('⚠️ Join performance below target!');
}
```

## Advanced Optimizations

### 1. Parallel Column Processing
```typescript
class ParallelJoinProcessor {
  async joinDatasets(leftDataset: any, rightDataset: any, options: any = {}) {
    const { confidence_threshold = 0.8, maxConcurrency = 4 } = options;

    // Process columns in parallel
    const columnPairs = this.findColumnPairs(leftDataset, rightDataset);

    const results = await Promise.all(
      this.chunk(columnPairs, maxConcurrency).map(async (chunk) => {
        return Promise.all(chunk.map(async ([leftCol, rightCol]) => {
          return this.processColumnPair(leftCol, rightCol, confidence_threshold);
        }));
      })
    );

    return this.mergeResults(results.flat(2));
  }

  private chunk(array: any[], size: number): any[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
```

### 2. Smart Sampling
```typescript
class SmartSampler {
  sampleForJoin(dataset: any[], maxSampleSize: number = 10000): any[] {
    if (dataset.length <= maxSampleSize) {
      return dataset;
    }

    // Use stratified sampling to maintain data distribution
    const sampleSize = Math.min(maxSampleSize, Math.ceil(dataset.length * 0.1));

    // Sample diverse records (avoid consecutive records)
    const step = Math.floor(dataset.length / sampleSize);
    const sample = [];

    for (let i = 0; i < dataset.length && sample.length < sampleSize; i += step) {
      sample.push(dataset[i]);
    }

    return sample;
  }

  // Use sample for initial matching, then verify with full dataset
  async optimizedJoin(leftDataset: any[], rightDataset: any[], options: any = {}) {
    const leftSample = this.sampleForJoin(leftDataset);
    const rightSample = this.sampleForJoin(rightDataset);

    // Quick join on samples to find promising pairs
    const sampleMatches = await this.quickJoin(leftSample, rightSample, {
      ...options,
      confidence_threshold: options.confidence_threshold - 0.1 // Lower threshold for sampling
    });

    // Verify promising pairs on full dataset
    const verifiedMatches = await this.verifyMatches(
      leftDataset,
      rightDataset,
      sampleMatches,
      options
    );

    return verifiedMatches;
  }
}
```

### 3. Memory-Efficient Processing
```typescript
class MemoryEfficientJoiner {
  async streamingJoin(leftDataset: any[], rightDataset: any[], options: any = {}) {
    const { batchSize = 1000 } = options;

    // Process in streaming fashion to avoid loading everything into memory
    let results = [];

    for (let i = 0; i < leftDataset.length; i += batchSize) {
      const leftBatch = leftDataset.slice(i, i + batchSize);

      for (let j = 0; j < rightDataset.length; j += batchSize) {
        const rightBatch = rightDataset.slice(j, j + batchSize);

        const batchResults = await this.joinBatch(leftBatch, rightBatch, options);
        results = results.concat(batchResults);

        // Optional: Force garbage collection for long-running processes
        if (global.gc && (i + j) % (batchSize * 10) === 0) {
          global.gc();
        }
      }
    }

    return results;
  }
}
```

## Database-Specific Optimizations

### PostgreSQL
```typescript
class PostgreSQLOptimizer {
  async optimizeForPostgreSQL(joinQuery: string) {
    // Create temporary indexes for join columns
    await this.db.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS temp_left_join_idx
      ON left_table USING btree (normalized_email);
    `);

    await this.db.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS temp_right_join_idx
      ON right_table USING btree (normalized_email);
    `);

    // Use window functions for fuzzy matching
    const optimizedQuery = `
      WITH similarity_scores AS (
        SELECT
          l.*,
          r.*,
          similarity(l.normalized_name, r.normalized_name) as name_score
        FROM left_table l
        CROSS JOIN right_table r
        WHERE similarity(l.normalized_email, r.normalized_email) > 0.8
      )
      SELECT * FROM similarity_scores
      WHERE name_score > 0.7
      ORDER BY name_score DESC;
    `;

    return this.db.query(optimizedQuery);
  }
}
```

### Snowflake
```typescript
class SnowflakeOptimizer {
  async optimizeForSnowflake(leftTable: string, rightTable: string) {
    // Use clustering keys for join performance
    await this.db.query(`
      ALTER TABLE ${leftTable}
      CLUSTER BY (normalized_email, normalized_name);
    `);

    // Use semi-structured data for fuzzy matching
    const query = `
      SELECT
        l.*,
        r.*,
        JAROWINKLER_SIMILARITY(l.name, r.name) as similarity_score
      FROM ${leftTable} l
      JOIN ${rightTable} r
        ON JAROWINKLER_SIMILARITY(l.email, r.email) > 0.9
      WHERE JAROWINKLER_SIMILARITY(l.name, r.name) > 0.8
      ORDER BY similarity_score DESC;
    `;

    return this.db.query(query);
  }
}
```

## Real-World Performance Examples

### E-commerce Customer Matching
```typescript
// Before optimization: 45 seconds for 100k customers
class SlowCustomerMatcher {
  async match(customers: any[], orders: any[]) {
    const results = [];
    for (const customer of customers) {
      for (const order of orders) {
        if (this.isMatch(customer, order)) {
          results.push({ customer, order });
        }
      }
    }
    return results; // O(n²) - very slow!
  }
}

// After optimization: 3 seconds for 100k customers
class FastCustomerMatcher {
  constructor() {
    this.emailIndex = new Map();
    this.phoneIndex = new Map();
    this.batchProcessor = new BatchProcessor({ batchSize: 5000 });
  }

  async match(customers: any[], orders: any[]) {
    // Build indexes once
    this.buildIndexes(customers);

    // Process orders in batches
    return this.batchProcessor.processBatches(orders, (orderBatch) => {
      return orderBatch.map(order => {
        const customer = this.findCustomer(order);
        return customer ? { customer, order } : null;
      }).filter(Boolean);
    });
  }

  private buildIndexes(customers: any[]) {
    customers.forEach(customer => {
      this.emailIndex.set(customer.email, customer);
      this.phoneIndex.set(customer.phone, customer);
    });
  }

  private findCustomer(order: any) {
    return this.emailIndex.get(order.customer_email) ||
           this.phoneIndex.get(order.customer_phone);
  }
}
```

### Financial Transaction Matching
```typescript
class TransactionMatcher {
  async matchTransactions(bankData: any[], cardData: any[]) {
    const matcher = new OptimizedMatcher({
      // Index by amount ranges for faster lookup
      indexingStrategy: 'amount_range',

      // Use temporal indexing for date-based matching
      temporalWindow: '±2 days',

      // Pre-filter obvious non-matches
      preFilters: [
        (bank, card) => Math.abs(bank.amount - card.amount) < 0.01,
        (bank, card) => Math.abs(bank.date - card.date) < 2 * 24 * 60 * 60 * 1000
      ]
    });

    return matcher.match(bankData, cardData);
  }
}
```

## Performance Troubleshooting

### Common Bottlenecks
```typescript
class PerformanceProfiler {
  profile(joinFunction: Function) {
    const profiler = new Profiler();

    profiler.start('total_join_time');

    profiler.start('data_loading');
    // ... data loading code
    profiler.end('data_loading');

    profiler.start('normalization');
    // ... normalization code
    profiler.end('normalization');

    profiler.start('matching');
    // ... matching code
    profiler.end('matching');

    profiler.start('result_aggregation');
    // ... result processing
    profiler.end('result_aggregation');

    profiler.end('total_join_time');

    return profiler.getReport();
  }
}

// Typical bottleneck analysis:
// 1. Data loading: 10% (optimize I/O)
// 2. Normalization: 30% (cache normalized values)
// 3. Matching: 50% (use indexing/approximation)
// 4. Result aggregation: 10% (stream results)
```

### Memory Usage Optimization
```typescript
class MemoryMonitor {
  trackMemoryUsage(operation: string, fn: Function) {
    const beforeMem = process.memoryUsage();
    const result = fn();
    const afterMem = process.memoryUsage();

    console.log(`${operation} memory usage:`);
    console.log(`  Heap used: ${(afterMem.heapUsed - beforeMem.heapUsed) / 1024 / 1024} MB`);
    console.log(`  External: ${(afterMem.external - beforeMem.external) / 1024 / 1024} MB`);

    return result;
  }
}
```

## Performance Targets by Dataset Size

| Dataset Size | Target Time | Memory Limit | Recommended Strategy |
|--------------|-------------|--------------|---------------------|
| < 1K records | < 100ms | < 10MB | Direct matching |
| 1K - 10K | < 1s | < 50MB | Batch processing |
| 10K - 100K | < 10s | < 200MB | Indexing + batching |
| 100K - 1M | < 60s | < 1GB | Sampling + verification |
| > 1M | < 300s | < 2GB | Distributed processing |

## Related Guides

- [Handle Large Datasets](large-datasets.md)
- [Distributed Processing](distributed-joins.md)
- [Database Integration](database-integration.md)
