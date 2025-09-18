export interface PatternMatch {
  pattern: string;
  confidence: number;
  matchCount: number;
  totalCount: number;
  examples: string[];
}

export interface PatternDetector {
  name: string;
  description: string;
  pattern: RegExp;
  validator?: (value: string) => boolean;
  weight: number;
}

export class PatternMatcher {
  private detectors: PatternDetector[] = [];

  constructor() {
    this.initializeDetectors();
  }

  private initializeDetectors(): void {
    this.detectors = [
      // Email patterns
      {
        name: 'email',
        description: 'Email addresses',
        pattern: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        weight: 0.95,
        validator: (value: string) => {
          return this.isValidEmail(value);
        }
      },

      // Currency patterns
      {
        name: 'currency_usd',
        description: 'US Dollar amounts',
        pattern: /^\$[\d,]+\.?\d*$/,
        weight: 0.9
      },
      {
        name: 'currency_euro',
        description: 'Euro amounts',
        pattern: /^€[\d,]+\.?\d*$|^[\d,]+\.?\d*\s*€$/,
        weight: 0.9
      },
      {
        name: 'currency_generic',
        description: 'Generic currency amounts',
        pattern: /^[\d,]+\.\d{2}$/,
        weight: 0.7
      },

      // Timestamp patterns
      {
        name: 'iso_datetime',
        description: 'ISO 8601 datetime',
        pattern: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/,
        weight: 0.95,
        validator: (value: string) => !isNaN(Date.parse(value))
      },
      {
        name: 'iso_date',
        description: 'ISO date format',
        pattern: /^\d{4}-\d{2}-\d{2}$/,
        weight: 0.9,
        validator: (value: string) => !isNaN(Date.parse(value))
      },
      {
        name: 'us_date',
        description: 'US date format (MM/DD/YYYY)',
        pattern: /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/\d{4}$/,
        weight: 0.85
      },
      {
        name: 'unix_timestamp',
        description: 'Unix timestamp',
        pattern: /^\d{10}$/,
        weight: 0.8,
        validator: (value: string) => {
          const num = parseInt(value);
          return num > 946684800 && num < 4102444800; // 2000-2100
        }
      },
      {
        name: 'unix_timestamp_ms',
        description: 'Unix timestamp (milliseconds)',
        pattern: /^\d{13}$/,
        weight: 0.8,
        validator: (value: string) => {
          const num = parseInt(value);
          return num > 946684800000 && num < 4102444800000; // 2000-2100
        }
      },

      // ID patterns
      {
        name: 'uuid',
        description: 'UUID',
        pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        weight: 0.95
      },
      {
        name: 'auto_increment_id',
        description: 'Auto-increment ID',
        pattern: /^\d+$/,
        weight: 0.6,
        validator: (value: string) => {
          const num = parseInt(value);
          return num > 0 && num < 1000000000; // Reasonable ID range
        }
      },
      {
        name: 'alphanumeric_id',
        description: 'Alphanumeric ID',
        pattern: /^[A-Za-z]+[_-]?[A-Za-z0-9]{3,}$/,
        weight: 0.8
      },
      {
        name: 'prefixed_id',
        description: 'Prefixed ID pattern',
        pattern: /^[A-Za-z]{2,}_[A-Za-z0-9]{3,}$/,
        weight: 0.85
      },

      // Geographic patterns
      {
        name: 'us_zip_code',
        description: 'US ZIP code',
        pattern: /^\d{5}(-\d{4})?$/,
        weight: 0.9
      },
      {
        name: 'us_zip_plus4',
        description: 'US ZIP+4 code',
        pattern: /^\d{5}-\d{4}$/,
        weight: 0.95
      },
      {
        name: 'postal_code_ca',
        description: 'Canadian postal code',
        pattern: /^[A-Za-z]\d[A-Za-z] \d[A-Za-z]\d$/,
        weight: 0.9
      },
      {
        name: 'postal_code_uk',
        description: 'UK postal code',
        pattern: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s\d[A-Za-z]{2}$/,
        weight: 0.9
      },

      // Phone patterns
      {
        name: 'phone_us',
        description: 'US phone number',
        pattern: /^(\+1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/,
        weight: 0.85
      },
      {
        name: 'phone_international',
        description: 'International phone number',
        pattern: /^\+[1-9]\d{1,14}$/,
        weight: 0.8
      },

      // IP addresses
      {
        name: 'ipv4',
        description: 'IPv4 address',
        pattern: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
        weight: 0.95
      },
      {
        name: 'ipv6',
        description: 'IPv6 address',
        pattern: /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
        weight: 0.95
      },

      // URLs
      {
        name: 'url',
        description: 'URL',
        pattern: /^https?:\/\/(?:[-\w.])+(?::[0-9]+)?(?:\/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?$/,
        weight: 0.9
      },

      // Social Security Numbers
      {
        name: 'ssn',
        description: 'Social Security Number',
        pattern: /^\d{3}-\d{2}-\d{4}$/,
        weight: 0.95
      },

      // Credit Card Numbers
      {
        name: 'credit_card',
        description: 'Credit card number',
        pattern: /^\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}$/,
        weight: 0.8,
        validator: (value: string) => this.luhnCheck(value.replace(/[-\s]/g, ''))
      },

      // Percentage
      {
        name: 'percentage',
        description: 'Percentage',
        pattern: /^\d+(\.\d+)?%$/,
        weight: 0.8
      },

      // Boolean patterns
      {
        name: 'boolean',
        description: 'Boolean values',
        pattern: /^(true|false|yes|no|y|n|1|0)$/i,
        weight: 0.9
      }
    ];
  }

  public analyzeColumn(values: string[]): PatternMatch[] {
    const results: PatternMatch[] = [];
    const sampleSize = Math.min(values.length, 1000);
    const sampleValues = values.slice(0, sampleSize);

    for (const detector of this.detectors) {
      const matches: string[] = [];
      let matchCount = 0;

      for (const value of sampleValues) {
        if (value && detector.pattern.test(value)) {
          if (!detector.validator || detector.validator(value)) {
            matchCount++;
            if (matches.length < 5) {
              matches.push(value);
            }
          }
        }
      }

      if (matchCount > 0) {
        const confidence = (matchCount / sampleSize) * detector.weight;

        results.push({
          pattern: detector.name,
          confidence,
          matchCount,
          totalCount: sampleSize,
          examples: matches
        });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  public getDetector(name: string): PatternDetector | undefined {
    return this.detectors.find(d => d.name === name);
  }

  public getAllDetectors(): PatternDetector[] {
    return [...this.detectors];
  }

  private isValidEmail(email: string): boolean {
    const parts = email.split('@');
    if (parts.length !== 2) return false;

    const [local, domain] = parts;
    if (local.length === 0 || local.length > 64) return false;
    if (domain.length === 0 || domain.length > 255) return false;

    return true;
  }

  private luhnCheck(cardNumber: string): boolean {
    let sum = 0;
    let alternate = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let n = parseInt(cardNumber.charAt(i), 10);

      if (alternate) {
        n *= 2;
        if (n > 9) {
          n = (n % 10) + 1;
        }
      }

      sum += n;
      alternate = !alternate;
    }

    return (sum % 10) === 0;
  }
}