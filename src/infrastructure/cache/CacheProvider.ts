/**
 * Cache Provider Implementation
 * Bridges to existing unified-cache-manager
 */

import { ICacheProvider, CacheOptions, CacheStats } from '../../domain/repositories/ICacheProvider';
import { unifiedCache } from '../../../lib/unified-cache-manager';

export class CacheProvider implements ICacheProvider {
  async get<T>(key: string): Promise<T | null> {
    try {
      // Parse key format: "type:account:startDate:endDate"
      const [dataType, accountId, startDate, endDate] = key.split(':');
      
      const result = unifiedCache.get(
        startDate,
        endDate,
        accountId === 'all' ? null : accountId,
        dataType as any
      );

      return result ? result.data as T : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    try {
      const [dataType, accountId, startDate, endDate] = key.split(':');
      
      unifiedCache.set(
        startDate,
        endDate,
        accountId === 'all' ? null : accountId,
        value,
        {
          dataType: dataType as any,
          priority: options?.priority || 2
        }
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const [dataType, accountId, startDate, endDate] = key.split(':');
      unifiedCache.invalidate(startDate, endDate, accountId === 'all' ? null : accountId);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clear(): Promise<void> {
    unifiedCache.clearAll();
  }

  async has(key: string): Promise<boolean> {
    const result = await this.get(key);
    return result !== null;
  }

  async getStats(): Promise<CacheStats> {
    const stats = unifiedCache.getStats();
    return {
      totalEntries: stats.totalEntries,
      hitRate: stats.hitRate,
      averageAge: stats.averageAge,
      staleEntries: stats.staleEntries
    };
  }

  /**
   * Build cache key
   */
  static buildKey(
    dataType: 'ads' | 'revenue',
    startDate: string,
    endDate: string,
    accountId?: string
  ): string {
    return `${dataType}:${accountId || 'all'}:${startDate}:${endDate}`;
  }
}

// Singleton instance
export const cacheProvider = new CacheProvider();

