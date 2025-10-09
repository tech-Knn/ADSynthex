/**
 * Redis Client Wrapper
 * Supports both Upstash Redis (serverless) and standard Redis
 * With automatic fallback to in-memory cache if Redis is unavailable
 */

import { Redis } from '@upstash/redis';

interface RedisConfig {
  url?: string;
  token?: string;
  enabled: boolean;
}

class RedisClient {
  private client: Redis | null = null;
  private fallbackCache: Map<string, { value: string; expiry: number }> = new Map();
  private isConnected: boolean = false;
  private config: RedisConfig;

  constructor() {
    this.config = {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
      enabled: process.env.REDIS_ENABLED !== 'false' // Enabled by default
    };

    this.initialize();
  }

  private initialize() {
    if (!this.config.enabled) {
      console.log('[REDIS] Redis disabled by configuration, using in-memory fallback');
      return;
    }

    if (!this.config.url || !this.config.token) {
      console.warn('[REDIS] Redis credentials not found, using in-memory fallback');
      console.warn('[REDIS] Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable Redis');
      return;
    }

    try {
      this.client = new Redis({
        url: this.config.url,
        token: this.config.token,
      });
      this.isConnected = true;
      console.log('[REDIS] Connected to Upstash Redis successfully');
    } catch (error) {
      console.error('[REDIS] Failed to initialize Redis client:', error);
      console.warn('[REDIS] Falling back to in-memory cache');
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  isRedisConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get value from Redis or fallback cache
   */
  async get(key: string): Promise<string | null> {
    try {
      if (this.isConnected && this.client) {
        const value = await this.client.get<string>(key);
        return value;
      }

      // Fallback to in-memory cache
      return this.getFallback(key);
    } catch (error) {
      console.error(`[REDIS] Error getting key ${key}:`, error);
      return this.getFallback(key);
    }
  }

  /**
   * Set value in Redis or fallback cache
   */
  async set(key: string, value: string): Promise<void> {
    try {
      if (this.isConnected && this.client) {
        await this.client.set(key, value);
        return;
      }

      // Fallback to in-memory cache
      this.setFallback(key, value);
    } catch (error) {
      console.error(`[REDIS] Error setting key ${key}:`, error);
      this.setFallback(key, value);
    }
  }

  /**
   * Set value with expiry (TTL in seconds)
   */
  async setex(key: string, seconds: number, value: string): Promise<void> {
    try {
      if (this.isConnected && this.client) {
        await this.client.setex(key, seconds, value);
        return;
      }

      // Fallback to in-memory cache with expiry
      this.setFallback(key, value, seconds);
    } catch (error) {
      console.error(`[REDIS] Error setting key ${key} with expiry:`, error);
      this.setFallback(key, value, seconds);
    }
  }

  /**
   * Increment value
   */
  async incr(key: string): Promise<number> {
    try {
      if (this.isConnected && this.client) {
        const result = await this.client.incr(key);
        return result;
      }

      // Fallback to in-memory increment
      return this.incrFallback(key);
    } catch (error) {
      console.error(`[REDIS] Error incrementing key ${key}:`, error);
      return this.incrFallback(key);
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      if (this.isConnected && this.client) {
        const result = await this.client.expire(key, seconds);
        return result === 1;
      }

      // Fallback: update expiry in memory cache
      return this.expireFallback(key, seconds);
    } catch (error) {
      console.error(`[REDIS] Error setting expiry on key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete key
   */
  async del(key: string): Promise<number> {
    try {
      if (this.isConnected && this.client) {
        const result = await this.client.del(key);
        return result;
      }

      // Fallback: delete from memory cache
      return this.delFallback(key);
    } catch (error) {
      console.error(`[REDIS] Error deleting key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Execute multiple commands atomically (pipeline)
   */
  async multi(commands: Array<{ command: string; args: any[] }>): Promise<any[]> {
    try {
      if (this.isConnected && this.client) {
        const pipeline = this.client.pipeline();

        commands.forEach(({ command, args }) => {
          (pipeline as any)[command](...args);
        });

        const results = await pipeline.exec();
        return results;
      }

      // Fallback: execute commands sequentially
      return this.multiFallback(commands);
    } catch (error) {
      console.error('[REDIS] Error executing multi commands:', error);
      return this.multiFallback(commands);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (this.isConnected && this.client) {
        const result = await this.client.exists(key);
        return result === 1;
      }

      // Fallback
      return this.existsFallback(key);
    } catch (error) {
      console.error(`[REDIS] Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL of key (in seconds)
   */
  async ttl(key: string): Promise<number> {
    try {
      if (this.isConnected && this.client) {
        const result = await this.client.ttl(key);
        return result;
      }

      // Fallback
      return this.ttlFallback(key);
    } catch (error) {
      console.error(`[REDIS] Error getting TTL of key ${key}:`, error);
      return -2;
    }
  }

  // ============ FALLBACK METHODS (IN-MEMORY) ============

  private getFallback(key: string): string | null {
    const entry = this.fallbackCache.get(key);
    if (!entry) return null;

    // Check expiry
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.fallbackCache.delete(key);
      return null;
    }

    return entry.value;
  }

  private setFallback(key: string, value: string, ttlSeconds?: number): void {
    const expiry = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : 0;
    this.fallbackCache.set(key, { value, expiry });

    // Cleanup if cache gets too large
    if (this.fallbackCache.size > 1000) {
      this.cleanupFallbackCache();
    }
  }

  private incrFallback(key: string): number {
    const current = this.getFallback(key);
    const newValue = current ? parseInt(current) + 1 : 1;
    this.setFallback(key, newValue.toString());
    return newValue;
  }

  private expireFallback(key: string, seconds: number): boolean {
    const entry = this.fallbackCache.get(key);
    if (!entry) return false;

    entry.expiry = Date.now() + (seconds * 1000);
    return true;
  }

  private delFallback(key: string): number {
    return this.fallbackCache.delete(key) ? 1 : 0;
  }

  private existsFallback(key: string): boolean {
    const entry = this.fallbackCache.get(key);
    if (!entry) return false;

    // Check expiry
    if (entry.expiry > 0 && Date.now() > entry.expiry) {
      this.fallbackCache.delete(key);
      return false;
    }

    return true;
  }

  private ttlFallback(key: string): number {
    const entry = this.fallbackCache.get(key);
    if (!entry) return -2;

    if (entry.expiry === 0) return -1; // No expiry

    const remaining = Math.floor((entry.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  private async multiFallback(commands: Array<{ command: string; args: any[] }>): Promise<any[]> {
    const results: any[] = [];

    for (const { command, args } of commands) {
      try {
        let result: any;
        switch (command) {
          case 'set':
            await this.set(args[0], args[1]);
            result = 'OK';
            break;
          case 'setex':
            await this.setex(args[0], args[1], args[2]);
            result = 'OK';
            break;
          case 'incr':
            result = await this.incr(args[0]);
            break;
          case 'expire':
            result = await this.expire(args[0], args[1]);
            break;
          case 'get':
            result = await this.get(args[0]);
            break;
          case 'del':
            result = await this.del(args[0]);
            break;
          default:
            result = null;
        }
        results.push(result);
      } catch (error) {
        results.push(null);
      }
    }

    return results;
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    let deleteCount = 0;

    for (const [key, entry] of this.fallbackCache.entries()) {
      if (entry.expiry > 0 && now > entry.expiry) {
        this.fallbackCache.delete(key);
        deleteCount++;
      }
    }

    console.log(`[REDIS_FALLBACK] Cleaned up ${deleteCount} expired entries`);

    // If still too large, remove oldest 20%
    if (this.fallbackCache.size > 1000) {
      const toDelete = Math.floor(this.fallbackCache.size * 0.2);
      const keys = Array.from(this.fallbackCache.keys());
      for (let i = 0; i < toDelete; i++) {
        this.fallbackCache.delete(keys[i]);
      }
      console.log(`[REDIS_FALLBACK] Removed ${toDelete} oldest entries`);
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      connected: this.isRedisConnected(),
      mode: this.isRedisConnected() ? 'redis' : 'in-memory-fallback',
      fallbackCacheSize: this.fallbackCache.size,
      config: {
        enabled: this.config.enabled,
        hasCredentials: !!(this.config.url && this.config.token)
      }
    };
  }
}

// Global singleton instance
export const redisClient = new RedisClient();
