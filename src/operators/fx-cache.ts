export enum OfflineMode {
  STRICT_OFFLINE = 'STRICT_OFFLINE',
  CACHE_FIRST = 'CACHE_FIRST',
  NETWORK_FIRST = 'NETWORK_FIRST',
  FORCE_NETWORK = 'FORCE_NETWORK'
}

export type ExchangeRateSource = 'cache' | 'ecb' | 'fed' | 'fallback';

export interface ExchangeRateResult {
  rate: number;
  timestamp: Date;
  source: ExchangeRateSource;
  fromCurrency: string;
  toCurrency: string;
  confidence: number;
  ageMs: number;
  stale: boolean;
}

export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set?(key: string, value: string): Promise<any>;
  setEx?(key: string, ttl: number, value: string): Promise<any>;
  expire?(key: string, ttl: number): Promise<any>;
}

export interface FXCacheConfig {
  ttlMs: number;
  enableRedis?: boolean;
  redisClient?: RedisLikeClient;
  fallbackRates?: Record<string, number>;
  dataSources?: Array<'ecb' | 'fed'>;
  defaultMode?: OfflineMode;
  timeoutMs?: number;
  ecbEndpoint?: string;
  fedEndpoint?: string;
}

interface CacheEntry {
  rate: number;
  timestamp: number;
  source: ExchangeRateSource;
}

export class FXCache {
  private memoryCache: Map<string, CacheEntry>;
  private config: FXCacheConfig;
  private lastFetchTime: Map<string, number>;
  private redisClient?: RedisLikeClient;
  private defaultMode: OfflineMode;
  private timeoutMs: number;

  constructor(ttlMs: number = 3600000, config: Partial<FXCacheConfig> = {}) {
    this.config = {
      ttlMs,
      enableRedis: false,
      dataSources: ['ecb'],
      ...config
    };
    this.memoryCache = new Map();
    this.lastFetchTime = new Map();
    this.redisClient = this.config.redisClient;
    if (this.config.enableRedis && !this.redisClient) {
      console.warn('FXCache: enableRedis is true but no redisClient provided; falling back to in-memory cache.');
    }
    this.defaultMode = this.config.defaultMode ?? OfflineMode.CACHE_FIRST;
    this.timeoutMs = this.config.timeoutMs ?? 5000;
  }

  private getCacheKey(fromCurrency: string, toCurrency: string): string {
    return `${fromCurrency}_${toCurrency}`;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > this.config.ttlMs;
  }

  private async getCachedEntry(fromCurrency: string, toCurrency: string): Promise<CacheEntry | null> {
    const cacheKey = this.getCacheKey(fromCurrency, toCurrency);
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry) {
      return memoryEntry;
    }

