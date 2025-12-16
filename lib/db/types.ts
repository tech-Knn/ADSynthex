/**
 * MongoDB TypeScript Types and Interfaces
 * Defines all document schemas for collections
 */

export type FeedType = 'afs' | 'compado' | 'adscom' | 'inuvo';

// ==================== COST DOCUMENTS ====================

export interface CostDocument {
  _id?: any; // MongoDB ObjectId

  // Account & Campaign Info
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;

  // Date
  date: string; // YYYY-MM-DD

  // Cost Metrics
  cost_micros: number; // Cost in micros ($1.50 = 1500000)
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;

  // Feed-Specific Matching Keys
  style_id?: string; // AFS only
  domain?: string; // AFS only
  gclid?: string; // Compado only
  article?: string; // Ads.com only
  tkid?: string; // Inuvo only

  // Metadata
  feed_type: FeedType;
  created_at: Date;
  updated_at: Date;
}

// ==================== REVENUE DOCUMENTS ====================

export interface RevenueDocument {
  _id?: any; // MongoDB ObjectId

  // Revenue Metrics
  revenue_usd: number;
  revenue_eur: number;
  clicks: number;
  impressions: number;
  date: string; // YYYY-MM-DD

  // Feed-Specific Matching Keys
  style_id?: string; // AFS
  domain?: string; // AFS
  country_name?: string; // AFS
  gclid?: string; // Compado
  article?: string; // Ads.com
  tkid?: string; // Inuvo

  // AFS-specific fields
  // country_name already above

  // Compado-specific fields
  srcclkid?: string;
  conversion_type?: string;
  device?: string;
  country?: string;
  traffic_source?: string;
  keywords?: string[];

  // Ads.com-specific fields
  visits?: number;
  ctr?: number;
  rpm?: number;
  epc?: number;
  ivt_correction?: number;
  finalized?: boolean;

  // Inuvo-specific fields
  agid?: string;
  platform_type?: string;
  ad_requests?: number;
  page_views?: number;
  estimated_clicks?: number;

  // Metadata
  feed_type: FeedType;
  created_at: Date;
  updated_at: Date;
}

// ==================== SYNC STATUS ====================

export interface SyncStatusDocument {
  _id?: any;
  feed_type: FeedType;
  account_id: string;
  last_sync_date: string; // Last date successfully synced (YYYY-MM-DD)
  last_sync_time: Date; // Timestamp of last sync
  status: 'success' | 'failed' | 'in_progress' | 'skipped';
  error_message?: string;
  records_synced: number;
  duration_ms: number;
  updated_at: Date;
}

// ==================== SYNC HISTORY ====================

export interface SyncHistoryDocument {
  _id?: any;
  feed_type: FeedType;
  account_id?: string; // null for overall sync
  sync_date: string; // Date that was synced (YYYY-MM-DD)
  sync_time: Date; // Timestamp when sync ran
  status: 'success' | 'failed' | 'partial';
  records_cost: number;
  records_revenue: number;
  duration_ms: number;
  errors?: string[];
  created_at: Date;
}

// ==================== DATA SNAPSHOTS ====================

export interface DataSnapshotDocument {
  _id?: any;
  feed_type: FeedType;
  date: string; // YYYY-MM-DD
  snapshot_type: 'daily' | 'weekly' | 'monthly';

  // Aggregated metrics
  total_cost_micros: number;
  total_revenue_usd: number;
  total_revenue_eur: number;
  total_clicks: number;
  total_impressions: number;
  total_conversions: number;

  // Account breakdown
  accounts: Array<{
    account_id: string;
    cost_micros: number;
    revenue_usd: number;
    clicks: number;
    impressions: number;
  }>;

  created_at: Date;
}

// ==================== INPUT TYPES FOR CRUD OPERATIONS ====================

export interface SaveCostInput {
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  ad_group_id?: string;
  ad_group_name?: string;
  ad_id?: string;
  ad_name?: string;
  date: string;
  cost_micros: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number;
  cpc: number;

  // Feed-specific keys
  style_id?: string;
  domain?: string;
  gclid?: string;
  article?: string;
  tkid?: string;
}

export interface SaveRevenueInput {
  revenue_usd: number;
  revenue_eur: number;
  clicks: number;
  impressions: number;
  date: string;

  // Matching keys
  style_id?: string;
  domain?: string;
  country_name?: string;
  gclid?: string;
  article?: string;
  tkid?: string;

  // Feed-specific fields
  srcclkid?: string;
  conversion_type?: string;
  device?: string;
  country?: string;
  traffic_source?: string;
  keywords?: string[];
  agid?: string;
  platform_type?: string;
  ad_requests?: number;
  page_views?: number;
  estimated_clicks?: number;
  visits?: number;
  ctr?: number;
  rpm?: number;
  epc?: number;
  ivt_correction?: number;
  finalized?: boolean;
}

// ==================== QUERY RESULT TYPES ====================

export interface CostRevenueJoined {
  // From cost
  account_id: string;
  campaign_id: string;
  campaign_name: string;
  date: string;
  cost_micros: number;
  cost_clicks: number;
  cost_impressions: number;

  // From revenue
  revenue_usd: number;
  revenue_eur: number;
  revenue_clicks: number;
  revenue_impressions: number;

  // Calculated
  profit_usd: number;
  roi: number;

  // Matching key (depends on feed type)
  style_id?: string;
  gclid?: string;
  article?: string;
}

export interface AggregatedMetrics {
  feed_type: FeedType;
  date_range: {
    start: string;
    end: string;
  };
  totals: {
    cost_micros: number;
    cost_usd: number;
    revenue_usd: number;
    revenue_eur: number;
    profit_usd: number;
    roi: number;
    clicks: number;
    impressions: number;
    conversions: number;
  };
  by_account: Array<{
    account_id: string;
    cost_micros: number;
    revenue_usd: number;
    profit_usd: number;
    roi: number;
    clicks: number;
  }>;
  by_date: Array<{
    date: string;
    cost_micros: number;
    revenue_usd: number;
    profit_usd: number;
    clicks: number;
  }>;
}

// ==================== COLLECTION NAMES ====================

export const COLLECTION_NAMES = {
  afs: {
    cost: 'afs_cost',
    revenue: 'afs_revenue',
  },
  compado: {
    cost: 'compado_cost',
    revenue: 'compado_revenue',
  },
  adscom: {
    cost: 'adscom_cost',
    revenue: 'adscom_revenue',
  },
  inuvo: {
    cost: 'inuvo_cost',
    revenue: 'inuvo_revenue',
  },
  shared: {
    syncStatus: 'sync_status',
    syncHistory: 'sync_history',
    dataSnapshots: 'data_snapshots',
  },
} as const;

/**
 * Get collection names for a feed type
 */
export function getCollectionNames(feedType: FeedType): {
  cost: string;
  revenue: string;
} {
  return COLLECTION_NAMES[feedType];
}

/**
 * Get all collection names (for iteration)
 */
export function getAllCollectionNames(): string[] {
  const names: string[] = [];

  // Add feed-specific collections
  Object.values(COLLECTION_NAMES)
    .filter((item) => typeof item === 'object' && 'cost' in item)
    .forEach((feed: any) => {
      names.push(feed.cost, feed.revenue);
    });

  // Add shared collections
  names.push(...Object.values(COLLECTION_NAMES.shared));

  return names;
}
