import { FuzzyMatcher, fuzzyMatch } from '../../src/matchers/index';
import { JaroWinklerMatcher } from '../../src/matchers/jaro-winkler';
import { LevenshteinMatcher } from '../../src/matchers/levenshtein';

describe('FuzzyMatcher', () => {
  let matcher: FuzzyMatcher;

  beforeEach(() => {
    matcher = new FuzzyMatcher();
  });

  describe('exact matches', () => {
    test('should return perfect score for identical strings', () => {
      const result = matcher.compare('hello', 'hello');
      expect(result.similarity).toBe(1.0);
      expect(result.distance).toBe(0.0);
      expect(result.isMatch).toBe(true);
      expect(result.confidence).toBe(1.0);
    });

    test('should return perfect score for empty strings', () => {
      const result = matcher.compare('', '');
      expect(result.similarity).toBe(1.0);
      expect(result.isMatch).toBe(true);
    });
  });

  describe('similar strings', () => {
    test('should score similar strings highly', () => {
      const result = matcher.compare('hello', 'helo');
      expect(result.similarity).toBeGreaterThan(0.7);
      expect(result.details.jaroWinkler).toBeGreaterThan(0.7);
      expect(result.details.levenshtein).toBeGreaterThan(0.7);
    });

    test('should handle case differences', () => {
      const result = matcher.compare('Hello', 'hello');
      expect(result.similarity).toBeGreaterThan(0.8);
    });

    test('should handle transpositions well', () => {
      const result = matcher.compare('abcd', 'acbd');
      expect(result.similarity).toBeGreaterThan(0.5);
    });
  });

  describe('phonetic matching', () => {
    test('should match phonetically similar names', () => {
      const result = matcher.compare('Smith', 'Smyth');
      expect(result.details.phonetic).toBeGreaterThan(0.8);
    });

    test('should match phonetically similar words', () => {
      const result = matcher.compare('night', 'knight');
      expect(result.details.phonetic).toBeGreaterThanOrEqual(0);
    });
  });

  describe('threshold handling', () => {
    test('should respect threshold in isMatch', () => {
      const highThreshold = new FuzzyMatcher({ threshold: 0.9 });
      const result = highThreshold.compare('hello', 'helo');
      expect(result.isMatch).toBe(result.similarity >= 0.9);
    });

    test('should allow threshold updates', () => {
      matcher.setThreshold(0.95);
      const result = matcher.compare('hello', 'helo');
      expect(result.isMatch).toBe(result.similarity >= 0.95);
    });
  });

  describe('weight configuration', () => {
    test('should respect custom weights', () => {
      const phoneticMatcher = new FuzzyMatcher({
        weights: { jaroWinkler: 0.2, levenshtein: 0.2, phonetic: 0.6 }
      });

      const result1 = phoneticMatcher.compare('Smith', 'Smyth');
      const result2 = matcher.compare('Smith', 'Smyth');

      expect(result1.similarity).not.toBe(result2.similarity);
    });

    test('should normalize weights automatically', () => {
      const unnormalizedMatcher = new FuzzyMatcher({
        weights: { jaroWinkler: 2, levenshtein: 2, phonetic: 1 }
      });

      const result = unnormalizedMatcher.compare('test', 'test');
      expect(result.similarity).toBe(1.0);
    });
  });

  describe('batch operations', () => {
    test('should find best match from candidates', () => {
      const candidates = ['hello', 'helo', 'help', 'world'];
      const result = matcher.findBestMatch('helo', candidates);

      expect(result).toBeTruthy();
      expect(result!.value).toBe('helo');
      expect(result!.result.similarity).toBe(1.0);
    });

    test('should find all matches above threshold', () => {
      const candidates = ['hello', 'helo', 'help', 'world'];
      const matches = matcher.findMatches('hello', candidates, 0.7);

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].value).toBe('hello');
      expect(matches.every(m => m.result.similarity >= 0.7)).toBe(true);
    });

    test('should find top N matches', () => {
      const candidates = ['hello', 'helo', 'help', 'world', 'held'];
      const topMatches = matcher.findTopMatches('hello', candidates, 3);

      expect(topMatches).toHaveLength(3);
      expect(topMatches[0].result.similarity).toBeGreaterThanOrEqual(topMatches[1].result.similarity);
    });

    test('should batch compare multiple targets', () => {
      const targets = ['hello', 'world'];
      const candidates = ['helo', 'word'];
      const results = matcher.batchCompare(targets, candidates);

      expect(results.size).toBe(2);
      expect(results.has('hello')).toBe(true);
      expect(results.has('world')).toBe(true);
    });
  });

  describe('performance optimization', () => {
    test('should provide fast mode for quick rejections', () => {
      const result = matcher.optimizedCompare('a', 'verylongstring', true);
      expect(result.similarity).toBe(0.0);
      expect(result.isMatch).toBe(false);
    });

    test('should fall back to normal mode for similar lengths', () => {
      const result = matcher.optimizedCompare('hello', 'helo', true);
      expect(result.similarity).toBeGreaterThan(0.7);
    });
  });

  describe('confidence calculation', () => {
    test('should provide high confidence for consistent scores', () => {
      const result = matcher.compare('hello', 'hello');
      expect(result.confidence).toBe(1.0);
    });

    test('should provide lower confidence for inconsistent scores', () => {
      matcher.setWeights({ jaroWinkler: 1, levenshtein: 0, phonetic: 0 });
      const result = matcher.compare('night', 'knight');

      expect(result.confidence).toBeLessThan(1.0);
    });
  });

  describe('real-world test cases', () => {
    const testCases = [
      {
        s1: 'John Smith',
        s2: 'Jon Smyth',
        minSimilarity: 0.7,
        description: 'Name variations'
      },
      {
        s1: 'Microsoft Corporation',
        s2: 'Microsoft Corp',
        minSimilarity: 0.8,
        description: 'Company name abbreviations'
      },
      {
        s1: 'New York',
        s2: 'NY',
        minSimilarity: 0.3,
        description: 'Geographic abbreviations'
      },
      {
        s1: 'iPhone',
        s2: 'iphone',
        minSimilarity: 0.89,
        description: 'Case differences'
      },
      {
        s1: 'color',
        s2: 'colour',
        minSimilarity: 0.8,
        description: 'Spelling variations'
      }
    ];

    testCases.forEach(({ s1, s2, minSimilarity, description }) => {
      test(description, () => {
        const result = matcher.compare(s1, s2);
        expect(result.similarity).toBeGreaterThanOrEqual(minSimilarity);
      });
    });
  });

  describe('integration with individual matchers', () => {
    test('should produce reasonable results compared to individual matchers', () => {
      const jaroWinkler = new JaroWinklerMatcher();
      const levenshtein = new LevenshteinMatcher();

      const str1 = 'hello';
      const str2 = 'helo';

      const fuzzyResult = matcher.compare(str1, str2);
      const jaroResult = jaroWinkler.compare(str1, str2);
      const levenResult = levenshtein.compare(str1, str2);

      expect(fuzzyResult.details.jaroWinkler).toBeCloseTo(jaroResult.similarity, 2);
      expect(fuzzyResult.details.levenshtein).toBeCloseTo(levenResult.similarity, 2);
    });
  });

  describe('convenience functions', () => {
    test('fuzzyMatch function should work', () => {
      const similarity = fuzzyMatch('hello', 'helo');
      expect(similarity).toBeGreaterThan(0.7);
    });
  });

  describe('edge cases', () => {
    test('should handle very different strings', () => {
      const result = matcher.compare('abc', 'xyz');
      expect(result.similarity).toBeLessThan(0.5);
      expect(result.isMatch).toBe(false);
    });

    test('should handle one empty string', () => {
      const result = matcher.compare('hello', '');
      expect(result.similarity).toBe(0.0);
      expect(result.isMatch).toBe(false);
    });

    test('should handle unicode characters', () => {
      const result = matcher.compare('café', 'cafe');
      expect(result.similarity).toBeGreaterThan(0.8);
    });
  });
});
