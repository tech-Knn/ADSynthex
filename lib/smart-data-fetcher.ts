/**
 * Smart Data Fetcher - Intelligent Query Routing
 * Routes queries to the fastest data source based on date range
 *
 * Query Strategy:
 * 1. Hot Data (today/yesterday) → Redis Cache (50-100ms)
 * 2. Warm Data (last 90 days) → MongoDB (200-500ms)
 * 3. Cold Data (>90 days or not synced) → API (30-60s) + save to MongoDB
 */

import { FeedType } from './db/types';
import { redisCacheManager } from './redis-cache-manager';
import { getCost, getRevenue, hasData, saveCost, saveRevenue } from './db/operations';
import { bulletproofAPI } from './bulletproof-google-ads-api';
import { fetchAdSenseRevenueByStyleId } from './adsense-api';
import { fetchAllCompadoConversions } from './compado-api';
import { fetchArticlePerformance } from './adscom-api';

export interface DataSource {
  cost: any[];
  revenue: any[];
  source: 'redis' | 'mongodb' | 'api';
  loadTime: string;
  cached: boolean;
  message: string;
}

export interface SmartFetchOptions {
  feedType: FeedType;
  accountId?: string | null;
  accountIds?: string[];
  startDate: string;
  endDate: string;
  forceLive?: boolean; // Bypass all caches
  adsenseAccountId?: string; // For AFS only
}

export class SmartDataFetcher {
  /**
   * Main method: Intelligently fetch data from best source
   */
  async fetchData(options: SmartFetchOptions): Promise<DataSource> {
    const { feedType, accountId, startDate, endDate, forceLive = false } = options;

    console.log(`[SMART_FETCH] ${feedType}: ${startDate} to ${endDate}${accountId ? `, account: ${accountId}` : ''}`);

    if (forceLive) {
      console.log('[SMART_FETCH] Force live mode - bypassing all caches');
      return await this.fetchFromAPI(options);
    }

    // Determine data "temperature"
    const dataTemperature = this.getDataTemperature(startDate, endDate);
    console.log(`[SMART_FETCH] Data temperature: ${dataTemperature}`);

    switch (dataTemperature) {
      case 'hot':
        return await this.fetchHotData(options);
      case 'warm':
        return await this.fetchWarmData(options);
      case 'cold':
        return await this.fetchColdData(options);
      default:
        return await this.fetchWarmData(options);
    }
  }

  /**
   * Determine if data is hot, warm, or cold based on date range
   */
  private getDataTemperature(
    startDate: string,
    endDate: string
  ): 'hot' | 'warm' | 'cold' {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

    // Hot: Today or yesterday
    if (startDate >= yesterday && endDate <= today) {
      return 'hot';
    }

    // Warm: Last 90 days
    if (startDate >= ninetyDaysAgo) {
      return 'warm';
    }

    // Cold: Older than 90 days
    return 'cold';
  }

  /**
   * STRATEGY 1: Hot Data (today/yesterday) → Redis Cache
   */
  private async fetchHotData(options: SmartFetchOptions): Promise<DataSource> {
    const { feedType, accountId, startDate, endDate } = options;
    const startTime = Date.now();

    console.log('[SMART_FETCH] Strategy: HOT DATA - checking Redis cache');

    // Try Redis cache first
    const cacheKey = redisCacheManager.generateKey({
      dataType: feedType === 'afs' ? 'google-ads' : (feedType as any),
      accountId: accountId || null,
      startDate,
      endDate,
      extra: feedType,
    });

    const cached = await redisCacheManager.get(cacheKey, {
      dataType: 'unified',
      forceRefresh: false,
    });

    if (cached.data && !cached.isStale) {
      const loadTime = Date.now() - startTime;
      console.log(`[SMART_FETCH] Redis cache HIT (${loadTime}ms)`);

      return {
        cost: cached.data.cost || [],
        revenue: cached.data.revenue || [],
        source: 'redis',
        loadTime: `${loadTime}ms`,
        cached: true,
        message: `Served from Redis cache (age: ${Math.round(cached.age / 1000)}s)`,
      };
    }

    console.log('[SMART_FETCH] Redis cache MISS - checking MongoDB');

    // Redis miss → try MongoDB
    return await this.fetchWarmData(options);
  }

