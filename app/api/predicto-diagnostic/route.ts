/**
 * Predicto Diagnostic API
 * Helps debug why cost and revenue are not being mapped
 */

import { NextRequest, NextResponse } from 'next/server';
import { predictoApiClient } from '@/lib/predicto-api';
import { extractChannelIdsFromUrl } from '@/lib/predicto-channel-mapper';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, customerId } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, endDate' },
        { status: 400 }
      );
    }

    console.log(`[PREDICTO_DIAGNOSTIC] Running diagnostic for ${startDate} to ${endDate}`);

    // Step 1: Fetch Google Ads data
    console.log('[PREDICTO_DIAGNOSTIC] Step 1: Fetching Google Ads data...');
    const googleAdsDataRaw = await bulletproofAPI.getData(startDate, endDate, customerId, {
      priority: 8,
      allowStale: true,
      maxWait: 20000,
      feedType: 'predicto',
    });

    const googleAdsData = [googleAdsDataRaw];

    // Step 2: Extract campaigns
    const campaigns: any[] = [];
    const campaignFinalUrlsMap = new Map<string, Set<string>>();

    // Extract final_urls from ads
    googleAdsData.forEach((accountData) => {
      if (accountData?.ads && Array.isArray(accountData.ads)) {
        accountData.ads.forEach((ad: any) => {
          const campaignId = ad.campaign_id || ad.id;
          if (ad.final_urls && Array.isArray(ad.final_urls) && ad.final_urls.length > 0) {
            if (!campaignFinalUrlsMap.has(campaignId)) {
              campaignFinalUrlsMap.set(campaignId, new Set());
            }
            ad.final_urls.forEach((url: string) => {
              campaignFinalUrlsMap.get(campaignId)!.add(url);
            });
          }
        });
      }
    });

    // Extract campaigns with final_urls
    googleAdsData.forEach((accountData) => {
      if (accountData?.campaigns && Array.isArray(accountData.campaigns)) {
        accountData.campaigns.forEach((campaign: any) => {
          const campaignId = campaign.campaign_id || campaign.id;
          const finalUrls = campaignFinalUrlsMap.has(campaignId)
            ? Array.from(campaignFinalUrlsMap.get(campaignId)!)
            : [];

          campaigns.push({
            campaign_id: campaignId,
            campaign_name: campaign.campaign_name || campaign.name,
            final_urls: finalUrls,
            cost: campaign.cost || 0,
            clicks: campaign.clicks || 0,
            impressions: campaign.impressions || 0,
          });
        });
      }
    });

    // Step 3: Analyze campaigns
    const totalCost = campaigns.reduce((sum, c) => sum + c.cost, 0);
    const campaignsWithCost = campaigns.filter(c => c.cost > 0);
    const campaignsWithUrls = campaigns.filter(c => c.final_urls.length > 0);
    const campaignsWithUrlsAndCost = campaigns.filter(c => c.cost > 0 && c.final_urls.length > 0);

    // Step 4: Extract channel IDs from campaigns
    const googleAdsChannelIds = new Set<string>();
    const campaignChannelMapping: any[] = [];

    campaigns.forEach(campaign => {
      const channelIds: string[] = [];

      campaign.final_urls.forEach((url: string) => {
        const extractedIds = extractChannelIdsFromUrl(url);
        channelIds.push(...extractedIds);
        extractedIds.forEach(id => googleAdsChannelIds.add(id));
      });

      if (campaign.cost > 0 || channelIds.length > 0) {
        campaignChannelMapping.push({
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          cost: campaign.cost,
          final_urls: campaign.final_urls,
          extracted_channel_ids: [...new Set(channelIds)],
          has_cost: campaign.cost > 0,
          has_urls: campaign.final_urls.length > 0,
          has_channel_ids: channelIds.length > 0,
        });
      }
    });

    // Step 5: Fetch Predicto data
    console.log('[PREDICTO_DIAGNOSTIC] Step 2: Fetching Predicto revenue...');
    const predictoRevenue = await predictoApiClient.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['custom_channel_id', 'date'],
    });

    // Step 6: Analyze Predicto data
    const predictoChannelIds = new Set<string>();
    const predictoChannelRevenue = new Map<string, number>();

    predictoRevenue.forEach(record => {
      if (record.custom_channel_id) {
        predictoChannelIds.add(record.custom_channel_id);
        const current = predictoChannelRevenue.get(record.custom_channel_id) || 0;
        predictoChannelRevenue.set(record.custom_channel_id, current + (record.revenue || 0));
      }
    });

    const totalRevenue = Array.from(predictoChannelRevenue.values()).reduce((sum, r) => sum + r, 0);

    // Step 7: Find matches and mismatches
    const matchedChannels = Array.from(googleAdsChannelIds).filter(id => predictoChannelIds.has(id));
    const googleOnlyChannels = Array.from(googleAdsChannelIds).filter(id => !predictoChannelIds.has(id));
    const predictoOnlyChannels = Array.from(predictoChannelIds).filter(id => !googleAdsChannelIds.has(id));

    // Step 8: Calculate potential cost-revenue matches
    let matchedCost = 0;
    let matchedRevenue = 0;
    let unmatchedCost = 0;
    let unmatchedRevenue = 0;

    campaignChannelMapping.forEach(campaign => {
      const hasMatch = campaign.extracted_channel_ids.some((id: string) => predictoChannelIds.has(id));

      if (hasMatch) {
        matchedCost += campaign.cost;
        // Sum revenue from matched channels
        campaign.extracted_channel_ids.forEach((id: string) => {
          if (predictoChannelRevenue.has(id)) {
            matchedRevenue += predictoChannelRevenue.get(id) || 0;
          }
        });
      } else if (campaign.cost > 0) {
        unmatchedCost += campaign.cost;
      }
    });

    predictoOnlyChannels.forEach(channelId => {
      unmatchedRevenue += predictoChannelRevenue.get(channelId) || 0;
    });

    // Diagnostic Report
    const diagnostic = {
      summary: {
        google_ads: {
          total_campaigns: campaigns.length,
          campaigns_with_cost: campaignsWithCost.length,
          campaigns_with_urls: campaignsWithUrls.length,
          campaigns_with_urls_and_cost: campaignsWithUrlsAndCost.length,
          total_cost: totalCost,
          unique_channel_ids_extracted: googleAdsChannelIds.size,
        },
        predicto: {
          total_records: predictoRevenue.length,
          unique_channel_ids: predictoChannelIds.size,
          total_revenue: totalRevenue,
        },
        mapping: {
          matched_channels: matchedChannels.length,
          google_only_channels: googleOnlyChannels.length,
          predicto_only_channels: predictoOnlyChannels.length,
          matched_cost: matchedCost,
          matched_revenue: matchedRevenue,
          unmatched_cost: unmatchedCost,
          unmatched_revenue: unmatchedRevenue,
          match_rate_by_channel: matchedChannels.length / Math.max(googleAdsChannelIds.size, predictoChannelIds.size, 1) * 100,
          match_rate_by_cost: matchedCost / totalCost * 100,
          match_rate_by_revenue: matchedRevenue / totalRevenue * 100,
        },
      },
      details: {
        matched_channels: matchedChannels.slice(0, 20),
        google_only_channels: googleOnlyChannels.slice(0, 20),
        predicto_only_channels: predictoOnlyChannels.slice(0, 20),
        sample_campaigns: campaignChannelMapping.slice(0, 10),
        all_google_channel_ids: Array.from(googleAdsChannelIds).sort(),
        all_predicto_channel_ids: Array.from(predictoChannelIds).sort(),
      },
      issues: [],
      recommendations: [],
    };

    // Identify issues
    if (campaignsWithCost.length > 0 && campaignsWithUrls.length === 0) {
      diagnostic.issues.push({
        severity: 'CRITICAL',
        issue: 'No Final URLs found in any campaign',
        impact: 'Cannot extract channel IDs to map cost to revenue',
        affected: `${campaignsWithCost.length} campaigns with cost have no URLs`,
      });
      diagnostic.recommendations.push({
        action: 'Add Final URLs to Google Ads campaigns',
        details: 'Go to Google Ads dashboard and add Final URLs with cid parameter to each campaign',
        example: 'https://tunefulsoul.com/page?cid=ch88087',
      });
    }

    if (campaignsWithUrls.length > 0 && googleAdsChannelIds.size === 0) {
      diagnostic.issues.push({
        severity: 'CRITICAL',
        issue: 'Final URLs exist but no channel IDs extracted',
        impact: 'Final URLs are missing the cid parameter',
        affected: `${campaignsWithUrls.length} campaigns have URLs but no cid parameter`,
      });
      diagnostic.recommendations.push({
        action: 'Add cid parameter to Final URLs',
        details: 'Update Final URLs to include ?cid=chXXXXX parameter',
        example: 'Change "https://tunefulsoul.com/page" to "https://tunefulsoul.com/page?cid=ch88087"',
      });
    }

    if (googleAdsChannelIds.size > 0 && matchedChannels.length === 0) {
      diagnostic.issues.push({
        severity: 'CRITICAL',
        issue: 'Channel IDs extracted but none match Predicto',
        impact: 'Google Ads channel IDs do not match Predicto channel IDs',
        affected: 'All channel mappings are failing',
      });
      diagnostic.recommendations.push({
        action: 'Verify channel ID consistency',
        details: 'Ensure Google Ads and Predicto use the same channel IDs',
        google_ads_channel_ids: Array.from(googleAdsChannelIds).slice(0, 10),
        predicto_channel_ids: Array.from(predictoChannelIds).slice(0, 10),
      });
    }

    if (matchedChannels.length > 0 && matchedChannels.length < googleAdsChannelIds.size) {
      diagnostic.issues.push({
        severity: 'WARNING',
        issue: 'Partial channel matching',
        impact: `${googleOnlyChannels.length} Google Ads channels have no matching Predicto data`,
        affected: `$${unmatchedCost.toFixed(2)} cost cannot be matched`,
      });
      diagnostic.recommendations.push({
        action: 'Check missing Predicto channels',
        details: 'These channel IDs are in Google Ads but not in Predicto',
        missing_channels: googleOnlyChannels.slice(0, 10),
      });
    }

    if (predictoOnlyChannels.length > 0) {
      diagnostic.issues.push({
        severity: 'INFO',
        issue: 'Predicto has channels not in Google Ads',
        impact: `$${unmatchedRevenue.toFixed(2)} revenue has no associated cost`,
        affected: `${predictoOnlyChannels.length} Predicto channels`,
      });
      diagnostic.recommendations.push({
        action: 'Add campaigns for these channels',
        details: 'These Predicto channels have revenue but no Google Ads campaigns',
        orphaned_channels: predictoOnlyChannels.slice(0, 10),
      });
    }

    return NextResponse.json({
      status: 'success',
      diagnostic,
      _timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[PREDICTO_DIAGNOSTIC] Error:', error);
    return NextResponse.json(
      {
        status: 'error',
        error: error.message,
        _timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
