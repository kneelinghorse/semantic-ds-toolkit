export interface EmailNormalizationOptions {
  removeDotsGmail?: boolean;
  removePlusAddressing?: boolean;
  lowercaseDomain?: boolean;
  lowercaseLocal?: boolean;
  normalizeUnicode?: boolean;
}

export interface NormalizedEmail {
  normalized: string;
  original: string;
  confidence: number;
  provider?: string;
  variations: string[];
}

const GMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com'
]);

const COMMON_PROVIDERS: Record<string, string> = {
  'outlook.com': 'microsoft',
  'hotmail.com': 'microsoft',
  'live.com': 'microsoft',
  'yahoo.com': 'yahoo',
  'yahoo.co.uk': 'yahoo',
  'aol.com': 'aol',
  'protonmail.com': 'proton',
  'icloud.com': 'apple',
  'me.com': 'apple'
};

export class EmailNormalizer {
  private options: Required<EmailNormalizationOptions>;

  constructor(options: EmailNormalizationOptions = {}) {
    this.options = {
      removeDotsGmail: true,
      removePlusAddressing: true,
      lowercaseDomain: true,
      lowercaseLocal: false,
      normalizeUnicode: true,
      ...options
    };
  }

  normalize(email: string): NormalizedEmail {
    if (!this.isValidEmail(email)) {
      return {
        normalized: email,
        original: email,
        confidence: 0,
        variations: []
      };
    }

    let normalized = email.trim();
    const original = normalized;
    const variations: string[] = [];

    if (this.options.normalizeUnicode) {
      normalized = this.normalizeUnicode(normalized);
    }

    const [localPart, domain] = normalized.split('@');
    let normalizedLocal = localPart;
    let normalizedDomain = domain;

    if (this.options.lowercaseDomain) {
      normalizedDomain = normalizedDomain.toLowerCase();
    }

    if (this.options.lowercaseLocal) {
      normalizedLocal = normalizedLocal.toLowerCase();
    }

    const provider = this.detectProvider(normalizedDomain);

    if (this.options.removePlusAddressing) {
      const plusIndex = normalizedLocal.indexOf('+');
      if (plusIndex !== -1) {
        const withoutPlus = normalizedLocal.substring(0, plusIndex);
        variations.push(`${withoutPlus}@${normalizedDomain}`);
        normalizedLocal = withoutPlus;
      }
    }

    if (this.options.removeDotsGmail && GMAIL_DOMAINS.has(normalizedDomain)) {
      const withoutDots = normalizedLocal.replace(/\./g, '');
      if (withoutDots !== normalizedLocal) {
        variations.push(`${withoutDots}@${normalizedDomain}`);
        normalizedLocal = withoutDots;
      }
    }

    normalized = `${normalizedLocal}@${normalizedDomain}`;

    const confidence = this.calculateConfidence(original, normalized);

    return {
      normalized,
      original,
      confidence,
      provider,
      variations: [...new Set(variations)]
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private normalizeUnicode(email: string): string {
    return email.normalize('NFKC');
  }

  private detectProvider(domain: string): string | undefined {
    const lowerDomain = domain.toLowerCase();

    if (GMAIL_DOMAINS.has(lowerDomain)) {
      return 'google';
    }

    return COMMON_PROVIDERS[lowerDomain];
  }

  private calculateConfidence(original: string, normalized: string): number {
    if (original === normalized) return 1.0;

    const [origLocal, origDomain] = original.split('@');
    const [normLocal, normDomain] = normalized.split('@');

    let confidence = 0.9;

    if (origDomain.toLowerCase() !== normDomain.toLowerCase()) {
      confidence -= 0.3;
    }

    const localChanges = Math.abs(origLocal.length - normLocal.length);
    confidence -= (localChanges / origLocal.length) * 0.2;

    return Math.max(0.1, confidence);
  }

  generateVariations(email: string): string[] {
    const result = this.normalize(email);
    const variations = new Set([result.normalized, ...result.variations]);

    const [localPart, domain] = email.split('@');
    const lowerDomain = domain.toLowerCase();

    if (GMAIL_DOMAINS.has(lowerDomain)) {
      const baseLocal = localPart.replace(/\./g, '').split('+')[0];
      variations.add(`${baseLocal}@${lowerDomain}`);
      variations.add(`${localPart.toLowerCase()}@${lowerDomain}`);
    }

    return Array.from(variations);
  }
}

export function normalizeEmail(email: string, options?: EmailNormalizationOptions): NormalizedEmail {
  const normalizer = new EmailNormalizer(options);
  return normalizer.normalize(email);
}