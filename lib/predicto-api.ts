interface PredictoApiParams {
  start_date: string;
  end_date?: string;
  metrics?: string[];
  dimensions?: string[];
  filters?: {
    custom_channel_id?: string[];
    campaign_id?: string[];
  };
}

interface PredictoRevenueData {
  date: string;
  campaign_id?: string;
  custom_channel_id?: string;
  impressions?: number;
  clicks?: number;
  revenue?: number;
  estimated_revenue?: number;
}

interface PredictoApiResponse {
  status: string;
  data: PredictoRevenueData[];
}

export class PredictoApiClient {
  private baseUrl: string;
  private maxDataRangeDays = 90;

  constructor() {
    this.baseUrl = process.env.PREDICTO_API_URL || 'https://dashboard-server.predicto.ai';
  }

  private getAuthToken(): string {
    const authToken = process.env.PREDICTO_AUTH_TOKEN;
    if (!authToken) {
      throw new Error('PREDICTO_AUTH_TOKEN environment variable is not set');
    }
    return authToken;
  }

  async fetchRevenueData(params: PredictoApiParams): Promise<PredictoRevenueData[]> {
    console.log('[PREDICTO_API] ===== Fetching Revenue Data =====');
    console.log('[PREDICTO_API] Start date:', params.start_date);
    console.log('[PREDICTO_API] End date:', params.end_date);
    console.log('[PREDICTO_API] Metrics:', params.metrics);
    console.log('[PREDICTO_API] Dimensions:', params.dimensions);

    // API-LEVEL FILTERING: Log if filters are provided
    if (params.filters) {
      console.log('[PREDICTO_API] 🎯 API-LEVEL FILTERING ENABLED:');
      if (params.filters.custom_channel_id) {
        console.log(`[PREDICTO_API]    - Filtering by ${params.filters.custom_channel_id.length} channel IDs: ${params.filters.custom_channel_id.slice(0, 10).join(', ')}${params.filters.custom_channel_id.length > 10 ? '...' : ''}`);
      }
      if (params.filters.campaign_id) {
        console.log(`[PREDICTO_API]    - Filtering by ${params.filters.campaign_id.length} campaign IDs`);
      }
    }

    if (params.end_date) {
      const daysDiff = Math.ceil(
        (new Date(params.end_date).getTime() - new Date(params.start_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff > this.maxDataRangeDays) {
        console.error(`[PREDICTO_API] ❌ Date range too large: ${daysDiff} days (max: ${this.maxDataRangeDays})`);
        throw new Error(`Date range exceeds maximum of ${this.maxDataRangeDays} days`);
      }
      console.log(`[PREDICTO_API] Date range: ${daysDiff} days`);
    }

    const queryParams = new URLSearchParams({ start_date: params.start_date });

    if (params.end_date) queryParams.append('end_date', params.end_date);

    const metrics = params.metrics || ['impressions', 'clicks', 'revenue'];
    queryParams.append('metrics', metrics.join(','));

    // Use custom_channel_id instead of campaign_id for mapping with Google Ads
    const dimensions = params.dimensions || ['custom_channel_id', 'date'];
    queryParams.append('dimensions', dimensions.join(','));

    // API-LEVEL FILTERING: Add filter query parameters
    // NOTE: This assumes Predicto API supports filter[custom_channel_id]=ch1,ch2,ch3 format
    // Adjust based on actual Predicto API documentation
    if (params.filters?.custom_channel_id && params.filters.custom_channel_id.length > 0) {
      queryParams.append('filter[custom_channel_id]', params.filters.custom_channel_id.join(','));
    }
    if (params.filters?.campaign_id && params.filters.campaign_id.length > 0) {
      queryParams.append('filter[campaign_id]', params.filters.campaign_id.join(','));
    }

    const apiUrl = `${this.baseUrl}/api/search/reporting/?${queryParams.toString()}`;
    console.log('[PREDICTO_API] Request URL:', apiUrl);

    const authToken = this.getAuthToken();
    const maskedToken = authToken.length > 10
      ? `${authToken.substring(0, 6)}...${authToken.substring(authToken.length - 4)}`
      : '***';
    console.log('[PREDICTO_API] Auth token (masked):', maskedToken);

    let response;
    try {
      const fetchStartTime = Date.now();
      response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });
      const fetchTime = Date.now() - fetchStartTime;
      console.log(`[PREDICTO_API] HTTP Response: ${response.status} ${response.statusText} (${fetchTime}ms)`);
    } catch (fetchError) {
      console.error('[PREDICTO_API] 🚨 FETCH ERROR:', fetchError);
      throw new Error(`Failed to connect to Predicto API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
        console.error('[PREDICTO_API] Error response body:', errorBody);
      } catch {
        console.error('[PREDICTO_API] Could not read error response body');
      }
      throw new Error(`Predicto API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
    }

    let data: PredictoApiResponse;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('[PREDICTO_API] 🚨 JSON PARSE ERROR:', jsonError);
      throw new Error(`Invalid JSON response from Predicto API: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
    }

    console.log('[PREDICTO_API] Response status:', data.status);

    if (data.status !== 'success') {
      console.error('[PREDICTO_API] 🚨 API returned non-success status:', data.status);
      console.error('[PREDICTO_API] Full response:', JSON.stringify(data, null, 2));
      throw new Error(`Predicto API returned status: ${data.status}`);
    }

    if (!data.data || !Array.isArray(data.data)) {
      console.error('[PREDICTO_API] 🚨 Invalid data format - expected array, got:', typeof data.data);
      throw new Error('Predicto API returned invalid data format');
    }

    console.log(`[PREDICTO_API] ✓ Received ${data.data.length} records`);

    // Calculate totals for logging
    const totalRevenue = data.data.reduce((sum, r) => sum + (r.revenue || r.estimated_revenue || 0), 0);
    const totalClicks = data.data.reduce((sum, r) => sum + (r.clicks || 0), 0);
    const totalImpressions = data.data.reduce((sum, r) => sum + (r.impressions || 0), 0);

    console.log(`[PREDICTO_API] Total revenue: $${totalRevenue.toFixed(2)}`);
    console.log(`[PREDICTO_API] Total clicks: ${totalClicks}`);
    console.log(`[PREDICTO_API] Total impressions: ${totalImpressions}`);

    // Show sample records
    if (data.data.length > 0) {
      console.log('[PREDICTO_API] Sample records (first 3):');
      data.data.slice(0, 3).forEach((record, i) => {
        console.log(`[PREDICTO_API]   ${i + 1}. Channel: ${record.custom_channel_id || record.campaign_id || 'N/A'}, Revenue: $${(record.revenue || record.estimated_revenue || 0).toFixed(2)}, Date: ${record.date}`);
      });
    }

    // Normalize revenue field name
    let normalizedData = data.data.map(record => ({
      ...record,
      revenue: record.revenue || record.estimated_revenue || 0,
    }));

    // CLIENT-SIDE FILTERING FALLBACK: If Predicto API doesn't support server-side filtering,
    // filter the results here (less efficient but ensures correct data)
    if (params.filters) {
      const beforeFilterCount = normalizedData.length;

      if (params.filters.custom_channel_id && params.filters.custom_channel_id.length > 0) {
        const allowedChannels = new Set(params.filters.custom_channel_id.map(ch => ch.toLowerCase()));
        normalizedData = normalizedData.filter(record =>
          record.custom_channel_id && allowedChannels.has(record.custom_channel_id.toLowerCase())
        );
        console.log(`[PREDICTO_API] 🔍 Client-side filter: ${beforeFilterCount} → ${normalizedData.length} records (filtered by ${params.filters.custom_channel_id.length} channels)`);
      }

      if (params.filters.campaign_id && params.filters.campaign_id.length > 0) {
        const allowedCampaigns = new Set(params.filters.campaign_id);
        normalizedData = normalizedData.filter(record =>
          record.campaign_id && allowedCampaigns.has(record.campaign_id)
        );
        console.log(`[PREDICTO_API] 🔍 Client-side filter: ${beforeFilterCount} → ${normalizedData.length} records (filtered by ${params.filters.campaign_id.length} campaigns)`);
      }

      // Log efficiency metrics
      const reductionPercent = beforeFilterCount > 0
        ? ((beforeFilterCount - normalizedData.length) / beforeFilterCount * 100).toFixed(1)
        : '0';
      console.log(`[PREDICTO_API] 📊 Filtering efficiency: ${reductionPercent}% of data filtered out`);

      if (normalizedData.length > 0) {
        const filteredRevenue = normalizedData.reduce((sum, r) => sum + (r.revenue || 0), 0);
        console.log(`[PREDICTO_API] 💰 Filtered revenue total: $${filteredRevenue.toFixed(2)}`);
      }
    }

    console.log('[PREDICTO_API] ✓ Revenue data fetch complete');
    return normalizedData;
  }

  async fetchRevenueByCampaign(
    startDate: string,
    endDate?: string
  ): Promise<Map<string, PredictoRevenueData>> {
    const data = await this.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['campaign_id', 'date'],
    });

    const campaignMap = new Map<string, PredictoRevenueData>();

    data.forEach((record) => {
      const campaign_id = record.campaign_id || 'unknown';

      if (!campaignMap.has(campaign_id)) {
        campaignMap.set(campaign_id, {
          date: record.date,
          campaign_id,
          impressions: 0,
          clicks: 0,
          revenue: 0,
        });
      }

      const existing = campaignMap.get(campaign_id)!;
      existing.impressions = (existing.impressions || 0) + (record.impressions || 0);
      existing.clicks = (existing.clicks || 0) + (record.clicks || 0);
      existing.revenue = (existing.revenue || 0) + (record.revenue || 0);
    });

    return campaignMap;
  }

  async fetchDailyRevenue(startDate: string, endDate?: string): Promise<PredictoRevenueData[]> {
    return this.fetchRevenueData({
      start_date: startDate,
      end_date: endDate,
      metrics: ['impressions', 'clicks', 'revenue'],
      dimensions: ['date', 'campaign_id'],
    });
  }
}

export const predictoApiClient = new PredictoApiClient();

export const formatDateForPredicto = (date: Date): string =>
  date.toISOString().split('T')[0];

export const getLastNDays = (days: number) => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return {
    startDate: formatDateForPredicto(startDate),
    endDate: formatDateForPredicto(endDate),
  };
};
