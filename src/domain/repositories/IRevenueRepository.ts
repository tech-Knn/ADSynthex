/**
 * IRevenueRepository - Domain Repository Interface
 * Defines contract for accessing Revenue data
 * Infrastructure layer will implement this
 */

import { Revenue } from '../entities/Revenue';
import { DateRange } from '../value-objects/DateRange';

export interface IRevenueRepository {
  /**
   * Find revenue data by date range
   * @param dateRange Date range to filter revenue
   * @returns Promise<Revenue[]> List of revenue records
   */
  findByDateRange(dateRange: DateRange): Promise<Revenue[]>;

  /**
   * Find revenue by slug
   * @param slug Article slug
   * @returns Promise<Revenue | null> Revenue or null if not found
   */
  findBySlug(slug: string): Promise<Revenue | null>;

  /**
   * Find revenue for multiple slugs
   * @param slugs Array of article slugs
   * @returns Promise<Revenue[]> List of revenue records
   */
  findBySlugs(slugs: string[]): Promise<Revenue[]>;
}

