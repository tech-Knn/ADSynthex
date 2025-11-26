/**
 * GoogleAds Mapper
 * Maps between API DTOs and Domain Entities
 */

import { Ad, AdMetrics } from '../../domain/entities/Ad';

export interface GoogleAdsApiAd {
  ad_id: string;
  customer_id: string;
  customer_name: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  ad_group_id: string;
  ad_group_name: string;
  ad_group_status: string;
  ad_name: string;
  ad_status: string;
  final_urls: string[];
  metrics: {
    impressions: number;
    clicks: number;
    cost_micros: number;
    cost: number;
    conversions: number;
    ctr?: number;
    cpc?: number;
    cpa?: number;
    conversion_rate?: number;
  };
}

export class GoogleAdsMapper {
  /**
   * Map API DTO to Domain Entity
   */
  static toDomain(dto: GoogleAdsApiAd): Ad {
    return new Ad(
      dto.ad_id?.toString() || '',
      dto.customer_id?.toString() || '',
      dto.customer_name || 'Unknown',
      dto.campaign_id?.toString() || '',
      dto.campaign_name || 'Unknown Campaign',
      dto.campaign_status || 'UNKNOWN',
      dto.ad_group_id?.toString() || '',
      dto.ad_group_name || 'Unknown Ad Group',
      dto.ad_group_status || 'UNKNOWN',
      dto.ad_name || 'Unknown Ad',
      dto.ad_status || 'UNKNOWN',
      dto.final_urls || [],
      this.mapMetrics(dto.metrics)
    );
  }

  /**
   * Map multiple DTOs to Domain Entities
   */
  static toDomainList(dtos: GoogleAdsApiAd[]): Ad[] {
    return dtos.map(dto => this.toDomain(dto));
  }

  /**
   * Map metrics from API format
   */
  private static mapMetrics(metrics: any): AdMetrics {
    const cost = metrics.cost || (metrics.cost_micros || 0) / 1000000;
    const impressions = Number(metrics.impressions || 0);
    const clicks = Number(metrics.clicks || 0);
    const conversions = Number(metrics.conversions || 0);

    return {
      impressions,
      clicks,
      cost,
      conversions,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? cost / clicks : 0,
      cpa: conversions > 0 ? cost / conversions : undefined,
      conversionRate: clicks > 0 ? (conversions / clicks) * 100 : undefined
    };
  }
}

