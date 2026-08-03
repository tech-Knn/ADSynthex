/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'androidadvice';

export interface AccountAccessConfig {
  accountId: string;
  accountName: string;
  allowedFeeds: FeedType[];
}

/**
 * EMERGENCY FIX 2026-02-07: Disabled feeds to prevent quota exhaustion
 * Set to empty array to disable a feed entirely
 */
// Only androidadvice is active; everything else is disabled to dedicate the
// Google Ads daily quota (15K/day Basic Access) to the 18 androidadvice accounts.
// Other feeds remain in the codebase but the routes refuse to call upstream APIs
// for them, so they show "feed disabled" rather than burning quota.

/**
 * Map of account IDs to their allowed feeds
 *
 * Feed Types:
 * - 'adscom': Ads.com dashboard and reports (DISABLED - NOT IN USE)
 * - 'compado': Compado cost-revenue mapping (DISABLED - NOT IN USE)
 * - 'inuvo': Inuvo cost vs revenue dashboard (DISABLED - NOT IN USE)
 * - 'adsense': AdSense for Search (AFS) revenue mapping (ACTIVE - TRT accounts only; IST accounts disabled)
 * - 'predicto': Predicto cost-revenue mapping (ACTIVE - 10 accounts)
 */
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // AFS - TRT Accounts (ACTIVE - search.topreserchtopics.com)

  // AndroidAdvice Accounts (androidadvices.com)
  'CID_8701280199': ['androidadvice'], // androidadvices 01
  'CID_3765399744': ['androidadvice'], // androidadvices 02
  'CID_3617356950': ['androidadvice'], // androidadvices 03
  'CID_4932880256': ['androidadvice'], // androidadvices 04
  'CID_3764963776': ['androidadvice'], // androidadvices 05
  'CID_4702286319': ['androidadvice'], // androidadvices 06
  'CID_8182947427': ['androidadvice'], // androidadvices 07
  'CID_7423206633': ['androidadvice'], // androidadvices 08
  'CID_7753453760': ['androidadvice'], // androidadvice 09
  'CID_9785664835': ['androidadvice'], // androidadvices 10
  'CID_5418244007': ['androidadvice'], // androidadvices 11
  'CID_1223790856': ['androidadvice'], // androidadvices 12
  'CID_7416756000': ['androidadvice'], // androidadvices 13
  'CID_2039691127': ['androidadvice'], // androidadvices 14
  'CID_5193468964': ['androidadvice'], // androidadvices 15
  'CID_4457984442': ['androidadvice'], // androidadvices 16
  'CID_9220539746': ['androidadvice'], // androidadvices 17
  'CID_8693469647': ['androidadvice'], // androidadvices 18
  'CID_9722524142': ['androidadvice'], // androidadvices 19
};

/**
 * Feed route paths mapping
 */
export const FEED_ROUTES: Record<FeedType, string[]> = {
  androidadvice: ['/androidadvice', '/api/adsense-cost-revenue'],
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