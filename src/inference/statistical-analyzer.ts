export interface StatisticalMetrics {
  dataType: 'numeric' | 'string' | 'date' | 'boolean' | 'mixed';
  nullCount: number;
  uniqueCount: number;
  totalCount: number;
  nullPercentage: number;
  uniquePercentage: number;
  avgLength?: number;
  minLength?: number;
  maxLength?: number;
  numericStats?: NumericStats;
  stringStats?: StringStats;
  temporalStats?: TemporalStats;
}

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  isInteger: boolean;
  hasDecimals: boolean;
  negativeCount: number;
  zeroCount: number;
  positiveCount: number;
}

export interface StringStats {
  avgLength: number;
  minLength: number;
  maxLength: number;
  commonPrefixes: string[];
  commonSuffixes: string[];
  hasConsistentFormat: boolean;
  casePattern: 'upper' | 'lower' | 'mixed' | 'title';
  containsNumbers: boolean;
  containsSpecialChars: boolean;
}

export interface TemporalStats {
  minDate: Date;
  maxDate: Date;
  dateRange: number; // in days
  commonFormats: string[];
  hasTime: boolean;
  hasTimezone: boolean;
  isSequential: boolean;
}

export interface DataTypeInference {
  primaryType: string;
  confidence: number;
  subtype?: string;
  reasoning: string[];
}

export class StatisticalAnalyzer {
  public analyzeColumn(values: any[]): StatisticalMetrics {
    const nonNullValues = values.filter(v => v != null && v !== '');
    const nullCount = values.length - nonNullValues.length;
    const uniqueValues = new Set(nonNullValues);

    const metrics: StatisticalMetrics = {
      dataType: this.inferPrimaryDataType(nonNullValues),
      nullCount,
      uniqueCount: uniqueValues.size,
      totalCount: values.length,
      nullPercentage: (nullCount / values.length) * 100,
      uniquePercentage: (uniqueValues.size / nonNullValues.length) * 100
    };

    // Add type-specific analysis
    if (metrics.dataType === 'numeric') {
      metrics.numericStats = this.analyzeNumericData(nonNullValues);
    } else if (metrics.dataType === 'string') {
      metrics.stringStats = this.analyzeStringData(nonNullValues.map(v => String(v)));
    } else if (metrics.dataType === 'date') {
      metrics.temporalStats = this.analyzeTemporalData(nonNullValues);
    }

    // Calculate length statistics for all types
    const lengths = nonNullValues.map(v => String(v).length);
    if (lengths.length > 0) {
      metrics.avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      metrics.minLength = Math.min(...lengths);
      metrics.maxLength = Math.max(...lengths);
    }

    return metrics;
  }

  public inferDataType(values: any[]): DataTypeInference {
    const nonNullValues = values.filter(v => v != null && v !== '');
    const sampleSize = Math.min(nonNullValues.length, 1000);
    const sample = nonNullValues.slice(0, sampleSize);

    const typeScores = {
      numeric: 0,
      string: 0,
      date: 0,
      boolean: 0,
      mixed: 0
    };

    const reasoning: string[] = [];

    // Analyze each value
    for (const value of sample) {
      const str = String(value);

      // Check if numeric
      if (this.isNumeric(str)) {
        typeScores.numeric++;
      }

      // Check if date
      if (this.isDate(str)) {
        typeScores.date++;
      }

      // Check if boolean
      if (this.isBoolean(str)) {
        typeScores.boolean++;
      }

      // Always counts as string
      typeScores.string++;
    }

    // Normalize scores
    const total = sample.length;
    Object.keys(typeScores).forEach(key => {
      typeScores[key as keyof typeof typeScores] = (typeScores[key as keyof typeof typeScores] / total) * 100;
    });

    // Determine primary type
    let primaryType = 'string';
    let confidence = typeScores.string;

    if (typeScores.numeric > 80) {
      primaryType = 'numeric';
      confidence = typeScores.numeric;
      reasoning.push(`${typeScores.numeric.toFixed(1)}% of values are numeric`);
    } else if (typeScores.date > 70) {
      primaryType = 'date';
      confidence = typeScores.date;
      reasoning.push(`${typeScores.date.toFixed(1)}% of values are dates`);
    } else if (typeScores.boolean > 90) {
      primaryType = 'boolean';
      confidence = typeScores.boolean;
      reasoning.push(`${typeScores.boolean.toFixed(1)}% of values are boolean`);
    } else if (typeScores.numeric > 50) {
      primaryType = 'mixed';
      confidence = 60;
      reasoning.push('Mixed numeric and string values detected');
    }

    // Add uniqueness reasoning
    const uniquePercentage = (new Set(sample).size / sample.length) * 100;
    if (uniquePercentage > 95) {
      reasoning.push('High uniqueness suggests identifier or key');
    } else if (uniquePercentage < 10) {
      reasoning.push('Low uniqueness suggests categorical data');
    }

    return {
      primaryType,
      confidence,
      reasoning
    };
  }