  /**
   * STRATEGY 2: Warm Data (last 90 days) → MongoDB
   */
  private async fetchWarmData(options: SmartFetchOptions): Promise<DataSource> {
    const { feedType, accountId, startDate, endDate } = options;
    const startTime = Date.now();

    console.log('[SMART_FETCH] Strategy: WARM DATA - querying MongoDB');

    try {
      // Check if MongoDB is available
      const mongoAvailable = process.env.MONGODB_URI;
      if (!mongoAvailable) {
        console.log('[SMART_FETCH] MongoDB not configured - falling back to API');
        return await this.fetchFromAPI(options);
      }

      // Check if data exists in MongoDB
      const dataExists = await hasData(feedType, startDate, endDate, accountId);

      if (dataExists) {
        // Fetch from MongoDB
        const cost = await getCost(feedType, startDate, endDate, accountId);
        const revenue = await getRevenue(feedType, startDate, endDate, accountId);

        const loadTime = Date.now() - startTime;
        console.log(`[SMART_FETCH] MongoDB HIT (${loadTime}ms) - ${cost.length} cost, ${revenue.length} revenue`);

        // Cache in Redis for next time (if hot data)
        const isHot = this.getDataTemperature(startDate, endDate) === 'hot';
        if (isHot) {
          const cacheKey = redisCacheManager.generateKey({
            dataType: feedType === 'afs' ? 'google-ads' : (feedType as any),
            accountId: accountId || null,
            startDate,
            endDate,
            extra: feedType,
          });

          await redisCacheManager.set(
            cacheKey,
            { cost, revenue },
            { dataType: 'unified', priority: 'high' }
          );
          console.log('[SMART_FETCH] Cached MongoDB result in Redis');
        }

        return {
          cost,
          revenue,
          source: 'mongodb',
          loadTime: `${loadTime}ms`,
          cached: false,
          message: `Served from MongoDB (${cost.length + revenue.length} records)`,
        };
      }

      console.log('[SMART_FETCH] MongoDB MISS - data not found, fetching from API');
      return await this.fetchFromAPI(options);
    } catch (error: any) {
      console.error('[SMART_FETCH] MongoDB error:', error.message);
      console.log('[SMART_FETCH] Falling back to API');
      return await this.fetchFromAPI(options);
    }
  }

  /**
   * STRATEGY 3: Cold Data (>90 days or not in MongoDB) → API + Save
   */
  private async fetchColdData(options: SmartFetchOptions): Promise<DataSource> {
    console.log('[SMART_FETCH] Strategy: COLD DATA - fetching from API (will cache)');
    return await this.fetchFromAPI(options);
  }

