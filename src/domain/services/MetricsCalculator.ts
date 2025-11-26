/**
 * MetricsCalculator - Domain Service
 * Calculates aggregate metrics from DashboardMetrics
 */

import { DashboardMetrics } from '../entities/DashboardMetrics';

export interface AggregateMetrics {
  totalCost: number;
  totalRevenue: number;
  totalProfit: number;
  averageROI: number;
  averageRO AS: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  averageCPC: number;
  averageCPA: number;
  overallCTR: number;
  profitableCount: number;
  losingCount: number;
  breakEvenCount: number;
}

export class MetricsCalculator {
  /**
   * Calculate aggregate metrics from array of DashboardMetrics
   */
  calculateAggregate(metrics: DashboardMetrics[]): AggregateMetrics {
    if (metrics.length === 0) {
      return this.getZeroMetrics();
    }

    const totalCost = this.sumBy(metrics, m => m.ad.metrics.cost);
    const totalRevenue = this.sumBy(metrics, m => m.revenue.revenue);
    const totalProfit = totalRevenue - totalCost;
    const totalImpressions = this.sumBy(metrics, m => m.ad.metrics.impressions);
    const totalClicks = this.sumBy(metrics, m => m.ad.metrics.clicks);
    const totalConversions = this.sumBy(metrics, m => m.ad.metrics.conversions);

    return {
      totalCost,
      totalRevenue,
      totalProfit,
      averageROI: totalCost > 0 ? (totalProfit / totalCost) * 100 : 0,
      averageROAS: totalCost > 0 ? totalRevenue / totalCost : 0,
      totalImpressions,
      totalClicks,
      totalConversions,
      averageCPC: totalClicks > 0 ? totalCost / totalClicks : 0,
      averageCPA: totalConversions > 0 ? totalCost / totalConversions : 0,
      overallCTR: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      profitableCount: metrics.filter(m => m.isProfitable).length,
      losingCount: metrics.filter(m => m.isLosing).length,
      breakEvenCount: metrics.filter(m => m.isBreakEven).length
    };
  }

  /**
   * Calculate metrics for a specific campaign
   */
  calculateForCampaign(metrics: DashboardMetrics[], campaignId: string): AggregateMetrics {
    const campaignMetrics = metrics.filter(m => m.ad.campaignId === campaignId);
    return this.calculateAggregate(campaignMetrics);
  }

  /**
   * Calculate metrics for a specific customer
   */
  calculateForCustomer(metrics: DashboardMetrics[], customerId: string): AggregateMetrics {
    const customerMetrics = metrics.filter(m => m.ad.customerId === customerId);
    return this.calculateAggregate(customerMetrics);
  }

  /**
   * Compare two time periods
   */
  compareTimePeriods(
    current: DashboardMetrics[],
    previous: DashboardMetrics[]
  ): {
    current: AggregateMetrics;
    previous: AggregateMetrics;
    changes: {
      profitChange: number;
      profitChangePercent: number;
      roiChange: number;
      costChange: number;
      revenueChange: number;
    };
  } {
    const currentMetrics = this.calculateAggregate(current);
    const previousMetrics = this.calculateAggregate(previous);

    const profitChange = currentMetrics.totalProfit - previousMetrics.totalProfit;
    const profitChangePercent = previousMetrics.totalProfit !== 0
      ? (profitChange / Math.abs(previousMetrics.totalProfit)) * 100
      : 0;

    return {
      current: currentMetrics,
      previous: previousMetrics,
      changes: {
        profitChange,
        profitChangePercent,
        roiChange: currentMetrics.averageROI - previousMetrics.averageROI,
        costChange: currentMetrics.totalCost - previousMetrics.totalCost,
        revenueChange: currentMetrics.totalRevenue - previousMetrics.totalRevenue
      }
    };
  }

  /**
   * Helper: Sum values by selector function
   */
  private sumBy<T>(array: T[], selector: (item: T) => number): number {
    return array.reduce((sum, item) => sum + selector(item), 0);
  }

  /**
   * Get zero metrics (for empty data)
   */
  private getZeroMetrics(): AggregateMetrics {
    return {
      totalCost: 0,
      totalRevenue: 0,
      totalProfit: 0,
      averageROI: 0,
      averageROAS: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      averageCPC: 0,
      averageCPA: 0,
      overallCTR: 0,
      profitableCount: 0,
      losingCount: 0,
      breakEvenCount: 0
    };
  }
}

