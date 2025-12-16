/**
 * Ad Entity - Domain Model
 * Pure business logic, no external dependencies
 */

export interface AdMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpa?: number;
  conversionRate?: number;
}

export class Ad {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly customerName: string,
    public readonly campaignId: string,
    public readonly campaignName: string,
    public readonly campaignStatus: string,
    public readonly adGroupId: string,
    public readonly adGroupName: string,
    public readonly adGroupStatus: string,
    public readonly adName: string,
    public readonly adStatus: string,
    public readonly finalUrls: string[],
    public readonly metrics: AdMetrics
  ) {}

  /**
   * Get primary URL from ad
   */
  get primaryUrl(): string {
    return this.finalUrls.length > 0 ? this.finalUrls[0] : '';
  }

  /**
   * Extract slug from URL for revenue matching

   */
  get slug(): string {
    return this.extractSlugFromUrl(this.primaryUrl);
  }

  /**
   * Check if ad is actively running
   */
  get isActive(): boolean {
    return this.adStatus === 'ENABLED' && 
           this.adGroupStatus === 'ENABLED' && 
           this.campaignStatus === 'ENABLED';
  }

  /**
   * Check if ad has meaningful data
   */
  get hasData(): boolean {
    return this.metrics.impressions > 0 || this.metrics.clicks > 0;
  }

  /**
   * Calculate cost per acquisition if conversions exist
   */
  get costPerAcquisition(): number {
    return this.metrics.conversions > 0 
      ? this.metrics.cost / this.metrics.conversions 
      : 0;
  }

  /**
   * Extract slug from URL
   * Examples:
   * - https://example.com/my-article → my-article
   * - https://example.com/path/to/article → path/to/article
   */
  private extractSlugFromUrl(url: string): string {
    if (!url) return '';

    try {
      // Decode URL-encoded characters
      const decoded = decodeURIComponent(url);
      
      // Remove protocol and domain, extract path
      const match = decoded.match(/\.com\/([^?#]+)/);
      if (!match) return '';

      // Get path, remove trailing slash, lowercase
      let slug = match[1]
        .replace(/\/$/, '')
        .toLowerCase()
        .trim();

      // Remove file extensions
      slug = slug.replace(/\.(html|htm|php|asp|aspx)$/i, '');

      return slug;
    } catch (error) {
      console.error('Error extracting slug from URL:', url, error);
      return '';
    }
  }

  /**
   * Create a summary string for logging/debugging
   */
  toString(): string {
    return `Ad{id=${this.id}, campaign=${this.campaignName}, slug=${this.slug}, cost=${this.metrics.cost}}`;
  }
}

