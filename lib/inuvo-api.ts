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
      id: '7195529443', 
      name: 'Inuvo - Account - 02 - GMT',
      timezone: 'GMT' // This account runs in PST but Inuvo API expects GMT
    },
    {
      id: '7616718892', 
      name: 'Inuvo - Account 2 - PST (GMT -8:00)',
      timezone: 'GMT'
    },
    {
      id: '9833281050', 
      name: 'Inuvo - Account 3 - PST (GMT -8:00)',
      timezone: 'GMT'
    },
    {
      id: '9790364217', 
      name: 'Inuvo - Account - 03 - GMT',
      timezone: 'GMT'
    },
    {
      id: '9835231086', 
      name: 'Inuvo - Account - 04 - GMT',
      timezone: 'GMT'
    },
    {
      id: '2420687578', 
      name: 'Inuvo - Account - 05 - GMT',
      timezone: 'GMT'
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
    const accounts = accountId 
      ? INUVO_CONFIG.accounts.filter(acc => acc.id === accountId)
      : INUVO_CONFIG.accounts;

    const allData: InuvoRealtimeData[] = [];
    const accountSummary: any = {};

    for (const account of accounts) {
      console.log(`[INUVO_API] Fetching data for account: ${account.name} (${account.id})`);
      
      // Fetch realtime data by channel
      const realtimeUrl = `${INUVO_CONFIG.baseUrl}/GetAdsenseOnlineRealtimeByChannel`;
      const params = new URLSearchParams({
        accessToken: INUVO_CONFIG.accessToken,
        startDate: formatDateForInuvo(startDate),
        endDate: formatDateForInuvo(endDate)
      });

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
      console.log(`[INUVO_API] Account ${account.id} returned ${data.length || 0} records`);

      // Process and filter data for this account
      if (Array.isArray(data)) {
        const accountData = data.map((item: any) => ({
          TKID: item.TKID || '',
          AGID: item.AGID || account.id,
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

        allData.push(...accountData);

        // Calculate account summary
        accountSummary[account.id] = {
          earnings: accountData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
          clicks: accountData.reduce((sum, item) => sum + item.CLICKS, 0),
          impressions: accountData.reduce((sum, item) => sum + item.IMPRESSIONS, 0)
        };
      }

      // Add delay between account requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const response: InuvoResponse = {
      data: allData,
      total_earnings: allData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
      total_clicks: allData.reduce((sum, item) => sum + item.CLICKS, 0),
      total_impressions: allData.reduce((sum, item) => sum + item.IMPRESSIONS, 0),
      account_summary: accountSummary,
      _source: 'inuvo_api',
      _timestamp: new Date().toISOString()
    };

    console.log(`[INUVO_API] Total: $${response.total_earnings.toFixed(2)} revenue, ${response.total_clicks} clicks`);
    return response;

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
    const accounts = accountId 
      ? INUVO_CONFIG.accounts.filter(acc => acc.id === accountId)
      : INUVO_CONFIG.accounts;

    const allData: InuvoRealtimeData[] = [];
    const accountSummary: any = {};

    for (const account of accounts) {
      // Fetch daily data by channel
      const dailyUrl = `${INUVO_CONFIG.baseUrl}/GetAdsenseOnlineDailyByChannel`;
      const params = new URLSearchParams({
        accessToken: INUVO_CONFIG.accessToken,
        startDate: formatDateForInuvo(startDate)
      });

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
      
      if (Array.isArray(data)) {
        const accountData = data.map((item: any) => ({
          TKID: item.TKID || '',
          AGID: item.AGID || account.id,
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

        allData.push(...accountData);

        accountSummary[account.id] = {
          earnings: accountData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
          clicks: accountData.reduce((sum, item) => sum + item.CLICKS, 0),
          impressions: accountData.reduce((sum, item) => sum + item.IMPRESSIONS, 0)
        };
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      data: allData,
      total_earnings: allData.reduce((sum, item) => sum + item.ESTIMATED_EARNINGS, 0),
      total_clicks: allData.reduce((sum, item) => sum + item.CLICKS, 0),
      total_impressions: allData.reduce((sum, item) => sum + item.IMPRESSIONS, 0),
      account_summary: accountSummary,
      _source: 'inuvo_api',
      _timestamp: new Date().toISOString()
    };

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
    const tkidParam = urlParams.get('tkid') || urlParams.get('TKID');
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
  
  // Group Inuvo data by TKID (case-insensitive)
  inuvoData.forEach(item => {
    if (item.TKID) {
      const tkid = item.TKID.toString().trim().toLowerCase(); // Normalize to lowercase
      if (!inuvoMap.has(tkid)) {
        inuvoMap.set(tkid, []);
      }
      inuvoMap.get(tkid)!.push(item);
    }
  });

  console.log(`[COST_REVENUE_MAPPING] Inuvo TKIDs available (${inuvoMap.size}): ${Array.from(inuvoMap.keys()).slice(0, 10).join(', ')}${inuvoMap.size > 10 ? '...' : ''}`);

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
      console.log(`[COST_REVENUE_MAPPING] Processing TKID: ${tkid} (normalized: ${normalizedTkid}), Cost: $${cost}`);
      
      if (inuvoMap.has(normalizedTkid)) {
        const revenueRecords = inuvoMap.get(normalizedTkid)!;
        
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
          TKID: tkid,
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
        
        console.log(`[COST_REVENUE_MAPPING] ✅ Mapped TKID ${tkid} (${normalizedTkid}): $${cost} cost → $${totalRevenue.toFixed(2)} revenue`);
      } else {
        // Ad has cost but no revenue (no matching TKID in inuvo)
        const conversions = ad.metrics?.conversions || 0;
        const cpa = ad.metrics?.cpa || (conversions > 0 ? cost / conversions : 0);
        
        mappings.push({
          TKID: tkid,
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
        
        console.log(`[COST_REVENUE_MAPPING] ⚠️ No revenue for TKID ${tkid}: $${cost} cost only`);
      }
    } else {
      console.log(`[COST_REVENUE_MAPPING] ❌ No TKID found for ad:`, {
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
      AGID: '7195529443',
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
      AGID: '7195529443',
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
      AGID: '7195529443',
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
      '7195529443': { 
        earnings: totalEarnings * 0.25, 
        clicks: Math.floor(totalClicks * 0.25), 
        impressions: Math.floor(totalImpressions * 0.25) 
      },
      '7616718892': { 
        earnings: totalEarnings * 0.15, 
        clicks: Math.floor(totalClicks * 0.15), 
        impressions: Math.floor(totalImpressions * 0.15) 
      },
      '9833281050': { 
        earnings: totalEarnings * 0.20, 
        clicks: Math.floor(totalClicks * 0.20), 
        impressions: Math.floor(totalImpressions * 0.20) 
      },
      '9790364217': { 
        earnings: totalEarnings * 0.15, 
        clicks: Math.floor(totalClicks * 0.15), 
        impressions: Math.floor(totalImpressions * 0.15) 
      },
      '9835231086': { 
        earnings: totalEarnings * 0.15, 
        clicks: Math.floor(totalClicks * 0.15), 
        impressions: Math.floor(totalImpressions * 0.15) 
      },
      '2420687578': { 
        earnings: totalEarnings * 0.10, 
        clicks: Math.floor(totalClicks * 0.10), 
        impressions: Math.floor(totalImpressions * 0.10) 
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

