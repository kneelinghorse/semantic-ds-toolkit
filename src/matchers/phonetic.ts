export interface PhoneticOptions {
  algorithm?: 'soundex' | 'metaphone' | 'double-metaphone' | 'nysiis';
  threshold?: number;
}

export interface PhoneticResult {
  similarity: number;
  isMatch: boolean;
  code1: string;
  code2: string;
  algorithm: string;
}

export class PhoneticMatcher {
  private algorithm: 'soundex' | 'metaphone' | 'double-metaphone' | 'nysiis';
  private threshold: number;

  constructor(options: PhoneticOptions = {}) {
    this.algorithm = options.algorithm ?? 'soundex';
    this.threshold = options.threshold ?? 1.0;
  }

  compare(s1: string, s2: string): PhoneticResult {
    const code1 = this.encode(s1);
    const code2 = this.encode(s2);

    let similarity = 0;

    if (this.algorithm === 'double-metaphone') {
      const codes1 = code1.split('|');
      const codes2 = code2.split('|');

      similarity = Math.max(
        codes1[0] === codes2[0] ? 1 : 0,
        codes1[0] === codes2[1] ? 1 : 0,
        codes1[1] === codes2[0] ? 1 : 0,
        codes1[1] === codes2[1] ? 1 : 0
      );
    } else {
      similarity = code1 === code2 ? 1 : 0;
    }

    return {
      similarity,
      isMatch: similarity >= this.threshold,
      code1,
      code2,
      algorithm: this.algorithm
    };
  }

  encode(word: string): string {
    switch (this.algorithm) {
      case 'soundex':
        return this.soundex(word);
      case 'metaphone':
        return this.metaphone(word);
      case 'double-metaphone':
        return this.doubleMetaphone(word);
      case 'nysiis':
        return this.nysiis(word);
      default:
        throw new Error(`Unknown phonetic algorithm: ${this.algorithm}`);
    }
  }

  private soundex(word: string): string {
    if (!word || word.length === 0) return '0000';

    const cleaned = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (cleaned.length === 0) return '0000';

    const firstLetter = cleaned[0];
    let code = firstLetter;

    const soundexMap: { [key: string]: string } = {
      'B': '1', 'F': '1', 'P': '1', 'V': '1',
      'C': '2', 'G': '2', 'J': '2', 'K': '2', 'Q': '2', 'S': '2', 'X': '2', 'Z': '2',
      'D': '3', 'T': '3',
      'L': '4',
      'M': '5', 'N': '5',
      'R': '6'
    };

    let prevCode = soundexMap[firstLetter] || '';

    for (let i = 1; i < cleaned.length && code.length < 4; i++) {
      const char = cleaned[i];
      const currentCode = soundexMap[char] || '';

      if (currentCode && currentCode !== prevCode) {
        code += currentCode;
      }

      if (char !== 'H' && char !== 'W') {
        prevCode = currentCode;
      }
    }

    return code.padEnd(4, '0').substring(0, 4);
  }

