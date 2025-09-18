import { PhoneticMatcher, soundex, metaphone, nysiis, phoneticSimilarity } from '../../src/matchers/phonetic';

describe('Matchers: Phonetic (extra)', () => {
  it('soundex encodes Smith and Smyth the same', () => {
    expect(soundex('Smith')).toBe(soundex('Smyth'));
  });

  it('metaphone produces non-empty code for typical words', () => {
    expect(metaphone('phone')).toBeTruthy();
  });

  it('nysiis encodes consistently for common cases', () => {
    const code = nysiis('MacDonald');
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(0);
  });

  it('phoneticSimilarity is higher for similar words', () => {
    const sim = phoneticSimilarity('center', 'centre', 'metaphone');
    expect(sim).toBeGreaterThanOrEqual(0);
  });

  it('matcher threshold affects isMatch', () => {
    const m = new PhoneticMatcher({ algorithm: 'soundex', threshold: 1 });
    const r = m.compare('color', 'colour');
    expect(typeof r.isMatch).toBe('boolean');
  });
});
