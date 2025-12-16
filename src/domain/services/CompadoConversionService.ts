/**
 * CompadoConversionService - Domain Service
 * Handles business logic for Compado conversions
 */

import {
  fetchCompadoConversions,
  fetchAllCompadoConversions,
  generateDailySummary,
  parseSrcClkId,
  groupByCampaign,
  validateDateFormat,
  type CompadoConversion,
  type CompadoDailySummary,
  type CompadoApiResponse
} from '../../../lib/compado-api';

export interface ConversionStats {
  total_conversions: number;
  total_revenue: number;
  average_revenue_per_conversion: number;
  unique_campaigns: number;
  date_range: {
    start_date: string;
    end_date: string;
  };
}

export interface CampaignConversionData {
  campaign_id: string;
  conversions: number;
  revenue: number;
  average_revenue: number;
  conversion_rate?: number;
}

export class CompadoConversionService {
  /**
   * Fetch conversions for a date range
   */
  async getConversions(
    startDate: string,
    endDate: string
  ): Promise<CompadoConversion[]> {
    this.validateDates(startDate, endDate);
    return await fetchAllCompadoConversions(startDate, endDate);
  }

  /**
   * Get conversion statistics for a date range
   */
  async getConversionStats(
    startDate: string,
    endDate: string
  ): Promise<ConversionStats> {
    const conversions = await this.getConversions(startDate, endDate);
    return this.calculateStats(conversions, startDate, endDate);
  }

  /**
   * Get daily breakdown of conversions
   */
  async getDailyBreakdown(
    startDate: string,
    endDate: string
  ): Promise<CompadoDailySummary[]> {
    const conversions = await this.getConversions(startDate, endDate);
    return generateDailySummary(conversions);
  }

  /**
   * Get campaign performance data
   */
  async getCampaignPerformance(
    startDate: string,
    endDate: string
  ): Promise<CampaignConversionData[]> {
    const conversions = await this.getConversions(startDate, endDate);
    const campaignMap = groupByCampaign(conversions);

    return Array.from(campaignMap.entries()).map(([campaignId, data]) => ({
      campaign_id: campaignId,
      conversions: data.conversions,
      revenue: parseFloat(data.revenue.toFixed(2)),
      average_revenue: parseFloat((data.revenue / data.conversions).toFixed(4))
    })).sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get top performing campaigns
   */
  async getTopCampaigns(
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<CampaignConversionData[]> {
    const campaigns = await this.getCampaignPerformance(startDate, endDate);
    return campaigns.slice(0, limit);
  }

  /**
   * Filter conversions by campaign ID
   */
  async getConversionsByCampaign(
    campaignId: string,
    startDate: string,
    endDate: string
  ): Promise<CompadoConversion[]> {
    const conversions = await this.getConversions(startDate, endDate);
    return conversions.filter(c => c.campaign_id === campaignId);
  }

  /**
   * Get conversions by country
   */
  async getConversionsByCountry(
    startDate: string,
    endDate: string
  ): Promise<Map<string, { conversions: number; revenue: number }>> {
    const conversions = await this.getConversions(startDate, endDate);
    const countryMap = new Map<string, { conversions: number; revenue: number }>();

    conversions.forEach(conversion => {
      const country = conversion.country || 'Unknown';

      if (!countryMap.has(country)) {
        countryMap.set(country, { conversions: 0, revenue: 0 });
      }

      const data = countryMap.get(country)!;
      data.conversions++;
      data.revenue += conversion.revenue;
    });

    return countryMap;
  }

  /**
   * Calculate overall statistics from conversions
   */
  private calculateStats(
    conversions: CompadoConversion[],
    startDate: string,
    endDate: string
  ): ConversionStats {
    const totalRevenue = conversions.reduce((sum, c) => sum + c.revenue, 0);
    const uniqueCampaigns = new Set(conversions.map(c => c.campaign_id)).size;

    return {
      total_conversions: conversions.length,
      total_revenue: parseFloat(totalRevenue.toFixed(2)),
      average_revenue_per_conversion: conversions.length > 0
        ? parseFloat((totalRevenue / conversions.length).toFixed(4))
        : 0,
      unique_campaigns: uniqueCampaigns,
      date_range: {
        start_date: startDate,
        end_date: endDate
      }
    };
  }

  /**
   * Validate date formats
   */
  private validateDates(startDate: string, endDate: string): void {
    if (!validateDateFormat(startDate)) {
      throw new Error(`Invalid start date format: ${startDate}. Expected YYYY-MM-DD`);
    }

    if (!validateDateFormat(endDate)) {
      throw new Error(`Invalid end date format: ${endDate}. Expected YYYY-MM-DD`);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new Error('Start date must be before or equal to end date');
    }
  }

  /**
   * Match conversions with Google Ads clicks
   * This method will be used to correlate Compado conversions with Google Ads data
   */
  matchWithGoogleAdsClicks(
    conversions: CompadoConversion[],
    googleAdsClicks: Array<{ gclid: string; campaign_id: string; cost: number }>
  ): Array<{
    gclid: string;
    campaign_id: string;
    cost: number;
    revenue: number;
    profit: number;
    roi: number;
  }> {
    const matched: Array<{
      gclid: string;
      campaign_id: string;
      cost: number;
      revenue: number;
      profit: number;
      roi: number;
    }> = [];

    const conversionMap = new Map<string, CompadoConversion>();
    conversions.forEach(c => conversionMap.set(c.gclid, c));

    googleAdsClicks.forEach(click => {
      const conversion = conversionMap.get(click.gclid);
      if (conversion) {
        const revenue = conversion.revenue;
        const cost = click.cost;
        const profit = revenue - cost;
        const roi = cost > 0 ? (profit / cost) * 100 : 0;

        matched.push({
          gclid: click.gclid,
          campaign_id: click.campaign_id,
          cost,
          revenue,
          profit,
          roi
        });
      }
    });

    return matched;
  }
}