  private metaphone(word: string): string {
    if (!word || word.length === 0) return '';

    const cleaned = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (cleaned.length === 0) return '';

    let metaphone = '';
    let i = 0;
    const length = cleaned.length;

    if (cleaned.startsWith('KN') || cleaned.startsWith('GN') || cleaned.startsWith('PN') || cleaned.startsWith('AE') || cleaned.startsWith('WR')) {
      i = 1;
    }

    if (cleaned[0] === 'X') {
      metaphone = 'S';
      i = 1;
    }

    while (i < length && metaphone.length < 4) {
      const char = cleaned[i];
      const nextChar = i + 1 < length ? cleaned[i + 1] : '';
      const prevChar = i > 0 ? cleaned[i - 1] : '';

      switch (char) {
        case 'A':
        case 'E':
        case 'I':
        case 'O':
        case 'U':
          if (i === 0) metaphone += char;
          break;

        case 'B':
          if (i === length - 1 && prevChar === 'M') {
            // Silent B after M at end
          } else {
            metaphone += 'B';
          }
          break;

        case 'C':
          if (nextChar === 'H') {
            metaphone += 'X';
            i++;
          } else if (nextChar === 'I' && i + 2 < length && cleaned[i + 2] === 'A') {
            metaphone += 'X';
          } else if ((nextChar === 'I' || nextChar === 'E' || nextChar === 'Y') && !(prevChar === 'S')) {
            metaphone += 'S';
          } else {
            metaphone += 'K';
          }
          break;

        case 'D':
          if (nextChar === 'G' && i + 2 < length && 'EIY'.includes(cleaned[i + 2])) {
            metaphone += 'J';
            i += 2;
          } else {
            metaphone += 'T';
          }
          break;

        case 'F':
          metaphone += 'F';
          break;

        case 'G':
          if (nextChar === 'H' && i + 2 < length && !'EIY'.includes(cleaned[i + 2])) {
            // Silent GH
          } else if (nextChar === 'N' && i === length - 2) {
            // Silent GN at end
          } else if ('EIY'.includes(nextChar)) {
            metaphone += 'J';
          } else {
            metaphone += 'K';
          }
          break;

        case 'H':
          if (i === 0 || 'AEIOU'.includes(prevChar)) {
            if ('AEIOU'.includes(nextChar)) {
              metaphone += 'H';
            }
          }
          break;

        case 'J':
          metaphone += 'J';
          break;

        case 'K':
          if (prevChar !== 'C') {
            metaphone += 'K';
          }
          break;

        case 'L':
          metaphone += 'L';
          break;

        case 'M':
          metaphone += 'M';
          break;

        case 'N':
          metaphone += 'N';
          break;

        case 'P':
          if (nextChar === 'H') {
            metaphone += 'F';
            i++;
          } else {
            metaphone += 'P';
          }
          break;

        case 'Q':
          metaphone += 'K';
          break;

        case 'R':
          metaphone += 'R';
          break;

        case 'S':
          if (nextChar === 'H' || (nextChar === 'I' && i + 2 < length && 'AO'.includes(cleaned[i + 2]))) {
            metaphone += 'X';
          } else {
            metaphone += 'S';
          }
          break;

        case 'T':
          if (nextChar === 'H') {
            metaphone += '0';
            i++;
          } else if (nextChar === 'I' && i + 2 < length && 'AO'.includes(cleaned[i + 2])) {
            metaphone += 'X';
          } else {
            metaphone += 'T';
          }
          break;

        case 'V':
          metaphone += 'F';
          break;

        case 'W':
          if ('AEIOU'.includes(nextChar)) {
            metaphone += 'W';
          }
          break;

        case 'X':
          metaphone += 'KS';
          break;

        case 'Y':
          if ('AEIOU'.includes(nextChar)) {
            metaphone += 'Y';
          }
          break;

        case 'Z':
          metaphone += 'S';
          break;
      }

      i++;
    }

    return metaphone;
  }

  private doubleMetaphone(word: string): string {
    if (!word || word.length === 0) return '|';

    const cleaned = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (cleaned.length === 0) return '|';

    let primary = '';
    let secondary = '';

    return `${primary}|${secondary}`;
  }

