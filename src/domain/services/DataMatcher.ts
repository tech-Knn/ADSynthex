/**
 * DataMatcher - Domain Service
 * Pure business logic for matching Ads with Revenue data
 */

import { Ad } from '../entities/Ad';
import { Revenue } from '../entities/Revenue';
import { DashboardMetrics } from '../entities/DashboardMetrics';

export interface MatchingStats {
  totalAds: number;
  totalRevenues: number;
  matched: number;
  unmatched: number;
  matchRate: number;
}

export class DataMatcher {
  /**
   * Match ads with revenue data by slug
   * Returns only matched pairs (ads with revenue)
   */
  matchAdsWithRevenue(ads: Ad[], revenues: Revenue[]): DashboardMetrics[] {
    // Create a Map for O(1) lookup
    const revenueMap = new Map<string, Revenue>();
    for (const revenue of revenues) {
      revenueMap.set(revenue.slug, revenue);
    }

    const metrics: DashboardMetrics[] = [];

    for (const ad of ads) {
      const revenue = revenueMap.get(ad.slug);
      if (revenue) {
        metrics.push(new DashboardMetrics(ad, revenue));
      }
    }

    return metrics;
  }

  /**
   * Match ads with revenue and include unmatched ads
   * Useful for debugging and finding missing matches
   */
  matchWithUnmatched(ads: Ad[], revenues: Revenue[]): {
    matched: DashboardMetrics[];
    unmatchedAds: Ad[];
    unmatchedRevenues: Revenue[];
  } {
    const revenueMap = new Map<string, Revenue>();
    for (const revenue of revenues) {
      revenueMap.set(revenue.slug, revenue);
    }

    const matched: DashboardMetrics[] = [];
    const unmatchedAds: Ad[] = [];

    for (const ad of ads) {
      const revenue = revenueMap.get(ad.slug);
      if (revenue) {
        matched.push(new DashboardMetrics(ad, revenue));
        revenueMap.delete(ad.slug); // Remove matched revenue
      } else {
        unmatchedAds.push(ad);
      }
    }

    // Remaining revenues are unmatched
    const unmatchedRevenues = Array.from(revenueMap.values());

    return { matched, unmatchedAds, unmatchedRevenues };
  }

  /**
   * Get matching statistics
   */
  getMatchingStats(ads: Ad[], revenues: Revenue[]): MatchingStats {
    const matched = this.matchAdsWithRevenue(ads, revenues);

    return {
      totalAds: ads.length,
      totalRevenues: revenues.length,
      matched: matched.length,
      unmatched: ads.length - matched.length,
      matchRate: ads.length > 0 ? (matched.length / ads.length) * 100 : 0
    };
  }

  /**
   * Find best matches (top performers by profit)
   */
  findTopPerformers(metrics: DashboardMetrics[], limit: number = 10): DashboardMetrics[] {
    return [...metrics]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, limit);
  }

  /**
   * Find worst performers (biggest losers)
   */
  findWorstPerformers(metrics: DashboardMetrics[], limit: number = 10): DashboardMetrics[] {
    return [...metrics]
      .sort((a, b) => a.profit - b.profit)
      .slice(0, limit);
  }

  /**
   * Find ads that need attention (low ROI)
   */
  findAdsNeedingAttention(metrics: DashboardMetrics[], roiThreshold: number = 0): DashboardMetrics[] {
    return metrics.filter(m => m.roi < roiThreshold);
  }

  /**
   * Group metrics by campaign
   */
  groupByCampaign(metrics: DashboardMetrics[]): Map<string, DashboardMetrics[]> {
    const grouped = new Map<string, DashboardMetrics[]>();

    for (const metric of metrics) {
      const campaignId = metric.ad.campaignId;
      if (!grouped.has(campaignId)) {
        grouped.set(campaignId, []);
      }
      grouped.get(campaignId)!.push(metric);
    }

    return grouped;
  }

  /**
   * Group metrics by customer/account
   */
  groupByCustomer(metrics: DashboardMetrics[]): Map<string, DashboardMetrics[]> {
    const grouped = new Map<string, DashboardMetrics[]>();

    for (const metric of metrics) {
      const customerId = metric.ad.customerId;
      if (!grouped.has(customerId)) {
        grouped.set(customerId, []);
      }
      grouped.get(customerId)!.push(metric);
    }

    return grouped;
  }
}

