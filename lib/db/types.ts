// lib/db/types.ts
// Database Schema Types - Microservices Pattern

export type FeedType = 'adscom' | 'afs' | 'compado' | 'inuvo';

// ==================== CLICK DATA (Google Ads Cost) ====================

export interface ClickDocument {
  _id?: string;
  account_id: string;
  gclid?: string; // Optional for AFS (uses style_id instead)
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string; // YYYY-MM-DD
  cost_micros: number; // Cost in micros ($1 = 1,000,000 micros)
  clicks: number; // Usually 1 per GCLID
  impressions?: number;

  // AFS-specific fields (for style_id + domain matching)
  style_id?: string; // For AFS revenue matching
  domain?: string; // For AFS revenue matching

  feed_type: FeedType;
  created_at: Date;
}

// ==================== REVENUE DATA (From Revenue APIs) ====================

export interface RevenueDocument {
  _id?: string;
  gclid?: string; // Optional for AFS (uses style_id instead)
  revenue_usd: number;
  revenue_eur?: number; // For Compado
  date: string; // YYYY-MM-DD

  // AFS-specific fields
  style_id?: string; // For AFS (from AdSense API)
  domain?: string; // For AFS and Ads.com

  article_id?: string; // For Ads.com
  conversion_type?: string; // For Compado
  feed_type: FeedType;
  created_at: Date;
}

// ==================== COST-REVENUE MAPPING (Joined Data) ====================

export interface CostRevenueMappingDocument {
  _id?: string;
  account_id: string;
  gclid?: string; // Optional for AFS
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string;

  // Cost metrics
  cost_usd: number;

  // Revenue metrics
  revenue_usd: number;
  revenue_eur?: number;

  // Calculated metrics
  profit_usd: number; // revenue_usd - cost_usd
  roi: number; // (profit_usd / cost_usd) * 100

  // AFS-specific fields (style_id + domain matching)
  style_id?: string; // For AFS
  domain?: string; // For AFS and Ads.com
  article_id?: string; // For Ads.com

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
  gclid?: string; // Optional for AFS
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

  // AFS-specific fields
  style_id?: string; // For AFS
  domain?: string; // For AFS
}

export interface SaveRevenueInput {
  gclid?: string; // Optional for AFS
  revenue_usd: number;
  revenue_eur?: number;
  date: string;

  // AFS-specific fields
  style_id?: string; // For AFS (from AdSense API)
  domain?: string; // For AFS and Ads.com

  article_id?: string; // For Ads.com
  conversion_type?: string; // For Compado
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