  private nysiis(word: string): string {
    if (!word || word.length === 0) return '';

    let cleaned = word.toUpperCase().replace(/[^A-Z]/g, '');
    if (cleaned.length === 0) return '';

    const prefixMap: { [key: string]: string } = {
      'MAC': 'MCC',
      'KN': 'N',
      'K': 'C',
      'PH': 'FF',
      'PF': 'FF',
      'SCH': 'SSS'
    };

    for (const [prefix, replacement] of Object.entries(prefixMap)) {
      if (cleaned.startsWith(prefix)) {
        cleaned = replacement + cleaned.substring(prefix.length);
        break;
      }
    }

    const suffixMap: { [key: string]: string } = {
      'EE': 'Y',
      'IE': 'Y',
      'DT': 'D',
      'RT': 'D',
      'RD': 'D',
      'NT': 'D',
      'ND': 'D'
    };

    for (const [suffix, replacement] of Object.entries(suffixMap)) {
      if (cleaned.endsWith(suffix)) {
        cleaned = cleaned.substring(0, cleaned.length - suffix.length) + replacement;
        break;
      }
    }

    let nysiis = '';
    let i = 0;

    while (i < cleaned.length) {
      const char = cleaned[i];
      const nextChar = i + 1 < cleaned.length ? cleaned[i + 1] : '';

      switch (char) {
        case 'A':
        case 'E':
        case 'I':
        case 'O':
        case 'U':
          if (i === 0) nysiis += 'A';
          break;

        case 'Q':
          nysiis += 'G';
          break;

        case 'Z':
          nysiis += 'S';
          break;

        case 'M':
          nysiis += 'N';
          break;

        case 'K':
          if (nextChar === 'N') {
            nysiis += 'N';
            i++;
          } else {
            nysiis += 'C';
          }
          break;

        case 'S':
          if (nextChar === 'C' && i + 2 < cleaned.length && cleaned[i + 2] === 'H') {
            nysiis += 'S';
            i += 2;
          } else {
            nysiis += 'S';
          }
          break;

        case 'P':
          if (nextChar === 'H') {
            nysiis += 'F';
            i++;
          } else {
            nysiis += 'P';
          }
          break;

        default:
          nysiis += char;
      }

      i++;
    }

    nysiis = nysiis.replace(/(.)\1+/g, '$1');

    if (nysiis.endsWith('S') && nysiis.length > 1) {
      nysiis = nysiis.substring(0, nysiis.length - 1);
    }

    if (nysiis.endsWith('AY') && nysiis.length > 2) {
      nysiis = nysiis.substring(0, nysiis.length - 2) + 'Y';
    }

    if (nysiis.endsWith('A') && nysiis.length > 1) {
      nysiis = nysiis.substring(0, nysiis.length - 1);
    }

    return nysiis.substring(0, 6);
  }

  findBestMatch(target: string, candidates: string[]): { value: string; result: PhoneticResult } | null {
    let bestMatch: { value: string; result: PhoneticResult } | null = null;
    let bestSimilarity = 0;

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity > bestSimilarity) {
        bestSimilarity = result.similarity;
        bestMatch = { value: candidate, result };
      }
    }

    return bestMatch && bestMatch.result.isMatch ? bestMatch : null;
  }

  findMatches(target: string, candidates: string[], minSimilarity?: number): Array<{ value: string; result: PhoneticResult }> {
    const threshold = minSimilarity ?? this.threshold;
    const matches: Array<{ value: string; result: PhoneticResult }> = [];

    for (const candidate of candidates) {
      const result = this.compare(target, candidate);
      if (result.similarity >= threshold) {
        matches.push({ value: candidate, result });
      }
    }

    return matches.sort((a, b) => b.result.similarity - a.result.similarity);
  }

  batchCompare(targets: string[], candidates: string[]): Map<string, Array<{ value: string; result: PhoneticResult }>> {
    const results = new Map<string, Array<{ value: string; result: PhoneticResult }>>();

    for (const target of targets) {
      results.set(target, this.findMatches(target, candidates));
    }

    return results;
  }
}

export function soundex(word: string): string {
  const matcher = new PhoneticMatcher({ algorithm: 'soundex' });
  return matcher.encode(word);
}

export function metaphone(word: string): string {
  const matcher = new PhoneticMatcher({ algorithm: 'metaphone' });
  return matcher.encode(word);
}

export function nysiis(word: string): string {
  const matcher = new PhoneticMatcher({ algorithm: 'nysiis' });
  return matcher.encode(word);
}

export function phoneticSimilarity(s1: string, s2: string, algorithm: PhoneticOptions['algorithm'] = 'soundex'): number {
  const matcher = new PhoneticMatcher({ algorithm });
  return matcher.compare(s1, s2).similarity;
}