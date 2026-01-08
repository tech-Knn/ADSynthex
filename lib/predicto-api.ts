interface PredictoApiParams {
  start_date: string;
  end_date?: string;
  metrics?: string[];
  dimensions?: string[];
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
    if (params.end_date) {
      const daysDiff = Math.ceil(
        (new Date(params.end_date).getTime() - new Date(params.start_date).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff > this.maxDataRangeDays) {
        throw new Error(`Date range exceeds maximum of ${this.maxDataRangeDays} days`);
      }
    }

    const queryParams = new URLSearchParams({ start_date: params.start_date });

    if (params.end_date) queryParams.append('end_date', params.end_date);

    const metrics = params.metrics || ['impressions', 'clicks', 'revenue'];
    queryParams.append('metrics', metrics.join(','));

    // Use custom_channel_id instead of campaign_id for mapping with Google Ads
    const dimensions = params.dimensions || ['custom_channel_id', 'date'];
    queryParams.append('dimensions', dimensions.join(','));

    const response = await fetch(
      `${this.baseUrl}/api/search/reporting/?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.getAuthToken()}`,

          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Predicto API error: ${response.status} ${response.statusText}`);
    }

    const data: PredictoApiResponse = await response.json();

    if (data.status !== 'success') {
      throw new Error(`Predicto API returned status: ${data.status}`);
    }

    // Normalize revenue field name
    const normalizedData = data.data.map(record => ({
      ...record,
      revenue: record.revenue || record.estimated_revenue || 0,
    }));

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
      const { campaign_id } = record;

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
      existing.revenue += record.revenue;
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
