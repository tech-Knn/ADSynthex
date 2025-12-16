/**
 * Google Ads Client
 * Handles communication with Google Ads API
 */

import { GoogleAdsApi } from 'google-ads-api';
import { GoogleAdsConfig } from '../config/GoogleAdsConfig';
import { TARGET_ACCOUNTS } from '../../shared/constants/googleAds';

export class GoogleAdsClient {
  private api: GoogleAdsApi;
  private config: GoogleAdsConfig;

  constructor(config: GoogleAdsConfig) {
    this.config = config;
    this.api = new GoogleAdsApi({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      developer_token: config.developerToken
    });
  }

  /**
   * Query ads for a specific customer
   */
  async queryAds(customerId: string, query: string): Promise<any[]> {
    const customer = this.api.Customer({
      customer_id: customerId,
      refresh_token: this.config.refreshToken,
      login_customer_id: this.config.managerId
    });

    return await customer.query(query);
  }

  /**
   * Query all target accounts
   */
  async queryAllAccounts(query: string): Promise<any[]> {
    const results: any[] = [];

    for (const account of TARGET_ACCOUNTS) {
      try {
        const accountResults = await this.queryAds(account.id, query);
        results.push(...accountResults);
      } catch (error) {
        console.error(`Error querying account ${account.id}:`, error);
        // Continue with other accounts
      }
    }

    return results;
  }

  /**
   * Get all accessible accounts
   */
  async getAccounts(): Promise<any[]> {
    const mccCustomer = this.api.Customer({
      customer_id: this.config.managerId,
      refresh_token: this.config.refreshToken,
      login_customer_id: this.config.managerId
    });

    const query = `
      SELECT
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.status
      FROM customer_client
      WHERE customer_client.status = 'ENABLED'
    `;

    return await mccCustomer.query(query);
  }
}

