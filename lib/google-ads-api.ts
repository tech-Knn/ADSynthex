import fs from 'fs';
import path from 'path';
import { GoogleAdsApi } from 'google-ads-api';
import config from './google-ads-config';
import * as utils from './google-ads-utils';

// Target accounts configuration
const TARGET_ACCOUNTS = config.TARGET_ACCOUNTS;

// Google Ads client initialization
export function initializeGoogleAdsClient() {
  try {
    const client = new GoogleAdsApi({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
    });
    
    // Create an auth client with refresh token
    const customer = client.Customer({
      customer_id: process.env.GOOGLE_ADS_MANAGER_ID || '',
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
      login_customer_id: process.env.GOOGLE_ADS_MANAGER_ID || ''
    });
    
    return { client, customer };
  } catch (error) {
    console.error('Error initializing Google Ads API client:', error);
    throw error;
  }
}

// Build campaign query without restricting by status so we capture ENABLED, PAUSED, REMOVED etc.
function buildActiveCampaignQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.activeCampaignQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build all campaigns query
function buildAllCampaignsQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.allCampaignsQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build active ad query
function buildActiveAdGroupAdQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.activeAdGroupAdQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build all ad query
function buildAllAdGroupAdQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.allAdGroupAdQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

// Build asset group query
function buildAssetGroupQuery(startDate: string, endDate: string) {
  // Replace date placeholders with actual dates
  return config.queries.assetGroupQuery
    .replace('DATE_RANGE_START', startDate)
    .replace('DATE_RANGE_END', endDate);
}

export interface GoogleAdsCampaign {
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  final_url_suffix: string;
  metrics: {
    impressions: number;
    clicks: number;
    cost: number;
    cost_micros: number;
    conversions: number;
    ctr: number;
    cpa: number;
    cpc: number;
    average_cost: number;
    average_cpc: number;
    average_cpe: number;
    average_target_cpa: number;
  };
}

export interface GoogleAdsAd {
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_group_status: string;
  ad_id: string;
  ad_name: string;
  ad_status: string;
  final_urls: string[];
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    cost: number;
    conversions: number;
    conversion_rate?: number;
    ctr: number;
    cpc: number;
    cpa?: number;
  };
}

export interface GoogleAdsData {
  campaigns: GoogleAdsCampaign[];
  ads: GoogleAdsAd[];
}

// Process campaign data
function processCampaignData(response: any[], account: any): GoogleAdsCampaign[] {
  return response.map(item => {
    try {
      // Extract metrics
      const impressions = Number(item.metrics?.impressions || 0);
      const clicks = Number(item.metrics?.clicks || 0);
      const costMicros = Number(item.metrics?.cost_micros || 0);
      const cost = costMicros / 1000000; // Convert micros to standard currency
      const conversions = Number(item.metrics?.conversions || 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      
      // Extract additional cost metrics
      const averageCostMicros = Number(item.metrics?.average_cost || 0);
      const averageCost = averageCostMicros / 1000000;
      
      const averageCpcMicros = Number(item.metrics?.average_cpc || 0);
      const averageCpc = averageCpcMicros / 1000000;
      
      const averageCpeMicros = Number(item.metrics?.average_cpe || 0);
      const averageCpe = averageCpeMicros / 1000000;
      
      const averageTargetCpaMicros = Number(item.metrics?.average_target_cpa_micros || 0);
      const averageTargetCpa = averageTargetCpaMicros / 1000000;
      
      // Extract campaign data
      const campaignId = item.campaign ? item.campaign.id : 'unknown';
      const campaignName = item.campaign ? item.campaign.name : 'Unknown Campaign';
      const campaignStatus = item.campaign && item.campaign.status ? item.campaign.status : 'unknown';
      const finalUrlSuffix = item.campaign && item.campaign.final_url_suffix ? item.campaign.final_url_suffix : '';
      
      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        final_url_suffix: finalUrlSuffix,
        metrics: {
          impressions,
          clicks,
          cost,
          cost_micros: costMicros,
          conversions,
          ctr,
          cpa: conversions > 0 ? cost / conversions : 0,
          cpc: clicks > 0 ? cost / clicks : 0,
          average_cost: averageCost,
          average_cpc: averageCpc,
          average_cpe: averageCpe,
          average_target_cpa: averageTargetCpa
        }
      };
    } catch (error) {
      console.error('Error processing campaign data:', error);
      return null;
    }
  }).filter(item => item !== null) as GoogleAdsCampaign[];
}

