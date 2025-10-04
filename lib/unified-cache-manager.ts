/**
 * Unified Cache Manager for Google Ads Data
 * Eliminates cache complexity and ensures data consistency
 */

export interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  isValid: boolean;
  accountId?: string;
  dateRange: string;
  priority: number; // 1=high (recent), 2=medium, 3=low (historical)
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  averageAge: number;
  staleEntries: number;
}

export class UnifiedCacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;
  private maxSize = 1000; // Prevent memory bloat
  
  // TTL configuration in milliseconds
  private ttlConfig = {
    individual: 10 * 60 * 1000,    // 10 minutes for individual accounts
    aggregated: 15 * 60 * 1000,    // 15 minutes for all accounts view
    cost: 20 * 60 * 1000,          // 20 minutes for cost data (most stable)
    historical: 60 * 60 * 1000,    // 1 hour for historical data
  };

  /**
   * Generate consistent cache key
   */
  private generateKey(
    startDate: string, 
    endDate: string, 
    accountId: string | null,
    dataType: 'individual' | 'aggregated' | 'cost' = 'individual'
  ): string {
    const account = accountId || 'all';
    return `${dataType}:${account}:${startDate}:${endDate}`;
  }

  /**
   * Store data in cache with intelligent TTL
   */
  set(
    startDate: string,
    endDate: string,
    accountId: string | null,
    data: any,
    options: {
      dataType?: 'individual' | 'aggregated' | 'cost';
      priority?: number;
      customTTL?: number;
    } = {}
  ): void {
    const { dataType = 'individual', priority = 1, customTTL } = options;
    const key = this.generateKey(startDate, endDate, accountId, dataType);
    
    // Determine TTL based on data type and date range
    let ttl = customTTL;
    if (!ttl) {
      ttl = this.ttlConfig[dataType];
      
      // Extend TTL for historical data
      const daysDiff = this.getDaysDifference(startDate, endDate);
      if (daysDiff > 7) {
        ttl = this.ttlConfig.historical;
      }
    }
    
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl,
      isValid: true,
      accountId,
      dateRange: `${startDate}:${endDate}`,
      priority
    };

    this.cache.set(key, entry);
    
    // Cleanup if cache is getting too large
    if (this.cache.size > this.maxSize) {
      this.cleanup();
    }

    console.log(`[UNIFIED_CACHE] Stored ${key} with TTL ${ttl}ms, priority ${priority}`);
  }

  /**
   * Retrieve data from cache
   */
  get(
    startDate: string,
    endDate: string,
    accountId: string | null,
    dataType: 'individual' | 'aggregated' | 'cost' = 'individual'
  ): {
    data: any | null;
    isHit: boolean;
    isStale: boolean;
    age: number;
  } {
    const key = this.generateKey(startDate, endDate, accountId, dataType);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return { data: null, isHit: false, isStale: false, age: 0 };
    }

    const age = Date.now() - entry.timestamp;
    const isStale = age > entry.ttl;
    
    if (isStale && entry.priority === 1) {
      // Remove stale high-priority entries immediately
      this.cache.delete(key);
      this.misses++;
      return { data: null, isHit: false, isStale: true, age };
    }

    this.hits++;
    
    console.log(`[UNIFIED_CACHE] Hit ${key}, age: ${Math.round(age/1000)}s, stale: ${isStale}`);
    
    return {
      data: entry.data,
      isHit: true,
      isStale,
      age
    };
  }

  /**
   * Get data with fallback strategy
   */
  getWithFallback(
    startDate: string,
    endDate: string,
    accountId: string | null,
    preferredTypes: ('individual' | 'aggregated' | 'cost')[] = ['individual', 'cost', 'aggregated']
  ): {
    data: any | null;
    source: string;
    isStale: boolean;
    age: number;
  } {
    for (const dataType of preferredTypes) {
      const result = this.get(startDate, endDate, accountId, dataType);
      if (result.isHit) {
        return {
          data: result.data,
          source: dataType,
          isStale: result.isStale,
          age: result.age
        };
      }
    }
    
    return { data: null, source: 'none', isStale: false, age: 0 };
  }

  /**
   * Check if we should fetch fresh data
   */
  shouldRefresh(
    startDate: string,
    endDate: string,
    accountId: string | null,
    dataType: 'individual' | 'aggregated' | 'cost' = 'individual'
  ): {
    shouldRefresh: boolean;
    reason: string;
    backgroundRefresh: boolean;
  } {
    const result = this.get(startDate, endDate, accountId, dataType);
    
    if (!result.isHit) {
      return {
        shouldRefresh: true,
        reason: 'cache_miss',
        backgroundRefresh: false
      };
    }
    
    if (result.isStale) {
      return {
        shouldRefresh: true,
        reason: 'stale_data',
        backgroundRefresh: false
      };
    }
    
    // Background refresh if data is > 50% of TTL age
    const refreshThreshold = this.ttlConfig[dataType] * 0.5;
    if (result.age > refreshThreshold) {
      return {
        shouldRefresh: false,
        reason: 'background_refresh_due',
        backgroundRefresh: true
      };
    }
    
    return {
      shouldRefresh: false,
      reason: 'fresh_data',
      backgroundRefresh: false
    };
  }

  /**
   * Invalidate cache entries
   */
  invalidate(pattern?: {
    accountId?: string;
    dateRange?: string;
    dataType?: 'individual' | 'aggregated' | 'cost';
  }): number {
    let deletedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      let shouldDelete = false;
      
      if (pattern?.accountId && entry.accountId !== pattern.accountId) {
        continue;
      }
      
      if (pattern?.dateRange && entry.dateRange !== pattern.dateRange) {
        continue;
      }
      
      if (pattern?.dataType && !key.startsWith(pattern.dataType + ':')) {
        continue;
      }
      
      if (!pattern) {
        shouldDelete = true; // Delete all if no pattern
      } else {
        shouldDelete = true; // Delete if matches pattern
      }
      
      if (shouldDelete) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    console.log(`[UNIFIED_CACHE] Invalidated ${deletedCount} entries`);
    return deletedCount;
  }

  /**
   * Cleanup old and low-priority entries
   */
  private cleanup(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by priority (higher number = lower priority) and age
    entries.sort((a, b) => {
      const [, entryA] = a;
      const [, entryB] = b;
      
      // First by priority
      if (entryA.priority !== entryB.priority) {
        return entryB.priority - entryA.priority;
      }
      
      // Then by age
      return entryB.timestamp - entryA.timestamp;
    });
    
    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      const [key] = entries[entries.length - 1 - i];
      this.cache.delete(key);
    }
    
    console.log(`[UNIFIED_CACHE] Cleaned up ${toRemove} entries, size now: ${this.cache.size}`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    
    let totalAge = 0;
    let staleEntries = 0;
    const now = Date.now();
    
    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      totalAge += age;
      
      if (age > entry.ttl) {
        staleEntries++;
      }
    }
    
    return {
      totalEntries: this.cache.size,
      hitRate: Math.round(hitRate * 100) / 100,
      averageAge: this.cache.size > 0 ? Math.round(totalAge / this.cache.size / 1000) : 0,
      staleEntries
    };
  }

  /**
   * Helper: Calculate days difference
   */
  private getDaysDifference(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Get all cache keys for debugging
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}

// Global instance
export const unifiedCache = new UnifiedCacheManager();

