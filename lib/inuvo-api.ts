/**
 * Inuvo API Integration
 * Maps cost (Google Ads) vs revenue (Inuvo) using TKID
 */

export interface InuvoApiConfig {
  accessToken: string;
  baseUrl: string;
  accounts: InuvoAccount[];
}

export interface InuvoAccount {
  id: string;
  name: string;
  timezone: string;
}

export interface InuvoRealtimeData {
  TKID: string;
  CAMP_ID?: number;
  AGID: string;
  PLATFORM_TYPE_CODE: string;
  ESTIMATED_EARNINGS: number;
  AD_REQUESTS: number;
  MATCHED_AD_REQUESTS: number;
  PAGE_VIEWS: number;
  IMPRESSIONS: number;
  INDIVIDUAL_AD_IMPRESSIONS: number;
  CLICKS: number;
  FUNNEL_REQUESTS: number;
  FUNNEL_IMPRESSIONS: number;
  FUNNEL_CLICKS: number;
  DATE_UPLOADED: string;
  DATE_UPLOADED_PST: string;
  ESTIMATED_CLICKS: number;
  DATE?: string;
}

export interface InuvoResponse {
  data: InuvoRealtimeData[];
  total_earnings: number;
  total_clicks: number;
  total_impressions: number;
  account_summary: {
    [accountId: string]: {
      earnings: number;
      clicks: number;
      impressions: number;
    };
  };
  _source: 'inuvo_api';
  _timestamp: string;
}

export interface CostRevenueMapping {
  TKID: string;
  // Google Ads Metrics
  conversions: number;    // From Google Ads
  cpa: number;            // Cost Per Acquisition from Google Ads
  cost: number;           // From Google Ads
  // Inuvo Metrics  
  revenue: number;        // From Inuvo (ESTIMATED_EARNINGS)
  ctr: number;            // Click Through Rate from Inuvo
  epc: number;            // Earnings Per Click = revenue/clicks
  clicks: number;         // From Inuvo
  roi: number;            // (Revenue - Cost) / Cost * 100
  profit: number;         // Revenue - Cost
  campaign_name?: string;
  date: string;
}

// Inuvo API Configuration - All active accounts
const INUVO_CONFIG: InuvoApiConfig = {
  accessToken: process.env.INUVO_ACCESS_TOKEN || '',
  baseUrl: 'https://partners.inuvo.com/analytics',
  accounts: [
    {
      id: '9532228491',
      name: 'kaptinklunk - Inuvo - PST',
      timezone: 'PST'
    }
  ]
};

/**
 * Fetch realtime data from Inuvo API
 */