// Process ad data
function processAdData(response: any[], account: any): GoogleAdsAd[] {
  return response.map(item => {
    try {
      // Extract campaign, ad group, and ad information
      const campaignId = item.campaign ? item.campaign.id : 'unknown';
      const campaignName = item.campaign ? item.campaign.name : 'Unknown Campaign';
      const campaignStatus = item.campaign && item.campaign.status ? item.campaign.status : 'unknown';
      
      const adGroupId = item.ad_group ? item.ad_group.id : 'unknown';
      const adGroupName = item.ad_group ? item.ad_group.name : 'Unknown Ad Group';
      const adGroupStatus = item.ad_group && item.ad_group.status ? item.ad_group.status : 'unknown';
      
      const adId = item.ad_group_ad && item.ad_group_ad.ad ? item.ad_group_ad.ad.id : 'unknown';
      const adName = item.ad_group_ad && item.ad_group_ad.ad && item.ad_group_ad.ad.name 
        ? item.ad_group_ad.ad.name 
        : 'Unknown Ad';
      const adStatus = item.ad_group_ad && item.ad_group_ad.status ? item.ad_group_ad.status : 'unknown';
      
      const finalUrls = (item.ad_group_ad && item.ad_group_ad.ad && item.ad_group_ad.ad.final_urls) 
        ? item.ad_group_ad.ad.final_urls 
        : [];
      
      // Safely access metrics with defaults
      const metrics = item.metrics || {};
      
      // Extract key metrics
      const impressions = Number(metrics.impressions || 0);
      const clicks = Number(metrics.clicks || 0);
      const costMicros = Number(metrics.cost_micros || 0);
      const cost = costMicros / 1000000; // Convert micros to actual currency
      const conversions = Number(metrics.conversions || 0);
      
      // Calculate derived metrics
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const cpa = conversions > 0 ? cost / conversions : 0;
      
      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        ad_group_id: adGroupId,
        ad_group_name: adGroupName,
        ad_group_status: adGroupStatus,
        ad_id: adId,
        ad_name: adName,
        ad_status: adStatus,
        final_urls: finalUrls,
        metrics: {
          impressions,
          clicks,
          cost_micros: costMicros,
          cost,
          conversions,
          conversion_rate: conversionRate,
          ctr,
          cpc,
          cpa
        }
      };
    } catch (error) {
      console.error('Error processing ad data:', error);
      return null;
    }
  }).filter(item => item !== null) as GoogleAdsAd[];
}

// Process asset group data
function processAssetGroupData(response: any[], account: any): GoogleAdsAd[] {
  return response.map(row => {
    try {
      const campaignId = row.campaign ? row.campaign.id : 'unknown';
      const campaignName = row.campaign ? row.campaign.name : 'Unknown Campaign';
      const campaignStatus = row.campaign && row.campaign.status ? row.campaign.status : 'unknown';

      const assetGroupId = row.asset_group ? row.asset_group.id : 'unknown';
      const assetGroupName = row.asset_group ? row.asset_group.name : 'Unknown Asset Group';
      const assetGroupStatus = row.asset_group && row.asset_group.status ? row.asset_group.status : 'unknown';

      const finalUrls = (row.asset_group && row.asset_group.final_urls) ? row.asset_group.final_urls : [];

      // Metrics
      const metrics = row.metrics || {};
      const impressions = Number(metrics.impressions || 0);
      const clicks = Number(metrics.clicks || 0);
      const costMicros = Number(metrics.cost_micros || 0);
      const cost = costMicros / 1_000_000;
      const conversions = Number(metrics.conversions || 0);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

      return {
        customer_id: account.id,
        customer_name: account.name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        campaign_status: campaignStatus,
        ad_group_id: `AG_${assetGroupId}`,
        ad_group_name: assetGroupName,
        ad_group_status: assetGroupStatus,
        ad_id: `AG_${assetGroupId}`,
        ad_name: `AssetGroup ${assetGroupName}`,
        ad_status: assetGroupStatus,
        final_urls: finalUrls,
        metrics: {
          impressions,
          clicks,
          cost_micros: costMicros,
          cost,
          conversions,
          ctr,
          cpc: clicks > 0 ? cost / clicks : 0
        }
      };
    } catch (err) {
      console.error('Error processing asset group row:', err);
      return null;
    }
  }).filter(Boolean) as GoogleAdsAd[];
}

