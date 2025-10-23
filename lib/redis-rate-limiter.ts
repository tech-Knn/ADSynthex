/**
 * Redis-Based Rate Limiter
 * Provides persistent rate limiting that survives server restarts
 * Implements Google Ads API compliance with multiple protection layers
 */

import { redisClient } from './redis-client';

interface RateLimitCheck {
  allowed: boolean;
  reason: string;
  waitTime?: number;
  quotaRemaining?: number;
  retryAfter?: number;
}

interface QuotaStatus {
  dailyUsed: number;
  dailyLimit: number;
  hourlyUsed: number;
  hourlyLimit: number;
  quotaRemaining: number;
  usagePercentage: number;
  isInCooldown: boolean;
  cooldownEnds: string | null;
  retryAfterSeconds: number | null;
  safeToOperate: boolean;
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface RateLimiterConfig {
  dailyLimit: number;
  hourlyLimit: number;
  qps: number; // Queries per second
  cooldownBuffer: number; // Safety buffer for cooldown
}

export class RedisRateLimiter {
  private config: RateLimiterConfig;
  private apiName: string;
  private enabled: boolean;
  private inMemoryCounters: Map<string, number> = new Map();

  constructor(apiName: string = 'google', config?: Partial<RateLimiterConfig>) {
    this.apiName = apiName;
    this.config = {
      dailyLimit: 10000, // ~67% of 15K daily quota (more conservative)
      hourlyLimit: 400,  // Max 400 requests per hour (~6-7 per minute)
      qps: 1,            // 1 query per second (Google standard)
      cooldownBuffer: 600, // 10 minutes safety buffer (increased from 5)
      ...config
    };

    // Check if rate limiter is enabled (can be disabled if Redis lacks permissions)
    this.enabled = process.env.REDIS_RATE_LIMITER_ENABLED !== 'false';

    if (!this.enabled) {
      console.warn('[REDIS_RATE_LIMITER] Rate limiter disabled via environment variable');
    }
  }

  /**
   * Check if a request can be made
   */
  async canMakeRequest(customerId?: string): Promise<RateLimitCheck> {
    // If rate limiter is disabled, always allow requests
    if (!this.enabled) {
      return {
        allowed: true,
        reason: 'Rate limiter disabled',
        waitTime: 0
      };
    }

    try {
      const now = Date.now();
      const date = this.getDateKey();
      const hour = new Date().getHours();

      // 1. Check if in cooldown period (HIGHEST PRIORITY)
      const cooldownCheck = await this.checkCooldown();
      if (!cooldownCheck.allowed) {
        return cooldownCheck;
      }

      // 2. Check circuit breaker state
      const circuitState = await this.getCircuitState();
      if (circuitState === 'OPEN') {
        return {
          allowed: false,
          reason: 'Circuit breaker is OPEN due to high error rate',
          waitTime: 3600000 // 1 hour
        };
      }

      // 3. Check daily quota
      const dailyUsed = await this.getDailyUsage(date);
      const quotaRemaining = this.config.dailyLimit - dailyUsed;

      if (quotaRemaining <= 0) {
        return {
          allowed: false,
          reason: 'Daily quota exhausted',
          quotaRemaining: 0,
          waitTime: this.getTimeUntilMidnight()
        };
      }

      // 4. Check hourly quota
      const hourlyUsed = await this.getHourlyUsage(hour);
      if (hourlyUsed >= this.config.hourlyLimit) {
        const minutesLeft = 60 - new Date().getMinutes();
        return {
          allowed: false,
          reason: `Hourly quota exhausted (${hourlyUsed}/${this.config.hourlyLimit})`,
          quotaRemaining,
          waitTime: minutesLeft * 60 * 1000
        };
      }

      // 5. Check QPS limit (sliding window)
      const qpsCheck = await this.checkQPS();
      if (!qpsCheck.allowed) {
        return {
          ...qpsCheck,
          quotaRemaining
        };
      }

      // 6. Check per-customer rate limit (if applicable)
      if (customerId) {
        const customerCheck = await this.checkCustomerRateLimit(customerId);
        if (!customerCheck.allowed) {
          return {
            ...customerCheck,
            quotaRemaining
          };
        }
      }

      // All checks passed
      return {
        allowed: true,
        reason: 'Request approved',
        quotaRemaining,
        waitTime: 0
      };

    } catch (error) {
      console.error('[REDIS_RATE_LIMITER] Error checking rate limit:', error);

      // Fail-safe: Allow request but log error
      return {
        allowed: true,
        reason: 'Rate limit check failed, allowing request',
        waitTime: 0
      };
    }
  }

