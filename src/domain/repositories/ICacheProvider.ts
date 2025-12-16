/**
 * ICacheProvider - Domain Repository Interface
 * Defines contract for caching mechanism
 * Infrastructure layer will implement this
 */

export interface CacheOptions {
  ttl?: number; 
  priority?: number; // Priority level (1=high, 2=medium, 3=low)
}

export interface ICacheProvider {
  /**
   * Get value from cache
   * @param key Cache key
   * @returns Promise<T | null> Cached value or null if not found/expired
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param options Cache options (ttl, priority)
   */
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;

  /**
   * Delete value from cache
   * @param key Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all cache entries
   */
  clear(): Promise<void>;

  /**
   * Check if key exists in cache
   * @param key Cache key
   * @returns Promise<boolean> True if exists and not expired
   */
  has(key: string): Promise<boolean>;

  /**
   * Get cache statistics
   * @returns Promise<CacheStats> Cache statistics
   */
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  averageAge: number;
  staleEntries: number;
}

