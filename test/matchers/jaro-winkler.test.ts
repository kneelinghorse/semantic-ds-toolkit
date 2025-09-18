import { JaroWinklerMatcher, jaroWinklerSimilarity, jaroWinklerDistance, jaroSimilarity } from '../../src/matchers/jaro-winkler';

describe('Matchers: Jaro-Winkler', () => {
  it('returns perfect match for identical strings', () => {
    const m = new JaroWinklerMatcher();
    const res = m.compare('abc', 'abc');
    expect(res.similarity).toBe(1);
    expect(res.distance).toBe(0);
    expect(res.isMatch).toBe(true);
    expect(res.prefixLength).toBe(3);
  });

  it('handles empty string cases', () => {
    const m = new JaroWinklerMatcher();
    const res = m.compare('', 'x');
    expect(res.similarity).toBe(0);
    expect(res.isMatch).toBe(false);
  });

  it('covers tiny strings where match window is negative', () => {
    const m = new JaroWinklerMatcher();
    const res = m.compare('a', 'b');
    expect(res.similarity).toBe(0);
    expect(res.isMatch).toBe(false);
  });

  it('respects threshold and options for prefix scaling', () => {
    const strict = new JaroWinklerMatcher({ threshold: 0.98, prefixScale: 0.25, maxPrefixLength: 2 });
    const res = strict.compare('MARTHA', 'MARHTA');
    // Should be less than strict threshold but positive
    expect(res.similarity).toBeGreaterThan(0.8);
    expect(res.isMatch).toBe(false);
    expect(res.prefixLength).toBeLessThanOrEqual(2);
  });

  it('findBestMatch returns null when none meet threshold', () => {
    const m = new JaroWinklerMatcher({ threshold: 0.9 });
    const best = m.findBestMatch('hello', ['world', 'xyz']);
    expect(best).toBeNull();
  });

  it('findMatches and batchCompare return ordered results', () => {
    const m = new JaroWinklerMatcher();
    const matches = m.findMatches('hello', ['helo', 'help', 'yellow'], 0.7);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].result.similarity).toBeGreaterThanOrEqual(matches[matches.length - 1].result.similarity);

    const map = m.batchCompare(['hi', 'bye'], ['he', 'by']);
    expect(map.size).toBe(2);
  });

  it('exports convenience functions', () => {
    expect(jaroWinklerSimilarity('abc', 'abc')).toBe(1);
    expect(jaroWinklerDistance('abc', 'abc')).toBe(0);
    expect(jaroSimilarity('abc', 'abd')).toBeGreaterThan(0.7);
  });
});
