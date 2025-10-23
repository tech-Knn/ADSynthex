/**
 * User-Level Rate Limiter
 * Prevents individual users from exhausting API quota
 * Ensures fair resource allocation across all users
 */

import { redisClient } from './redis-client';

interface UserRateLimitResult {
  allowed: boolean;
  reason: string;
  remaining: number;
  resetIn: number; // seconds
  retryAfter?: number; // seconds
}

interface UserRateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstSize: number; // Allow short bursts
}

export class UserRateLimiter {
  private inMemoryCache: Map<string, { count: number; resetAt: number }> = new Map();

  // Rate limit profiles
  private profiles = {
    admin: {
      requestsPerMinute: 30,
      requestsPerHour: 300,
      requestsPerDay: 2000,
      burstSize: 10
    },
    user: {
      requestsPerMinute: 10,
      requestsPerHour: 100,
      requestsPerDay: 500,
      burstSize: 5
    },
    guest: {
      requestsPerMinute: 3,
      requestsPerHour: 20,
      requestsPerDay: 50,
      burstSize: 2
    }
  };

  /**
   * Check if user can make a request
   */
  async canMakeRequest(
    userId: string,
    userType: 'admin' | 'user' | 'guest' = 'user'
  ): Promise<UserRateLimitResult> {
    const config = this.profiles[userType];

    try {
      // Check all time windows
      const minuteCheck = await this.checkTimeWindow(userId, 'minute', config.requestsPerMinute);
      if (!minuteCheck.allowed) return minuteCheck;

      const hourCheck = await this.checkTimeWindow(userId, 'hour', config.requestsPerHour);
      if (!hourCheck.allowed) return hourCheck;

      const dayCheck = await this.checkTimeWindow(userId, 'day', config.requestsPerDay);
      if (!dayCheck.allowed) return dayCheck;

      // All checks passed
      return {
        allowed: true,
        reason: 'Request approved',
        remaining: Math.min(
          minuteCheck.remaining,
          hourCheck.remaining,
          dayCheck.remaining
        ),
        resetIn: Math.min(
          minuteCheck.resetIn,
          hourCheck.resetIn,
          dayCheck.resetIn
        )
      };

    } catch (error) {
      console.error('[USER_RATE_LIMITER] Error checking rate limit:', error);
      // Fail open - allow request
      return {
        allowed: true,
        reason: 'Rate limiter error - allowing request',
        remaining: 999,
        resetIn: 60
      };
    }
  }

  /**
   * Record a request for a user
   */
  async recordRequest(
    userId: string,
    userType: 'admin' | 'user' | 'guest' = 'user'
  ): Promise<void> {
    try {
      const now = Date.now();

      // Record in all time windows
      await Promise.all([
        this.incrementTimeWindow(userId, 'minute', 60),
        this.incrementTimeWindow(userId, 'hour', 3600),
        this.incrementTimeWindow(userId, 'day', 86400)
      ]);

      console.log(`[USER_RATE_LIMITER] Recorded request for user: ${userId} (${userType})`);

    } catch (error) {
      console.error('[USER_RATE_LIMITER] Error recording request:', error);
      // Don't throw - recording failure shouldn't block the request
    }
  }

  /**
   * Check a specific time window
   */
  private async checkTimeWindow(
    userId: string,
    window: 'minute' | 'hour' | 'day',
    limit: number
  ): Promise<UserRateLimitResult> {
    const key = this.getTimeWindowKey(userId, window);
    const ttl = this.getTimeWindowTTL(window);

    try {
      const count = await redisClient.get(key);
      const currentCount = count ? parseInt(count) : 0;

      if (currentCount >= limit) {
        const remaining = await redisClient.ttl(key);

        return {
          allowed: false,
          reason: `Rate limit exceeded for ${window} (${currentCount}/${limit})`,
          remaining: 0,
          resetIn: remaining > 0 ? remaining : ttl,
          retryAfter: remaining > 0 ? remaining : ttl
        };
      }

      return {
        allowed: true,
        reason: `Within ${window} limit`,
        remaining: limit - currentCount,
        resetIn: ttl
      };

    } catch (error) {
      // If Redis fails, check in-memory cache
      return this.checkInMemory(userId, window, limit);
    }
  }

  /**
   * Increment request counter for time window
   */
  private async incrementTimeWindow(
    userId: string,
    window: 'minute' | 'hour' | 'day',
    ttl: number
  ): Promise<void> {
    const key = this.getTimeWindowKey(userId, window);

    try {
      const exists = await redisClient.exists(key);

      if (!exists) {
        // First request in this window
        await redisClient.setex(key, ttl, '1');
      } else {
        // Increment existing counter
        await redisClient.incr(key);
      }

    } catch (error) {
      console.error(`[USER_RATE_LIMITER] Error incrementing ${window} window:`, error);
      // Update in-memory fallback
      this.incrementInMemory(userId, window, ttl);
    }
  }