  private inferPrimaryDataType(values: any[]): 'numeric' | 'string' | 'date' | 'boolean' | 'mixed' {
    if (values.length === 0) return 'string';

    const sample = values.slice(0, Math.min(100, values.length));

    let numericCount = 0;
    let dateCount = 0;
    let booleanCount = 0;

    for (const value of sample) {
      const str = String(value);

      if (this.isNumeric(str)) numericCount++;
      if (this.isDate(str)) dateCount++;
      if (this.isBoolean(str)) booleanCount++;
    }

    const total = sample.length;

    if (numericCount / total > 0.8) return 'numeric';
    if (dateCount / total > 0.7) return 'date';
    if (booleanCount / total > 0.9) return 'boolean';
    if (numericCount / total > 0.5) return 'mixed';

    return 'string';
  }

  private analyzeNumericData(values: any[]): NumericStats {
    const numbers = values
      .map(v => parseFloat(String(v)))
      .filter(n => !isNaN(n));

    numbers.sort((a, b) => a - b);

    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / numbers.length;
    const median = numbers.length % 2 === 0
      ? (numbers[numbers.length / 2 - 1] + numbers[numbers.length / 2]) / 2
      : numbers[Math.floor(numbers.length / 2)];

    const variance = numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numbers.length;
    const stdDev = Math.sqrt(variance);

    const isInteger = numbers.every(n => Number.isInteger(n));
    const hasDecimals = numbers.some(n => !Number.isInteger(n));

    const negativeCount = numbers.filter(n => n < 0).length;
    const zeroCount = numbers.filter(n => n === 0).length;
    const positiveCount = numbers.filter(n => n > 0).length;

    return {
      min: numbers[0],
      max: numbers[numbers.length - 1],
      mean,
      median,
      stdDev,
      isInteger,
      hasDecimals,
      negativeCount,
      zeroCount,
      positiveCount
    };
  }

  private analyzeStringData(values: string[]): StringStats {
    const lengths = values.map(v => v.length);
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const minLength = Math.min(...lengths);
    const maxLength = Math.max(...lengths);

    // Analyze prefixes and suffixes
    const prefixes = new Map<string, number>();
    const suffixes = new Map<string, number>();

    values.forEach(value => {
      if (value.length >= 3) {
        const prefix = value.substring(0, 3);
        const suffix = value.substring(value.length - 3);
        prefixes.set(prefix, (prefixes.get(prefix) || 0) + 1);
        suffixes.set(suffix, (suffixes.get(suffix) || 0) + 1);
      }
    });

    const commonPrefixes = Array.from(prefixes.entries())
      .filter(([_, count]) => count > values.length * 0.1)
      .map(([prefix]) => prefix);

    const commonSuffixes = Array.from(suffixes.entries())
      .filter(([_, count]) => count > values.length * 0.1)
      .map(([suffix]) => suffix);

    // Check case patterns
    const upperCount = values.filter(v => v === v.toUpperCase()).length;
    const lowerCount = values.filter(v => v === v.toLowerCase()).length;
    const titleCount = values.filter(v => v === this.toTitleCase(v)).length;

    let casePattern: 'upper' | 'lower' | 'mixed' | 'title' = 'mixed';
    if (upperCount / values.length > 0.8) casePattern = 'upper';
    else if (lowerCount / values.length > 0.8) casePattern = 'lower';
    else if (titleCount / values.length > 0.8) casePattern = 'title';

    const containsNumbers = values.some(v => /\d/.test(v));
    const containsSpecialChars = values.some(v => /[^a-zA-Z0-9\s]/.test(v));

    // Check format consistency
    const lengthVariance = this.calculateVariance(lengths);
    const hasConsistentFormat = lengthVariance < 2 && (commonPrefixes.length > 0 || commonSuffixes.length > 0);

    return {
      avgLength,
      minLength,
      maxLength,
      commonPrefixes,
      commonSuffixes,
      hasConsistentFormat,
      casePattern,
      containsNumbers,
      containsSpecialChars
    };
  }

  private analyzeTemporalData(values: any[]): TemporalStats {
    const dates = values
      .map(v => new Date(String(v)))
      .filter(d => !isNaN(d.getTime()));

    dates.sort((a, b) => a.getTime() - b.getTime());

    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    const dateRange = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);

    const stringValues = values.map(v => String(v));
    const hasTime = stringValues.some(v => /\d{2}:\d{2}/.test(v));
    const hasTimezone = stringValues.some(v => /[+-]\d{2}:\d{2}|Z/.test(v));

    // Check if dates are sequential
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push(dates[i].getTime() - dates[i - 1].getTime());
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const intervalVariance = this.calculateVariance(intervals);
    const isSequential = intervalVariance < avgInterval * 0.1;

    // Detect common formats
    const formats = new Set<string>();
    stringValues.forEach(v => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) formats.add('YYYY-MM-DD');
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) formats.add('MM/DD/YYYY');
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) formats.add('ISO 8601');
    });

    return {
      minDate,
      maxDate,
      dateRange,
      commonFormats: Array.from(formats),
      hasTime,
      hasTimezone,
      isSequential
    };
  }

  private isNumeric(value: string): boolean {
    return !isNaN(parseFloat(value)) && isFinite(parseFloat(value));
  }

  private isDate(value: string): boolean {
    const date = new Date(value);
    return !isNaN(date.getTime()) && value.length > 6;
  }

  private isBoolean(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(normalized);
  }

  private toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    return numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numbers.length;
  }
}