  /**
   * Record a successful request
   */
  async recordRequest(customerId?: string): Promise<void> {
    // If rate limiter is disabled, skip recording
    if (!this.enabled) {
      return;
    }

    try {
      const now = Date.now();
      const date = this.getDateKey();
      const hour = new Date().getHours();

      const commands = [
        // Increment daily counter
        { command: 'incr', args: [`rate:${this.apiName}:daily:${date}`] },
        { command: 'expire', args: [`rate:${this.apiName}:daily:${date}`, 86400] },

        // Increment hourly counter
        { command: 'incr', args: [`rate:${this.apiName}:hourly:${hour}`] },
        { command: 'expire', args: [`rate:${this.apiName}:hourly:${hour}`, 3600] },

        // Record QPS timestamp
        { command: 'set', args: [`rate:${this.apiName}:qps:last`, now.toString()] },
        { command: 'expire', args: [`rate:${this.apiName}:qps:last`, 2] },

        // Increment success counter
        { command: 'incr', args: [`health:${this.apiName}:success`] },
        { command: 'expire', args: [`health:${this.apiName}:success`, 3600] }
      ];

      // Record per-customer if applicable
      if (customerId) {
        commands.push(
          { command: 'incr', args: [`rate:${this.apiName}:customer:${customerId}:${hour}`] },
          { command: 'expire', args: [`rate:${this.apiName}:customer:${customerId}:${hour}`, 3600] }
        );
      }

      await redisClient.multi(commands);

      const dailyUsed = await this.getDailyUsage(date);
      console.log(`[REDIS_RATE_LIMITER] Request recorded. Daily usage: ${dailyUsed}/${this.config.dailyLimit}`);

    } catch (error) {
      console.error('[REDIS_RATE_LIMITER] Error recording request:', error);
    }
  }