  /**
   * Generate Redis key for time window
   */
  private getTimeWindowKey(userId: string, window: 'minute' | 'hour' | 'day'): string {
    const now = new Date();

    switch (window) {
      case 'minute':
        return `user-rate:${userId}:minute:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${now.getUTCMinutes()}`;
      case 'hour':
        return `user-rate:${userId}:hour:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
      case 'day':
        return `user-rate:${userId}:day:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
    }
  }

  /**
   * Get TTL for time window
   */
  private getTimeWindowTTL(window: 'minute' | 'hour' | 'day'): number {
    switch (window) {
      case 'minute': return 60;
      case 'hour': return 3600;
      case 'day': return 86400;
    }
  }

  /**
   * In-memory fallback for rate limiting
   */
  private checkInMemory(
    userId: string,
    window: 'minute' | 'hour' | 'day',
    limit: number
  ): UserRateLimitResult {
    const key = `${userId}:${window}`;
    const entry = this.inMemoryCache.get(key);
    const now = Date.now();

    if (!entry || now > entry.resetAt) {
      return {
        allowed: true,
        reason: 'Within limit (in-memory)',
        remaining: limit,
        resetIn: this.getTimeWindowTTL(window)
      };
    }

    if (entry.count >= limit) {
      const resetIn = Math.ceil((entry.resetAt - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded (in-memory)`,
        remaining: 0,
        resetIn,
        retryAfter: resetIn
      };
    }

    return {
      allowed: true,
      reason: 'Within limit (in-memory)',
      remaining: limit - entry.count,
      resetIn: Math.ceil((entry.resetAt - now) / 1000)
    };
  }

  /**
   * Increment in-memory counter
   */
  private incrementInMemory(
    userId: string,
    window: 'minute' | 'hour' | 'day',
    ttl: number
  ): void {
    const key = `${userId}:${window}`;
    const now = Date.now();
    const resetAt = now + (ttl * 1000);

    const entry = this.inMemoryCache.get(key);

    if (!entry || now > entry.resetAt) {
      this.inMemoryCache.set(key, { count: 1, resetAt });
    } else {
      entry.count++;
    }

    // Cleanup old entries
    if (this.inMemoryCache.size > 1000) {
      this.cleanupInMemoryCache();
    }
  }

  /**
   * Cleanup expired in-memory entries
   */
  private cleanupInMemoryCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.inMemoryCache.entries()) {
      if (now > entry.resetAt) {
        this.inMemoryCache.delete(key);
        cleaned++;
      }
    }

    console.log(`[USER_RATE_LIMITER] Cleaned ${cleaned} expired entries from in-memory cache`);
  }

  /**
   * Get user's current usage
   */
  async getUserUsage(
    userId: string,
    userType: 'admin' | 'user' | 'guest' = 'user'
  ): Promise<{
    minute: { used: number; limit: number; remaining: number };
    hour: { used: number; limit: number; remaining: number };
    day: { used: number; limit: number; remaining: number };
  }> {
    const config = this.profiles[userType];

    const [minuteCount, hourCount, dayCount] = await Promise.all([
      this.getUsageCount(userId, 'minute'),
      this.getUsageCount(userId, 'hour'),
      this.getUsageCount(userId, 'day')
    ]);

    return {
      minute: {
        used: minuteCount,
        limit: config.requestsPerMinute,
        remaining: Math.max(0, config.requestsPerMinute - minuteCount)
      },
      hour: {
        used: hourCount,
        limit: config.requestsPerHour,
        remaining: Math.max(0, config.requestsPerHour - hourCount)
      },
      day: {
        used: dayCount,
        limit: config.requestsPerDay,
        remaining: Math.max(0, config.requestsPerDay - dayCount)
      }
    };
  }

  /**
   * Get usage count for time window
   */
  private async getUsageCount(
    userId: string,
    window: 'minute' | 'hour' | 'day'
  ): Promise<number> {
    try {
      const key = this.getTimeWindowKey(userId, window);
      const count = await redisClient.get(key);
      return count ? parseInt(count) : 0;
    } catch (error) {
      console.error(`[USER_RATE_LIMITER] Error getting usage count:`, error);
      return 0;
    }
  }

  /**
   * Reset user's rate limit (admin only)
   */
  async resetUserLimit(userId: string): Promise<void> {
    try {
      const keys = [
        this.getTimeWindowKey(userId, 'minute'),
        this.getTimeWindowKey(userId, 'hour'),
        this.getTimeWindowKey(userId, 'day')
      ];

      await Promise.all(keys.map(key => redisClient.del(key)));

      console.log(`[USER_RATE_LIMITER] Reset rate limit for user: ${userId}`);

    } catch (error) {
      console.error(`[USER_RATE_LIMITER] Error resetting user limit:`, error);
    }
  }
}

// Global singleton
export const userRateLimiter = new UserRateLimiter();
