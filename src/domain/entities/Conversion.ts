/**
 * Conversion Entity - Domain Model
 * Represents conversion data from Compado
 */

export interface ConversionDevice {
  type: string;
  conversions: number;
  revenue: number;
}

export interface ConversionCountry {
  code: string;
  name: string;
  conversions: number;
  revenue: number;
  average_revenue: number;
}

export class Conversion {
  constructor(
    public readonly srcclkid: string,
    public readonly gclid: string,
    public readonly campaignId: string,
    public readonly revenue: number,
    public readonly timestamp: string,
    public readonly conversionType?: string,
    public readonly device?: string,
    public readonly country?: string
  ) {}

  /**
   * Get the date of this conversion (YYYY-MM-DD)
   */
  get date(): string {
    return this.timestamp.split('T')[0];
  }

  /**
   * Get the hour of this conversion (0-23)
   */
  get hour(): number {
    const time = this.timestamp.split('T')[1];
    return parseInt(time.split(':')[0]);
  }

  /**
   * Check if conversion is from mobile device
   */
  get isMobile(): boolean {
    return this.device?.toLowerCase().includes('mobile') ?? false;
  }

  /**
   * Check if conversion is from desktop device
   */
  get isDesktop(): boolean {
    return this.device?.toLowerCase().includes('desktop') ?? false;
  }

  /**
   * Check if conversion is from tablet device
   */
  get isTablet(): boolean {
    return this.device?.toLowerCase().includes('tablet') ?? false;
  }

  /**
   * Check if conversion is high value (>$1.00)
   */
  get isHighValue(): boolean {
    return this.revenue >= 1.0;
  }

  /**
   * Check if conversion is medium value ($0.50 - $0.99)
   */
  get isMediumValue(): boolean {
    return this.revenue >= 0.5 && this.revenue < 1.0;
  }

  /**
   * Check if conversion is low value (<$0.50)
   */
  get isLowValue(): boolean {
    return this.revenue < 0.5;
  }

  /**
   * Get revenue category
   */
  get revenueCategory(): 'high' | 'medium' | 'low' {
    if (this.isHighValue) return 'high';
    if (this.isMediumValue) return 'medium';
    return 'low';
  }

  /**
   * Create a summary string for logging/debugging
   */
  toString(): string {
    return `Conversion{gclid=${this.gclid}, campaign=${this.campaignId}, revenue=$${this.revenue.toFixed(2)}, date=${this.date}}`;
  }

  /**
   * Create a conversion object from API data
   */
  static fromApiData(data: {
    srcclkid: string;
    revenue: number;
    timestamp: string;
    conversion_type?: string;
    device?: string;
    country?: string;
  }): Conversion {
    // Parse srcclkid to extract gclid and campaign_id
    const parts = data.srcclkid.split('_');
    const gclid = parts[0] || data.srcclkid;
    const campaignId = parts[1] || 'unknown';

    return new Conversion(
      data.srcclkid,
      gclid,
      campaignId,
      data.revenue,
      data.timestamp,
      data.conversion_type,
      data.device,
      data.country
    );
  }

  /**
   * Check if two conversions are from the same campaign
   */
  isSameCampaign(other: Conversion): boolean {
    return this.campaignId === other.campaignId;
  }

  /**
   * Check if two conversions are from the same day
   */
  isSameDay(other: Conversion): boolean {
    return this.date === other.date;
  }

  /**
   * Calculate time difference with another conversion (in hours)
   */
  hoursDifference(other: Conversion): number {
    const thisTime = new Date(this.timestamp).getTime();
    const otherTime = new Date(other.timestamp).getTime();
    return Math.abs(thisTime - otherTime) / (1000 * 60 * 60);
  }
}

/**
 * ConversionAggregate - Aggregated conversion data
 */
export class ConversionAggregate {
  constructor(
    public readonly campaignId: string,
    public readonly conversions: Conversion[],
    public readonly totalRevenue: number,
    public readonly totalConversions: number,
    public readonly averageRevenue: number
  ) {}

  /**
   * Get date range for these conversions
   */
  get dateRange(): { startDate: string; endDate: string } {
    if (this.conversions.length === 0) {
      return { startDate: '', endDate: '' };
    }

    const dates = this.conversions.map(c => c.date).sort();
    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1]
    };
  }

  /**
   * Get conversions grouped by date
   */
  get conversionsByDate(): Map<string, Conversion[]> {
    const map = new Map<string, Conversion[]>();
    this.conversions.forEach(conversion => {
      const date = conversion.date;
      if (!map.has(date)) {
        map.set(date, []);
      }
      map.get(date)!.push(conversion);
    });
    return map;
  }

  /**
   * Get conversions grouped by device
   */
  get conversionsByDevice(): Map<string, Conversion[]> {
    const map = new Map<string, Conversion[]>();
    this.conversions.forEach(conversion => {
      const device = conversion.device || 'unknown';
      if (!map.has(device)) {
        map.set(device, []);
      }
      map.get(device)!.push(conversion);
    });
    return map;
  }

  /**
   * Get daily revenue breakdown
   */
  getDailyRevenue(): Array<{ date: string; revenue: number; conversions: number }> {
    const dailyMap = new Map<string, { revenue: number; conversions: number }>();

    this.conversions.forEach(conversion => {
      const date = conversion.date;
      if (!dailyMap.has(date)) {
        dailyMap.set(date, { revenue: 0, conversions: 0 });
      }
      const data = dailyMap.get(date)!;
      data.revenue += conversion.revenue;
      data.conversions++;
    });

    return Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        revenue: parseFloat(data.revenue.toFixed(2)),
        conversions: data.conversions
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Get top performing hours
   */
  getTopHours(limit: number = 5): Array<{ hour: number; conversions: number; revenue: number }> {
    const hourMap = new Map<number, { conversions: number; revenue: number }>();

    this.conversions.forEach(conversion => {
      const hour = conversion.hour;
      if (!hourMap.has(hour)) {
        hourMap.set(hour, { conversions: 0, revenue: 0 });
      }
      const data = hourMap.get(hour)!;
      data.conversions++;
      data.revenue += conversion.revenue;
    });

    return Array.from(hourMap.entries())
      .map(([hour, data]) => ({
        hour,
        conversions: data.conversions,
        revenue: parseFloat(data.revenue.toFixed(2))
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  /**
   * Create aggregate from conversions
   */
  static fromConversions(campaignId: string, conversions: Conversion[]): ConversionAggregate {
    const totalRevenue = conversions.reduce((sum, c) => sum + c.revenue, 0);
    const totalConversions = conversions.length;
    const averageRevenue = totalConversions > 0 ? totalRevenue / totalConversions : 0;

    return new ConversionAggregate(
      campaignId,
      conversions,
      parseFloat(totalRevenue.toFixed(2)),
      totalConversions,
      parseFloat(averageRevenue.toFixed(4))
    );
  }
}