  /**
   * Fetch from live APIs and save to MongoDB
   */
  private async fetchFromAPI(options: SmartFetchOptions): Promise<DataSource> {
    const {
      feedType,
      accountId,
      accountIds,
      startDate,
      endDate,
      adsenseAccountId,
    } = options;
    const startTime = Date.now();

    console.log('[SMART_FETCH] Fetching from live APIs...');

    let costData: any[] = [];
    let revenueData: any[] = [];

    try {
      // STEP 1: Fetch Cost Data (Google Ads)
      if (accountIds && accountIds.length > 0) {
        // Multiple accounts
        console.log(`[SMART_FETCH] Fetching cost data for ${accountIds.length} accounts`);

        const costPromises = accountIds.map((accId) =>
          bulletproofAPI.getData(startDate, endDate, accId, {
            feedType: feedType === 'afs' ? 'adsense' : feedType,
            allowStale: false,
            priority: 10,
          })
        );

        const costResults = await Promise.all(costPromises);

        costResults.forEach((result) => {
          if (result.data?.ads) {
            costData.push(...result.data.ads);
          }
        });
      } else if (accountId) {
        // Single account
        const costResult = await bulletproofAPI.getData(startDate, endDate, accountId, {
          feedType: feedType === 'afs' ? 'adsense' : feedType,
          allowStale: false,
          priority: 10,
        });

        if (costResult.data?.ads) {
          costData = costResult.data.ads;
        }
      }

      console.log(`[SMART_FETCH] Fetched ${costData.length} cost records from Google Ads`);

      // STEP 2: Fetch Revenue Data (depends on feed type)
      switch (feedType) {
        case 'afs':
          if (adsenseAccountId) {
            console.log(`[SMART_FETCH] Fetching AdSense revenue for ${adsenseAccountId}`);
            revenueData = await fetchAdSenseRevenueByStyleId(
              adsenseAccountId,
              startDate,
              endDate,
              accountId || undefined
            );
            console.log(`[SMART_FETCH] Fetched ${revenueData.length} revenue records from AdSense`);
          }
          break;

        case 'compado':
          console.log('[SMART_FETCH] Fetching Compado conversions');
          const compadoData = await fetchAllCompadoConversions(startDate, endDate);
          revenueData = compadoData;
          console.log(`[SMART_FETCH] Fetched ${revenueData.length} revenue records from Compado`);
          break;

        case 'adscom':
          console.log('[SMART_FETCH] Fetching Ads.com article performance');
          const adscomData = await fetchArticlePerformance(startDate, endDate);
          revenueData = adscomData.articles || [];
          console.log(`[SMART_FETCH] Fetched ${revenueData.length} revenue records from Ads.com`);
          break;
      }

      // STEP 3: Save to MongoDB for future fast access
      const mongoAvailable = process.env.MONGODB_URI;
      if (mongoAvailable && (costData.length > 0 || revenueData.length > 0)) {
        console.log('[SMART_FETCH] Saving API results to MongoDB for future queries...');

        try {
          // Transform and save cost data
          if (costData.length > 0) {
            const costDocuments = this.transformCostData(costData, feedType);
            await saveCost(costDocuments, feedType);
          }

          // Transform and save revenue data
          if (revenueData.length > 0) {
            const revenueDocuments = this.transformRevenueData(revenueData, feedType);
            await saveRevenue(revenueDocuments, feedType);
          }

          console.log('[SMART_FETCH] Saved to MongoDB - future queries will be fast');
        } catch (error: any) {
          console.error('[SMART_FETCH] Failed to save to MongoDB:', error.message);
          // Continue anyway - we have the data
        }
      }

      const loadTime = Date.now() - startTime;

      return {
        cost: costData,
        revenue: revenueData,
        source: 'api',
        loadTime: `${(loadTime / 1000).toFixed(1)}s`,
        cached: mongoAvailable ? true : false,
        message: `Fetched from live APIs${mongoAvailable ? ' and saved to MongoDB' : ''}`,
      };
    } catch (error: any) {
      console.error('[SMART_FETCH] API fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Transform Google Ads API data to MongoDB cost format
   */
  private transformCostData(ads: any[], feedType: FeedType): any[] {
    return ads.map((ad) => ({
      account_id: ad.account_id || '',
      campaign_id: ad.campaign_id || '',
      campaign_name: ad.campaign_name || '',
      ad_group_id: ad.ad_group_id,
      ad_group_name: ad.ad_group_name,
      ad_id: ad.ad_id,
      ad_name: ad.ad_name,
      date: ad.date || ad.segments?.date || new Date().toISOString().split('T')[0],
      cost_micros: ad.metrics?.cost_micros || 0,
      clicks: ad.metrics?.clicks || 0,
      impressions: ad.metrics?.impressions || 0,
      conversions: ad.metrics?.conversions || 0,
      ctr: ad.metrics?.ctr || 0,
      cpc: ad.metrics?.average_cpc || 0,
      style_id: ad.style_id,
      domain: ad.domain,
      gclid: ad.gclid,
      article: ad.article,
    }));
  }

  /**
   * Transform revenue API data to MongoDB format
   */
  private transformRevenueData(revenue: any[], feedType: FeedType): any[] {
    switch (feedType) {
      case 'afs':
        return revenue.map((rev) => ({
          style_id: rev.style_id,
          domain: rev.domain_name,
          country_name: rev.country_name,
          revenue_usd: rev.earnings || 0,
          revenue_eur: 0,
          clicks: rev.clicks || 0,
          impressions: rev.impressions || 0,
          date: rev.date,
        }));

      case 'compado':
        return revenue.map((conv) => ({
          gclid: conv.gclid,
          revenue_usd: conv.revenueUsd || 0,
          revenue_eur: conv.revenue || 0,
          clicks: conv.clicks || 1,
          impressions: conv.impressions || 0,
          date: conv.timestamp ? conv.timestamp.split('T')[0] : '',
          conversion_type: conv.conversion_type,
          device: conv.device,
          country: conv.country,
          traffic_source: conv.traffic_source,
          keywords: conv.keywords,
          srcclkid: conv.srcclkid,
        }));

      case 'adscom':
        return revenue.map((article) => ({
          article: article.article || article.article_id,
          revenue_usd: article.revenue || article.revenue_usd || 0,
          revenue_eur: 0,
          clicks: article.clicks || 0,
          impressions: article.impressions || 0,
          date: article.date,
          visits: article.visits,
          ctr: article.ctr,
          rpm: article.rpm,
          epc: article.epc,
          ivt_correction: article.ivtCorrection || article.ivt_correction,
          finalized: article.finalized,
        }));

      default:
        return [];
    }
  }
}

// Export singleton instance
export const smartDataFetcher = new SmartDataFetcher();
