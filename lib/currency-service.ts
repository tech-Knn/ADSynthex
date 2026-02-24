import { redisClient } from './redis-client';
import axios, { AxiosError } from 'axios';

const CONFIG = {
  REDIS_KEY_EUR: 'currency:eur-to-usd:v2',
  REDIS_KEY_IDR: 'currency:idr-to-usd:v1',
  CACHE_TTL_SECONDS: 24 * 60 * 60,
  FALLBACK_CACHE_TTL: 60 * 60,
  // Multiple API sources for reliability
  FRANKFURTER_API_EUR: 'https://api.frankfurter.app/latest?from=EUR&to=USD',
  FRANKFURTER_API_IDR: 'https://api.frankfurter.app/latest?from=IDR&to=USD',
  EXCHANGERATE_API_EUR: 'https://api.exchangerate-api.com/v4/latest/EUR',
  EXCHANGERATE_API_IDR: 'https://api.exchangerate-api.com/v4/latest/IDR',
  ECB_DIRECT_API: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  TIMEOUT_MS: 8000,
  FALLBACK_RATE_EUR: 1.164, // Last updated: 2025-10-28
  FALLBACK_RATE_IDR: 0.000063, // 1 IDR = ~$0.000063 USD (≈15,873 IDR per USD)
  MIN_RATE_EUR: 0.80,
  MAX_RATE_EUR: 1.50,
  MIN_RATE_IDR: 0.00005,  // ~20,000 IDR per USD
  MAX_RATE_IDR: 0.0001,   // ~10,000 IDR per USD
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
  private inMemoryCacheEUR: ExchangeRateCache | null = null;
  private inMemoryCacheIDR: ExchangeRateCache | null = null;

  async getEurToUsdRate(): Promise<number> {
    return this.getRate('EUR');
  }

  async getIdrToUsdRate(): Promise<number> {
    return this.getRate('IDR');
  }

  private async getRate(currency: 'EUR' | 'IDR'): Promise<number> {
    try {
      const cache = currency === 'EUR' ? this.inMemoryCacheEUR : this.inMemoryCacheIDR;
      const fallback = currency === 'EUR' ? CONFIG.FALLBACK_RATE_EUR : CONFIG.FALLBACK_RATE_IDR;
      const redisKey = currency === 'EUR' ? CONFIG.REDIS_KEY_EUR : CONFIG.REDIS_KEY_IDR;

      if (cache && this.isCacheValid(cache)) {
        console.log(`[CURRENCY_${currency}] In-memory cache hit: ${cache.rate} (${cache.source})`);
        return cache.rate;
      }

      const redisCache = await this.getFromRedisCache(redisKey);
      if (redisCache) {
        if (currency === 'EUR') {
          this.inMemoryCacheEUR = redisCache;
        } else {
          this.inMemoryCacheIDR = redisCache;
        }
        console.log(`[CURRENCY_${currency}] Redis cache hit: ${redisCache.rate} (${redisCache.source})`);
        return redisCache.rate;
      }

      console.log(`[CURRENCY_${currency}] Cache miss, fetching...`);
      const fetchResult = await this.fetchAndCacheRate(currency);
      console.log(`[CURRENCY_${currency}] Rate: ${fetchResult.rate} (${fetchResult.source})`);
      return fetchResult.rate;

    } catch (error) {
      const fallback = currency === 'EUR' ? CONFIG.FALLBACK_RATE_EUR : CONFIG.FALLBACK_RATE_IDR;
      console.error(`[CURRENCY_${currency}] Error:`, error);
      console.log(`[CURRENCY_${currency}] Using fallback: ${fallback}`);
      return fallback;
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

      await this.cacheRate(CONFIG.FALLBACK_RATE_EUR, 'fallback', CONFIG.FALLBACK_CACHE_TTL);

      return {
        rate: CONFIG.FALLBACK_RATE_EUR,
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
    const inMemory = this.inMemoryCacheEUR && this.isCacheValid(this.inMemoryCacheEUR)
      ? { cached: true, rate: this.inMemoryCacheEUR.rate, source: this.inMemoryCacheEUR.source }
      : { cached: false };

    const redisCache = await this.getFromRedisCache();
    const redis = redisCache
      ? { cached: true, rate: redisCache.rate, source: redisCache.source, ttl: await this.getRedisTTL() }
      : { cached: false };

    return { inMemory, redis };
  }

  async clearCache(): Promise<void> {
    this.inMemoryCacheEUR = null;
    await redisClient.del(CONFIG.REDIS_KEY);
    console.log('[CURRENCY] Cache cleared');
  }

  private async fetchAndCacheRate(currency: 'EUR' | 'IDR'): Promise<FetchResult> {
    // Try multiple APIs in order of preference
    const apis = currency === 'EUR'
      ? [
          { name: 'frankfurter' as const, fetcher: () => this.fetchFromFrankfurter(currency) },
          { name: 'exchangerate-api' as const, fetcher: () => this.fetchFromExchangeRateAPI(currency) },
          { name: 'ecb' as const, fetcher: () => this.fetchFromECBXML() },
        ]
      : [
          { name: 'frankfurter' as const, fetcher: () => this.fetchFromFrankfurter(currency) },
          { name: 'exchangerate-api' as const, fetcher: () => this.fetchFromExchangeRateAPI(currency) },
        ];

    const fallback = currency === 'EUR' ? CONFIG.FALLBACK_RATE_EUR : CONFIG.FALLBACK_RATE_IDR;
    const redisKey = currency === 'EUR' ? CONFIG.REDIS_KEY_EUR : CONFIG.REDIS_KEY_IDR;

    for (const api of apis) {
      try {
        console.log(`[CURRENCY_${currency}] Trying ${api.name}...`);
        const rate = await api.fetcher();
        await this.cacheRate(rate, api.name, CONFIG.CACHE_TTL_SECONDS, redisKey, currency);
        console.log(`[CURRENCY_${currency}] ${api.name} succeeded: ${rate}`);
        return { rate, source: api.name, success: true };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`[CURRENCY_${currency}] ${api.name} failed: ${errorMsg}`);
      }
    }

    // All APIs failed, use fallback
    console.error(`[CURRENCY_${currency}] All APIs failed, using fallback rate`);
    await this.cacheRate(fallback, 'fallback', CONFIG.FALLBACK_CACHE_TTL, redisKey, currency);

    return {
      rate: fallback,
      source: 'fallback',
      success: false,
      error: 'All exchange rate APIs failed'
    };
  }

  /**
   * Fetch from Frankfurter API (free, fast, uses ECB data)
   */
  private async fetchFromFrankfurter(currency: 'EUR' | 'IDR'): Promise<number> {
    const apiUrl = currency === 'EUR' ? CONFIG.FRANKFURTER_API_EUR : CONFIG.FRANKFURTER_API_IDR;
    const response = await axios.get(apiUrl, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'AdSyntheX/1.0' },
    });

    const rate = response.data?.rates?.USD;
    if (!rate || !this.isValidRate(rate, currency)) {
      throw new Error(`Invalid Frankfurter rate: ${rate}`);
    }

    return parseFloat(rate.toFixed(currency === 'IDR' ? 8 : 4));
  }

  /**
   * Fetch from ExchangeRate-API (free tier, reliable)
   */
  private async fetchFromExchangeRateAPI(currency: 'EUR' | 'IDR'): Promise<number> {
    const apiUrl = currency === 'EUR' ? CONFIG.EXCHANGERATE_API_EUR : CONFIG.EXCHANGERATE_API_IDR;
    const response = await axios.get(apiUrl, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'AdSyntheX/1.0' },
    });

    const rate = response.data?.rates?.USD;
    if (!rate || !this.isValidRate(rate, currency)) {
      throw new Error(`Invalid ExchangeRate-API rate: ${rate}`);
    }

    return parseFloat(rate.toFixed(currency === 'IDR' ? 8 : 4));
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

  private isValidRate(rate: number, currency: 'EUR' | 'IDR'): boolean {
    const minRate = currency === 'EUR' ? CONFIG.MIN_RATE_EUR : CONFIG.MIN_RATE_IDR;
    const maxRate = currency === 'EUR' ? CONFIG.MAX_RATE_EUR : CONFIG.MAX_RATE_IDR;

    return (
      typeof rate === 'number' &&
      !isNaN(rate) &&
      rate >= minRate &&
      rate <= maxRate
    );
  }

  private async cacheRate(
    rate: number,
    source: 'frankfurter' | 'exchangerate-api' | 'ecb' | 'fallback',
    ttlSeconds: number,
    redisKey: string,
    currency: 'EUR' | 'IDR'
  ): Promise<void> {
    const cacheData: ExchangeRateCache = {
      rate,
      source,
      fetchedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };

    try {
      await redisClient.setex(redisKey, ttlSeconds, JSON.stringify(cacheData));
      if (currency === 'EUR') {
        this.inMemoryCacheEUR = cacheData;
      } else {
        this.inMemoryCacheIDR = cacheData;
      }
      console.log(`[CURRENCY_${currency}] Cached: ${rate} (${source}, TTL: ${ttlSeconds}s)`);
    } catch (error) {
      console.error(`[CURRENCY_${currency}] Cache error:`, error);
      if (currency === 'EUR') {
        this.inMemoryCacheEUR = cacheData;
      } else {
        this.inMemoryCacheIDR = cacheData;
      }
    }
  }

  private async getFromRedisCache(redisKey: string): Promise<ExchangeRateCache | null> {
    try {
      const cached = await redisClient.get(redisKey);
      if (!cached) return null;

      const data: ExchangeRateCache = JSON.parse(cached);
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

export async function getIdrToUsdRate(): Promise<number> {
  return currencyService.getIdrToUsdRate();
}

/**
 * Convert amount from source currency to USD
 * @param amount - Amount in source currency
 * @param sourceCurrency - Source currency code (IDR, EUR, USD)
 * @returns Amount in USD
 */
export async function convertToUsd(amount: number, sourceCurrency: string): Promise<number> {
  if (sourceCurrency === 'USD') {
    return amount;
  }

  if (sourceCurrency === 'IDR') {
    const rate = await getIdrToUsdRate();
    return amount * rate;
  }

  if (sourceCurrency === 'EUR') {
    const rate = await getEurToUsdRate();
    return amount * rate;
  }

  // Unknown currency - return as-is
  console.warn(`[CURRENCY] Unknown currency: ${sourceCurrency}, returning original amount`);
  return amount;
}

export const CURRENCY_CONFIG = CONFIG;
