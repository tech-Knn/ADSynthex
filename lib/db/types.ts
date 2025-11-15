// lib/db/types.ts
// Database Schema Types - Microservices Pattern

export type FeedType = 'adscom' | 'afs' | 'compado' | 'inuvo';

// ==================== CLICK DATA (Google Ads Cost) ====================

export interface ClickDocument {
  _id?: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string; // YYYY-MM-DD

  // Cost metrics
  cost_micros: number; // Cost in micros ($1 = 1,000,000 micros)
  clicks: number; // Google Ads clicks
  impressions?: number;
  conversions?: number; // Google Ads conversions
  ctr?: number; // Click-through rate
  cpc?: number; // Cost per click

  // MATCHING KEYS BY FEED:
  gclid?: string; // Compado, Inuvo (from click_view query)
  style_id?: string; // AFS (from final_urls ?style_id=xxx)
  domain?: string; // AFS (termuxtools.com)
  article?: string; // Ads.com (article slug from URL)
  tkid?: string; // Inuvo (from final_urls ?tkid=xxx)

  feed_type: FeedType;
  created_at: Date;
}

// ==================== REVENUE DATA (From Revenue APIs) ====================

export interface RevenueDocument {
  _id?: string;
  date: string; // YYYY-MM-DD

  // Revenue metrics
  revenue_usd: number;
  revenue_eur?: number; // Original currency (Compado)
  clicks: number; // Revenue clicks (AdSense/Compado/Ads.com clicks)
  impressions?: number;

  // MATCHING KEYS BY FEED:
  gclid?: string; // Compado
  style_id?: string; // AFS (from AdSense API)
  domain?: string; // AFS (termuxtools.com)
  article?: string; // Ads.com (article slug)
  tkid?: string; // Inuvo (TKID from API)

  // Feed-specific additional data
  // AFS
  country_name?: string;

  // Compado
  srcclkid?: string; // Source click ID
  conversion_type?: string;
  device?: string;
  country?: string;
  traffic_source?: string;
  keywords?: string[];

  // Inuvo
  agid?: string;
  platform_type?: string;
  ad_requests?: number;
  page_views?: number;
  estimated_clicks?: number;

  // Ads.com
  visits?: number;
  ctr?: number;
  rpm?: number;
  epc?: number;
  ivt_correction?: number;
  finalized?: boolean;

  feed_type: FeedType;
  created_at: Date;
}

// ==================== COST-REVENUE MAPPING (Joined Data) ====================

export interface CostRevenueMappingDocument {
  _id?: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string;

  // MATCHING KEYS BY FEED:
  gclid?: string; // Compado
  style_id?: string; // AFS
  domain?: string; // AFS (termuxtools.com)
  article?: string; // Ads.com
  tkid?: string; // Inuvo

  // Cost metrics (from Google Ads)
  cost_usd: number;
  cost_clicks: number; // Google Ads clicks
  impressions: number;
  cost_conversions?: number; // Google Ads conversions
  cpc?: number;
  ctr?: number;

  // Revenue metrics (from revenue APIs)
  revenue_usd: number;
  revenue_eur?: number;
  revenue_clicks: number; // AdSense/Compado/Ads.com clicks
  revenue_impressions?: number;

  // Dashboard calculated metrics (CRITICAL!)
  profit_usd: number; // revenue_usd - cost_usd
  roi: number; // (profit_usd / cost_usd) * 100
  roas?: number; // revenue_usd / cost_usd
  cpa?: number; // cost_usd / revenue_clicks
  conversion_rate?: number; // (revenue_clicks / cost_clicks) * 100
  rpc?: number; // revenue_usd / revenue_clicks

  // Feed-specific extra data
  country_name?: string; // AFS
  traffic_source?: string; // Compado
  device?: string; // Compado
  keywords?: string[]; // Compado
  conversion_type?: string; // Compado
  visits?: number; // Ads.com
  rpm?: number; // Ads.com
  epc?: number; // Ads.com
  ivt_correction?: number; // Ads.com
  finalized?: boolean; // Ads.com
  page_views?: number; // Inuvo
  ad_requests?: number; // Inuvo