export async function fetchInuvoRealtimeData(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<InuvoResponse> {
  console.log(`[INUVO_API] Fetching realtime data: ${startDate} to ${endDate}`);

  if (!INUVO_CONFIG.accessToken) {
    throw new Error('Inuvo access token not configured');
  }

  try {
    const realtimeUrl = `${INUVO_CONFIG.baseUrl}/GetAdsenseLegacyByGeoRealtime`;
    const params = new URLSearchParams({
      accessToken: INUVO_CONFIG.accessToken,
      startDate: formatDateForInuvo(startDate),
      endDate: formatDateForInuvo(endDate)
    });

    console.log(`[INUVO_API] Calling ${realtimeUrl}?${params}`);
    const response = await fetch(`${realtimeUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AdSyntheX-Dashboard/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Inuvo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[INUVO_API] Returned ${data.length || 0} records`);

    const allData: InuvoRealtimeData[] = [];

    if (Array.isArray(data)) {
      const parsedData = data.map((item: any) => ({
        TKID: item.CAMP_ID?.toString() || item.TKID?.toString() || '',
        CAMP_ID: item.CAMP_ID,
        AGID: item.AGID || accountId || 'unknown',
        PLATFORM_TYPE_CODE: item.PLATFORM_TYPE_CODE || 'Unknown',
        ESTIMATED_EARNINGS: parseFloat(item.ESTIMATED_EARNINGS || 0),
        AD_REQUESTS: parseInt(item.AD_REQUESTS || 0),
        MATCHED_AD_REQUESTS: parseInt(item.MATCHED_AD_REQUESTS || 0),
        PAGE_VIEWS: parseInt(item.PAGE_VIEWS || 0),
        IMPRESSIONS: parseInt(item.IMPRESSIONS || 0),
        INDIVIDUAL_AD_IMPRESSIONS: parseInt(item.INDIVIDUAL_AD_IMPRESSIONS || 0),
        CLICKS: parseInt(item.CLICKS || 0),
        FUNNEL_REQUESTS: parseInt(item.FUNNEL_REQUESTS || 0),
        FUNNEL_IMPRESSIONS: parseInt(item.FUNNEL_IMPRESSIONS || 0),
        FUNNEL_CLICKS: parseInt(item.FUNNEL_CLICKS || 0),
        DATE_UPLOADED: item.DATE_UPLOADED || '',
        DATE_UPLOADED_PST: item.DATE_UPLOADED_PST || '',
        ESTIMATED_CLICKS: parseInt(item.ESTIMATED_CLICKS || 0),
        DATE: item.DATE || formatDateForInuvo(startDate)
      }));

      allData.push(...parsedData);
    }

    const apiResponse: InuvoResponse = {
      data: allData,
      total_earnings: allData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
      total_clicks: allData.reduce((sum, item) => sum + item.CLICKS, 0),
      total_impressions: allData.reduce((sum, item) => sum + item.IMPRESSIONS, 0),
      account_summary: {},
      _source: 'inuvo_api',
      _timestamp: new Date().toISOString()
    };

    console.log(`[INUVO_API] Total: $${apiResponse.total_earnings.toFixed(2)} revenue, ${apiResponse.total_clicks} clicks`);
    return apiResponse;

  } catch (error) {
    console.error('[INUVO_API] Error fetching data:', error);
    throw error;
  }
}

/**
 * Fetch daily data from Inuvo API
 */
export async function fetchInuvoDailyData(
  startDate: string,
  endDate: string,
  accountId?: string
): Promise<InuvoResponse> {
  console.log(`[INUVO_API] Fetching daily data: ${startDate} to ${endDate}`);

  if (!INUVO_CONFIG.accessToken) {
    throw new Error('Inuvo access token not configured');
  }

  try {
    const dailyUrl = `${INUVO_CONFIG.baseUrl}/GetAdsenseLegacyDaily`;
    const params = new URLSearchParams({
      accessToken: INUVO_CONFIG.accessToken,
      startDate: formatDateForInuvo(startDate),
      endDate: formatDateForInuvo(endDate)
    });

    console.log(`[INUVO_API] Calling ${dailyUrl}?${params}`);
    const response = await fetch(`${dailyUrl}?${params}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AdSyntheX-Dashboard/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Inuvo daily API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[INUVO_API] Returned ${data.length || 0} relative records`);

    const allData: InuvoRealtimeData[] = [];

    if (Array.isArray(data)) {
      const parsedData = data.map((item: any) => ({
        TKID: item.CAMP_ID?.toString() || item.TKID?.toString() || '',
        CAMP_ID: item.CAMP_ID,
        AGID: item.AGID || accountId || 'unknown',
        PLATFORM_TYPE_CODE: item.PLATFORM_TYPE_CODE || 'Unknown',
        ESTIMATED_EARNINGS: parseFloat(item.ESTIMATED_EARNINGS || 0),
        AD_REQUESTS: parseInt(item.AD_REQUESTS || 0),
        MATCHED_AD_REQUESTS: parseInt(item.MATCHED_AD_REQUESTS || 0),
        PAGE_VIEWS: parseInt(item.PAGE_VIEWS || 0),
        IMPRESSIONS: parseInt(item.IMPRESSIONS || 0),
        INDIVIDUAL_AD_IMPRESSIONS: parseInt(item.INDIVIDUAL_AD_IMPRESSIONS || 0),
        CLICKS: parseInt(item.CLICKS || 0),
        FUNNEL_REQUESTS: parseInt(item.FUNNEL_REQUESTS || 0),
        FUNNEL_IMPRESSIONS: parseInt(item.FUNNEL_IMPRESSIONS || 0),
        FUNNEL_CLICKS: parseInt(item.FUNNEL_CLICKS || 0),
        DATE_UPLOADED: item.DATE_UPLOADED || '',
        DATE_UPLOADED_PST: item.DATE_UPLOADED_PST || '',
        ESTIMATED_CLICKS: parseInt(item.ESTIMATED_CLICKS || 0),
        DATE: item.DATE || formatDateForInuvo(startDate)
      }));

      allData.push(...parsedData);
    }

    const apiResponse: InuvoResponse = {
      data: allData,
      total_earnings: allData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
      total_clicks: allData.reduce((sum, item) => sum + item.CLICKS, 0),
      total_impressions: allData.reduce((sum, item) => sum + item.IMPRESSIONS, 0),
      account_summary: {},
      _source: 'inuvo_api',
      _timestamp: new Date().toISOString()
    };

    console.log(`[INUVO_API] Total: $${apiResponse.total_earnings.toFixed(2)} revenue, ${apiResponse.total_clicks} clicks`);
    return apiResponse;

  } catch (error) {
    console.error('[INUVO_API] Error fetching daily data:', error);
    throw error;
  }
}

/**
 * Extract TKID from Google Ads URL
 */
function extractTKIDFromURL(url: string): string | null {
  try {
    // Common TKID patterns in URLs:
    // - ?tkid=value
    // - &tkid=value  
    // - /tkid/value
    // - tkid-value

    if (!url) return null;

    // Try URL parameter first
    const urlParams = new URLSearchParams(url.split('?')[1] || '');
    const tkidParam = urlParams.get('tkid') || urlParams.get('TKID') || urlParams.get('camp_id') || urlParams.get('CAMP_ID');
    if (tkidParam) return tkidParam;

    // Try path-based TKID
    const tkidPathMatch = url.match(/\/tkid\/([^\/\?]+)/i);
    if (tkidPathMatch) return tkidPathMatch[1];

    // Try dash-separated TKID
    const tkidDashMatch = url.match(/tkid[-_]([^\/\?&]+)/i);
    if (tkidDashMatch) return tkidDashMatch[1];

    return null;
  } catch (error) {
    console.error('Error extracting TKID from URL:', error);
    return null;
  }
}

/**
 * Map cost and revenue data using TKID from URLs and Inuvo data
 */
export function mapCostRevenue(
  googleAdsData: any[],
  inuvoData: InuvoRealtimeData[]
): CostRevenueMapping[] {
  console.log(`[COST_REVENUE_MAPPING] Mapping ${googleAdsData.length} ads with ${inuvoData.length} revenue records`);

  const mappings: CostRevenueMapping[] = [];
  const inuvoMap = new Map<string, InuvoRealtimeData[]>();
  const inuvoCampIdMap = new Map<string, InuvoRealtimeData[]>();

  // Group Inuvo data by TKID (case-insensitive) and CAMP_ID
  inuvoData.forEach(item => {
    if (item.TKID) {
      const tkid = item.TKID.toString().trim().toLowerCase(); // Normalize to lowercase
      if (!inuvoMap.has(tkid)) {
        inuvoMap.set(tkid, []);
      }
      inuvoMap.get(tkid)!.push(item);
    }
    
    if (item.CAMP_ID) {
      const campId = item.CAMP_ID.toString().trim();
      if (!inuvoCampIdMap.has(campId)) {
        inuvoCampIdMap.set(campId, []);
      }
      inuvoCampIdMap.get(campId)!.push(item);
    }
  });

  console.log(`[COST_REVENUE_MAPPING] Inuvo TKIDs available (${inuvoMap.size}): ${Array.from(inuvoMap.keys()).slice(0, 10).join(', ')}${inuvoMap.size > 10 ? '...' : ''}`);
  console.log(`[COST_REVENUE_MAPPING] Inuvo CAMP_IDs available (${inuvoCampIdMap.size}): ${Array.from(inuvoCampIdMap.keys()).slice(0, 10).join(', ')}${inuvoCampIdMap.size > 10 ? '...' : ''}`);

  // Map Google Ads data with Inuvo revenue using TKID extraction
  googleAdsData.forEach(ad => {
    let tkid: string | null = null;
    let cost = ad.metrics?.cost || ad.cost || 0;

    // Try multiple sources for TKID
    if (ad.TKID) {
      tkid = ad.TKID.toString().trim();
    } else if (ad.final_urls && Array.isArray(ad.final_urls)) {
      // Extract TKID from final URLs
      for (const url of ad.final_urls) {
        tkid = extractTKIDFromURL(url);
        if (tkid) break;
      }
    } else if (ad.ad_id) {
      tkid = ad.ad_id.toString().trim();
    } else if (ad.campaign_id) {
      tkid = ad.campaign_id.toString().trim();
    }

    if (tkid) {
      const normalizedTkid = tkid.toLowerCase(); // Normalize to lowercase for comparison

      let matchedRevenueRecords: InuvoRealtimeData[] | null = null;
      let matchedBy = '';

      if (inuvoMap.has(normalizedTkid)) {
        matchedRevenueRecords = inuvoMap.get(normalizedTkid)!;
        matchedBy = 'TKID';
      } else if (ad.campaign_id && inuvoCampIdMap.has(ad.campaign_id.toString().trim())) {
        matchedRevenueRecords = inuvoCampIdMap.get(ad.campaign_id.toString().trim())!;
        matchedBy = 'CAMP_ID';
        tkid = ad.campaign_id.toString().trim(); // Ensure tkid is updated to campaign_id for mappings
      }

      console.log(`[COST_REVENUE_MAPPING] Processing ad with Cost: $${cost}, TKID extract: ${normalizedTkid}, CampaignID: ${ad.campaign_id}`);

      if (matchedRevenueRecords) {
        const revenueRecords = matchedRevenueRecords;

        // Aggregate Inuvo metrics
        const totalRevenue = revenueRecords.reduce((sum, record) => sum + record.ESTIMATED_EARNINGS, 0);
        const totalInuvoClicks = revenueRecords.reduce((sum, record) => sum + record.CLICKS, 0);
        const totalImpressions = revenueRecords.reduce((sum, record) => sum + record.IMPRESSIONS, 0);

        // Calculate derived metrics
        const profit = totalRevenue - cost;
        const roi = cost > 0 ? ((totalRevenue - cost) / cost) * 100 : 0;
        const inuvoCtr = totalImpressions > 0 ? (totalInuvoClicks / totalImpressions) * 100 : 0;
        const epc = totalInuvoClicks > 0 ? totalRevenue / totalInuvoClicks : 0;

        // Extract Google Ads metrics
        const conversions = ad.metrics?.conversions || 0;
        const cpa = ad.metrics?.cpa || (conversions > 0 ? cost / conversions : 0);

        mappings.push({
          TKID: tkid || '',
          // Google Ads Metrics
          conversions: conversions,
          cpa: cpa,
          cost: cost,
          // Inuvo Metrics
          revenue: totalRevenue,
          ctr: inuvoCtr,
          epc: epc,
          clicks: totalInuvoClicks,
          roi: roi,
          profit: profit,
          campaign_name: ad.campaign_name || ad.name || `Campaign ${tkid}`,
          date: ad.date || revenueRecords[0]?.DATE || formatDateForDisplay(new Date())
        });

        console.log(`[COST_REVENUE_MAPPING] Mapped by ${matchedBy} ${tkid}: $${cost} cost → $${totalRevenue.toFixed(2)} revenue`);
      } else {
        // Ad has cost but no revenue (no matching TKID in inuvo)
        const conversions = ad.metrics?.conversions || 0;
        const cpa = ad.metrics?.cpa || (conversions > 0 ? cost / conversions : 0);

        mappings.push({
          TKID: tkid || '',
          // Google Ads Metrics
          conversions: conversions,
          cpa: cpa,
          cost: cost,
          // Inuvo Metrics (no data available)
          revenue: 0,
          ctr: 0,
          epc: 0,
          clicks: 0,
          roi: -100,
          profit: -cost,
          campaign_name: ad.campaign_name || ad.name || `Campaign ${tkid}`,
          date: ad.date || formatDateForDisplay(new Date())
        });

        console.log(`[COST_REVENUE_MAPPING] No revenue for TKID ${tkid}: $${cost} cost only`);
      }
    } else {
      console.log(`[COST_REVENUE_MAPPING] No TKID found for ad:`, {
        ad_id: ad.ad_id,
        campaign_id: ad.campaign_id,
        final_urls: ad.final_urls
      });
    }
  });

  console.log(`[COST_REVENUE_MAPPING] Created ${mappings.length} cost/revenue mappings`);
  return mappings;
}

/**
 * Get aggregated cost/revenue summary
 */
export function getCostRevenueSummary(mappings: CostRevenueMapping[]) {
  const totalCost = mappings.reduce((sum, item) => sum + item.cost, 0);
  const totalRevenue = mappings.reduce((sum, item) => sum + item.revenue, 0);
  const totalProfit = totalRevenue - totalCost;
  const overallROI = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;

  const profitableCampaigns = mappings.filter(item => item.profit > 0).length;
  const totalCampaigns = mappings.length;

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    overallROI: Math.round(overallROI * 100) / 100,
    profitableCampaigns,
    totalCampaigns,
    profitabilityRate: totalCampaigns > 0 ? Math.round((profitableCampaigns / totalCampaigns) * 100) : 0
  };
}