// Fetch all necessary data
export async function fetchGoogleAdsData(startDate: string, endDate: string): Promise<GoogleAdsData> {
  const { client, customer } = initializeGoogleAdsClient();
  const data: GoogleAdsData = {
    campaigns: [],
    ads: []
  };

  for (const account of TARGET_ACCOUNTS) {
    try {
      // Create account-specific customer
      const accountCustomer = client.Customer({
        customer_id: account.id,
        refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
        login_customer_id: process.env.GOOGLE_ADS_MANAGER_ID || ''
      });
      
      // Fetch active campaigns
      const activeCampaignQuery = buildActiveCampaignQuery(startDate, endDate);
      console.log(`Account ${account.id} query: ${activeCampaignQuery}`);
      
      const activeCampaignResponse = await accountCustomer.query(activeCampaignQuery);
      if (activeCampaignResponse && activeCampaignResponse.length > 0) {
        const processedCampaigns = processCampaignData(activeCampaignResponse, account);
        data.campaigns.push(...processedCampaigns);
      }

      // Fetch all campaigns
      const allCampaignsQuery = buildAllCampaignsQuery(startDate, endDate);
      const allCampaignsResponse = await accountCustomer.query(allCampaignsQuery);
      if (allCampaignsResponse && allCampaignsResponse.length > 0) {
        const allCampaigns = processCampaignData(allCampaignsResponse, account);
        
        // Merge campaign lists, prioritizing active campaigns
        const campaignMap = new Map();
        
        // First add all campaigns
        for (const campaign of allCampaigns) {
          campaignMap.set(campaign.campaign_id, campaign);
        }
        
        // Then override with active campaigns
        for (const campaign of data.campaigns) {
          if (campaign.customer_id === account.id) {
            campaignMap.set(campaign.campaign_id, campaign);
          }
        }
        
        // Update campaigns list
        data.campaigns = data.campaigns.filter(c => c.customer_id !== account.id);
        data.campaigns.push(...Array.from(campaignMap.values()));
      }

      // Fetch active ad group ads
      const activeAdQuery = buildActiveAdGroupAdQuery(startDate, endDate);
      const activeAdResponse = await accountCustomer.query(activeAdQuery);
      if (activeAdResponse && activeAdResponse.length > 0) {
        const processedAds = processAdData(activeAdResponse, account);
        data.ads.push(...processedAds);
      }

      // Fetch all ad group ads
      const allAdQuery = buildAllAdGroupAdQuery(startDate, endDate);
      const allAdResponse = await accountCustomer.query(allAdQuery);
      if (allAdResponse && allAdResponse.length > 0) {
        const allAds = processAdData(allAdResponse, account);
        
        // Merge ad lists, prioritizing active ads
        const adMap = new Map();
        
        // First add all ads
        for (const ad of allAds) {
          adMap.set(ad.ad_id, ad);
        }
        
        // Then override with active ads
        for (const ad of data.ads) {
          if (ad.customer_id === account.id) {
            adMap.set(ad.ad_id, ad);
          }
        }
        
        // Update ads list
        data.ads = data.ads.filter(a => a.customer_id !== account.id);
        data.ads.push(...Array.from(adMap.values()));
      }

      // Fetch Performance Max asset groups
      const assetGroupQuery = buildAssetGroupQuery(startDate, endDate);
      const assetGroupResponse = await accountCustomer.query(assetGroupQuery);
      if (assetGroupResponse && assetGroupResponse.length > 0) {
        const assetGroupAds = processAssetGroupData(assetGroupResponse, account);
        
        // Add asset group ads to the list
        data.ads.push(...assetGroupAds);
      }
    } catch (error) {
      console.error(`Error fetching data for account ${account.id}:`, error);
    }
  }

  return data;
}