  feed_type: FeedType;
  created_at: Date;
  updated_at: Date;
}

// ==================== CAMPAIGN AGGREGATION ====================

export interface CampaignDocument {
  _id?: string;
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  date: string;

  // Aggregated metrics
  clicks: number;
  cost_usd: number;
  revenue_usd: number;
  revenue_eur?: number;
  profit_usd: number;
  roi: number;

  // Ad groups count (for reference)
  ad_groups?: number;
  ads?: number;

  feed_type: FeedType;
  created_at: Date;
  updated_at: Date;
}

// ==================== DAILY METRICS (Account Summary) ====================

export interface DailyMetricsDocument {
  _id?: string;
  account_id: string;
  date: string;

  // Summary metrics
  clicks: number;
  cost_usd: number;
  revenue_usd: number;
  revenue_eur?: number;
  profit_usd: number;
  roi: number;

  // Counts
  campaigns: number;
  matched_conversions: number; // Clicks with revenue
  unmatched_clicks: number; // Clicks without revenue

  feed_type: FeedType;
  created_at: Date;
  updated_at: Date;
}

// ==================== SYNC STATUS ====================

export interface SyncStatusDocument {
  _id?: string;
  feed_type: FeedType;
  account_id: string;
  last_sync_time: Date;
  last_sync_date: string; // YYYY-MM-DD
  status: 'success' | 'failed' | 'in_progress';
  error_message?: string;

  // Sync metrics
  clicks_synced?: number;
  revenue_records_synced?: number;
  mappings_created?: number;

  created_at: Date;
  updated_at: Date;
}

// ==================== COLLECTION NAMES ====================

export function getCollectionNames(feedType: FeedType) {
  return {
    clicks: `${feedType}_clicks`,
    revenue: `${feedType}_revenue`,
    costRevenueMapping: `${feedType}_cost_revenue_mapping`,
    campaigns: `${feedType}_campaigns`,
    dailyMetrics: `${feedType}_daily_metrics`,
  };
}

// Shared collections
export const SHARED_COLLECTIONS = {
  syncStatus: 'sync_status',
};

// ==================== INPUT TYPES FOR OPERATIONS ====================

export interface SaveClicksInput {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string;
  cost_micros: number;
  clicks?: number;
  impressions?: number;
  conversions?: number;
  ctr?: number;
  cpc?: number;

  // Matching keys by feed
  gclid?: string; // Compado, Inuvo
  style_id?: string; // AFS
  domain?: string; // AFS
  article?: string; // Ads.com
  tkid?: string; // Inuvo
}

export interface SaveRevenueInput {
  revenue_usd: number;
  revenue_eur?: number;
  clicks: number;
  impressions?: number;
  date: string;

  // Matching keys by feed
  gclid?: string; // Compado
  style_id?: string; // AFS
  domain?: string; // AFS
  article?: string; // Ads.com
  tkid?: string; // Inuvo

  // Feed-specific fields
  country_name?: string; // AFS
  srcclkid?: string; // Compado
  conversion_type?: string; // Compado
  device?: string; // Compado
  country?: string; // Compado
  traffic_source?: string; // Compado
  keywords?: string[]; // Compado
  agid?: string; // Inuvo
  platform_type?: string; // Inuvo
  ad_requests?: number; // Inuvo
  page_views?: number; // Inuvo
  estimated_clicks?: number; // Inuvo
  visits?: number; // Ads.com
  ctr?: number; // Ads.com
  rpm?: number; // Ads.com
  epc?: number; // Ads.com
  ivt_correction?: number; // Ads.com
  finalized?: boolean; // Ads.com
}

// ==================== QUERY FILTERS ====================

export interface DashboardQueryFilter {
  feedType: FeedType;
  accountId?: string | 'all';
  startDate: string;
  endDate: string;
  campaignId?: string;
  domain?: string;
}

export interface CampaignQueryFilter {
  feedType: FeedType;
  accountId?: string | 'all';
  startDate: string;
  endDate: string;
  sortBy?: 'cost' | 'revenue' | 'profit' | 'roi';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}
