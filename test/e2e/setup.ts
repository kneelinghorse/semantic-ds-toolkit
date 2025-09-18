import { performance } from 'perf_hooks';

declare global {
  var __E2E_START_TIME__: number;
  var __E2E_PERFORMANCE_METRICS__: Array<{
    testName: string;
    duration: number;
    memoryUsage: NodeJS.MemoryUsage;
  }>;
}

global.__E2E_PERFORMANCE_METRICS__ = [];

beforeEach(() => {
  global.__E2E_START_TIME__ = performance.now();

  if (global.gc) {
    global.gc();
  }
});

afterEach(() => {
  const endTime = performance.now();
  const duration = endTime - global.__E2E_START_TIME__;
  const memoryUsage = process.memoryUsage();

  global.__E2E_PERFORMANCE_METRICS__.push({
    testName: expect.getState().currentTestName || 'unknown',
    duration,
    memoryUsage
  });
});

afterAll(() => {
  const totalTests = global.__E2E_PERFORMANCE_METRICS__.length;
  const avgDuration = global.__E2E_PERFORMANCE_METRICS__.reduce((sum, m) => sum + m.duration, 0) / totalTests;
  const maxMemory = Math.max(...global.__E2E_PERFORMANCE_METRICS__.map(m => m.memoryUsage.heapUsed));

  console.log('\n=== E2E Performance Summary ===');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);
  console.log(`Peak Memory Usage: ${(maxMemory / 1024 / 1024).toFixed(2)}MB`);
  console.log('===============================\n');
});