/**
 * Format date for Inuvo API (MM/dd/YYYY)
 */
function formatDateForInuvo(dateString: string): string {
  try {
    const date = new Date(dateString);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  } catch (error) {
    console.error('Error formatting date for Inuvo:', error);
    return dateString;
  }
}

/**
 * Format date for display (YYYY-MM-DD)
 */
function formatDateForDisplay(date: Date): string {
  try {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formatting date for display:', error);
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Get mock Inuvo data for testing (supports all configured accounts)
 */
export function getMockInuvoData(startDate: string, endDate: string): InuvoResponse {
  // Realistic TKIDs that might appear in Google Ads URLs
  const mockData: InuvoRealtimeData[] = [
    {
      TKID: 'article_123456',
      AGID: '9532228491',
      PLATFORM_TYPE_CODE: 'Desktop',
      ESTIMATED_EARNINGS: 185.75,
      AD_REQUESTS: 2800,
      MATCHED_AD_REQUESTS: 2200,
      PAGE_VIEWS: 1500,
      IMPRESSIONS: 2200,
      INDIVIDUAL_AD_IMPRESSIONS: 4400,
      CLICKS: 78,
      FUNNEL_REQUESTS: 1,
      FUNNEL_IMPRESSIONS: 1,
      FUNNEL_CLICKS: 1,
      DATE_UPLOADED: new Date().toISOString(),
      DATE_UPLOADED_PST: convertToGMT(new Date()).toISOString(),
      ESTIMATED_CLICKS: 72,
      DATE: startDate
    },
    {
      TKID: 'article_789012',
      AGID: '9532228491',
      PLATFORM_TYPE_CODE: 'HighEndMobile',
      ESTIMATED_EARNINGS: 142.30,
      AD_REQUESTS: 3500,
      MATCHED_AD_REQUESTS: 2800,
      PAGE_VIEWS: 1800,
      IMPRESSIONS: 2800,
      INDIVIDUAL_AD_IMPRESSIONS: 5600,
      CLICKS: 95,
      FUNNEL_REQUESTS: 1,
      FUNNEL_IMPRESSIONS: 1,
      FUNNEL_CLICKS: 1,
      DATE_UPLOADED: new Date().toISOString(),
      DATE_UPLOADED_PST: convertToGMT(new Date()).toISOString(),
      ESTIMATED_CLICKS: 88,
      DATE: startDate
    },
    {
      TKID: 'article_345678',
      AGID: '9532228491',
      PLATFORM_TYPE_CODE: 'Tablet',
      ESTIMATED_EARNINGS: 98.45,
      AD_REQUESTS: 1800,
      MATCHED_AD_REQUESTS: 1400,
      PAGE_VIEWS: 900,
      IMPRESSIONS: 1400,
      INDIVIDUAL_AD_IMPRESSIONS: 2800,
      CLICKS: 52,
      FUNNEL_REQUESTS: 1,
      FUNNEL_IMPRESSIONS: 1,
      FUNNEL_CLICKS: 1,
      DATE_UPLOADED: new Date().toISOString(),
      DATE_UPLOADED_PST: convertToGMT(new Date()).toISOString(),
      ESTIMATED_CLICKS: 48,
      DATE: startDate
    }
  ];

  const totalEarnings = mockData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0);
  const totalClicks = mockData.reduce((sum, item) => sum + item.CLICKS, 0);
  const totalImpressions = mockData.reduce((sum, item) => sum + item.IMPRESSIONS, 0);

  return {
    data: mockData,
    total_earnings: totalEarnings,
    total_clicks: totalClicks,
    total_impressions: totalImpressions,
    account_summary: {
      '9532228491': {
        earnings: totalEarnings,
        clicks: totalClicks,
        impressions: totalImpressions
      }
    },
    _source: 'inuvo_api',
    _timestamp: new Date().toISOString()
  };
}

/**
 * Convert PST time to GMT for Inuvo API
 */
function convertToGMT(date: Date): Date {
  // Account runs in PST (GMT-8), but API expects GMT
  const gmtDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return gmtDate;
}

