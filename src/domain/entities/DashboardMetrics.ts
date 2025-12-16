/**
 * DashboardMetrics Entity - Domain Model
 * Combines Ad and Revenue data with calculated metrics
 */

import { Ad } from './Ad';
import { Revenue } from './Revenue';

export class DashboardMetrics {
  constructor(
    public readonly ad: Ad,
    public readonly revenue: Revenue
  ) {
    // Validate that ad and revenue match
    if (ad.slug !== revenue.slug) {
      console.warn(`Slug mismatch: Ad(${ad.slug}) vs Revenue(${revenue.slug})`);
    }
  }

  /**
   * Calculate profit (revenue - cost)
   */
  get profit(): number {
    return this.revenue.revenue - this.ad.metrics.cost;
  }

  /**
   * Calculate ROI (Return on Investment)
   * Formula: (Profit / Cost) * 100
   */
  get roi(): number {
    return this.ad.metrics.cost > 0 
      ? (this.profit / this.ad.metrics.cost) * 100 
      : 0;
  }

  /**
   * Check if this is a profitable ad
   */
  get isProfitable(): boolean {
    return this.profit > 0;
  }

  /**
   * Check if this is a losing ad (negative profit)
   */
  get isLosing(): boolean {
    return this.profit < 0;
  }

  /**
   * Check if this is break-even
   */
  get isBreakEven(): boolean {
    return Math.abs(this.profit) < 0.01; // Within 1 cent
  }

  /**
   * Get profitability status
   */
  get profitabilityStatus(): 'profitable' | 'break-even' | 'losing' {
    if (this.isProfitable) return 'profitable';
    if (this.isBreakEven) return 'break-even';
    return 'losing';
  }

  /**
   * Calculate profit margin percentage
   * Formula: (Profit / Revenue) * 100
   */
  get profitMargin(): number {
    return this.revenue.revenue > 0 
      ? (this.profit / this.revenue.revenue) * 100 
      : 0;
  }

  /**
   * Calculate ROAS (Return on Ad Spend)
   * Formula: Revenue / Cost
   */
  get roas(): number {
    return this.ad.metrics.cost > 0 
      ? this.revenue.revenue / this.ad.metrics.cost 
      : 0;
  }

  /**
   * Get performance rating (1-5 stars)
   */
  get performanceRating(): number {
    if (this.roi >= 200) return 5;
    if (this.roi >= 100) return 4;
    if (this.roi >= 50) return 3;
    if (this.roi >= 0) return 2;
    return 1;
  }

  /**
   * Check if this ad needs attention (low performance)
   */
  get needsAttention(): boolean {
    return this.performanceRating <= 2;
  }

  /**
   * Get combined slug (for matching verification)
   */
  get slug(): string {
    return this.ad.slug; // or this.revenue.slug (should be same)
  }

  /**
   * Create a summary string for logging/debugging
   */
  toString(): string {
    return `DashboardMetrics{slug=${this.slug}, cost=${this.ad.metrics.cost}, revenue=${this.revenue.revenue}, profit=${this.profit}, roi=${this.roi}%}`;
  }
}

