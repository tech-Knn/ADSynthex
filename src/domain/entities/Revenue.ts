/**
 * Revenue Entity - Domain Model
 * Represents revenue data from Ads.com
 */

export interface CountryRevenue {
  country: string;
  countryName: string;
  visits: number;
  clicks: number;
  revenue: number;
  rpm: number;
  epc: number;
  ctr: number;
}

export class Revenue {
  constructor(
    public readonly slug: string,
    public readonly article: string,
    public readonly visits: number,
    public readonly clicks: number,
    public readonly revenue: number,
    public readonly rpm: number,
    public readonly epc: number,
    public readonly countryBreakdown?: CountryRevenue[]
  ) {}

  /**
   * Calculate CTR (Click-Through Rate)
   */
  get ctr(): number {
    return this.visits > 0 ? (this.clicks / this.visits) * 100 : 0;
  }

  /**
   * Check if revenue data is significant
   */
  get hasSignificantRevenue(): boolean {
    return this.revenue > 0 && this.visits > 0;
  }

  /**
   * Get top performing country
   */
  get topCountry(): CountryRevenue | null {
    if (!this.countryBreakdown || this.countryBreakdown.length === 0) {
      return null;
    }

    return this.countryBreakdown.reduce((top, current) => 
      current.revenue > top.revenue ? current : top
    );
  }

  /**
   * Calculate total revenue from country breakdown (for validation)
   */
  get totalRevenueFromCountries(): number {
    if (!this.countryBreakdown) return 0;
    
    return this.countryBreakdown.reduce(
      (sum, country) => sum + country.revenue, 
      0
    );
  }

  /**
   * Get countries sorted by revenue (descending)
   */
  getCountriesByRevenue(): CountryRevenue[] {
    if (!this.countryBreakdown) return [];
    
    return [...this.countryBreakdown].sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get countries sorted by visits (descending)
   */
  getCountriesByVisits(): CountryRevenue[] {
    if (!this.countryBreakdown) return [];
    
    return [...this.countryBreakdown].sort((a, b) => b.visits - a.visits);
  }

  /**
   * Create a summary string for logging/debugging
   */
  toString(): string {
    return `Revenue{slug=${this.slug}, visits=${this.visits}, revenue=${this.revenue}}`;
  }
}

