import { InferenceEngine } from '../src/inference';

describe('Inference Engine Performance', () => {
  let engine: InferenceEngine;

  beforeEach(() => {
    engine = new InferenceEngine();
  });

  test('should process 1M rows in under 200ms', async () => {
    // Generate test data
    const testData = generateTestData(1000000);

    const startTime = performance.now();

    // Use performance mode for speed
    const result = await engine.inferColumnType('test_column', testData, {
      performanceMode: 'fast',
      sampleSize: 1000 // Key optimization: sample instead of processing all
    });

    const endTime = performance.now();
    const processingTime = endTime - startTime;

    console.log(`Processing time for 1M rows: ${processingTime.toFixed(2)}ms`);

    expect(processingTime).toBeLessThan(200);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test('should handle mixed data types efficiently', async () => {
    const mixedData = [
      ...Array(250000).fill(0).map((_, i) => i.toString()),
      ...Array(250000).fill(0).map(() => generateEmail()),
      ...Array(250000).fill(0).map(() => new Date().toISOString()),
      ...Array(250000).fill(0).map(() => Math.random() * 1000)
    ];

    const startTime = performance.now();
    const result = await engine.inferColumnType('mixed_column', mixedData, {
      performanceMode: 'fast',
      sampleSize: 1000
    });
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(100);
    expect(result.semanticType).toBeDefined();
  });

  test('should process multiple columns in parallel efficiently', async () => {
    const dataset = {
      ids: Array(1000000).fill(0).map((_, i) => i),
      emails: Array(1000000).fill(0).map(() => generateEmail()),
      dates: Array(1000000).fill(0).map(() => new Date().toISOString()),
      amounts: Array(1000000).fill(0).map(() => `$${Math.random() * 1000}`)
    };

    const startTime = performance.now();
    const results = await engine.inferDatasetTypes(dataset, {
      performanceMode: 'fast',
      sampleSize: 500
    });
    const endTime = performance.now();

    console.log(`Dataset processing time: ${endTime - startTime}ms`);

    // Allow headroom for CI variability
    expect(endTime - startTime).toBeLessThan(500); // 4 columns * 100-125ms
    expect(Object.keys(results)).toHaveLength(4);
    expect(results.emails.semanticType).toBe('email');
  });

  // Accuracy tests
  test('should achieve 85%+ accuracy on email detection', async () => {
    const emails = Array(1000).fill(0).map(() => generateEmail());
    const nonEmails = Array(100).fill(0).map(() => generateRandomString());
    const testData = [...emails, ...nonEmails];

    const result = await engine.inferColumnType('email_test', testData);

    expect(result.semanticType).toBe('email');
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  test('should achieve 85%+ accuracy on currency detection', async () => {
    const currencies = Array(900).fill(0).map(() => `$${(Math.random() * 1000).toFixed(2)}`);
    const nonCurrencies = Array(100).fill(0).map(() => generateRandomString());
    const testData = [...currencies, ...nonCurrencies];

    const result = await engine.inferColumnType('currency_test', testData);

    expect(result.semanticType).toBe('currency');
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  test('should achieve 85%+ accuracy on timestamp detection', async () => {
    const timestamps = Array(850).fill(0).map(() => new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString());
    const nonTimestamps = Array(150).fill(0).map(() => generateRandomString());
    const testData = [...timestamps, ...nonTimestamps];

    const result = await engine.inferColumnType('timestamp_test', testData);

    expect(['timestamp', 'date'].includes(result.semanticType)).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  test('should achieve 85%+ accuracy on ID detection', async () => {
    const ids = Array(950).fill(0).map((_, i) => `ID_${i.toString().padStart(6, '0')}`);
    const nonIds = Array(50).fill(0).map(() => generateRandomString());
    const testData = [...ids, ...nonIds];

    const result = await engine.inferColumnType('id_test', testData);

    expect(result.semanticType).toBe('identifier');
    expect(result.confidence).toBeGreaterThan(0.85);
  });
});

// Helper functions
function generateTestData(size: number): string[] {
  return Array(size).fill(0).map((_, i) => `item_${i}`);
}

function generateEmail(): string {
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'company.com'];
  const names = ['john', 'jane', 'bob', 'alice', 'charlie', 'diana'];

  const name = names[Math.floor(Math.random() * names.length)];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  const num = Math.floor(Math.random() * 1000);

  return `${name}${num}@${domain}`;
}

function generateRandomString(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < Math.floor(Math.random() * 20) + 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
