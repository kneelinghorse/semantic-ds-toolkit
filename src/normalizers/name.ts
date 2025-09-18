export interface NameNormalizationOptions {
  removeMiddleInitials?: boolean;
  standardizePrefixes?: boolean;
  standardizeSuffixes?: boolean;
  handleHyphenated?: boolean;
  normalizeCase?: boolean;
  removeAccents?: boolean;
}

export interface NormalizedName {
  normalized: string;
  original: string;
  confidence: number;
  components: {
    prefix?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    suffix?: string;
  };
  variations: string[];
}

const PREFIXES = new Map([
  ['mr', 'Mr.'],
  ['mrs', 'Mrs.'],
  ['ms', 'Ms.'],
  ['miss', 'Miss'],
  ['dr', 'Dr.'],
  ['prof', 'Prof.'],
  ['professor', 'Prof.'],
  ['doctor', 'Dr.'],
  ['rev', 'Rev.'],
  ['reverend', 'Rev.'],
  ['sir', 'Sir'],
  ['lord', 'Lord'],
  ['lady', 'Lady'],
  ['hon', 'Hon.'],
  ['honorable', 'Hon.'],
  ['sen', 'Sen.'],
  ['senator', 'Sen.'],
  ['rep', 'Rep.'],
  ['representative', 'Rep.'],
  ['gov', 'Gov.'],
  ['governor', 'Gov.'],
  ['pres', 'Pres.'],
  ['president', 'Pres.'],
  ['capt', 'Capt.'],
  ['captain', 'Capt.'],
  ['col', 'Col.'],
  ['colonel', 'Col.'],
  ['gen', 'Gen.'],
  ['general', 'Gen.'],
  ['lt', 'Lt.'],
  ['lieutenant', 'Lt.'],
  ['maj', 'Maj.'],
  ['major', 'Maj.'],
  ['sgt', 'Sgt.'],
  ['sergeant', 'Sgt.']
]);

const SUFFIXES = new Map([
  ['jr', 'Jr.'],
  ['junior', 'Jr.'],
  ['sr', 'Sr.'],
  ['senior', 'Sr.'],
  ['ii', 'II'],
  ['iii', 'III'],
  ['iv', 'IV'],
  ['v', 'V'],
  ['vi', 'VI'],
  ['vii', 'VII'],
  ['viii', 'VIII'],
  ['ix', 'IX'],
  ['x', 'X'],
  ['md', 'M.D.'],
  ['phd', 'Ph.D.'],
  ['dds', 'D.D.S.'],
  ['dvm', 'D.V.M.'],
  ['jd', 'J.D.'],
  ['cpa', 'C.P.A.'],
  ['esq', 'Esq.'],
  ['esquire', 'Esq.'],
  ['rn', 'R.N.'],
  ['lpn', 'L.P.N.'],
  ['pa', 'P.A.'],
  ['np', 'N.P.']
]);

const PARTICLE_PREFIXES = new Set([
  'de', 'del', 'della', 'delle', 'di', 'da', 'dal', 'dalla',
  'von', 'van', 'der', 'den', 'ter', 'te',
  'le', 'la', 'les', 'du', 'des',
  'al', 'el', 'bin', 'ibn', 'abu',
  'mac', 'mc', "o'", 'ó', 'ní', 'nic'
]);

export class NameNormalizer {
  private options: Required<NameNormalizationOptions>;

  constructor(options: NameNormalizationOptions = {}) {
    this.options = {
      removeMiddleInitials: false,
      standardizePrefixes: true,
      standardizeSuffixes: true,
      handleHyphenated: true,
      normalizeCase: true,
      removeAccents: false,
      ...options
    };
  }

  normalize(name: string): NormalizedName {
    const original = name.trim();
    if (!original) {
      return {
        normalized: '',
        original,
        confidence: 0,
        components: {},
        variations: []
      };
    }

    let normalized = original;
    const variations: string[] = [];

    if (this.options.removeAccents) {
      normalized = this.removeAccents(normalized);
    }

    if (this.options.normalizeCase) {
      normalized = this.normalizeCase(normalized);
    }

    const components = this.parseNameComponents(normalized);
    const assembledName = this.assembleName(components);

    if (assembledName !== normalized) {
      variations.push(assembledName);
    }

    this.generateVariations(components, variations);

    const confidence = this.calculateConfidence(original, assembledName, components);

    return {
      normalized: assembledName,
      original,
      confidence,
      components,
      variations: [...new Set(variations)]
    };
  }

  private removeAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private normalizeCase(name: string): string {
    return name.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
  }

