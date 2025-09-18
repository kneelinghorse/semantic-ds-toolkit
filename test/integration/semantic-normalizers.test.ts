import { SemanticNormalizer } from '../../src/normalizers/index';
import { FuzzyMatcher } from '../../src/matchers/index';

describe('Semantic Normalizers Integration', () => {
  let normalizer: SemanticNormalizer;
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    normalizer = new SemanticNormalizer();
    matcher = new FuzzyMatcher({ threshold: 0.85 });
  });

  describe('Real-world data matching scenarios', () => {
    test('should match email variations across datasets', () => {
      const dataset1 = [
        'john.doe@gmail.com',
        'jane.smith+newsletter@outlook.com',
        'admin@company.org'
      ];

      const dataset2 = [
        'johndoe@gmail.com',
        'jane.smith@outlook.com',
        'admin@company.org'
      ];

      const matches: Array<{ original: string; normalized: string; match: string; similarity: number }> = [];

      dataset1.forEach(email1 => {
        const norm1 = normalizer.normalizeEmail(email1);

        dataset2.forEach(email2 => {
          const norm2 = normalizer.normalizeEmail(email2);
          const fuzzyResult = matcher.compare(norm1.normalized, norm2.normalized);

          if (fuzzyResult.isMatch) {
            matches.push({
              original: email1,
              normalized: norm1.normalized,
              match: email2,
              similarity: fuzzyResult.similarity
            });
          }
        });
      });

      expect(matches).toHaveLength(3);
      expect(matches.every(m => m.similarity >= 0.85)).toBe(true);
    });

    test('should handle international phone number matching', () => {
      const phones1 = [
        '+1 (555) 123-4567',
        '+44 20 7123 4567',
        '+49 30 12345678'
      ];

      const phones2 = [
        '555-123-4567',
        '+442071234567',
        '03012345678'
      ];

      const matches: Array<{ phone1: string; phone2: string; similarity: number }> = [];

      phones1.forEach(phone1 => {
        const norm1 = normalizer.normalizePhone(phone1);

        phones2.forEach(phone2 => {
          const norm2 = normalizer.normalizePhone(phone2);

          if (norm1.isValid && norm2.isValid) {
            const fuzzyResult = matcher.compare(norm1.normalized, norm2.normalized);

            if (fuzzyResult.similarity > 0.9) {
              matches.push({
                phone1,
                phone2,
                similarity: fuzzyResult.similarity
              });
            }
          }
        });
      });

      expect(matches.length).toBeGreaterThan(0);
    });

    test('should match name variations with cultural considerations', () => {
      const names1 = [
        'John Smith',
        'María García-López',
        'Dr. Michael O\'Connor Jr.',
        'Sarah Johnson'
      ];

      const names2 = [
        'Jon Smyth',
        'Maria Garcia Lopez',
        'Michael O\'Connor',
        'Sara Johnson'
      ];

      const matches: Array<{ name1: string; name2: string; similarity: number; confidence: number }> = [];

      names1.forEach(name1 => {
        const norm1 = normalizer.normalizeName(name1);

        names2.forEach(name2 => {
          const norm2 = normalizer.normalizeName(name2);
          const fuzzyResult = matcher.compare(norm1.normalized, norm2.normalized);

          if (fuzzyResult.similarity >= 0.8) {
            matches.push({
              name1,
              name2,
              similarity: fuzzyResult.similarity,
              confidence: fuzzyResult.confidence
            });
          }
        });
      });

      expect(matches.length).toBeGreaterThanOrEqual(2);
      expect(matches.every(m => m.similarity >= 0.8)).toBe(true);
    });

    test('should handle address normalization and matching', () => {
      const addresses1 = [
        '123 Main St, New York, NY 10001',
        '456 Oak Ave, Los Angeles, California 90210'
      ];

      const addresses2 = [
        '123 Main Street, New York, New York 10001',
        '456 Oak Avenue, LA, CA 90210'
      ];

      const matches: Array<{ addr1: string; addr2: string; similarity: number }> = [];

      addresses1.forEach(addr1 => {
        const norm1 = normalizer.normalizeAddress(addr1);

        addresses2.forEach(addr2 => {
          const norm2 = normalizer.normalizeAddress(addr2);
          const fuzzyResult = matcher.compare(norm1.normalized, norm2.normalized);

          if (fuzzyResult.similarity >= 0.8) {
            matches.push({
              addr1,
              addr2,
              similarity: fuzzyResult.similarity
            });
          }
        });
      });

      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Confidence scoring validation', () => {
    test('should provide accurate confidence scores', () => {
      const testCases = [
        {
          type: 'email' as const,
          input: 'john.doe+test@gmail.com',
          expectedConfidence: 0.8
        },
        {
          type: 'phone' as const,
          input: '+1-555-123-4567',
          expectedConfidence: 0.8
        },
        {
          type: 'name' as const,
          input: 'Dr. John Smith Jr.',
          expectedConfidence: 0.8
        }
      ];

      testCases.forEach(({ type, input, expectedConfidence }) => {
        const result = normalizer.normalizeField(input, type);
        expect(result.confidence).toBeGreaterThanOrEqual(expectedConfidence);
      });
    });
  });

  describe('Accuracy validation', () => {
    test('should achieve >90% accuracy on fuzzy matching', () => {
      const testPairs = [
        // Should match (true positives)
        ['hello', 'helo', true],
        ['John Smith', 'Jon Smyth', true],
        ['Microsoft', 'Mircosoft', true],
        ['test@gmail.com', 'test@googlemail.com', true],
        ['color', 'colour', true],

        // Should not match (true negatives)
        ['hello', 'world', false],
        ['John Smith', 'Jane Doe', false],
        ['Microsoft', 'Apple', false],
        ['test@gmail.com', 'admin@yahoo.com', false],
        ['red', 'blue', false]
      ];

      let correct = 0;
      const threshold = 0.85;

      testPairs.forEach(([s1, s2, shouldMatch]) => {
        const result = matcher.compare(s1 as string, s2 as string);
        const isMatch = result.similarity >= threshold;

        if (isMatch === shouldMatch) {
          correct++;
        }
      });

      const accuracy = correct / testPairs.length;
      console.log(`Fuzzy matching accuracy: ${(accuracy * 100).toFixed(1)}%`);

      expect(accuracy).toBeGreaterThanOrEqual(0.9);
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle malformed input gracefully', () => {
      const malformedInputs = [
        { type: 'email' as const, value: 'not-an-email' },
        { type: 'phone' as const, value: 'abc-def-ghij' },
        { type: 'uuid' as const, value: 'not-a-uuid' }
      ];

      malformedInputs.forEach(({ type, value }) => {
        expect(() => {
          const result = normalizer.normalizeField(value, type);
          expect(result.confidence).toBeLessThan(0.5);
        }).not.toThrow();
      });
    });

    test('should handle empty and null inputs', () => {
      const emptyInputs = ['', '   ', '\t\n'];

      emptyInputs.forEach(input => {
        expect(() => {
          normalizer.normalizeEmail(input);
          normalizer.normalizePhone(input);
          normalizer.normalizeName(input);
          normalizer.normalizeAddress(input);
          normalizer.normalizeUuid(input);
        }).not.toThrow();
      });
    });
  });

  describe('Performance under load', () => {
    test('should maintain performance with large datasets', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        email: `user${i}@example${i % 10}.com`,
        phone: `555${String(i).padStart(7, '0')}`,
        name: `User ${i}`
      }));

      const start = performance.now();

      largeDataset.forEach(record => {
        normalizer.normalizeEmail(record.email);
        normalizer.normalizePhone(record.phone);
        normalizer.normalizeName(record.name);
      });

      const end = performance.now();
      const totalTime = end - start;
      const avgTime = totalTime / largeDataset.length;

      console.log(`Large dataset processing: ${totalTime.toFixed(2)}ms total, ${avgTime.toFixed(3)}ms per record`);

      expect(avgTime).toBeLessThan(1.0); // Less than 1ms per record
    });
  });

  describe('International data support', () => {
    test('should handle international characters correctly', () => {
      const internationalData = [
        { email: 'müller@münchen.de', expected: true },
        { name: 'José María García', expected: true },
        { phone: '+33 1 42 34 56 78', expected: true },
        { address: 'Champs-Élysées, Paris, France', expected: true }
      ];

      internationalData.forEach(({ email, name, phone, address, expected }) => {
        if (email) {
          const result = normalizer.normalizeEmail(email);
          expect(result.confidence > 0.8).toBe(expected);
        }
        if (name) {
          const result = normalizer.normalizeName(name);
          expect(result.confidence > 0.8).toBe(expected);
        }
        if (phone) {
          const result = normalizer.normalizePhone(phone);
          expect(result.isValid).toBe(expected);
        }
        if (address) {
          const result = normalizer.normalizeAddress(address);
          expect(result.confidence > 0.8).toBe(expected);
        }
      });
    });
  });

  describe('Configuration flexibility', () => {
    test('should allow custom configuration per normalizer', () => {
      const customNormalizer = new SemanticNormalizer({
        email: { removeDotsGmail: false },
        phone: { defaultCountryCode: '44' },
        name: { removeMiddleInitials: true }
      });

      const emailResult = customNormalizer.normalizeEmail('john.doe@gmail.com');
      expect(emailResult.normalized).toBe('john.doe@gmail.com');

      const phoneResult = customNormalizer.normalizePhone('2071234567');
      expect(phoneResult.countryCode).toBe('44');

      const nameResult = customNormalizer.normalizeName('John M. Doe');
      expect(nameResult.normalized).not.toContain('M.');
    });
  });
});