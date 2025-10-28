import { redisClient } from './redis-client';
import axios, { AxiosError } from 'axios';

const CONFIG = {
  REDIS_KEY: 'currency:eur-to-usd:v2',
  CACHE_TTL_SECONDS: 24 * 60 * 60,
  FALLBACK_CACHE_TTL: 60 * 60,
  // Multiple API sources for reliability
  FRANKFURTER_API: 'https://api.frankfurter.app/latest?from=EUR&to=USD',
  EXCHANGERATE_API: 'https://api.exchangerate-api.com/v4/latest/EUR',
  ECB_DIRECT_API: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  TIMEOUT_MS: 8000,
  FALLBACK_RATE: 1.164, // Last updated: 2025-10-28 (update this periodically if all APIs fail)
  MIN_RATE: 0.80,
  MAX_RATE: 1.50,
  MIN_FETCH_INTERVAL_MS: 60000,
} as const;

interface ExchangeRateCache {
  rate: number;
  fetchedAt: string;
  source: 'frankfurter' | 'exchangerate-api' | 'ecb' | 'fallback';
  expiresAt: string;
}

// Removed old ECBApiResponse interface - now using simpler JSON/XML APIs

interface FetchResult {
  rate: number;
  source: 'frankfurter' | 'exchangerate-api' | 'ecb' | 'fallback';
  success: boolean;
  error?: string;
}

class CurrencyService {
  private lastFetchAttempt: number = 0;
  private inMemoryCache: ExchangeRateCache | null = null;

  async getEurToUsdRate(): Promise<number> {
    try {
      if (this.inMemoryCache && this.isCacheValid(this.inMemoryCache)) {
        console.log(`[CURRENCY] In-memory cache hit: ${this.inMemoryCache.rate} (${this.inMemoryCache.source})`);
        return this.inMemoryCache.rate;
      }

      const redisCache = await this.getFromRedisCache();
      if (redisCache) {
        this.inMemoryCache = redisCache;
        console.log(`[CURRENCY] Redis cache hit: ${redisCache.rate} (${redisCache.source})`);
        return redisCache.rate;
      }

      console.log('[CURRENCY] Cache miss, fetching from ECB...');
      const fetchResult = await this.fetchAndCacheRate();
      console.log(`[CURRENCY] Rate: ${fetchResult.rate} (${fetchResult.source})`);
      return fetchResult.rate;

    } catch (error) {
      console.error('[CURRENCY] Error:', error);
      console.log(`[CURRENCY] Using fallback: ${CONFIG.FALLBACK_RATE}`);
      return CONFIG.FALLBACK_RATE;
    }
  }

