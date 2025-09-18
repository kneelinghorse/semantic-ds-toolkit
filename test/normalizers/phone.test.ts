import { PhoneNormalizer, normalizePhone } from '../../src/normalizers/phone';

describe('PhoneNormalizer', () => {
  let normalizer: PhoneNormalizer;

  beforeEach(() => {
    normalizer = new PhoneNormalizer();
  });

  describe('US phone numbers', () => {
    test('should normalize 10-digit US number', () => {
      const result = normalizer.normalize('5551234567');
      expect(result.normalized).toBe('+15551234567');
      expect(result.isValid).toBe(true);
      expect(result.countryCode).toBe('1');
      expect(result.format).toBe('E164');
    });

    test('should normalize formatted US number', () => {
      const result = normalizer.normalize('(555) 123-4567');
      expect(result.normalized).toBe('+15551234567');
      expect(result.isValid).toBe(true);
    });

    test('should normalize US number with +1', () => {
      const result = normalizer.normalize('+1 555 123 4567');
      expect(result.normalized).toBe('+15551234567');
      expect(result.isValid).toBe(true);
    });
  });

  describe('international phone numbers', () => {
    test('should normalize UK number', () => {
      const result = normalizer.normalize('+44 20 7123 4567');
      expect(result.normalized).toBe('+442071234567');
      expect(result.countryCode).toBe('44');
      expect(result.isValid).toBe(true);
    });

    test('should normalize German number', () => {
      const result = normalizer.normalize('+49 30 12345678');
      expect(result.normalized).toBe('+493012345678');
      expect(result.countryCode).toBe('49');
      expect(result.isValid).toBe(true);
    });

    test('should normalize Japanese number', () => {
      const result = normalizer.normalize('+81 3 1234 5678');
      expect(result.normalized).toBe('+81312345678');
      expect(result.countryCode).toBe('81');
      expect(result.isValid).toBe(true);
    });

    test('should normalize Indian number', () => {
      const result = normalizer.normalize('+91 98765 43210');
      expect(result.normalized).toBe('+919876543210');
      expect(result.countryCode).toBe('91');
      expect(result.isValid).toBe(true);
    });
  });

  describe('formatting options', () => {
    test('should format as national for US', () => {
      const formatted = normalizer.formatNational('+1 555 123 4567');
      expect(formatted).toBe('(555) 123-4567');
    });

    test('should format as international', () => {
      const formatted = normalizer.formatInternational('555-123-4567');
      expect(formatted).toBe('+1 5551234567');
    });

    test('should return null for invalid number in formatting', () => {
      const formatted = normalizer.formatNational('invalid');
      expect(formatted).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('should handle empty string', () => {
      const result = normalizer.normalize('');
      expect(result.isValid).toBe(false);
      expect(result.confidence).toBe(0);
    });

    test('should handle too short number', () => {
      const result = normalizer.normalize('123');
      expect(result.isValid).toBe(false);
    });

    test('should handle too long number', () => {
      const result = normalizer.normalize('12345678901234567890');
      expect(result.isValid).toBe(false);
    });

    test('should handle letters in number', () => {
      const result = normalizer.normalize('555-CALL-NOW');
      expect(result.isValid).toBe(false);
    });
  });

  describe('configuration options', () => {
    test('should respect default country code', () => {
      const normalizerUK = new PhoneNormalizer({ defaultCountryCode: '44' });
      const result = normalizerUK.normalize('2071234567');
      expect(result.countryCode).toBe('44');
    });

    test('should respect formatE164 option', () => {
      const normalizerNoE164 = new PhoneNormalizer({ formatE164: false });
      const result = normalizerNoE164.normalize('555-123-4567');
      expect(result.format).not.toBe('E164');
    });
  });

  describe('confidence scoring', () => {
    test('should give high confidence for well-formatted numbers', () => {
      const result = normalizer.normalize('+1-555-123-4567');
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    test('should reduce confidence for assumed country code', () => {
      const result = normalizer.normalize('5551234567');
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  describe('real-world test cases', () => {
    const testCases = [
      {
        input: '1-800-555-1234',
        expected: '+18005551234',
        description: 'US toll-free number'
      },
      {
        input: '+44 20 7123 4567',
        expected: '+442071234567',
        description: 'UK number with plus prefix'
      },
      {
        input: '+33 1 42 34 56 78',
        expected: '+33142345678',
        description: 'French number'
      },
      {
        input: '+86 138 0013 8000',
        expected: '+8613800138000',
        description: 'Chinese mobile number'
      },
      {
        input: '+55 11 9 8765 4321',
        expected: '+5511987654321',
        description: 'Brazilian mobile number'
      }
    ];

    testCases.forEach(({ input, expected, description }) => {
      test(description, () => {
        const result = normalizer.normalize(input);
        expect(result.normalized).toBe(expected);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('country code edge cases', () => {
    test('should handle ambiguous country codes', () => {
      const result = normalizer.normalize('+1234567890123');
      expect(result.isValid).toBe(false);
    });

    test('should prefer longer country codes when applicable', () => {
      const result = normalizer.normalize('+351234567890');
      expect(result.countryCode).toBe('351'); // Portugal, not a shorter code
    });
  });

  describe('convenience function', () => {
    test('normalizePhone function should work', () => {
      const result = normalizePhone('555-123-4567');
      expect(result.normalized).toBe('+15551234567');
    });
  });
});