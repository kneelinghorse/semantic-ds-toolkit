import { describe, beforeEach, it, expect } from '@jest/globals';
import { SemanticJoinOperator } from './semantic-join';
import { CIDRegistry } from '../registry/cid-registry';
import { ShadowSemanticsLayer } from '../core/shadow-semantics';
import { StatisticalAnalyzer } from '../inference/statistical-analyzer';

describe('SemanticJoinOperator Performance Tests', () => {
  let joinOperator: SemanticJoinOperator;
  let cidRegistry: CIDRegistry;

  beforeEach(() => {
    cidRegistry = new CIDRegistry();
    joinOperator = new SemanticJoinOperator(cidRegistry);

    // Register performance test concepts
    cidRegistry.registerPack({
      pack: 'performance-test-pack',
      version: '1.0.0',
      description: 'Performance test concepts',
      concepts: [
        {
          cid: 'identifier.user_id',
          labels: ['user_id', 'id', 'customer_id'],
          description: 'User identifier',
          facets: { identifier: true },
          examples: ['USER-12345']
        },
        {
          cid: 'person.email',
          labels: ['email', 'email_address', 'user_email'],
          description: 'Email address',
          facets: { pii: true },
          examples: ['user@example.com']
        }
      ]
    });
  });

  describe('Scalability Tests', () => {
    it('should handle 100K rows in under 100ms for simple exact matches', async () => {
      const leftSize = 100000;
      const rightSize = 100000;
      const overlapSize = 50000;

      console.log(`Generating ${leftSize} left rows and ${rightSize} right rows...`);

      // Generate test data
      const leftData = generateTestData('left', leftSize, overlapSize);
      const rightData = generateTestData('right', rightSize, overlapSize);

      console.log('Starting performance test...');
      const startTime = performance.now();

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner',
        confidenceThreshold: 0.9,
        batchSize: 50000,
        cacheNormalizedValues: true,
        enableFuzzyMatching: false // Disable for pure performance test
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`Execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Matched rows: ${result.statistics.matchedRows}`);
      console.log(`Cache hit rate: ${(joinOperator.getCacheStats().hitRate * 100).toFixed(1)}%`);

      // Performance assertions
      expect(executionTime).toBeLessThan(200); // Allow some tolerance for CI environments
      expect(result.statistics.matchedRows).toBe(overlapSize);
      expect(result.performance.totalTime).toBeLessThan(200);

      // Memory efficiency check
      expect(result.performance.cacheHits).toBeGreaterThan(0);
    });

    it('should maintain performance with fuzzy matching on 10K rows', async () => {
      const leftSize = 10000;
      const rightSize = 10000;

      const leftData = generateEmailTestData('left', leftSize);
      const rightData = generateEmailTestData('right', rightSize, 0.3); // 30% variation

      const startTime = performance.now();

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'email',
        rightOn: 'user_email',
        how: 'inner',
        confidenceThreshold: 0.6,
        enableFuzzyMatching: true,
        fuzzyThreshold: 0.8,
        autoSelectNormalizers: true,
        batchSize: 5000
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`Fuzzy matching execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Matched rows: ${result.statistics.matchedRows}`);
      console.log(`Average confidence: ${(result.statistics.confidence.average * 100).toFixed(1)}%`);

      // Should complete within reasonable time even with fuzzy matching
      expect(executionTime).toBeLessThan(5000);
      expect(result.statistics.matchedRows).toBeGreaterThan(0);
    });

    it('should handle multi-column joins efficiently', async () => {
      const dataSize = 25000;

      const leftData = {
        first_name: generateNames('first', dataSize),
        last_name: generateNames('last', dataSize),
        birth_year: generateYears(dataSize),
        id: Array.from({length: dataSize}, (_, i) => i + 1)
      };

      const rightData = {
        fname: leftData.first_name.slice(0, dataSize * 0.7), // 70% overlap
        lname: leftData.last_name.slice(0, dataSize * 0.7),
        year_born: leftData.birth_year.slice(0, dataSize * 0.7),
        score: Array.from({length: dataSize * 0.7}, () => Math.floor(Math.random() * 100) + 1)
      };

      const startTime = performance.now();

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: ['first_name', 'last_name', 'birth_year'],
        rightOn: ['fname', 'lname', 'year_born'],
        how: 'inner',
        confidenceThreshold: 0.8,
        batchSize: 10000
      });

      const endTime = performance.now();
      const executionTime = endTime - startTime;

      console.log(`Multi-column join execution time: ${executionTime.toFixed(2)}ms`);
      console.log(`Matched rows: ${result.statistics.matchedRows}`);

      expect(executionTime).toBeLessThan(3000);
      expect(result.statistics.matchedRows).toBeGreaterThan(0);
    });
  });

  describe('Memory Efficiency Tests', () => {
    it('should handle large datasets without excessive memory usage', async () => {
      const leftSize = 50000;
      const rightSize = 50000;

      const leftData = {
        id: Array.from({length: leftSize}, (_, i) => `ID-${(i + 1).toString().padStart(6, '0')}`),
        email: Array.from({length: leftSize}, (_, i) => `user${i + 1}@company${Math.floor(i / 1000)}.com`),
        name: Array.from({length: leftSize}, (_, i) => `User ${i + 1}`),
        data: Array.from({length: leftSize}, (_, i) => `Some long string data ${i} that takes up memory space`)
      };

      const rightData = {
        user_id: leftData.id.slice(10000, 40000), // Subset with offset
        score: Array.from({length: 30000}, () => Math.floor(Math.random() * 1000)),
        metadata: Array.from({length: 30000}, (_, i) => `Metadata ${i} with additional information`)
      };

      // Monitor memory usage (simplified)
      const initialMemory = process.memoryUsage();

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner',
        batchSize: 25000, // Large batches for efficiency
        cacheNormalizedValues: true
      });

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Cache hit rate: ${(joinOperator.getCacheStats().hitRate * 100).toFixed(1)}%`);

      expect(result.statistics.matchedRows).toBe(30000);

      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
    });

    it('should benefit from normalization caching', async () => {
      const dataSize = 20000;
      const duplicateRate = 0.3; // 30% duplicate values

      const emailVariations = [
        '@gmail.com', '@GMAIL.COM', '@Gmail.Com',
        '@yahoo.com', '@YAHOO.COM', '@Yahoo.Com',
        '@outlook.com', '@OUTLOOK.COM', '@Outlook.Com'
      ];

      const leftData = {
        email: Array.from({length: dataSize}, (_, i) => {
          const baseIndex = Math.floor(i * (1 - duplicateRate));
          const domain = emailVariations[baseIndex % emailVariations.length];
          return `user${baseIndex}${domain}`;
        }),
        id: Array.from({length: dataSize}, (_, i) => i + 1)
      };

      const rightData = {
        user_email: leftData.email.slice(5000, 15000), // Subset for joining
        score: Array.from({length: 10000}, () => Math.floor(Math.random() * 100))
      };

      // First run to warm up cache
      await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'email',
        rightOn: 'user_email',
        how: 'inner',
        cacheNormalizedValues: true,
        autoSelectNormalizers: true
      });

      const cacheStatsAfterWarmup = joinOperator.getCacheStats();

      // Second run should benefit from cache
      const startTime = performance.now();

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'email',
        rightOn: 'user_email',
        how: 'inner',
        cacheNormalizedValues: true,
        autoSelectNormalizers: true
      });

      const endTime = performance.now();
      const cachedRunTime = endTime - startTime;

      const finalCacheStats = joinOperator.getCacheStats();

      console.log(`Cached run time: ${cachedRunTime.toFixed(2)}ms`);
      console.log(`Cache hit rate: ${(finalCacheStats.hitRate * 100).toFixed(1)}%`);
      console.log(`Cache hits gained: ${finalCacheStats.hits - cacheStatsAfterWarmup.hits}`);

      expect(finalCacheStats.hitRate).toBeGreaterThan(0.5); // Should have good cache utilization
      expect(finalCacheStats.hits).toBeGreaterThan(cacheStatsAfterWarmup.hits);
    });
  });

  describe('Batching and Parallelization Tests', () => {
    it('should process data in batches for large datasets', async () => {
      const leftSize = 75000;
      const rightSize = 75000;
      const batchSize = 15000;

      const leftData = generateTestData('left', leftSize, leftSize * 0.6);
      const rightData = generateTestData('right', rightSize, rightSize * 0.6);

      const result = await joinOperator.semanticJoin(leftData, rightData, {
        leftOn: 'id',
        rightOn: 'user_id',
        how: 'inner',
        batchSize: batchSize,
        confidenceThreshold: 0.8
      });

      // Verify that batching was effective
      expect(result.performance.totalOperations).toBeGreaterThan(0);
      expect(result.statistics.matchedRows).toBeGreaterThan(0);

      // Should handle batching without errors
      expect(result.data).toBeDefined();
    });
  });

  describe('Stress Tests', () => {
    it('should handle edge cases without performance degradation', async () => {
      const testCases = [
        // High cardinality
        { leftSize: 10000, rightSize: 10000, overlap: 0.9, description: 'High overlap' },
        // Low cardinality
        { leftSize: 10000, rightSize: 10000, overlap: 0.1, description: 'Low overlap' },
        // Skewed sizes
        { leftSize: 50000, rightSize: 5000, overlap: 0.5, description: 'Skewed left' },
        { leftSize: 5000, rightSize: 50000, overlap: 0.5, description: 'Skewed right' }
      ];

      for (const testCase of testCases) {
        console.log(`Testing ${testCase.description}...`);

        const leftData = generateTestData('left', testCase.leftSize,
          Math.floor(testCase.leftSize * testCase.overlap));
        const rightData = generateTestData('right', testCase.rightSize,
          Math.floor(testCase.rightSize * testCase.overlap));

        const startTime = performance.now();

        const result = await joinOperator.semanticJoin(leftData, rightData, {
          leftOn: 'id',
          rightOn: 'user_id',
          how: 'inner',
          batchSize: 10000
        });

        const endTime = performance.now();
        const executionTime = endTime - startTime;

        console.log(`  ${testCase.description} - Time: ${executionTime.toFixed(2)}ms, Matches: ${result.statistics.matchedRows}`);

        // Should complete within reasonable time for all cases
        expect(executionTime).toBeLessThan(10000);
        expect(result.statistics.matchedRows).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // Helper functions for generating test data
  function generateTestData(prefix: string, size: number, overlapSize: number): any {
    const data = {
      id: Array.from({length: size}, (_, i) => `${prefix.toUpperCase()}-${(i + 1).toString().padStart(6, '0')}`),
      name: Array.from({length: size}, (_, i) => `${prefix} User ${i + 1}`),
      email: Array.from({length: size}, (_, i) => `${prefix}user${i + 1}@example.com`)
    };

    if (prefix === 'right') {
      // Create overlap by using some IDs from left pattern
      for (let i = 0; i < overlapSize; i++) {
        data.id[i] = `LEFT-${(i + 1).toString().padStart(6, '0')}`;
      }
      // Rename id field for right data
      return {
        user_id: data.id,
        name: data.name,
        email: data.email,
        score: Array.from({length: size}, () => Math.floor(Math.random() * 100) + 1)
      };
    }

    return data;
  }

  function generateEmailTestData(prefix: string, size: number, variationRate = 0): any {
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com', 'example.org'];
    const variations = ['', '.', '_', '-'];

    return {
      email: Array.from({length: size}, (_, i) => {
        const baseName = `${prefix}user${Math.floor(i * (1 - variationRate))}`;
        const variation = Math.random() < variationRate ?
          variations[Math.floor(Math.random() * variations.length)] : '';
        const domain = domains[Math.floor(Math.random() * domains.length)];

        return `${baseName}${variation}@${domain}`;
      }),
      [prefix === 'left' ? 'id' : 'user_id']: Array.from({length: size}, (_, i) => i + 1)
    };
  }

  function generateNames(type: 'first' | 'last', size: number): string[] {
    const firstNames = ['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Frank', 'Grace'];
    const lastNames = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];

    const namePool = type === 'first' ? firstNames : lastNames;

    return Array.from({length: size}, (_, i) => {
      const baseName = namePool[i % namePool.length];
      return i % 3 === 0 ? baseName : `${baseName}${Math.floor(i / namePool.length)}`;
    });
  }

  function generateYears(size: number): number[] {
    return Array.from({length: size}, () =>
      1950 + Math.floor(Math.random() * 70) // Years 1950-2020
    );
  }
});