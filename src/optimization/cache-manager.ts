import { StableColumnAnchor, ColumnFingerprint } from '../types/anchor.types';

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  size: number;
  ttl?: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  memoryUsage: number;
  entryCount: number;
}

interface CacheConfig {
  l1MaxSize: number;      // L1 cache max entries (hot data)
  l2MaxSize: number;      // L2 cache max entries (warm data)
  l3MaxSize: number;      // L3 cache max entries (cold data)
  defaultTTL: number;     // Default TTL in milliseconds
  maxMemoryMB: number;    // Max memory usage in MB
  evictionPolicy: 'LRU' | 'LFU' | 'ADAPTIVE';
  compressionThreshold: number; // Compress entries larger than this
}

type CacheKey = string;
type CacheValue = StableColumnAnchor | ColumnFingerprint | any;

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private maxSize: number;
  private stats: CacheStats;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      memoryUsage: 0,
      entryCount: 0
    };
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Check TTL
    if (entry.ttl && Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access tracking
    entry.accessCount++;
    entry.timestamp = Date.now();
    this.moveToFront(key);

    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const size = this.calculateSize(value);

    if (this.cache.has(key)) {
      // Update existing entry
      const entry = this.cache.get(key)!;
      this.stats.memoryUsage = this.stats.memoryUsage - entry.size + size;
      entry.value = value;
      entry.timestamp = Date.now();
      entry.size = size;
      if (ttl) entry.ttl = ttl;
      this.moveToFront(key);
    } else {
      // New entry
      if (this.cache.size >= this.maxSize) {
        this.evictLRU();
      }

      const entry: CacheEntry<T> = {
        value,
        timestamp: Date.now(),
        accessCount: 1,
        size,
        ttl
      };

      this.cache.set(key, entry);
      this.accessOrder.unshift(key);
      this.stats.memoryUsage += size;
      this.stats.entryCount++;
    }
  }

  private evictLRU(): void {
    const lruKey = this.accessOrder.pop();
    if (lruKey) {
      const entry = this.cache.get(lruKey);
      if (entry) {
        this.stats.memoryUsage -= entry.size;
        this.stats.evictions++;
        this.stats.entryCount--;
      }
      this.cache.delete(lruKey);
    }
  }

  private moveToFront(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.unshift(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private calculateSize(value: any): number {
    // Rough estimation of memory size
    return JSON.stringify(value).length * 2; // UTF-16 characters
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      memoryUsage: 0,
      entryCount: 0
    };
  }
}