// For development/testing purposes when API is not available
export function getMockGoogleAdsData(startDate?: string, endDate?: string): GoogleAdsData {
  console.log(`Generating mock Google Ads data for date range: ${startDate || 'default'} to ${endDate || 'default'}`);
  
  // Always ensure we have enough ads to match all articles (target 553)
  const targetAdCount = 553;  
  
  // Can use the date range to adjust mock data (e.g., reduce data for shorter date ranges)
  const dateMultiplier = 1.0; // Default multiplier
  
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // For single-day requests, reduce the mock data volumes
    if (daysDiff === 1) {
      // For single day, reduce metrics by factor
      console.log('Adjusting mock data for single-day request');
      return generateSingleDayMockData(startDate, targetAdCount);
    } 
    // For date ranges larger than 3 days, increase proportionally
    else if (daysDiff > 3) {
      // For longer ranges, increase metrics proportionally
      console.log(`Adjusting mock data for ${daysDiff}-day request`);
    }
  }
  
  // Default mock data (for 3-day range)
  // Start with our base campaigns and ads
  const baseCampaigns = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2844,
        clicks: 1234,
        cost: 73.95,
        cost_micros: 73950000,
        conversions: 45,
        ctr: 43.39,
        cpa: 1.64,
        cpc: 0.06,
        average_cost: 0.06,
        average_cpc: 0.06,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '23456789',
      campaign_name: 'Automotive Knowledge Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 144,
        clicks: 574,
        cost: 54.71,
        cost_micros: 54710000,
        conversions: 12,
        ctr: 398.61,
        cpa: 4.56,
        cpc: 0.095,
        average_cost: 0.095,
        average_cpc: 0.095,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 48735,
        clicks: 4813,
        cost: 102.34,
        cost_micros: 102340000,
        conversions: 18,
        ctr: 9.88,
        cpa: 5.69,
        cpc: 0.0213,
        average_cost: 0.0213,
        average_cpc: 0.0213,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '8677814915',
      customer_name: 'Ads.com - RSOC - IST',
      campaign_id: '45678901',
      campaign_name: 'Industrial Crusher Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2285,
        clicks: 1149,
        cost: 45.60,
        cost_micros: 45600000,
        conversions: 22,
        ctr: 50.28,
        cpa: 2.07,
        cpc: 0.0397,
        average_cost: 0.0397,
        average_cpc: 0.0397,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '4277350349',
      customer_name: 'RSOC - UTC - Ads.com',
      campaign_id: '56789012',
      campaign_name: 'Bioreactors Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 3009,
        clicks: 1182,
        cost: 42.80,
        cost_micros: 42800000,
        conversions: 19,
        ctr: 39.28,
        cpa: 2.25,
        cpc: 0.0362,
        average_cost: 0.0362,
        average_cpc: 0.0362,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '67890123',
      campaign_name: 'Industrial Crusher Machines Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 2556,
        clicks: 1107,
        cost: 39.70,
        cost_micros: 39700000,
        conversions: 17,
        ctr: 43.31,
        cpa: 2.33,
        cpc: 0.0359,
        average_cost: 0.0359,
        average_cpc: 0.0359,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '78901234',
      campaign_name: 'Metal Stamping Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: 1383,
        clicks: 762,
        cost: 36.50,
        cost_micros: 36500000,
        conversions: 15,
        ctr: 55.10,
        cpa: 2.43,
        cpc: 0.0479,
        average_cost: 0.0479,
        average_cpc: 0.0479,
        average_cpe: 0,
        average_target_cpa: 0
      }
    }
  ];
  
  const baseAds = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag123456',
      ad_group_name: 'Chemical Processing Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad123456',
      ad_name: 'Chemical Processing Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions'],
      metrics: {
        impressions: 2844,
        clicks: 1234,
        cost_micros: 73950000,
        cost: 73.95,
        conversions: 45,
        conversion_rate: 3.65,
        ctr: 43.39,
        cpc: 0.06,
        cpa: 1.64
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '23456789',
      campaign_name: 'Automotive Knowledge Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag234567',
      ad_group_name: 'Automotive Knowledge Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad234567',
      ad_name: 'Automotive Knowledge Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revving-up-your-automotive-knowledge-essential-insights-into-innovation-safety-and-sustainable-choices'],
      metrics: {
        impressions: 144,
        clicks: 574,
        cost_micros: 54710000,
        cost: 54.71,
        conversions: 12,
        conversion_rate: 2.09,
        ctr: 398.61,
        cpc: 0.095,
        cpa: 4.56
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag345678',
      ad_group_name: 'Industrial Packaging Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad345678',
      ad_name: 'Industrial Packaging Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions'],
      metrics: {
        impressions: 48735,
        clicks: 4813,
        cost_micros: 102340000,
        cost: 102.34,
        conversions: 18,
        conversion_rate: 0.37,
        ctr: 9.88,
        cpc: 0.0213,
        cpa: 5.69
      }
    },
    {
      customer_id: '8677814915',
      customer_name: 'Ads.com - RSOC - IST',
      campaign_id: '45678901',
      campaign_name: 'Industrial Crusher Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag456789',
      ad_group_name: 'Industrial Crusher Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad456789',
      ad_name: 'Industrial Crusher Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/industrial-crusher-machines-enhancing-efficiency-in-high-demand-lump-crushing-industry'],
      metrics: {
        impressions: 2285,
        clicks: 1149,
        cost_micros: 45600000,
        cost: 45.60,
        conversions: 22,
        conversion_rate: 1.91,
        ctr: 50.28,
        cpc: 0.0397,
        cpa: 2.07
      }
    },
    {
      customer_id: '4277350349',
      customer_name: 'RSOC - UTC - Ads.com',
      campaign_id: '56789012',
      campaign_name: 'Bioreactors Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag567890',
      ad_group_name: 'Bioreactors Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad567890',
      ad_name: 'Bioreactors Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/exploring-the-world-of-bioreactors-a-vital-tool-in-biotechnology'],
      metrics: {
        impressions: 3009,
        clicks: 1182,
        cost_micros: 42800000,
        cost: 42.80,
        conversions: 19,
        ctr: 39.28,
        cpa: 2.25,
        cpc: 0.0362
      }
    },
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '67890123',
      campaign_name: 'Industrial Crusher Machines Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag678901',
      ad_group_name: 'Industrial Crusher Machines Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad678901',
      ad_name: 'Industrial Crusher Machines Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-the-industry-with-industrial-crusher-machines'],
      metrics: {
        impressions: 2556,
        clicks: 1107,
        cost_micros: 39700000,
        cost: 39.70,
        conversions: 17,
        ctr: 43.31,
        cpc: 0.0359
      }
    },
    {
      customer_id: '5723554317',
      customer_name: 'Ads.com - RSOC - UTC - 03',
      campaign_id: '78901234',
      campaign_name: 'Metal Stamping Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag789012',
      ad_group_name: 'Metal Stamping Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad789012',
      ad_name: 'Metal Stamping Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/metal-stamping-machines-for-industrial-precision'],
      metrics: {
        impressions: 1383,
        clicks: 762,
        cost_micros: 36500000,
        cost: 36.50,
        conversions: 15,
        ctr: 55.10,
        cpc: 0.0479
      }
    }
  ];
  
  // Generate additional ads to reach target count
  const additionalAdsNeeded = targetAdCount - baseAds.length;
  console.log(`Generating ${additionalAdsNeeded} additional ads to reach target count of ${targetAdCount}`);
  
  // Templates for ad creation
  const urlPrefixes = [
    'https://www.freshcuesdaily.com/',
    'https://techinsightsweekly.com/',
    'https://innovationspotlight.net/',
    'https://futuretechtoday.com/',
    'https://emergingtrendsreport.org/',
    'https://nextgentechnology.info/',
    'https://digitaltransformationhub.com/'
  ];
  
  // Topics for generating URLs
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing',
    'digital-transformation',
    'supply-chain-optimization',
    'predictive-maintenance',
    'smart-factories',
    'industrial-iot',
    'augmented-reality',
    'virtual-reality',
    '3d-printing',
    'additive-manufacturing'
  ];
  
  // Generate additional ads
  const additionalAds = [];
  for (let i = 0; i < additionalAdsNeeded; i++) {
    // Select a random campaign as template (alternate between first and second)
    const campaignIndex = i % 2;
    const campaign = baseCampaigns[campaignIndex];
    
    // Generate variation
    const variationFactor = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
    
    // Generate URL
    const urlPrefix = urlPrefixes[i % urlPrefixes.length];
    const topic = topics[i % topics.length];
    const finalUrl = `${urlPrefix}${topic}-article-${i + 8}`;
    
    // Calculate metrics
    const impressions = Math.round(2000 * variationFactor);
    const clicks = Math.round(impressions * (0.1 + Math.random() * 0.2)); // 10-30% CTR
    const costMicros = Math.round(clicks * 50000 * variationFactor); // Average CPC of $0.05-$0.15
    const cost = parseFloat((costMicros / 1000000).toFixed(2));
    const conversions = Math.round(clicks * (0.01 + Math.random() * 0.04)); // 1-5% conversion rate
    const ctr = parseFloat((clicks / impressions * 100).toFixed(2));
    const cpc = parseFloat((cost / clicks).toFixed(4));
    const conversionRate = parseFloat((conversions / clicks * 100).toFixed(2));
    const cpa = parseFloat((cost / conversions).toFixed(2));
    
    // Create ad
    additionalAds.push({
      customer_id: campaign.customer_id,
      customer_name: campaign.customer_name,
      campaign_id: `campaign-${i + 8}`,
      campaign_name: `Campaign for ${topic}`,
      campaign_status: 'ENABLED',
      ad_group_id: `adgroup-${i + 8}`,
      ad_group_name: `Ad Group for ${topic}`,
      ad_group_status: 'ENABLED',
      ad_id: `ad-${i + 8}`,
      ad_name: `Ad for ${topic}`,
      ad_status: 'ENABLED',
      final_urls: [finalUrl],
      metrics: {
        impressions,
        clicks,
        cost_micros: costMicros,
        cost,
        conversions,
        conversion_rate: conversionRate,
        ctr,
        cpc,
        cpa
      }
    });
  }
  
  // Combine base ads with additional ads
  const allAds = [...baseAds, ...additionalAds];
  console.log(`Total Google Ads mock ads: ${allAds.length}`);
  
  return {
    campaigns: baseCampaigns,
    ads: allAds
  };
}

