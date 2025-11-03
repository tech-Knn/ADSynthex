/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'adscom' | 'compado' | 'inuvo';

export interface AccountAccessConfig {
  accountId: string;
  accountName: string;
  allowedFeeds: FeedType[];
}

/**
 * Map of account IDs to their allowed feeds
 *
 * Feed Types:
 * - 'adscom': Ads.com dashboard and reports
 * - 'compado': Compado cost-revenue mapping
 * - 'inuvo': Inuvo cost vs revenue dashboard
 */
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // Compado Accounts - Only access Compado feed
  'CID_5416418019': ['compado'],
  'CID_5108802445': ['compado'],
  'CID_1671699399': ['compado'],
  'CID_9197380684': ['compado'],
  'CID_9669088480': ['compado'],
  'CID_6725067013': ['compado'],
  'CID_9299147464': ['compado'],
  'CID_2126478207': ['compado'],
  'CID_8711828676': ['compado'],
  'CID_5496110293': ['compado'],
  'CID_3963323643': ['compado'],
  'CID_1751028486': ['compado'],
  'CID_9248809715': ['compado'],

  // Ads.com Accounts - Only access Ads.com feed
  'CID_8677814915': ['adscom'],
  'CID_9071440966': ['adscom'],
  'CID_5723554317': ['adscom'],
  'CID_3146253756': ['adscom'],
  'CID_5857090949': ['adscom'],
  'CID_6201189752': ['adscom'],
  'CID_4071621621': ['adscom'],
  'CID_7579121709': ['adscom'],
  'CID_1918795911': ['adscom'],
  'CID_2849704713': ['adscom'],
  'CID_7605096292': ['adscom'],
  'CID_5719842337': ['adscom'],
  'CID_9341614254': ['adscom'],
  'CID_9790364217': ['adscom', 'inuvo'], // Special: Has both Ads.com and Inuvo access
  'CID_2420687578': ['adscom'],
  'CID_6324595978': ['adscom'],
  'CID_5133038944': ['adscom'],
  'CID_9084731648': ['adscom'],
  'CID_5109995931': ['adscom'],
  'CID_3218250684': ['adscom'],
  'CID_7035336235': ['adscom'],
  'CID_5343981146': ['adscom'],
  'CID_1908857409': ['adscom'],
  'CID_3848887282': ['adscom'],
  'CID_4213092623': ['adscom'],
  'CID_6626619603': ['adscom'],
  'CID_8914190629': ['adscom'],
  'CID_9876515601': ['adscom'],
  'CID_8600545272': ['adscom'],
  'CID_3118222043': ['adscom'],
  'CID_7824950746': ['adscom'],
  'CID_8807720960': ['adscom'],
  'CID_4277350349': ['adscom', 'inuvo'], // Special: Has both Ads.com and Inuvo access
};

/**
 * Feed route paths mapping
 */
export const FEED_ROUTES: Record<FeedType, string[]> = {
  adscom: ['/dashboard', '/api/adscom'],
  compado: ['/compado', '/api/compado', '/api/compado-cost-revenue'],
  inuvo: ['/inuvo-dashboard', '/api/inuvo'],
};

/**
 * Check if an account has access to a specific feed
 */
export function hasAccessToFeed(accountId: string | null, feed: FeedType): boolean {
  if (!accountId) return false;

  const allowedFeeds = ACCOUNT_FEED_ACCESS[accountId];
  if (!allowedFeeds) return false;

  return allowedFeeds.includes(feed);
}

/**
 * Get all feeds an account has access to
 */
export function getAllowedFeeds(accountId: string | null): FeedType[] {
  if (!accountId) return [];
  return ACCOUNT_FEED_ACCESS[accountId] || [];
}

/**
 * Check if a route path is allowed for an account
 */
export function hasAccessToRoute(accountId: string | null, pathname: string): boolean {
  if (!accountId) return false;

  const allowedFeeds = getAllowedFeeds(accountId);

  // Check if the pathname matches any route for the allowed feeds
  return allowedFeeds.some(feed => {
    const routes = FEED_ROUTES[feed];
    return routes.some(route => pathname.startsWith(route));
  });
}

/**
 * Get feed type from route path
 */
export function getFeedTypeFromRoute(pathname: string): FeedType | null {
  for (const [feed, routes] of Object.entries(FEED_ROUTES)) {
    if (routes.some(route => pathname.startsWith(route))) {
      return feed as FeedType;
    }
  }
  return null;
}