  async forceRefresh(): Promise<FetchResult> {
    try {
      console.log('[CURRENCY] Force refresh...');
      const result = await this.fetchAndCacheRate();

      if (result.success) {
        console.log(`[CURRENCY] Refresh successful: ${result.rate} (${result.source})`);
      } else {
        console.warn(`[CURRENCY] Refresh used fallback: ${result.rate}`);
      }

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CURRENCY] Refresh failed:', errorMsg);

      await this.cacheRate(CONFIG.FALLBACK_RATE, 'fallback', CONFIG.FALLBACK_CACHE_TTL);

      return {
        rate: CONFIG.FALLBACK_RATE,
        source: 'fallback',
        success: false,
        error: errorMsg
      };
    }
  }

  async getCacheStatus(): Promise<{
    inMemory: { cached: boolean; rate?: number; source?: string };
    redis: { cached: boolean; rate?: number; source?: string; ttl?: number };
  }> {
    const inMemory = this.inMemoryCache && this.isCacheValid(this.inMemoryCache)
      ? { cached: true, rate: this.inMemoryCache.rate, source: this.inMemoryCache.source }
      : { cached: false };

    const redisCache = await this.getFromRedisCache();
    const redis = redisCache
      ? { cached: true, rate: redisCache.rate, source: redisCache.source, ttl: await this.getRedisTTL() }
      : { cached: false };

    return { inMemory, redis };
  }

  async clearCache(): Promise<void> {
    this.inMemoryCache = null;
    await redisClient.del(CONFIG.REDIS_KEY);
    console.log('[CURRENCY] Cache cleared');
  }

  private async fetchAndCacheRate(): Promise<FetchResult> {
    // Try multiple APIs in order of preference
    const apis = [
      { name: 'frankfurter' as const, fetcher: () => this.fetchFromFrankfurter() },
      { name: 'exchangerate-api' as const, fetcher: () => this.fetchFromExchangeRateAPI() },
      { name: 'ecb' as const, fetcher: () => this.fetchFromECBXML() },
    ];

    for (const api of apis) {
      try {
        console.log(`[CURRENCY] Trying ${api.name}...`);
        const rate = await api.fetcher();
        await this.cacheRate(rate, api.name, CONFIG.CACHE_TTL_SECONDS);
        console.log(`[CURRENCY] ✅ ${api.name} succeeded: ${rate}`);
        return { rate, source: api.name, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[CURRENCY] ⚠️ ${api.name} failed: ${errorMsg}`);
      }
    }

    // All APIs failed, use fallback
    console.error('[CURRENCY] ❌ All APIs failed, using fallback rate');
    await this.cacheRate(CONFIG.FALLBACK_RATE, 'fallback', CONFIG.FALLBACK_CACHE_TTL);

    return {
      rate: CONFIG.FALLBACK_RATE,
      source: 'fallback',
      success: false,
      error: 'All exchange rate APIs failed'
    };
  }

  /**
   * Fetch from Frankfurter API (free, fast, uses ECB data)
   */
  private async fetchFromFrankfurter(): Promise<number> {
    const response = await axios.get(CONFIG.FRANKFURTER_API, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'AdSyntheX/1.0' },
    });

    const rate = response.data?.rates?.USD;
    if (!rate || !this.isValidRate(rate)) {
      throw new Error(`Invalid Frankfurter rate: ${rate}`);
    }

    return parseFloat(rate.toFixed(4));
  }

  /**
   * Fetch from ExchangeRate-API (free tier, reliable)
   */
  private async fetchFromExchangeRateAPI(): Promise<number> {
    const response = await axios.get(CONFIG.EXCHANGERATE_API, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'AdSyntheX/1.0' },
    });

    const rate = response.data?.rates?.USD;
    if (!rate || !this.isValidRate(rate)) {
      throw new Error(`Invalid ExchangeRate-API rate: ${rate}`);
    }

    return parseFloat(rate.toFixed(4));
  }

  /**
   * Fetch from ECB XML (official source, slower)
   */
  private async fetchFromECBXML(): Promise<number> {
    const response = await axios.get(CONFIG.ECB_DIRECT_API, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'AdSyntheX/1.0' },
    });

    // Parse XML to find USD rate
    const xmlData = response.data as string;
    const usdMatch = xmlData.match(/<Cube currency=['"]USD['"] rate=['"]([0-9.]+)['"]/);

    if (!usdMatch || !usdMatch[1]) {
      throw new Error('USD rate not found in ECB XML');
    }

    const rate = parseFloat(usdMatch[1]);
    if (!this.isValidRate(rate)) {
      throw new Error(`Invalid ECB XML rate: ${rate}`);
    }

    return parseFloat(rate.toFixed(4));
  }

  // Removed old parseEcbResponse - now using simpler fetchers

  private isValidRate(rate: number): boolean {
    return (
      typeof rate === 'number' &&
      !isNaN(rate) &&
      rate >= CONFIG.MIN_RATE &&
      rate <= CONFIG.MAX_RATE
    );
  }

  private async cacheRate(rate: number, source: 'frankfurter' | 'exchangerate-api' | 'ecb' | 'fallback', ttlSeconds: number): Promise<void> {
    const cacheData: ExchangeRateCache = {
      rate,
      source,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };

    try {
      await redisClient.setex(CONFIG.REDIS_KEY, ttlSeconds, JSON.stringify(cacheData));
      this.inMemoryCache = cacheData;
      console.log(`[CURRENCY] Cached: ${rate} (${source}, TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.error('[CURRENCY] Cache error:', error);
      this.inMemoryCache = cacheData;
    }
  }

  private async getFromRedisCache(): Promise<ExchangeRateCache | null> {
    try {
      const cached = await redisClient.get(CONFIG.REDIS_KEY);
      if (!cached) return null;

      const data: ExchangeRateCache = JSON.parse(cached);

      if (!this.isValidRate(data.rate)) {
        console.warn(`[CURRENCY] Invalid cached rate: ${data.rate}`);
        await redisClient.del(CONFIG.REDIS_KEY);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[CURRENCY] Redis read error:', error);
      return null;
    }
  }

  private async getRedisTTL(): Promise<number> {
    try {
      const ttl = await redisClient.ttl(CONFIG.REDIS_KEY);
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      return 0;
    }
  }

  private isCacheValid(cache: ExchangeRateCache): boolean {
    try {
      const expiresAt = new Date(cache.expiresAt).getTime();
      const now = Date.now();
      return now < expiresAt;
    } catch (error) {
      return false;
    }
  }
}

export const currencyService = new CurrencyService();

export async function getEurToUsdRate(): Promise<number> {
  return currencyService.getEurToUsdRate();
}

export const CURRENCY_CONFIG = CONFIG;