// Helper function to generate additional ads
function generateAdditionalAds(count: number, campaigns: GoogleAdsCampaign[]): GoogleAdsAd[] {
  const ads: GoogleAdsAd[] = [];
  
  // Templates for ad creation
  const urlPrefixes = [
    'https://www.freshcuesdaily.com/',
    'https://techinsightsweekly.com/',
    'https://innovationspotlight.net/',
    'https://futuretechtoday.com/',
    'https://emergingtrendsreport.org/',
    'https://nextgentechnology.info/',
    'https://digitaltransformationhub.com/'
  ];
  
  // Topics for generating URLs
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing',
    'digital-transformation',
    'supply-chain-optimization',
    'predictive-maintenance',
    'smart-factories',
    'industrial-iot',
    'augmented-reality',
    'virtual-reality',
    '3d-printing',
    'additive-manufacturing',
    'electric-vehicles',
    'renewable-energy',
    'green-technology',
    'logistics-automation'
  ];
  
  // Subtopics for url variation
  const subtopics = [
    'market-trends',
    'top-companies',
    'best-practices',
    'future-developments',
    'case-studies',
    'industry-insights',
    'implementation-guide',
    'benefits-challenges',
    'roi-analysis',
    'technology-comparison',
    'expert-advice',
    'research-findings',
    'latest-innovations',
    'practical-applications',
    'success-stories'
  ];
  
  // Generate the additional ads
  for (let i = 0; i < count; i++) {
    // Select a random campaign as template
    const campaignTemplate = campaigns[Math.floor(Math.random() * campaigns.length)];
    
    // Generate variation from template
    const variationFactor = 0.5 + Math.random(); // 0.5 to 1.5
    
    // Generate URL
    const urlPrefix = urlPrefixes[Math.floor(Math.random() * urlPrefixes.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const subtopic = subtopics[Math.floor(Math.random() * subtopics.length)];
    const urlSuffix = `${topic}-${subtopic}-${i + 8}`;
    const finalUrl = `${urlPrefix}${urlSuffix}`;
    
    // Calculate metrics based on template with variations
    const impressions = Math.round(campaignTemplate.metrics.impressions * variationFactor);
    const clicks = Math.round(campaignTemplate.metrics.clicks * variationFactor);
    const costMicros = Math.round(campaignTemplate.metrics.cost_micros * variationFactor);
    const cost = parseFloat((campaignTemplate.metrics.cost * variationFactor).toFixed(2));
    const conversions = Math.round(campaignTemplate.metrics.conversions * variationFactor);
    const ctr = parseFloat((impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2));
    const cpc = parseFloat((clicks > 0 ? cost / clicks : 0).toFixed(4));
    const conversionRate = parseFloat((clicks > 0 ? (conversions / clicks) * 100 : 0).toFixed(2));
    const cpa = parseFloat((conversions > 0 ? cost / conversions : 0).toFixed(2));
    
    // Create the ad
    ads.push({
      customer_id: campaignTemplate.customer_id,
      customer_name: campaignTemplate.customer_name,
      campaign_id: `campaign-${i + 8}`,
      campaign_name: `Campaign for ${topic}`,
      campaign_status: 'ENABLED',
      ad_group_id: `adgroup-${i + 8}`,
      ad_group_name: `Ad Group for ${topic}`,
      ad_group_status: 'ENABLED',
      ad_id: `ad-${i + 8}`,
      ad_name: `Ad for ${topic}`,
      ad_status: 'ENABLED',
      final_urls: [finalUrl],
      metrics: {
        impressions,
        clicks,
        cost_micros: costMicros,
        cost,
        conversions,
        conversion_rate: conversionRate,
        ctr,
        cpc,
        cpa
      }
    });
  }
  
  return ads;
}

// Generate mock data for a single day
function generateSingleDayMockData(dateString: string, targetAdCount: number = 553): GoogleAdsData {
  // Calculate a factor based on which day it is (to make data different per day)
  const date = new Date(dateString);
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dateFactor = (day * 0.1) + (month * 0.05); 
  
  // Create a variation of the standard mock data
  const isToday = dateString === new Date().toISOString().split('T')[0];
  const isYesterday = dateString === new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  // Base factor for the day
  const factor = 0.4 + dateFactor;
  
  // Today will have slightly higher numbers than yesterday
  const adjustedFactor = isToday ? factor * 1.2 : (isYesterday ? factor * 0.9 : factor);
  
  console.log(`Mock data for ${dateString} using factor: ${adjustedFactor.toFixed(2)}`);
  
  // Base campaigns and ads
  const baseCampaigns = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: Math.round(2844 * adjustedFactor),
        clicks: Math.round(1234 * adjustedFactor),
        cost: parseFloat((73.95 * adjustedFactor).toFixed(2)),
        cost_micros: Math.round(73950000 * adjustedFactor),
        conversions: Math.round(45 * adjustedFactor),
        ctr: 43.39,
        cpa: 1.64,
        cpc: 0.06,
        average_cost: 0.06,
        average_cpc: 0.06,
        average_cpe: 0,
        average_target_cpa: 0
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      final_url_suffix: '',
      metrics: {
        impressions: Math.round(48735 * adjustedFactor),
        clicks: Math.round(4813 * adjustedFactor),
        cost: parseFloat((102.34 * adjustedFactor).toFixed(2)),
        cost_micros: Math.round(102340000 * adjustedFactor),
        conversions: Math.round(18 * adjustedFactor),
        ctr: 9.88,
        cpa: 5.69,
        cpc: 0.0213,
        average_cost: 0.0213,
        average_cpc: 0.0213,
        average_cpe: 0,
        average_target_cpa: 0
      }
    }
  ];
  
  const baseAds = [
    {
      customer_id: '3146253756',
      customer_name: 'Ads.com - RSOC - UTC - 04',
      campaign_id: '12345678',
      campaign_name: 'Chemical Processing Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag123456',
      ad_group_name: 'Chemical Processing Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad123456',
      ad_name: 'Chemical Processing Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/chemical-processing-equipment-leading-brands-and-advanced-solutions'],
      metrics: {
        impressions: Math.round(2844 * adjustedFactor),
        clicks: Math.round(1234 * adjustedFactor),
        cost_micros: Math.round(73950000 * adjustedFactor),
        cost: parseFloat((73.95 * adjustedFactor).toFixed(2)),
        conversions: Math.round(45 * adjustedFactor),
        conversion_rate: 3.65,
        ctr: 43.39,
        cpc: 0.06,
        cpa: 1.64
      }
    },
    {
      customer_id: '9071440966',
      customer_name: 'Ads.com - RSOC - UTC - 02',
      campaign_id: '34567890',
      campaign_name: 'Industrial Packaging Campaign',
      campaign_status: 'ENABLED',
      ad_group_id: 'ag345678',
      ad_group_name: 'Industrial Packaging Ad Group',
      ad_group_status: 'ENABLED',
      ad_id: 'ad345678',
      ad_name: 'Industrial Packaging Ad',
      ad_status: 'ENABLED',
      final_urls: ['https://www.freshcuesdaily.com/revolutionizing-industrial-packaging-with-automation-machines-top-brands-cutting-edge-solutions'],
      metrics: {
        impressions: Math.round(48735 * adjustedFactor),
        clicks: Math.round(4813 * adjustedFactor),
        cost_micros: Math.round(102340000 * adjustedFactor),
        cost: parseFloat((102.34 * adjustedFactor).toFixed(2)),
        conversions: Math.round(18 * adjustedFactor),
        conversion_rate: 0.37,
        ctr: 9.88,
        cpc: 0.0213,
        cpa: 5.69
      }
    }
  ];
  
  // Generate additional ads to reach target count
  const additionalAdsNeeded = targetAdCount - baseAds.length;
  console.log(`Generating ${additionalAdsNeeded} additional ads for single day ${dateString}`);
  
  // Templates for ad creation
  const urlPrefixes = [
    'https://www.freshcuesdaily.com/',
    'https://techinsightsweekly.com/',
    'https://innovationspotlight.net/',
    'https://futuretechtoday.com/',
    'https://emergingtrendsreport.org/'
  ];
  
  // Topics for generating URLs
  const topics = [
    'industrial-automation',
    'machine-learning',
    'cloud-computing',
    'cybersecurity',
    'blockchain',
    'internet-of-things',
    'big-data-analytics',
    'artificial-intelligence',
    'edge-computing',
    'quantum-computing',
    'robotics-innovations',
    'sustainable-manufacturing'
  ];
  
  // Generate additional ads
  const additionalAds = [];
  for (let i = 0; i < additionalAdsNeeded; i++) {
    // Select a random base ad as template
    const template = baseAds[Math.floor(Math.random() * baseAds.length)];
    
    // Generate variation from template
    const variationFactor = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
    
    // Generate URL
    const urlPrefix = urlPrefixes[Math.floor(Math.random() * urlPrefixes.length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const finalUrl = `${urlPrefix}${topic}-article-${i + 3}`;
    
    // Calculate metrics
    const impressions = Math.round(template.metrics.impressions * variationFactor);
    const clicks = Math.round(template.metrics.clicks * variationFactor);
    const costMicros = Math.round(template.metrics.cost_micros * variationFactor);
    const cost = parseFloat((template.metrics.cost * variationFactor).toFixed(2));
    const conversions = Math.round((template.metrics.conversions || 0) * variationFactor);
    const ctr = parseFloat((impressions > 0 ? (clicks / impressions) * 100 : 0).toFixed(2));
    const cpc = parseFloat((clicks > 0 ? cost / clicks : 0).toFixed(4));
    const conversionRate = parseFloat((clicks > 0 ? (conversions / clicks) * 100 : 0).toFixed(2));
    const cpa = parseFloat((conversions > 0 ? cost / conversions : 0).toFixed(2));
    
    // Create new ad
    additionalAds.push({
      customer_id: template.customer_id,
      customer_name: template.customer_name,
      campaign_id: `campaign-${i + 3}`,
      campaign_name: `Campaign for ${topic}`,
      campaign_status: 'ENABLED',
      ad_group_id: `adgroup-${i + 3}`,
      ad_group_name: `Ad Group for ${topic}`,
      ad_group_status: 'ENABLED',
      ad_id: `ad-${i + 3}`,
      ad_name: `Ad for ${topic}`,
      ad_status: 'ENABLED',
      final_urls: [finalUrl],
      metrics: {
        impressions,
        clicks,
        cost_micros: costMicros,
        cost,
        conversions,
        conversion_rate: conversionRate,
        ctr,
        cpc,
        cpa
      }
    });
  }
  
  return {
    campaigns: baseCampaigns,
    ads: [...baseAds, ...additionalAds]
  };
}