    if (this.redisClient) {
      try {
        const raw = await this.redisClient.get(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw) as CacheEntry;
          this.memoryCache.set(cacheKey, parsed);
          return parsed;
        }
      } catch (error) {
        console.warn(`FXCache: failed to read Redis entry for ${cacheKey}: ${error}`);
      }
    }

    return null;
  }

  private async storeCacheEntries(fromCurrency: string, toCurrency: string, entry: CacheEntry): Promise<void> {
    const cacheKey = this.getCacheKey(fromCurrency, toCurrency);
    const inverseKey = this.getCacheKey(toCurrency, fromCurrency);

    this.memoryCache.set(cacheKey, entry);
    this.memoryCache.set(inverseKey, {
      rate: 1 / entry.rate,
      timestamp: entry.timestamp,
      source: entry.source
    });

    if (this.redisClient) {
      const ttlSeconds = Math.max(1, Math.floor(this.config.ttlMs / 1000));
      const payload = JSON.stringify(entry);
      const inversePayload = JSON.stringify({
        rate: 1 / entry.rate,
        timestamp: entry.timestamp,
        source: entry.source
      });

      try {
        if (this.redisClient.setEx) {
          await this.redisClient.setEx(cacheKey, ttlSeconds, payload);
          await this.redisClient.setEx(inverseKey, ttlSeconds, inversePayload);
        } else if (this.redisClient.set) {
          await this.redisClient.set(cacheKey, payload);
          await this.redisClient.set(inverseKey, inversePayload);
          if (this.redisClient.expire) {
            await this.redisClient.expire(cacheKey, ttlSeconds);
            await this.redisClient.expire(inverseKey, ttlSeconds);
          }
        }
      } catch (error) {
        console.warn(`FXCache: failed to write to Redis for ${cacheKey}: ${error}`);
      }
    }

    this.lastFetchTime.set(cacheKey, entry.timestamp);
  }

  private toExchangeRateResult(
    fromCurrency: string,
    toCurrency: string,
    entry: CacheEntry,
    source: ExchangeRateSource,
    markStale: boolean
  ): ExchangeRateResult {
    const now = Date.now();
    const ageMs = now - entry.timestamp;
    const stale = markStale || this.isExpired(entry);

    let confidence = 1;
    switch (source) {
      case 'ecb':
      case 'fed':
        confidence = stale ? 0.7 : 1;
        break;
      case 'cache':
        confidence = stale ? 0.5 : 0.9;
        break;
      case 'fallback':
        confidence = 0.5;
        break;
      default:
        confidence = 0.6;
    }

    return {
      rate: entry.rate,
      timestamp: new Date(entry.timestamp),
      source,
      fromCurrency,
      toCurrency,
      confidence,
      ageMs,
      stale,
    };
  }

  private async fetchAndStore(
    fromCurrency: string,
    toCurrency: string,
    timeoutMs: number
  ): Promise<ExchangeRateResult> {
    const { rate, source } = await this.fetchExchangeRate(fromCurrency, toCurrency, timeoutMs);
    const timestamp = Date.now();
    const entry: CacheEntry = {
      rate,
      timestamp,
      source
    };
    await this.storeCacheEntries(fromCurrency, toCurrency, entry);
    return this.toExchangeRateResult(fromCurrency, toCurrency, entry, source, false);
  }

  private async fetchFromECB(fromCurrency: string, toCurrency: string, timeoutMs?: number): Promise<number> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.ecbEndpoint ?? 'https://api.exchangerate.host/latest'}?base=${fromCurrency}`,
        timeoutMs ?? this.timeoutMs
      );
      if (!response.ok) {
        throw new Error(`ECB API error: ${response.status}`);
      }

      const data = await response.json();
      const rate = data.rates?.[toCurrency];

      if (typeof rate !== 'number') {
        throw new Error(`Rate not found for ${fromCurrency} to ${toCurrency}`);
      }

      return rate;
    } catch (error) {
      throw new Error(`ECB fetch failed: ${error}`);
    }
  }

  private async fetchFromFed(fromCurrency: string, toCurrency: string, timeoutMs?: number): Promise<number> {
    if (fromCurrency !== 'USD' && toCurrency !== 'USD') {
      throw new Error('Fed API only supports USD pairs');
    }

    try {
      const symbol = fromCurrency === 'USD' ? `DEXUS${toCurrency}` : `DEXUS${fromCurrency}`;
      const endpoint = this.config.fedEndpoint ?? 'https://api.stlouisfed.org/fred/series/observations';
      const response = await this.fetchWithTimeout(
        `${endpoint}?series_id=${symbol}&api_key=demo&file_type=json&limit=1&sort_order=desc`,
        timeoutMs ?? this.timeoutMs
      );

      if (!response.ok) {
        throw new Error(`Fed API error: ${response.status}`);
      }

      const data = await response.json();
      const observations = data.observations;

      if (!observations || observations.length === 0) {
        throw new Error(`No data found for ${symbol}`);
      }

      const rate = parseFloat(observations[0].value);
      if (isNaN(rate)) {
        throw new Error(`Invalid rate data: ${observations[0].value}`);
      }

      return fromCurrency === 'USD' ? rate : 1 / rate;
    } catch (error) {
      throw new Error(`Fed fetch failed: ${error}`);
    }
  }

  private getFallbackRate(fromCurrency: string, toCurrency: string): number {
    const key = this.getCacheKey(fromCurrency, toCurrency);
    const reverseKey = this.getCacheKey(toCurrency, fromCurrency);

    if (this.config.fallbackRates?.[key]) {
      return this.config.fallbackRates[key];
    }

    if (this.config.fallbackRates?.[reverseKey]) {
      return 1 / this.config.fallbackRates[reverseKey];
    }

    // Basic fallback rates for common pairs
    const defaultRates: Record<string, number> = {
      'USD_EUR': 0.85,
      'USD_GBP': 0.75,
      'USD_JPY': 110,
      'USD_CAD': 1.25,
      'USD_AUD': 1.35,
      'USD_CHF': 0.92,
      'USD_CNY': 6.45,
      'USD_SEK': 8.5,
      'USD_NOK': 8.8,
      'EUR_GBP': 0.88,
      'EUR_JPY': 129,
    };

    if (defaultRates[key]) {
      return defaultRates[key];
    }

    const reverseDefault = defaultRates[reverseKey];
    if (reverseDefault) {
      return 1 / reverseDefault;
    }

    throw new Error(`No fallback rate available for ${fromCurrency} to ${toCurrency}`);
  }

  private async fetchExchangeRate(fromCurrency: string, toCurrency: string, timeoutMs?: number): Promise<{rate: number, source: ExchangeRateSource}> {
    const errors: string[] = [];

    const dataSources = (this.config.dataSources && this.config.dataSources.length > 0)
      ? this.config.dataSources
      : ['ecb'];

    if (dataSources.length === 0) {
      const rate = this.getFallbackRate(fromCurrency, toCurrency);
      return { rate, source: 'fallback' };
    }

    for (const source of dataSources) {
      try {
        let rate: number;

        switch (source) {
          case 'ecb':
            rate = await this.fetchFromECB(fromCurrency, toCurrency, timeoutMs);
            return { rate, source: 'ecb' };

          case 'fed':
            rate = await this.fetchFromFed(fromCurrency, toCurrency, timeoutMs);
            return { rate, source: 'fed' };

          default:
            throw new Error(`Unknown data source: ${source}`);
        }
      } catch (error) {
        errors.push(`${source}: ${error}`);
        continue;
      }
    }

    // All sources failed, try fallback
    try {
      const rate = this.getFallbackRate(fromCurrency, toCurrency);
      return { rate, source: 'fallback' };
    } catch (fallbackError) {
      throw new Error(`All sources failed. Errors: ${errors.join(', ')}. Fallback: ${fallbackError}`);
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      return response;
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async getExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    options: { mode?: OfflineMode; timeoutMs?: number } = {}
  ): Promise<ExchangeRateResult> {
    const mode = options.mode ?? this.defaultMode;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;

    if (fromCurrency === toCurrency) {
      const entry: CacheEntry = {
        rate: 1,
        timestamp: Date.now(),
        source: 'cache'
      };
      return this.toExchangeRateResult(fromCurrency, toCurrency, entry, 'cache', false);
    }

    const cached = await this.getCachedEntry(fromCurrency, toCurrency);
    const hasCache = Boolean(cached);
    const isExpired = cached ? this.isExpired(cached) : true;

    if (mode === OfflineMode.STRICT_OFFLINE) {
      if (!cached) {
        throw new Error(`No cached rate available for ${fromCurrency}→${toCurrency} in STRICT_OFFLINE mode.`);
      }
      return this.toExchangeRateResult(fromCurrency, toCurrency, cached, 'cache', true);
    }

    if (mode === OfflineMode.CACHE_FIRST) {
      if (cached && !isExpired) {
        return this.toExchangeRateResult(fromCurrency, toCurrency, cached, 'cache', false);
      }

      try {
        return await this.fetchAndStore(fromCurrency, toCurrency, timeoutMs);
      } catch (error) {
        if (cached) {
          console.warn(`Using stale FX rate for ${fromCurrency}/${toCurrency}: ${error}`);
          return this.toExchangeRateResult(fromCurrency, toCurrency, cached, 'cache', true);
        }
        throw error;
      }
    }

    if (mode === OfflineMode.NETWORK_FIRST) {
      try {
        return await this.fetchAndStore(fromCurrency, toCurrency, timeoutMs);
      } catch (error) {
        if (cached) {
          console.warn(`Network fetch failed for ${fromCurrency}/${toCurrency}. Falling back to cache: ${error}`);
          return this.toExchangeRateResult(fromCurrency, toCurrency, cached, 'cache', isExpired);
        }
        throw error;
      }
    }

    if (mode === OfflineMode.FORCE_NETWORK) {
      try {
        return await this.fetchAndStore(fromCurrency, toCurrency, timeoutMs);
      } catch (error) {
        if (hasCache) {
          console.warn(`FORCE_NETWORK failed for ${fromCurrency}/${toCurrency}. Returning cached rate: ${error}`);
          return this.toExchangeRateResult(fromCurrency, toCurrency, cached!, 'cache', true);
        }
        throw error;
      }
    }

    // Fallback to cache-first behaviour if mode is unrecognized
    if (cached && !isExpired) {
      return this.toExchangeRateResult(fromCurrency, toCurrency, cached, 'cache', false);
    }
    return this.fetchAndStore(fromCurrency, toCurrency, timeoutMs);
  }

  async preloadRates(
    currencyPairs: Array<{from: string, to: string}>,
    options: { mode?: OfflineMode } = {}
  ): Promise<void> {
    const mode = options.mode ?? OfflineMode.NETWORK_FIRST;
    const promises = currencyPairs.map(pair =>
      this.getExchangeRate(pair.from, pair.to, { mode }).catch(err =>
        console.warn(`Failed to preload ${pair.from}/${pair.to}: ${err}`)
      )
    );

    await Promise.all(promises);
  }

  getCacheStats(): {
    size: number;
    hitRate: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  } {
    const entries = Array.from(this.memoryCache.values());

    if (entries.length === 0) {
      return {
        size: 0,
        hitRate: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }

    const timestamps = entries.map(e => e.timestamp);
    const oldest = Math.min(...timestamps);
    const newest = Math.max(...timestamps);

    return {
      size: entries.length,
      hitRate: 0, // Would need to track hits/misses for accurate calculation
      oldestEntry: new Date(oldest),
      newestEntry: new Date(newest)
    };
  }

  clearCache(): void {
    this.memoryCache.clear();
    this.lastFetchTime.clear();
  }

  getSupportedCurrencies(): string[] {
    return [
      'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'NZD',
      'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK',
      'RUB', 'TRY', 'BRL', 'MXN', 'SGD', 'HKD', 'ZAR', 'KRW', 'THB',
      'MYR', 'IDR', 'PHP', 'INR', 'AED', 'SAR', 'QAR', 'KWD', 'BHD',
      'OMR', 'ILS', 'ARS', 'CLP', 'PEN', 'COP', 'VND', 'NGN', 'GHS',
      'KES', 'UGX', 'TZS', 'GEL', 'UAH', 'KZT', 'BTC'
    ];
  }

  async warmupCache(baseCurrency: string = 'USD'): Promise<void> {
    const currencies = this.getSupportedCurrencies().filter(c => c !== baseCurrency);
    const pairs = currencies.map(to => ({ from: baseCurrency, to }));
    await this.preloadRates(pairs);
  }
}