  /**
   * Handle rate limit error from API
   */
  async handleRateLimitError(error: any): Promise<void> {
    // If rate limiter is disabled, just log the error
    if (!this.enabled) {
      console.error('[REDIS_RATE_LIMITER] Rate limit error detected (limiter disabled):', error);
      return;
    }

    try {
      console.error('[REDIS_RATE_LIMITER] Rate limit error detected:', error);

      // Parse retry time from error (Google Ads specific format)
      let retrySeconds = 3600; // Default 1 hour
      const errorString = JSON.stringify(error);

      // Try multiple patterns to extract retry time
      const patterns = [
        /Retry in (\d+) seconds/i,
        /retry_after[\"']?\s*:\s*(\d+)/i,
        /wait[\"']?\s*:\s*(\d+)/i
      ];

      for (const pattern of patterns) {
        const match = errorString.match(pattern);
        if (match) {
          retrySeconds = parseInt(match[1]);
          console.log(`[REDIS_RATE_LIMITER] ⚠️ EXTRACTED COOLDOWN: ${retrySeconds}s (~${Math.round(retrySeconds / 3600)} hours)`);
          break;
        }
      }

      // Log the full error for debugging
      console.error(`[REDIS_RATE_LIMITER] 🔴 RATE LIMIT ERROR DETAILS:`, {
        retrySeconds,
        retryHours: Math.round(retrySeconds / 3600),
        cooldownUntil: new Date(Date.now() + retrySeconds * 1000).toISOString(),
        errorMessage: error.message || errorString.substring(0, 200)
      });

      // Add safety buffer
      retrySeconds += this.config.cooldownBuffer;

      const cooldownUntil = Date.now() + (retrySeconds * 1000);

      // Store cooldown in Redis (PERSISTS ACROSS RESTARTS!)
      await redisClient.multi([
        { command: 'set', args: [`quota:${this.apiName}:cooldown`, cooldownUntil.toString()] },
        { command: 'expire', args: [`quota:${this.apiName}:cooldown`, retrySeconds] },
        { command: 'set', args: [`quota:${this.apiName}:retry_after`, retrySeconds.toString()] },
        { command: 'expire', args: [`quota:${this.apiName}:retry_after`, retrySeconds] },
        { command: 'incr', args: [`health:${this.apiName}:errors`] },
        { command: 'expire', args: [`health:${this.apiName}:errors`, 3600] }
      ]);

      // Update circuit breaker
      await this.updateCircuitBreaker('error');

      console.error(`[REDIS_RATE_LIMITER] Cooldown activated for ${retrySeconds}s until ${new Date(cooldownUntil).toISOString()}`);

    } catch (err) {
      console.error('[REDIS_RATE_LIMITER] Error handling rate limit error:', err);
    }
  }

  /**
   * Get current quota status
   */
  async getQuotaStatus(): Promise<QuotaStatus> {
    try {
      const date = this.getDateKey();
      const hour = new Date().getHours();

      const dailyUsed = await this.getDailyUsage(date);
      const hourlyUsed = await this.getHourlyUsage(hour);
      const quotaRemaining = this.config.dailyLimit - dailyUsed;
      const usagePercentage = (dailyUsed / this.config.dailyLimit) * 100;

      const cooldownUntil = await redisClient.get(`quota:${this.apiName}:cooldown`);
      const isInCooldown = cooldownUntil ? Date.now() < parseInt(cooldownUntil) : false;
      const retryAfter = await redisClient.get(`quota:${this.apiName}:retry_after`);

      const circuitState = await this.getCircuitState();

      return {
        dailyUsed,
        dailyLimit: this.config.dailyLimit,
        hourlyUsed,
        hourlyLimit: this.config.hourlyLimit,
        quotaRemaining: Math.max(0, quotaRemaining),
        usagePercentage: Math.round(usagePercentage * 100) / 100,
        isInCooldown,
        cooldownEnds: cooldownUntil && isInCooldown
          ? new Date(parseInt(cooldownUntil)).toISOString()
          : null,
        retryAfterSeconds: retryAfter ? parseInt(retryAfter) : null,
        safeToOperate: !isInCooldown && quotaRemaining > 0 && circuitState !== 'OPEN',
        circuitState
      };

    } catch (error) {
      console.error('[REDIS_RATE_LIMITER] Error getting quota status:', error);
      return {
        dailyUsed: 0,
        dailyLimit: this.config.dailyLimit,
        hourlyUsed: 0,
        hourlyLimit: this.config.hourlyLimit,
        quotaRemaining: this.config.dailyLimit,
        usagePercentage: 0,
        isInCooldown: false,
        cooldownEnds: null,
        retryAfterSeconds: null,
        safeToOperate: true,
        circuitState: 'CLOSED'
      };
    }
  }

  /**
   * Manually reset cooldown (emergency use only)
   */
  async resetCooldown(): Promise<void> {
    try {
      await redisClient.multi([
        { command: 'del', args: [`quota:${this.apiName}:cooldown`] },
        { command: 'del', args: [`quota:${this.apiName}:retry_after`] }
      ]);
      console.warn('[REDIS_RATE_LIMITER] Cooldown manually reset');
    } catch (error) {
      console.error('[REDIS_RATE_LIMITER] Error resetting cooldown:', error);
    }
  }

  // ============ PRIVATE METHODS ============

  private async checkCooldown(): Promise<RateLimitCheck> {
    const cooldownUntil = await redisClient.get(`quota:${this.apiName}:cooldown`);

    if (!cooldownUntil) {
      return { allowed: true, reason: 'No active cooldown' };
    }

    const cooldownTime = parseInt(cooldownUntil);
    const now = Date.now();

    if (now < cooldownTime) {
      const waitTime = cooldownTime - now;
      const retryAfter = await redisClient.get(`quota:${this.apiName}:retry_after`);

      return {
        allowed: false,
        reason: 'API in cooldown period due to rate limit',
        waitTime,
        retryAfter: retryAfter ? parseInt(retryAfter) : undefined
      };
    }

    // Cooldown expired, clean up
    await redisClient.del(`quota:${this.apiName}:cooldown`);
    await redisClient.del(`quota:${this.apiName}:retry_after`);

    return { allowed: true, reason: 'Cooldown expired' };
  }

  private async checkQPS(): Promise<RateLimitCheck> {
    const lastRequest = await redisClient.get(`rate:${this.apiName}:qps:last`);

    if (!lastRequest) {
      return { allowed: true, reason: 'QPS check passed' };
    }

    const timeSinceLastRequest = Date.now() - parseInt(lastRequest);
    const minInterval = 1000 / this.config.qps; // milliseconds between requests

    if (timeSinceLastRequest < minInterval) {
      const waitTime = Math.ceil(minInterval - timeSinceLastRequest);
      return {
        allowed: false,
        reason: `QPS limit (${this.config.qps} req/s) - too fast`,
        waitTime
      };
    }

    return { allowed: true, reason: 'QPS check passed' };
  }

  private async checkCustomerRateLimit(customerId: string): Promise<RateLimitCheck> {
    const hour = new Date().getHours();
    const key = `rate:${this.apiName}:customer:${customerId}:${hour}`;
    const count = await redisClient.get(key);

    const limit = 100; // Max 100 requests per customer per hour
    const used = count ? parseInt(count) : 0;

    if (used >= limit) {
      return {
        allowed: false,
        reason: `Per-customer rate limit exceeded for ${customerId} (${used}/${limit})`,
        waitTime: (60 - new Date().getMinutes()) * 60 * 1000
      };
    }

    return { allowed: true, reason: 'Customer rate limit check passed' };
  }

  private async getDailyUsage(date: string): Promise<number> {
    const value = await redisClient.get(`rate:${this.apiName}:daily:${date}`);
    return value ? parseInt(value) : 0;
  }

  private async getHourlyUsage(hour: number): Promise<number> {
    const value = await redisClient.get(`rate:${this.apiName}:hourly:${hour}`);
    return value ? parseInt(value) : 0;
  }

  private async getCircuitState(): Promise<'CLOSED' | 'OPEN' | 'HALF_OPEN'> {
    const state = await redisClient.get(`circuit:${this.apiName}:state`);
    return (state as any) || 'CLOSED';
  }

  private async updateCircuitBreaker(outcome: 'success' | 'error'): Promise<void> {
    try {
      const successKey = `health:${this.apiName}:success`;
      const errorKey = `health:${this.apiName}:errors`;

      const [successCount, errorCount] = await Promise.all([
        redisClient.get(successKey),
        redisClient.get(errorKey)
      ]);

      const successes = successCount ? parseInt(successCount) : 0;
      const errors = errorCount ? parseInt(errorCount) : 0;
      const total = successes + errors;

      if (total < 5) return; // Not enough data

      const errorRate = errors / total;

      // Update circuit state based on error rate
      let newState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

      if (errorRate > 0.5) {
        newState = 'OPEN';
      } else if (errorRate > 0.3) {
        newState = 'HALF_OPEN';
      }

      await redisClient.setex(`circuit:${this.apiName}:state`, 3600, newState);

    } catch (error) {
      console.error('[REDIS_RATE_LIMITER] Error updating circuit breaker:', error);
    }
  }

  private getDateKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getTimeUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  }
}

// Global singleton instance
export const googleAdsRateLimiter = new RedisRateLimiter('google');
