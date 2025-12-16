/**
 * IAdRepository - Domain Repository Interface
 * Defines contract for accessing Ad data
 * Infrastructure layer will implement this
 */

import { Ad } from '../entities/Ad';
import { DateRange } from '../value-objects/DateRange';

export interface IAdRepository {
  /**
   * Find ads by date range
   * @param dateRange Date range to filter ads
   * @param customerId Optional customer ID to filter by specific account
   * @returns Promise<Ad[]> List of ads
   */
  findByDateRange(dateRange: DateRange, customerId?: string): Promise<Ad[]>;

  /**
   * Find ad by ID
   * @param id Ad ID
   * @returns Promise<Ad | null> Ad or null if not found
   */
  findById(id: string): Promise<Ad | null>;

  /**
   * Find ads by campaign ID
   * @param campaignId Campaign ID
   * @returns Promise<Ad[]> List of ads in campaign
   */
  findByCampaignId(campaignId: string): Promise<Ad[]>;

  /**
   * Find ads by customer ID
   * @param customerId Customer/Account ID
   * @param dateRange Date range to filter ads
   * @returns Promise<Ad[]> List of ads for customer
   */
  findByCustomerId(customerId: string, dateRange: DateRange): Promise<Ad[]>;
}

