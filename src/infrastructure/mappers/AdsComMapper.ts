/**
 * AdsCom Mapper
 * Maps between Ads.com API DTOs and Domain Entities
 */

import { Revenue, CountryRevenue } from '../../domain/entities/Revenue';

export interface AdsComApiRevenue {
  slug: string;
  article: string;
  visits: number;
  clicks: number;
  revenue: number;
  rpm: number;
  epc: number;
  country_data?: Array<{
    country: string;
    country_name?: string;
    visits: number;
    clicks: number;
    revenue: number;
    rpm: number;
    epc: number;
  }>;
}

export class AdsComMapper {
  /**
   * Map API DTO to Domain Entity
   */
  static toDomain(dto: AdsComApiRevenue): Revenue {
    return new Revenue(
      dto.slug || '',
      dto.article || '',
      Number(dto.visits || 0),
      Number(dto.clicks || 0),
      Number(dto.revenue || 0),
      Number(dto.rpm || 0),
      Number(dto.epc || 0),
      dto.country_data ? this.mapCountryData(dto.country_data) : undefined
    );
  }

  /**
   * Map multiple DTOs to Domain Entities
   */
  static toDomainList(dtos: AdsComApiRevenue[]): Revenue[] {
    return dtos.map(dto => this.toDomain(dto));
  }

  /**
   * Map country breakdown data
   */
  private static mapCountryData(countryData: any[]): CountryRevenue[] {
    return countryData.map(country => ({
      country: country.country || '',
      countryName: country.country_name || country.country || '',
      visits: Number(country.visits || 0),
      clicks: Number(country.clicks || 0),
      revenue: Number(country.revenue || 0),
      rpm: Number(country.rpm || 0),
      epc: Number(country.epc || 0),
      ctr: country.visits > 0 ? (country.clicks / country.visits) * 100 : 0
    }));
  }
}

