import { readFileSync, existsSync } from 'fs';
import path from 'path';
import YAML from 'yaml';

import { FXCache, OfflineMode, ExchangeRateResult } from './fx-cache';

export interface ConversionMetadata {
  rateSource?: ExchangeRateResult['source'];
  rateAgeMs?: number;
  confidence?: number;
  audit?: {
    timestamp: Date;
    conversion: string;
    rate?: number;
    source?: ExchangeRateResult['source'];
    stalenessMs?: number;
  };
}

export interface ConversionResult {
  value: number;
  fromUnit: string;
  toUnit: string;
  rate?: number;
  timestamp: Date;
  metadata?: ConversionMetadata;
}

export interface UnitConversionConfig {
  cacheTTL?: number;
  fallbackRates?: Record<string, number>;
  unitMappingsPath?: string;
  offlineMode?: OfflineMode;
  commonCurrencyPairs?: Array<{ from: string; to: string }>;
}

export type UnitCategory = 'currency' | 'temperature' | 'distance' | 'time' | 'mass' | 'volume' | 'area';

export interface UnitDefinition {
  symbol: string;
  name: string;
  category: UnitCategory;
  baseUnit?: string;
  conversionFactor?: number;
  conversionFunction?: (value: number, fromUnit: string, toUnit: string) => number;
}

export class UnitConverter {
  private fxCache: FXCache;
  private config: UnitConversionConfig;
  private unitDefinitions: Map<string, UnitDefinition>;
  private aliases: Map<string, string>;
  private unitMappingsPath: string;

  constructor(config: UnitConversionConfig = {}) {
    this.config = {
      cacheTTL: 3600000,
      offlineMode: OfflineMode.CACHE_FIRST,
      ...config
    };

    this.unitMappingsPath = this.resolveMappingsPath(this.config.unitMappingsPath);
    this.fxCache = new FXCache(this.config.cacheTTL || 3600000, {
      fallbackRates: this.config.fallbackRates,
      defaultMode: this.config.offlineMode,
    });

    this.unitDefinitions = new Map();
    this.aliases = new Map();
    this.loadUnitsFromYAML();
  }

  private resolveMappingsPath(customPath?: string): string {
    const candidatePaths = [] as string[];
    if (customPath) {
      candidatePaths.push(path.resolve(customPath));
    }

    const moduleDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    candidatePaths.push(path.resolve(moduleDir, '../data/unit-mappings.yml'));
    candidatePaths.push(path.resolve(process.cwd(), 'semantics/mappings/unit-mappings.yml'));

    for (const candidate of candidatePaths) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    throw new Error('Unable to locate unit-mappings.yml. Provide unitMappingsPath in configuration.');
  }

  private loadUnitsFromYAML(): void {
    try {
      const fileContents = readFileSync(this.unitMappingsPath, 'utf8');
      const parsed = YAML.parse(fileContents) as any;

      const unitMap = new Map<string, UnitDefinition>();
      const aliasMap = new Map<string, string>();

      const unitsSection = parsed?.units ?? {};

      Object.entries(unitsSection).forEach(([categoryKey, unitEntries]) => {
        const typedCategory = this.normalizeCategory(categoryKey);
        if (!typedCategory) {
          return;
        }

        const baseSymbol = this.findBaseSymbol(unitEntries as Record<string, any>);

        Object.entries(unitEntries as Record<string, any>).forEach(([unitKey, unitConfig]) => {
          const canonicalKey = (unitConfig.iso_code || unitKey).toString();
          const symbol = (unitConfig.symbol || canonicalKey).toString();
          const name = unitConfig.name || canonicalKey;

          const baseUnitSymbol = unitConfig.base_unit ? canonicalKey : baseSymbol;

          const definition: UnitDefinition = {
            symbol,
            name,
            category: typedCategory,
            baseUnit: baseUnitSymbol,
          };

          if (unitConfig.conversion_type === 'function' && typedCategory === 'temperature') {
            definition.conversionFunction = this.convertTemperature.bind(this);
          }

          if (typeof unitConfig.factor === 'number') {
            definition.conversionFactor = unitConfig.factor;
          } else if (unitConfig.base_unit) {
            definition.conversionFactor = 1;
          }

          unitMap.set(canonicalKey, definition);

          const symbolAliasKey = symbol.toLowerCase();
          if (symbolAliasKey !== canonicalKey.toLowerCase()) {
            aliasMap.set(symbolAliasKey, canonicalKey);
          }

          aliasMap.set(canonicalKey.toLowerCase(), canonicalKey);
        });
      });

      const aliasSection = parsed?.aliases ?? {};
      Object.entries(aliasSection as Record<string, string>).forEach(([aliasKey, canonical]) => {
        aliasMap.set(aliasKey.toLowerCase(), canonical);
      });

      this.unitDefinitions = unitMap;
      this.aliases = aliasMap;
    } catch (error) {
      throw new Error(`Failed to load unit definitions: ${error}`);
    }
  }

  private normalizeCategory(category: string): UnitCategory | null {
    const normalized = category.toLowerCase();
    switch (normalized) {
      case 'currency':
      case 'temperature':
      case 'distance':
      case 'time':
      case 'mass':
      case 'volume':
      case 'area':
        return normalized as UnitCategory;
      default:
        return null;
    }
  }

  private findBaseSymbol(entries: Record<string, any>): string | undefined {
    for (const [unitKey, config] of Object.entries(entries)) {
      if (config.base_unit) {
        return config.iso_code || unitKey;
      }
    }
    return undefined;
  }

