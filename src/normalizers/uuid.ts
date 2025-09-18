export interface UuidNormalizationOptions {
  removeHyphens?: boolean;
  lowercase?: boolean;
  validateFormat?: boolean;
}

export interface NormalizedUuid {
  normalized: string;
  original: string;
  confidence: number;
  isValid: boolean;
  version?: number;
  variant?: string;
  format: 'standard' | 'compact' | 'urn' | 'invalid';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_COMPACT_REGEX = /^[0-9a-f]{32}$/i;
const UUID_URN_REGEX = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UuidNormalizer {
  private options: Required<UuidNormalizationOptions>;

  constructor(options: UuidNormalizationOptions = {}) {
    this.options = {
      removeHyphens: false,
      lowercase: true,
      validateFormat: true,
      ...options
    };
  }

  normalize(uuid: string): NormalizedUuid {
    const original = uuid.trim();
    if (!original) {
      return {
        normalized: '',
        original,
        confidence: 0,
        isValid: false,
        format: 'invalid'
      };
    }

    let normalized = original;
    let format: 'standard' | 'compact' | 'urn' | 'invalid' = 'invalid';
    let isValid = false;

    if (this.options.lowercase) {
      normalized = normalized.toLowerCase();
    }

    if (UUID_URN_REGEX.test(normalized)) {
      format = 'urn';
      isValid = true;
      normalized = normalized.replace('urn:uuid:', '');
    } else if (UUID_REGEX.test(normalized)) {
      format = 'standard';
      isValid = true;
    } else if (UUID_COMPACT_REGEX.test(normalized)) {
      format = 'compact';
      isValid = true;
      normalized = this.addHyphens(normalized);
    } else {
      const cleanedUuid = this.attemptCleanup(normalized);
      if (cleanedUuid) {
        normalized = cleanedUuid;
        format = 'standard';
        isValid = true;
      }
    }

    if (isValid && this.options.removeHyphens) {
      normalized = normalized.replace(/-/g, '');
      format = 'compact';
    }

    const version = isValid ? this.getVersion(normalized) : undefined;
    const variant = isValid ? this.getVariant(normalized) : undefined;
    const confidence = this.calculateConfidence(original, normalized, isValid, format);

    return {
      normalized,
      original,
      confidence,
      isValid,
      version,
      variant,
      format
    };
  }

  private attemptCleanup(uuid: string): string | null {
    let cleaned = uuid.replace(/[^0-9a-f-]/gi, '');

    if (cleaned.length === 32) {
      return this.addHyphens(cleaned);
    }

    if (cleaned.length === 36 && cleaned.indexOf('-') !== -1) {
      const withoutHyphens = cleaned.replace(/-/g, '');
      if (withoutHyphens.length === 32) {
        const withHyphens = this.addHyphens(withoutHyphens);
        if (UUID_REGEX.test(withHyphens)) {
          return withHyphens;
        }
      }
    }

    return null;
  }

  private addHyphens(compactUuid: string): string {
    if (compactUuid.length !== 32) {
      return compactUuid;
    }

    return `${compactUuid.substring(0, 8)}-${compactUuid.substring(8, 12)}-${compactUuid.substring(12, 16)}-${compactUuid.substring(16, 20)}-${compactUuid.substring(20, 32)}`;
  }

  private getVersion(uuid: string): number | undefined {
    const cleaned = uuid.replace(/-/g, '');
    if (cleaned.length !== 32) return undefined;

    const versionChar = cleaned[12];
    const version = parseInt(versionChar, 16);

    if (version >= 1 && version <= 5) {
      return version;
    }

    return undefined;
  }

  private getVariant(uuid: string): string | undefined {
    const cleaned = uuid.replace(/-/g, '');
    if (cleaned.length !== 32) return undefined;

    const variantChar = cleaned[16];
    const variantBits = parseInt(variantChar, 16);

    if ((variantBits & 0x8) === 0) {
      return 'NCS';
    } else if ((variantBits & 0xC) === 0x8) {
      return 'RFC4122';
    } else if ((variantBits & 0xE) === 0xC) {
      return 'Microsoft';
    } else if ((variantBits & 0xE) === 0xE) {
      return 'Reserved';
    }

    return 'Unknown';
  }

  private calculateConfidence(
    original: string,
    normalized: string,
    isValid: boolean,
    format: 'standard' | 'compact' | 'urn' | 'invalid'
  ): number {
    if (!isValid) return 0;

    let confidence = 0.9;

    if (original === normalized) {
      confidence = 1.0;
    }

    if (format === 'standard') {
      confidence += 0.05;
    } else if (format === 'compact') {
      confidence += 0.03;
    } else if (format === 'urn') {
      confidence += 0.05;
    }

    const cleanOriginal = original.replace(/[^0-9a-f-]/gi, '');
    const cleanNormalized = normalized.replace(/[^0-9a-f-]/gi, '');

    if (cleanOriginal.toLowerCase() === cleanNormalized.toLowerCase()) {
      confidence += 0.05;
    }

    const lengthDifference = Math.abs(original.length - normalized.length);
    if (lengthDifference > 5) {
      confidence -= 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  isValidUuid(uuid: string): boolean {
    const result = this.normalize(uuid);
    return result.isValid;
  }

  toStandard(uuid: string): string | null {
    const result = this.normalize(uuid);
    if (!result.isValid) return null;

    const cleaned = result.normalized.replace(/-/g, '');
    return this.addHyphens(cleaned);
  }

  toCompact(uuid: string): string | null {
    const result = this.normalize(uuid);
    if (!result.isValid) return null;

    return result.normalized.replace(/-/g, '');
  }

  toUrn(uuid: string): string | null {
    const standard = this.toStandard(uuid);
    if (!standard) return null;

    return `urn:uuid:${standard}`;
  }

  generateVariations(uuid: string): string[] {
    const result = this.normalize(uuid);
    if (!result.isValid) return [];

    const variations: string[] = [];
    const standard = this.toStandard(uuid);
    const compact = this.toCompact(uuid);
    const urn = this.toUrn(uuid);

    if (standard) {
      variations.push(standard);
      variations.push(standard.toUpperCase());
    }

    if (compact) {
      variations.push(compact);
      variations.push(compact.toUpperCase());
    }

    if (urn) {
      variations.push(urn);
      variations.push(urn.toUpperCase());
    }

    return [...new Set(variations)];
  }
}

export function normalizeUuid(uuid: string, options?: UuidNormalizationOptions): NormalizedUuid {
  const normalizer = new UuidNormalizer(options);
  return normalizer.normalize(uuid);
}

export function isValidUuid(uuid: string): boolean {
  const normalizer = new UuidNormalizer();
  return normalizer.isValidUuid(uuid);
}

export function generateUuid(): string {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);

  randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
  randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

  const hex = Array.from(randomBytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}