export class MultiTierCacheManager {
  private l1Cache: LRUCache<CacheValue>; // Hot data - most frequently accessed
  private l2Cache: LRUCache<CacheValue>; // Warm data - occasionally accessed
  private l3Cache: LRUCache<CacheValue>; // Cold data - rarely accessed
  private config: CacheConfig;
  private globalStats: CacheStats;
  private compressionCache = new Map<string, string>(); // Compressed data storage

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      l1MaxSize: 1000,        // Hot cache - 1K entries
      l2MaxSize: 10000,       // Warm cache - 10K entries
      l3MaxSize: 100000,      // Cold cache - 100K entries
      defaultTTL: 3600000,    // 1 hour default TTL
      maxMemoryMB: 512,       // 512MB max memory
      evictionPolicy: 'ADAPTIVE',
      compressionThreshold: 1024, // Compress entries > 1KB
      ...config
    };

    this.l1Cache = new LRUCache(this.config.l1MaxSize);
    this.l2Cache = new LRUCache(this.config.l2MaxSize);
    this.l3Cache = new LRUCache(this.config.l3MaxSize);

    this.globalStats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      memoryUsage: 0,
      entryCount: 0
    };
  }

  get(key: CacheKey): CacheValue | undefined {
    // Try L1 first (hottest data)
    let value = this.l1Cache.get(key);
    if (value !== undefined) {
      this.updateGlobalStats();
      return this.maybeDecompress(value);
    }

    // Try L2 next (warm data)
    value = this.l2Cache.get(key);
    if (value !== undefined) {
      // Promote to L1 on access
      this.l1Cache.set(key, value);
      this.updateGlobalStats();
      return this.maybeDecompress(value);
    }

    // Try L3 last (cold data)
    value = this.l3Cache.get(key);
    if (value !== undefined) {
      // Promote to L2 on access
      this.l2Cache.set(key, value);
      this.updateGlobalStats();
      return this.maybeDecompress(value);
    }

    this.updateGlobalStats();
    return undefined;
  }

  set(key: CacheKey, value: CacheValue, options: { ttl?: number; tier?: 1 | 2 | 3 } = {}): void {
    const compressed = this.maybeCompress(value);
    const { ttl, tier } = options;

    if (tier === 1 || this.shouldPromoteToL1(key, value)) {
      this.l1Cache.set(key, compressed, ttl);
    } else if (tier === 2 || this.shouldPromoteToL2(key, value)) {
      this.l2Cache.set(key, compressed, ttl);
    } else {
      this.l3Cache.set(key, compressed, ttl);
    }

    this.updateGlobalStats();
    this.enforceMemoryLimits();
  }

  private shouldPromoteToL1(key: CacheKey, value: CacheValue): boolean {
    // Promote frequently accessed anchors and fingerprints
    if (this.isAnchor(value) || this.isFingerprint(value)) {
      return true;
    }
    return false;
  }

  private shouldPromoteToL2(key: CacheKey, value: CacheValue): boolean {
    // Promote medium-priority data
    return this.calculateSize(value) < 10000; // < 10KB
  }

  private isAnchor(value: any): value is StableColumnAnchor {
    return value && typeof value === 'object' && 'anchor_id' in value;
  }

  private isFingerprint(value: any): value is ColumnFingerprint {
    return value && typeof value === 'object' && 'column_hash' in value;
  }

  private maybeCompress(value: CacheValue): CacheValue {
    const size = this.calculateSize(value);
    if (size > this.config.compressionThreshold) {
      try {
        // Simple compression simulation - in production use zlib
        const compressed = JSON.stringify(value);
        const key = this.generateCompressionKey(compressed);
        this.compressionCache.set(key, compressed);
        return { __compressed: key };
      } catch (error) {
        return value; // Return original if compression fails
      }
    }
    return value;
  }

  private maybeDecompress(value: CacheValue): CacheValue {
    if (value && typeof value === 'object' && '__compressed' in value) {
      const compressed = this.compressionCache.get(value.__compressed as string);
      if (compressed) {
        try {
          return JSON.parse(compressed);
        } catch (error) {
          return value;
        }
      }
    }
    return value;
  }

  private generateCompressionKey(data: string): string {
    // Simple hash for compression key
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private calculateSize(value: any): number {
    return JSON.stringify(value).length * 2; // Rough UTF-16 estimate
  }

  private enforceMemoryLimits(): void {
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
    const currentMemory = this.getCurrentMemoryUsage();

    if (currentMemory > maxMemoryBytes) {
      // Evict from L3 first, then L2, then L1
      this.l3Cache.clear();

      if (this.getCurrentMemoryUsage() > maxMemoryBytes) {
        this.l2Cache.clear();
      }
    }
  }

  private getCurrentMemoryUsage(): number {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache.getStats();
    const l3Stats = this.l3Cache.getStats();

    return l1Stats.memoryUsage + l2Stats.memoryUsage + l3Stats.memoryUsage;
  }

  private updateGlobalStats(): void {
    const l1Stats = this.l1Cache.getStats();
    const l2Stats = this.l2Cache.getStats();
    const l3Stats = this.l3Cache.getStats();

    this.globalStats = {
      hits: l1Stats.hits + l2Stats.hits + l3Stats.hits,
      misses: l1Stats.misses + l2Stats.misses + l3Stats.misses,
      evictions: l1Stats.evictions + l2Stats.evictions + l3Stats.evictions,
      hitRate: 0,
      memoryUsage: l1Stats.memoryUsage + l2Stats.memoryUsage + l3Stats.memoryUsage,
      entryCount: l1Stats.entryCount + l2Stats.entryCount + l3Stats.entryCount
    };

    const total = this.globalStats.hits + this.globalStats.misses;
    this.globalStats.hitRate = total > 0 ? this.globalStats.hits / total : 0;
  }

  // Cache invalidation patterns for SCAs
  invalidateAnchor(anchorId: string): void {
    const patterns = [
      `anchor:${anchorId}`,
      `anchor:${anchorId}:*`,
      `fingerprint:${anchorId}`,
      `reconciliation:*:${anchorId}`
    ];

    patterns.forEach(pattern => {
      this.invalidatePattern(pattern);
    });
  }

  invalidateDataset(datasetName: string): void {
    const patterns = [
      `dataset:${datasetName}:*`,
      `reconciliation:${datasetName}:*`
    ];

    patterns.forEach(pattern => {
      this.invalidatePattern(pattern);
    });
  }

  private invalidatePattern(pattern: string): void {
    // Simple pattern matching - in production use more sophisticated matching
    [this.l1Cache, this.l2Cache, this.l3Cache].forEach(cache => {
      // This is a simplified implementation
      // In production, maintain key indexes for efficient pattern matching
    });
  }

  // Batch operations for better performance
  mget(keys: CacheKey[]): Map<CacheKey, CacheValue> {
    const results = new Map<CacheKey, CacheValue>();

    keys.forEach(key => {
      const value = this.get(key);
      if (value !== undefined) {
        results.set(key, value);
      }
    });

    return results;
  }

  mset(entries: Array<{ key: CacheKey; value: CacheValue; options?: any }>): void {
    entries.forEach(({ key, value, options }) => {
      this.set(key, value, options);
    });
  }

  // Performance optimization methods
  preload(keys: CacheKey[], loader: (key: CacheKey) => Promise<CacheValue>): Promise<void> {
    return Promise.all(
      keys.map(async key => {
        if (this.get(key) === undefined) {
          try {
            const value = await loader(key);
            this.set(key, value, { tier: 3 }); // Load into cold cache
          } catch (error) {
            console.error(`Failed to preload cache key ${key}:`, error);
          }
        }
      })
    ).then(() => undefined);
  }

  warmup(anchorIds: string[]): void {
    anchorIds.forEach(id => {
      // Move frequently accessed anchors to L1
      const key = `anchor:${id}`;
      const value = this.l3Cache.get(key) || this.l2Cache.get(key);
      if (value) {
        this.l1Cache.set(key, value);
      }
    });
  }

  getStats(): {
    global: CacheStats;
    l1: CacheStats;
    l2: CacheStats;
    l3: CacheStats;
    compressionRatio: number;
  } {
    return {
      global: { ...this.globalStats },
      l1: this.l1Cache.getStats(),
      l2: this.l2Cache.getStats(),
      l3: this.l3Cache.getStats(),
      compressionRatio: this.compressionCache.size / Math.max(1, this.globalStats.entryCount)
    };
  }

  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
    this.l3Cache.clear();
    this.compressionCache.clear();
    this.updateGlobalStats();
  }

  // Utility methods for cache key generation
  static anchorKey(anchorId: string): string {
    return `anchor:${anchorId}`;
  }

  static fingerprintKey(columnHash: string): string {
    return `fingerprint:${columnHash}`;
  }

  static reconciliationKey(datasetName: string, columnName: string): string {
    return `reconciliation:${datasetName}:${columnName}`;
  }
}

// Global cache instance with optimized settings for SCA workloads
export const globalCacheManager = new MultiTierCacheManager({
  l1MaxSize: 5000,       // 5K hot anchors/fingerprints
  l2MaxSize: 50000,      // 50K warm data
  l3MaxSize: 500000,     // 500K cold storage
  defaultTTL: 7200000,   // 2 hours
  maxMemoryMB: 1024,     // 1GB max memory
  evictionPolicy: 'ADAPTIVE',
  compressionThreshold: 512 // Compress > 512 bytes
});