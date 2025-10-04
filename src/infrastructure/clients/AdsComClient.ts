/**
 * Ads.com Client
 * Handles communication with Ads.com Revenue API
 */

export class AdsComClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.ADSCOM_API_KEY || '';
    this.apiSecret = process.env.ADSCOM_API_SECRET || '';
    this.baseUrl = process.env.ADSCOM_API_URL || 'https://api.ads.com';
  }

  /**
   * Fetch revenue data for date range
   */
  async fetchRevenue(startDate: string, endDate: string): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/revenue`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        },
        body: JSON.stringify({ startDate, endDate })
      });

      if (!response.ok) {
        throw new Error(`Ads.com API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Ads.com API error:', error);
      throw error;
    }
  }

  /**
   * Validate API credentials
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          'X-API-Secret': this.apiSecret
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Ads.com validation error:', error);
      return false;
    }
  }
}

