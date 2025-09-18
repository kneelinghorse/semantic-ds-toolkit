import { EmailNormalizer, normalizeEmail } from '../../src/normalizers/email';

describe('EmailNormalizer', () => {
  let normalizer: EmailNormalizer;

  beforeEach(() => {
    normalizer = new EmailNormalizer();
  });

  describe('basic email normalization', () => {
    test('should normalize simple emails', () => {
      const result = normalizer.normalize('john.doe@example.com');
      expect(result.normalized).toBe('john.doe@example.com');
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should handle Gmail dot normalization', () => {
      const result = normalizer.normalize('john.doe@gmail.com');
      expect(result.normalized).toBe('johndoe@gmail.com');
      expect(result.variations).toContain('johndoe@gmail.com');
    });

    test('should handle plus addressing', () => {
      const result = normalizer.normalize('john+newsletter@example.com');
      expect(result.normalized).toBe('john@example.com');
      expect(result.variations).toContain('john@example.com');
    });

    test('should handle Gmail with both dots and plus', () => {
      const result = normalizer.normalize('john.doe+test@gmail.com');
      expect(result.normalized).toBe('johndoe@gmail.com');
    });
  });

  describe('provider detection', () => {
    test('should detect Google provider', () => {
      const result = normalizer.normalize('test@gmail.com');
      expect(result.provider).toBe('google');
    });

    test('should detect Microsoft provider', () => {
      const result = normalizer.normalize('test@outlook.com');
      expect(result.provider).toBe('microsoft');
    });

    test('should detect Yahoo provider', () => {
      const result = normalizer.normalize('test@yahoo.com');
      expect(result.provider).toBe('yahoo');
    });
  });

  describe('international emails', () => {
    test('should handle Unicode domains', () => {
      const result = normalizer.normalize('user@münchen.de');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    test('should handle international characters in local part', () => {
      const result = normalizer.normalize('José@example.com');
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('edge cases', () => {
    test('should handle empty string', () => {
      const result = normalizer.normalize('');
      expect(result.confidence).toBe(0);
      expect(result.normalized).toBe('');
    });

    test('should handle invalid email', () => {
      const result = normalizer.normalize('invalid-email');
      expect(result.confidence).toBe(0);
    });

    test('should handle email with multiple @', () => {
      const result = normalizer.normalize('user@@example.com');
      expect(result.confidence).toBe(0);
    });
  });

  describe('variations generation', () => {
    test('should generate variations for Gmail', () => {
      const variations = normalizer.generateVariations('john.doe+test@gmail.com');
      expect(variations).toContain('johndoe@gmail.com');
      expect(variations).toContain('john.doe@gmail.com');
    });

    test('should not generate invalid variations', () => {
      const variations = normalizer.generateVariations('test@example.com');
      expect(variations.every(email => email.includes('@'))).toBe(true);
    });
  });

  describe('configuration options', () => {
    test('should respect removeDotsGmail option', () => {
      const normalizerNoDots = new EmailNormalizer({ removeDotsGmail: false });
      const result = normalizerNoDots.normalize('john.doe@gmail.com');
      expect(result.normalized).toBe('john.doe@gmail.com');
    });

    test('should respect removePlusAddressing option', () => {
      const normalizerNoPlus = new EmailNormalizer({ removePlusAddressing: false });
      const result = normalizerNoPlus.normalize('john+test@example.com');
      expect(result.normalized).toBe('john+test@example.com');
    });

    test('should respect lowercaseDomain option', () => {
      const normalizerNoLower = new EmailNormalizer({ lowercaseDomain: false });
      const result = normalizerNoLower.normalize('test@EXAMPLE.COM');
      expect(result.normalized).toBe('test@EXAMPLE.COM');
    });
  });

  describe('confidence scoring', () => {
    test('should give high confidence for exact matches', () => {
      const result = normalizer.normalize('test@example.com');
      expect(result.confidence).toBe(1.0);
    });

    test('should reduce confidence for changes', () => {
      const result = normalizer.normalize('test.user@gmail.com');
      expect(result.confidence).toBeLessThan(1.0);
      expect(result.confidence).toBeGreaterThan(0.8);
    });
  });

  describe('convenience function', () => {
    test('normalizeEmail function should work', () => {
      const result = normalizeEmail('test@example.com');
      expect(result.normalized).toBe('test@example.com');
    });
  });

  describe('real-world test cases', () => {
    const testCases = [
      {
        input: 'John.Doe+Newsletter@Gmail.Com',
        expected: 'JohnDoe@gmail.com',
        description: 'Mixed case Gmail with dots and plus'
      },
      {
        input: 'user.name+tag123@googlemail.com',
        expected: 'username@googlemail.com',
        description: 'Googlemail domain'
      },
      {
        input: 'test@Example.Co.Uk',
        expected: 'test@example.co.uk',
        description: 'UK domain normalization'
      }
    ];

    testCases.forEach(({ input, expected, description }) => {
      test(description, () => {
        const result = normalizer.normalize(input);
        expect(result.normalized).toBe(expected);
      });
    });
  });
});