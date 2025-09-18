import { EmailNormalizer } from '../../src/normalizers/email';
import { PhoneNormalizer } from '../../src/normalizers/phone';
import { NameNormalizer } from '../../src/normalizers/name';
import { AddressNormalizer } from '../../src/normalizers/address';
import { UuidNormalizer } from '../../src/normalizers/uuid';
import { FuzzyMatcher } from '../../src/matchers/index';

describe('Performance Tests', () => {
  const PERFORMANCE_THRESHOLD_MS = 1.0;
  const ITERATIONS = 1000;

  const sampleData = {
    emails: [
      'john.doe+newsletter@gmail.com',
      'jane.smith@example.co.uk',
      'user123@yahoo.com',
      'test.user+tag@outlook.com',
      'admin@company-name.org'
    ],
    phones: [
      '+1-555-123-4567',
      '(555) 987-6543',
      '+44 20 7123 4567',
      '+49 30 12345678',
      '555.123.4567'
    ],
    names: [
      'John Doe',
      'Dr. Jane Smith Jr.',
      'María García-López',
      'Prof. Michael O\'Connor',
      'Sarah Johnson-Williams'
    ],
    addresses: [
      '123 Main St, New York, NY 10001',
      '456 Oak Avenue, Los Angeles, CA 90210',
      '789 Elm Street Apt 2B, Chicago, IL 60601',
      '321 Pine Blvd, Miami, FL 33101',
      '654 Cedar Lane, Seattle, WA 98101'
    ],
    uuids: [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      '12345678-1234-5678-1234-123456789012'
    ]
  };

  function measurePerformance(fn: () => void, iterations: number = ITERATIONS): number {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const end = performance.now();
    return (end - start) / iterations;
  }

  describe('Email Normalization Performance', () => {
    let normalizer: EmailNormalizer;

    beforeEach(() => {
      normalizer = new EmailNormalizer();
    });

    test(`should normalize emails in under ${PERFORMANCE_THRESHOLD_MS}ms`, () => {
      const avgTime = measurePerformance(() => {
        sampleData.emails.forEach(email => {
          normalizer.normalize(email);
        });
      });

      console.log(`Email normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });

    test('should generate variations efficiently', () => {
      const avgTime = measurePerformance(() => {
        sampleData.emails.forEach(email => {
          normalizer.generateVariations(email);
        });
      });

      console.log(`Email variations generation average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
    });
  });

  describe('Phone Normalization Performance', () => {
    let normalizer: PhoneNormalizer;

    beforeEach(() => {
      normalizer = new PhoneNormalizer();
    });

    test(`should normalize phones in under ${PERFORMANCE_THRESHOLD_MS}ms`, () => {
      const avgTime = measurePerformance(() => {
        sampleData.phones.forEach(phone => {
          normalizer.normalize(phone);
        });
      });

      console.log(`Phone normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });

    test('should format phones efficiently', () => {
      const avgTime = measurePerformance(() => {
        sampleData.phones.forEach(phone => {
          normalizer.formatNational(phone);
          normalizer.formatInternational(phone);
        });
      });

      console.log(`Phone formatting average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
    });
  });

  describe('Name Normalization Performance', () => {
    let normalizer: NameNormalizer;

    beforeEach(() => {
      normalizer = new NameNormalizer();
    });

    test(`should normalize names in under ${PERFORMANCE_THRESHOLD_MS}ms`, () => {
      const avgTime = measurePerformance(() => {
        sampleData.names.forEach(name => {
          normalizer.normalize(name);
        });
      });

      console.log(`Name normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Address Normalization Performance', () => {
    let normalizer: AddressNormalizer;

    beforeEach(() => {
      normalizer = new AddressNormalizer();
    });

    test(`should normalize addresses in under ${PERFORMANCE_THRESHOLD_MS}ms`, () => {
      const avgTime = measurePerformance(() => {
        sampleData.addresses.forEach(address => {
          normalizer.normalize(address);
        });
      });

      console.log(`Address normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('UUID Normalization Performance', () => {
    let normalizer: UuidNormalizer;

    beforeEach(() => {
      normalizer = new UuidNormalizer();
    });

    test(`should normalize UUIDs in under ${PERFORMANCE_THRESHOLD_MS}ms`, () => {
      const avgTime = measurePerformance(() => {
        sampleData.uuids.forEach(uuid => {
          normalizer.normalize(uuid);
        });
      });

      console.log(`UUID normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });

    test('should generate UUID variations efficiently', () => {
      const avgTime = measurePerformance(() => {
        sampleData.uuids.forEach(uuid => {
          normalizer.generateVariations(uuid);
        });
      });

      console.log(`UUID variations generation average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });
  });

  describe('Fuzzy Matching Performance', () => {
    let matcher: FuzzyMatcher;

    beforeEach(() => {
      matcher = new FuzzyMatcher();
    });

    test('should perform fuzzy matching efficiently', () => {
      const testPairs = [
        ['hello', 'helo'],
        ['John Smith', 'Jon Smyth'],
        ['Microsoft', 'Mircosoft'],
        ['New York', 'Newyork'],
        ['test@example.com', 'test@exampl.com']
      ];

      const avgTime = measurePerformance(() => {
        testPairs.forEach(([s1, s2]) => {
          matcher.compare(s1, s2);
        });
      });

      console.log(`Fuzzy matching average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 5);
    });

    test('should batch compare efficiently', () => {
      const targets = ['hello', 'world', 'test'];
      const candidates = ['helo', 'word', 'tset', 'hello', 'world'];

      const avgTime = measurePerformance(() => {
        matcher.batchCompare(targets, candidates);
      }, 100);

      console.log(`Batch fuzzy matching average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 10);
    });

    test('should use optimized mode efficiently', () => {
      const testPairs = [
        ['a', 'verylongstring'],
        ['hello', 'helo'],
        ['short', 'string']
      ];

      const avgTime = measurePerformance(() => {
        testPairs.forEach(([s1, s2]) => {
          matcher.optimizedCompare(s1, s2, true);
        });
      });

      console.log(`Optimized fuzzy matching average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS * 2);
    });
  });

  describe('Stress Tests', () => {
    test('should handle large datasets efficiently', () => {
      const largeEmailSet = Array.from({ length: 100 }, (_, i) =>
        `user${i}.test+tag${i}@example${i % 10}.com`
      );

      const normalizer = new EmailNormalizer();
      const start = performance.now();

      largeEmailSet.forEach(email => {
        normalizer.normalize(email);
      });

      const end = performance.now();
      const avgTime = (end - start) / largeEmailSet.length;

      console.log(`Large dataset email normalization average time: ${avgTime.toFixed(3)}ms`);
      expect(avgTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
    });

    test('should handle fuzzy matching with many candidates', () => {
      const target = 'hello world';
      const candidates = Array.from({ length: 100 }, (_, i) =>
        `hello${i} world${i % 5}`
      );

      const matcher = new FuzzyMatcher();
      const start = performance.now();

      matcher.findMatches(target, candidates);

      const end = performance.now();
      const totalTime = end - start;

      console.log(`Large candidate set fuzzy matching total time: ${totalTime.toFixed(3)}ms`);
      expect(totalTime).toBeLessThan(100); // 100ms for 100 candidates
    });
  });

  describe('Memory Usage', () => {
    test('should not leak memory during repeated operations', () => {
      const normalizer = new EmailNormalizer();
      const matcher = new FuzzyMatcher();

      const initialMemory = (performance as any).memory?.usedJSHeapSize;

      // Perform many operations
      for (let i = 0; i < 10000; i++) {
        normalizer.normalize(`test${i}@example.com`);
        matcher.compare(`test${i}`, `tset${i}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = (performance as any).memory?.usedJSHeapSize;

      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory - initialMemory;
        console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);

        // Memory increase should be reasonable (less than 10MB)
        expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      }
    });
  });
});