  refreshUnitDefinitions(): void {
    this.loadUnitsFromYAML();
  }

  private normalizeUnit(unit: string): string {
    if (!unit) {
      return unit;
    }

    const trimmed = unit.trim();
    if (this.unitDefinitions.has(trimmed)) {
      return trimmed;
    }

    const upper = trimmed.toUpperCase();
    if (this.unitDefinitions.has(upper)) {
      return upper;
    }

    const lower = trimmed.toLowerCase();
    const aliasTarget = this.aliases.get(lower);
    if (aliasTarget && this.unitDefinitions.has(aliasTarget)) {
      return aliasTarget;
    }

    return trimmed;
  }

  private convertTemperature(value: number, fromUnit: string, toUnit: string): number {
    // Convert to Celsius first
    let celsius: number;
    switch (fromUnit) {
      case 'C':
        celsius = value;
        break;
      case 'F':
        celsius = (value - 32) * 5/9;
        break;
      case 'K':
        celsius = value - 273.15;
        break;
      default:
        throw new Error(`Unsupported temperature unit: ${fromUnit}`);
    }

    // Convert from Celsius to target unit
    switch (toUnit) {
      case 'C':
        return celsius;
      case 'F':
        return (celsius * 9/5) + 32;
      case 'K':
        return celsius + 273.15;
      default:
        throw new Error(`Unsupported temperature unit: ${toUnit}`);
    }
  }

  async convert(value: number, fromUnit: string, toUnit: string): Promise<ConversionResult> {
    const startTime = Date.now();

    const normalizedFrom = this.normalizeUnit(fromUnit);
    const normalizedTo = this.normalizeUnit(toUnit);

    if (normalizedFrom === normalizedTo) {
      return {
        value,
        fromUnit: normalizedFrom,
        toUnit: normalizedTo,
        timestamp: new Date()
      };
    }

    const fromDef = this.unitDefinitions.get(normalizedFrom);
    const toDef = this.unitDefinitions.get(normalizedTo);

    if (!fromDef || !toDef) {
      throw new Error(`Unsupported unit conversion: ${fromUnit} to ${toUnit}`);
    }

    if (fromDef.category !== toDef.category) {
      throw new Error(`Cannot convert between different unit categories: ${fromDef.category} to ${toDef.category}`);
    }

    let convertedValue: number;
    let rate: number | undefined;
    let metadata: ConversionMetadata | undefined;

    switch (fromDef.category) {
      case 'currency': {
        const fxResult = await this.fxCache.getExchangeRate(normalizedFrom, normalizedTo, {
          mode: this.config.offlineMode,
        });
        convertedValue = value * fxResult.rate;
        rate = fxResult.rate;
        metadata = {
          rateSource: fxResult.source,
          rateAgeMs: fxResult.ageMs,
          confidence: fxResult.confidence,
          audit: {
            timestamp: fxResult.timestamp,
            conversion: `${normalizedFrom}→${normalizedTo}`,
            rate: fxResult.rate,
            source: fxResult.source,
            stalenessMs: fxResult.ageMs,
          }
        };
        break;
      }

      case 'temperature':
        if (fromDef.conversionFunction) {
          convertedValue = fromDef.conversionFunction(value, normalizedFrom, normalizedTo);
        } else {
          convertedValue = this.convertTemperature(value, normalizedFrom, normalizedTo);
        }
        metadata = { confidence: 1 };
        break;

      case 'distance':
      case 'time':
      case 'mass':
      case 'volume':
      case 'area': {
        // Convert to base unit first, then to target unit
        const baseValue = value * (fromDef.conversionFactor || 1);
        convertedValue = baseValue / (toDef.conversionFactor || 1);
        metadata = { confidence: 1 };
        break;
      }

      default:
        throw new Error(`Unsupported unit category: ${fromDef.category}`);
    }

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    if (elapsed > 50) {
      console.warn(`Unit conversion took ${elapsed}ms, exceeding 50ms target`);
    }

    return {
      value: convertedValue,
      fromUnit: normalizedFrom,
      toUnit: normalizedTo,
      rate,
      timestamp: new Date(),
      metadata
    };
  }

  async convertBatch(conversions: Array<{value: number, fromUnit: string, toUnit: string}>): Promise<ConversionResult[]> {
    const results = await Promise.all(
      conversions.map(conv => this.convert(conv.value, conv.fromUnit, conv.toUnit))
    );
    return results;
  }

  getSupportedUnits(category?: UnitCategory): string[] {
    if (category) {
      return Array.from(this.unitDefinitions.values())
        .filter(def => def.category === category)
        .map(def => def.symbol);
    }
    return Array.from(this.unitDefinitions.keys());
  }

  getUnitInfo(unit: string): UnitDefinition | undefined {
    const normalized = this.normalizeUnit(unit);
    return this.unitDefinitions.get(normalized);
  }

  addCustomUnit(definition: UnitDefinition): void {
    this.unitDefinitions.set(definition.symbol, definition);
  }

  async prefetchCommonRates(pairs: Array<{ from: string; to: string }> | undefined = this.config.commonCurrencyPairs): Promise<void> {
    const defaults = pairs ?? [
      { from: 'USD', to: 'EUR' },
      { from: 'EUR', to: 'GBP' },
      { from: 'USD', to: 'JPY' }
    ];

    await this.fxCache.preloadRates(defaults, { mode: OfflineMode.NETWORK_FIRST });
  }
}
