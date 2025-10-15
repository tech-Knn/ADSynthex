/**
 * Compado Cost/Revenue Mapping API
 * Maps Google Ads cost with Compado conversion revenue by GCLID
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAllCompadoConversions,
  mapCompadoCostRevenue,
  aggregateMappingsByCampaign,
  getCompadoCostRevenueSummary,
  type CompadoCostRevenueMapping,
  type CompadoCostRevenueSummary
} from '@/lib/compado-api';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { redisCacheManager } from '@/lib/redis-cache-manager';

interface CompadoCostRevenueResponse {
  google_ads_data: any;
  compado_data: any;
  cost_revenue_mapping: CompadoCostRevenueMapping[];
  campaign_aggregated: CompadoCostRevenueMapping[];
  summary: CompadoCostRevenueSummary;
  _source: string;
  _timestamp: string;
  _message: string;
  _dataFreshness?: {
    source: string;
    ageMinutes: number;
    isFresh: boolean;
    message: string;
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { startDate, endDate, customerId } = body;

    // Validate required parameters
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    console.log(`[COMPADO_COST_REVENUE] Mapping request: ${startDate} to ${endDate}, Customer: ${customerId || 'all'}`);

    let message = '';

    try {
      // 1. Fetch Google Ads cost data with GCLID
      console.log('[COMPADO_COST_REVENUE] Fetching Google Ads click data with GCLIDs...');
      const googleAdsResult = await bulletproofAPI.getData(startDate, endDate, customerId, {
        priority: 8,
        allowStale: true,
        maxWait: 20000
      });

      const googleAdsData = googleAdsResult.data;
      message += `Google Ads: ${googleAdsResult.message}. `;

      // Validate that we have real API data (not hardcoded/dummy)
      if (!googleAdsData || (!googleAdsData.campaigns && !googleAdsData.clicks)) {
        console.error('[COMPADO_COST_REVENUE] ❌ No Google Ads data received from API!');
        throw new Error('Failed to fetch Google Ads data - API returned empty response');
      }

      console.log(`[COMPADO_COST_REVENUE] ✓ Live Google Ads API data received:`, {
        campaigns: googleAdsData?.campaigns?.length || 0,
        ads: googleAdsData?.ads?.length || 0,
        clicks: googleAdsData?.clicks?.length || 0,
        dataSource: 'bulletproofAPI.getData() - LIVE API',
        timestamp: new Date().toISOString()
      });

      // Build campaign-level cost metrics from LIVE Google Ads API data
      console.log('[COMPADO_COST_REVENUE] Building campaign metrics from LIVE API data...');
      const campaignMetricsMap = new Map<string, any>();
      (googleAdsData?.campaigns || []).forEach((campaign: any, index: number) => {
        const campaignId = String(campaign.campaign_id); // Ensure string type
        if (campaignId && campaignId !== 'undefined') {
          const totalCost = campaign.metrics?.cost || 0;
          const totalClicks = campaign.metrics?.clicks || 0;
          const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

          campaignMetricsMap.set(campaignId, {
            campaign_name: campaign.campaign_name,
            total_cost: totalCost,
            total_clicks: totalClicks,
            cpc: cpc,
            impressions: campaign.metrics?.impressions || 0
          });

          // Log first campaign to verify real data
          if (index === 0) {
            console.log(`[COMPADO_COST_REVENUE] ✓ Sample campaign from LIVE API: ${campaign.campaign_name} | ID: ${campaignId} | Cost: $${totalCost.toFixed(2)} | Clicks: ${totalClicks}`);
          }
        }
      });

      // Build ad-group-level metrics (middle tier)
      const adGroupMetricsMap = new Map<string, any>();
      (googleAdsData?.ads || []).forEach((ad: any) => {
        const adGroupId = String(ad.ad_group_id); // Ensure string type
        if (adGroupId && adGroupId !== 'undefined') {
          // If we already have this ad group, sum the metrics
          const existing = adGroupMetricsMap.get(adGroupId);
          const totalCost = (existing?.cost || 0) + (ad.metrics?.cost || 0);
          const totalClicks = (existing?.clicks || 0) + (ad.metrics?.clicks || 1);
          const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;

          adGroupMetricsMap.set(adGroupId, {
            campaign_id: String(ad.campaign_id),
            campaign_name: ad.campaign_name,
            ad_group_name: ad.ad_group_name,
            cost: totalCost,
            clicks: totalClicks,
            impressions: (existing?.impressions || 0) + (ad.metrics?.impressions || 0),
            cpc: cpc
          });
        }
      });

      console.log(`[COMPADO_COST_REVENUE] Built metrics maps:`, {
        campaigns: campaignMetricsMap.size,
        adGroups: adGroupMetricsMap.size,
        ads: googleAdsData?.ads?.length || 0
      });

      // Log sample IDs from each map for debugging
      if (campaignMetricsMap.size > 0) {
        const sampleCampaignIds = Array.from(campaignMetricsMap.keys()).slice(0, 3);
        console.log(`[COMPADO_COST_REVENUE] Sample campaign IDs in map:`, sampleCampaignIds);
      }
      if (adGroupMetricsMap.size > 0) {
        const sampleAdGroupIds = Array.from(adGroupMetricsMap.keys()).slice(0, 3);
        console.log(`[COMPADO_COST_REVENUE] Sample ad group IDs in map:`, sampleAdGroupIds);
      }
      if (googleAdsData?.clicks && googleAdsData.clicks.length > 0) {
        const sampleClickIds = googleAdsData.clicks.slice(0, 3).map((c: any) => ({
          ad_group_id: c.ad_group_id,
          campaign_id: c.campaign_id
        }));
        console.log(`[COMPADO_COST_REVENUE] Sample ad_group/campaign IDs from clicks:`, sampleClickIds);
      }

      // Extract actual GCLID clicks from Google Ads click_view data and enrich with cost data
      const googleAdsClicks = (googleAdsData?.clicks || []).map((click: any) => {
        // Try to get metrics: ad_group level first, then campaign level
        const adGroupIdStr = String(click.ad_group_id);
        const campaignIdStr = String(click.campaign_id);

        let metrics = adGroupMetricsMap.get(adGroupIdStr);
        let costPerClick = 0;
        let source = 'none';

        if (metrics && metrics.cpc > 0) {
          costPerClick = metrics.cpc;
          source = 'ad-group-level';
        } else {
          // Fallback to campaign-level metrics
          const campaignMetrics = campaignMetricsMap.get(campaignIdStr);
          if (campaignMetrics && campaignMetrics.cpc > 0) {
            costPerClick = campaignMetrics.cpc;
            metrics = {
              campaign_id: campaignIdStr,
              campaign_name: campaignMetrics.campaign_name,
              ad_group_id: adGroupIdStr,
              ad_group_name: click.ad_group_name,
              cost: campaignMetrics.total_cost,
              clicks: campaignMetrics.total_clicks,
              impressions: campaignMetrics.impressions,
              cpc: campaignMetrics.cpc
            };
            source = 'campaign-level';
          } else {
            // No metrics found
            metrics = {
              campaign_id: campaignIdStr,
              campaign_name: click.campaign_name,
              ad_group_id: adGroupIdStr,
              ad_group_name: click.ad_group_name,
              cost: 0,
              clicks: 1,
              impressions: 0,
              cpc: 0
            };
            source = 'none';
          }
        }

        return {
          gclid: click.gclid,
          campaign_id: String(click.campaign_id || metrics.campaign_id || 'unknown'),
          campaign_name: click.campaign_name || metrics.campaign_name || `Campaign ${click.campaign_id}`,
          ad_group_id: String(click.ad_group_id || 'unknown'),
          ad_group_name: click.ad_group_name || metrics.ad_group_name || 'unknown',
          cost: costPerClick, // Cost for this individual click
          clicks: 1, // Each row represents 1 click
          impressions: 1, // Approximation
          date: click.date || startDate,
          _costSource: source // For debugging
        };
      });

      // Log cost statistics
      const clicksWithCost = googleAdsClicks.filter((c: any) => c.cost > 0);
      const totalCost = googleAdsClicks.reduce((sum: number, c: any) => sum + c.cost, 0);
      console.log(`[COMPADO_COST_REVENUE] Cost mapping results:`, {
        total_clicks: googleAdsClicks.length,
        clicks_with_cost: clicksWithCost.length,
        total_cost: `$${totalCost.toFixed(2)}`,
        avg_cpc: googleAdsClicks.length > 0 ? `$${(totalCost / googleAdsClicks.length).toFixed(4)}` : '$0',
        cost_sources: {
          'ad-group-level': googleAdsClicks.filter((c: any) => c._costSource === 'ad-group-level').length,
          'campaign-level': googleAdsClicks.filter((c: any) => c._costSource === 'campaign-level').length,
          'none': googleAdsClicks.filter((c: any) => c._costSource === 'none').length
        }
      });

      // Log sample clicks for debugging
      if (googleAdsClicks.length > 0) {
        console.log(`[COMPADO_COST_REVENUE] Sample clicks (first 3):`,
          googleAdsClicks.slice(0, 3).map((c: any) => ({
            gclid: c.gclid.substring(0, 20) + '...',
            campaign: c.campaign_name?.substring(0, 30),
            cost: `$${c.cost.toFixed(4)}`,
            source: c._costSource
          }))
        );
      }

      // 2. Fetch Compado conversion data (LIVE API)
      console.log('[COMPADO_COST_REVENUE] Fetching LIVE Compado conversion data from API...');
      let compadoConversions: any[] = [];

      try {
        compadoConversions = await fetchAllCompadoConversions(startDate, endDate);
        message += `Compado: ${compadoConversions.length} conversions fetched. `;
        console.log(`[COMPADO_COST_REVENUE] ✓ Live Compado API data received:`, {
          conversions: compadoConversions.length,
          dataSource: 'fetchAllCompadoConversions() - LIVE API',
          timestamp: new Date().toISOString()
        });

        // Log first conversion to verify real data
        if (compadoConversions.length > 0) {
          const firstConv = compadoConversions[0];
          console.log(`[COMPADO_COST_REVENUE] ✓ Sample conversion from LIVE API: GCLID: ${firstConv.gclid?.substring(0, 20)}... | Revenue: €${firstConv.revenue?.toFixed(2)} ($${firstConv.revenueUsd?.toFixed(2)} USD)`);
        }
      } catch (compadoError) {
        console.warn('[COMPADO_COST_REVENUE] ⚠️  Compado API error:', compadoError);
        message += 'Compado: API error (no conversions available). ';
      }

      // 3. Map cost and revenue by GCLID
      console.log('[COMPADO_COST_REVENUE] Creating cost-revenue mapping...');

      // Build and cache campaign names for future use (even during rate limits)
      const campaignNamesMap = new Map<string, string>();
      (googleAdsData?.campaigns || []).forEach((campaign: any) => {
        if (campaign.campaign_id && campaign.campaign_name) {
          campaignNamesMap.set(String(campaign.campaign_id), campaign.campaign_name);
        }
      });

      // Cache campaign names in Redis for 7 days (persist across rate limits)
      if (campaignNamesMap.size > 0) {
        try {
          const cacheKey = `campaign-names:${customerId}`;
          const campaignNamesObj = Object.fromEntries(campaignNamesMap);
          await redisCacheManager.set(cacheKey, campaignNamesObj, {
            dataType: 'google-ads',
            ttl: 604800
          }); // 7 days
          console.log(`[COMPADO_COST_REVENUE] Cached ${campaignNamesMap.size} campaign names for future use`);
        } catch (err) {
          console.warn('[COMPADO_COST_REVENUE] Failed to cache campaign names:', err);
        }
      } else {
        // Try to load cached campaign names if no fresh data
        try {
          const cacheKey = `campaign-names:${customerId}`;
          const cached = await redisCacheManager.get(cacheKey, { dataType: 'google-ads' });
          if (cached.data) {
            Object.entries(cached.data).forEach(([id, name]) => {
              campaignNamesMap.set(id, name as string);
            });
            console.log(`[COMPADO_COST_REVENUE] Loaded ${campaignNamesMap.size} campaign names from cache`);
          }
        } catch (err) {
          console.warn('[COMPADO_COST_REVENUE] Failed to load cached campaign names:', err);
        }
      }

      const costRevenueMapping = mapCompadoCostRevenue(googleAdsClicks, compadoConversions, campaignNamesMap);

      // 4. Aggregate by campaign for easier viewing (using LIVE data only)
      console.log('[COMPADO_COST_REVENUE] Aggregating by campaign using LIVE API data...');

      // Validate we're using live campaign data
      if (campaignMetricsMap.size === 0) {
        console.warn('[COMPADO_COST_REVENUE] ⚠️  No campaign metrics available - campaigns may show with zero cost');
      } else {
        console.log(`[COMPADO_COST_REVENUE] ✓ Using ${campaignMetricsMap.size} campaigns from LIVE Google Ads API`);
      }

      const campaignAggregated = aggregateMappingsByCampaign(costRevenueMapping, campaignMetricsMap);
      console.log(`[COMPADO_COST_REVENUE] ✓ Campaign aggregation complete: ${campaignAggregated.length} campaigns with LIVE data`);

      // Log what campaigns we're returning
      if (campaignAggregated.length > 0) {
        console.log(`[COMPADO_COST_REVENUE] Campaigns being returned to frontend:`);
        campaignAggregated.forEach((camp, idx) => {
          console.log(`[COMPADO_COST_REVENUE]   ${idx + 1}. ${camp.campaign_name} | Cost: $${camp.cost.toFixed(2)} | Conversions: ${camp.conversions} | Revenue: $${camp.revenue.toFixed(2)}`);
        });
      } else {
        console.warn(`[COMPADO_COST_REVENUE] ⚠️  No campaigns in aggregated data - dashboard will show empty!`);
      }

      // 5. Generate summary statistics from aggregated campaign data
      const totalCostFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.cost, 0);
      const totalRevenueFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.revenue, 0);
      const totalConversionsFromCampaigns = campaignAggregated.reduce((sum, c) => sum + c.conversions, 0);

      const summary = getCompadoCostRevenueSummary(costRevenueMapping);

      console.log(`[COMPADO_COST_REVENUE] ✅ Mapping complete:`, {
        click_level_mappings: costRevenueMapping.length,
        campaigns: campaignAggregated.length,
        total_cost: `$${totalCostFromCampaigns.toFixed(2)}`,
        total_revenue: `$${totalRevenueFromCampaigns.toFixed(2)}`,
        total_conversions: totalConversionsFromCampaigns,
        profit: `$${(totalRevenueFromCampaigns - totalCostFromCampaigns).toFixed(2)}`
      });

      // Calculate data freshness for user awareness
      const dataAge = googleAdsResult.age || 0;
      const dataSource = googleAdsResult.source || 'unknown';
      const freshnessMinutes = Math.round(dataAge / 60000);

      const response: CompadoCostRevenueResponse = {
        google_ads_data: {
          clicks: googleAdsClicks,
          total_clicks: googleAdsClicks.length,
          total_cost: googleAdsClicks.reduce((sum: number, c: any) => sum + c.cost, 0)
        },
        compado_data: {
          conversions: compadoConversions,
          total_conversions: compadoConversions.length,
          total_revenue: compadoConversions.reduce((sum: number, c: any) => sum + c.revenue, 0)
        },
        cost_revenue_mapping: costRevenueMapping,
        campaign_aggregated: campaignAggregated,
        summary,
        _source: 'compado_google_ads_mapping',
        _timestamp: new Date().toISOString(),
        _message: message.trim(),
        _dataFreshness: {
          source: dataSource,
          ageMinutes: freshnessMinutes,
          isFresh: freshnessMinutes < 30,
          message: dataSource === 'cache' ? `Data from cache (${freshnessMinutes} min old)` : 'Fresh from API'
        }
      };

      return NextResponse.json(response, {
        headers: {
          'Cache-Control': 'public, max-age=300'
        }
      });

    } catch (dataError) {
      console.error('[COMPADO_COST_REVENUE] Data fetching failed:', dataError);

      // Return empty result on error
      const emptyResponse: CompadoCostRevenueResponse = {
        google_ads_data: { clicks: [], total_clicks: 0, total_cost: 0 },
        compado_data: { conversions: [], total_conversions: 0, total_revenue: 0 },
        cost_revenue_mapping: [],
        campaign_aggregated: [],
        summary: {
          totalCost: 0,
          totalRevenue: 0,
          totalProfit: 0,
          totalConversions: 0,
          totalClicks: 0,
          totalImpressions: 0,
          overallROI: 0,
          overallROAS: 0,
          averageConversionRate: 0,
          profitableCampaigns: 0,
          totalCampaigns: 0,
          profitabilityRate: 0
        },
        _source: 'error_fallback',
        _timestamp: new Date().toISOString(),
        _message: `Data fetch failed: ${dataError instanceof Error ? dataError.message : 'Unknown error'}`
      };

      return NextResponse.json(emptyResponse, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
    }

  } catch (error) {
    console.error('[COMPADO_COST_REVENUE] Request processing error:', error);

    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      _loadTime: Date.now() - startTime
    }, { status: 500 });
  }
}

/**
 * Health check endpoint
 */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