  private parseNameComponents(name: string): NormalizedName['components'] {
    const parts = name.split(/\s+/).filter(part => part.length > 0);
    const components: NormalizedName['components'] = {};

    if (parts.length === 0) return components;

    let startIndex = 0;
    let endIndex = parts.length - 1;

    if (this.options.standardizePrefixes && this.isPrefix(parts[0])) {
      components.prefix = PREFIXES.get(parts[0].toLowerCase().replace(/\./g, '')) || parts[0];
      startIndex = 1;
    }

    if (this.options.standardizeSuffixes && endIndex >= startIndex && this.isSuffix(parts[endIndex])) {
      components.suffix = SUFFIXES.get(parts[endIndex].toLowerCase().replace(/\./g, '')) || parts[endIndex];
      endIndex--;
    }

    const nameParts = parts.slice(startIndex, endIndex + 1);

    if (nameParts.length === 1) {
      components.firstName = nameParts[0];
    } else if (nameParts.length === 2) {
      components.firstName = nameParts[0];
      components.lastName = nameParts[1];
    } else if (nameParts.length >= 3) {
      components.firstName = nameParts[0];

      if (this.options.removeMiddleInitials && nameParts[1].length === 1) {
        components.lastName = nameParts.slice(2).join(' ');
      } else {
        const middleParts = nameParts.slice(1, -1);
        const lastPart = nameParts[nameParts.length - 1];

        components.middleName = middleParts.join(' ');
        components.lastName = lastPart;
      }
    }

    return components;
  }

  private isPrefix(word: string): boolean {
    const clean = word.toLowerCase().replace(/\./g, '');
    return PREFIXES.has(clean);
  }

  private isSuffix(word: string): boolean {
    const clean = word.toLowerCase().replace(/\./g, '');
    return SUFFIXES.has(clean);
  }

  private assembleName(components: NormalizedName['components']): string {
    const parts: string[] = [];

    if (components.prefix) parts.push(components.prefix);
    if (components.firstName) parts.push(components.firstName);
    if (components.middleName && !this.options.removeMiddleInitials) {
      parts.push(components.middleName);
    }
    if (components.lastName) parts.push(components.lastName);
    if (components.suffix) parts.push(components.suffix);

    return parts.join(' ');
  }

  private generateVariations(components: NormalizedName['components'], variations: string[]): void {
    const { prefix, firstName, middleName, lastName, suffix } = components;

    if (firstName && lastName) {
      variations.push(`${lastName}, ${firstName}`);

      if (middleName) {
        variations.push(`${lastName}, ${firstName} ${middleName}`);

        const middleInitial = middleName.split(' ').map(part => part[0] + '.').join(' ');
        variations.push(`${firstName} ${middleInitial} ${lastName}`);
        variations.push(`${lastName}, ${firstName} ${middleInitial}`);
      }

      if (!prefix) {
        variations.push(`${firstName} ${lastName}`);
      }

      if (!suffix) {
        const parts = [prefix, firstName, middleName, lastName].filter(Boolean);
        variations.push(parts.join(' '));
      }
    }

    if (firstName && middleName && lastName) {
      const firstInitial = firstName[0] + '.';
      variations.push(`${firstInitial} ${middleName} ${lastName}`);
      variations.push(`${firstInitial} ${lastName}`);
    }

    if (this.options.handleHyphenated && lastName && lastName.includes('-')) {
      const hyphenatedParts = lastName.split('-');
      for (const part of hyphenatedParts) {
        if (firstName) {
          variations.push(`${firstName} ${part}`);
        }
      }
    }
  }

  private calculateConfidence(
    original: string,
    normalized: string,
    components: NormalizedName['components']
  ): number {
    if (original === normalized) return 1.0;

    let confidence = 0.9;

    const originalParts = original.split(/\s+/).length;
    const componentCount = Object.keys(components).filter(key => components[key as keyof typeof components]).length;

    if (componentCount < 2) {
      confidence *= 0.7;
    }

    if (components.firstName && components.lastName) {
      confidence *= 1.1;
    }

    const lengthDifference = Math.abs(original.length - normalized.length);
    confidence -= (lengthDifference / original.length) * 0.1;

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  getDisplayName(components: NormalizedName['components']): string {
    if (components.firstName && components.lastName) {
      return `${components.firstName} ${components.lastName}`;
    }

    return this.assembleName(components);
  }

  getLastFirst(components: NormalizedName['components']): string {
    if (components.firstName && components.lastName) {
      const middleInitial = components.middleName ? ` ${components.middleName[0]}.` : '';
      return `${components.lastName}, ${components.firstName}${middleInitial}`;
    }

    return this.assembleName(components);
  }
}

export function normalizeName(name: string, options?: NameNormalizationOptions): NormalizedName {
  const normalizer = new NameNormalizer(options);
  return normalizer.normalize(name);
}