#!/usr/bin/env node

import { OptimizedBatchProcessorV2 } from './batch-processor-v2';
import { ColumnData } from '../types/anchor.types';
import { performance } from 'perf_hooks';
import { cpus } from 'os';

const processor = new OptimizedBatchProcessorV2({
  batchSize: 1000,
  maxWorkers: Math.max(1, cpus().length - 1),
  useSharedMemory: true,
  enableSIMD: true,
  objectPooling: true,
  streamingMode: false,
  memoryLimit: 128 * 1024 * 1024
});

function generateTestData(rowCount: number): ColumnData[] {
  const columns: ColumnData[] = [];

  for (let i = 0; i < rowCount; i++) {
    const valueCount = 100;
    const values = Array.from({ length: valueCount }, () => Math.random() * 1000);

    columns.push({
      name: `column_${i}`,
      data_type: 'float64',
      values
    });
  }

  return columns;
}

function mockProcessor(column: ColumnData): any {
  return {
    name: column.name,
    hash: simpleHash(column.name + column.values.length),
    valueCount: column.values.length,
    processed: true
  };
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

async function runTest(testName: string, rowCount: number): Promise<{
  throughput: number;
  duration: number;
  memoryUsed: number;
}> {
  console.log(`\nTesting ${testName} (${rowCount.toLocaleString()} rows)...`);

  if (global.gc) global.gc();

  const initialMemory = process.memoryUsage().heapUsed;
  const testData = generateTestData(rowCount);

  const startTime = performance.now();
  await processor.processColumns(testData, mockProcessor);
  const endTime = performance.now();

  const duration = (endTime - startTime) / 1000;
  const throughput = rowCount / duration;
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryUsed = finalMemory - initialMemory;

  console.log(`  ✅ ${throughput.toFixed(0)} rows/sec (${duration.toFixed(3)}s)`);
  console.log(`  📊 Memory: ${(memoryUsed / 1024 / 1024).toFixed(1)}MB`);

  return { throughput, duration, memoryUsed };
}

async function main() {
  console.log('🚀 Optimized Batch Processor V2 - Quick Performance Test');
  console.log('=' .repeat(60));

  console.log(`\nSystem: ${cpus().length} cores, ${process.arch}, Node.js ${process.version}`);

  try {
    const tests = [
      { name: '1K rows', count: 1000 },
      { name: '10K rows', count: 10000 },
      { name: '50K rows', count: 50000 },
      { name: '100K rows', count: 100000 }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = await runTest(test.name, test.count);
        results.push({ ...result, testName: test.name, rowCount: test.count });
      } catch (error) {
        console.log(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      if (global.gc) global.gc();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📈 PERFORMANCE SUMMARY');
    console.log('='.repeat(60));

    if (results.length > 0) {
      const maxThroughput = Math.max(...results.map(r => r.throughput));
      const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;

      console.log(`Peak Throughput: ${maxThroughput.toFixed(0)} rows/sec`);
      console.log(`Average Throughput: ${avgThroughput.toFixed(0)} rows/sec`);

      if (maxThroughput >= 1000000) {
        console.log('\n🎉 SUCCESS: 1M+ rows/sec achieved!');
      } else if (maxThroughput >= 500000) {
        console.log(`\n🔥 Excellent: ${(maxThroughput/1000000*100).toFixed(1)}% of 1M target`);
      } else if (maxThroughput >= 250000) {
        console.log(`\n⚡ Good: ${(maxThroughput/1000000*100).toFixed(1)}% of 1M target`);
      } else {
        console.log(`\n⚠️  Needs improvement: ${(maxThroughput/1000000*100).toFixed(1)}% of 1M target`);
      }

      console.log('\nOptimization Assessment:');
      if (maxThroughput >= 226000) {
        const improvement = ((maxThroughput - 226000) / 226000 * 100);
        console.log(`✅ Improved by ${improvement.toFixed(1)}% over baseline (226K rows/sec)`);
      } else {
        console.log(`❌ Below baseline of 226K rows/sec`);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    processor.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { main as runQuickTest };