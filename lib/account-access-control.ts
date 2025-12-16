/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'adscom' | 'compado' | 'inuvo' | 'adsense';

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
 * - 'adsense': AdSense for Search (AFS) revenue mapping
 */
export const ACCOUNT_FEED_ACCESS: Record<string, FeedType[]> = {
  // AdSense for Search (AFS) Accounts - Only access AdSense feed
  'CID_7072817229': ['adsense'],
  'CID_1353234754': ['adsense'],
  'CID_6610446272': ['adsense'],
  'CID_5700221831': ['adsense'],
  'CID_3961840839': ['adsense'],
  'CID_1769246493': ['adsense'],
  'CID_8077371478': ['adsense'],
  'CID_5932592680': ['adsense'],
  'CID_9657188741': ['adsense'],
  'CID_5898780123': ['adsense'],
  'CID_3851198549': ['adsense'],
  'CID_9841818774': ['adsense'],
  'CID_5351234641': ['adsense'],
  'CID_7918808672': ['adsense'], // AFS-IST-13
  'CID_5136436733': ['adsense'], // AFS-IST-14
  'CID_4985953086': ['adsense'], // AFS-IST-15
  'CID_7833025125': ['adsense'], // AFS-IST-16
  'CID_1622548445': ['adsense'], // AFS-IST-17
  'CID_9249163427': ['adsense'], // TRT-AFS 01

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
  'CID_9922466223': ['compado'],

  // Compado BoldmoveGuide Accounts
  'CID_1235076035': ['compado'],
  'CID_3471023162': ['compado'],
  'CID_8871395768': ['compado'],
  'CID_3475645746': ['compado'],
  'CID_8994182684': ['compado'],
  'CID_9524489917': ['compado'],
  'CID_9622143895': ['compado'], // Compado - BoldmoveGuide - UTC06
  'CID_7949737807': ['compado'], // Compado - BoldmoveGuide - UTC07
  'CID_8138817445': ['compado'], // Compado - BoldmoveGuide - UTC08
  'CID_4315436458': ['compado'], // Compado - BoldmoveGuide - UTC09

  // Ads.com Accounts - Only access Ads.com feed
  'CID_8677814915': ['adscom'], // IST
  'CID_9071440966': ['adscom'], // UTC02
  // 'CID_5723554317': ['adscom'], // UTC03 - DEPRECATED (no longer using ads.com)
  'CID_3146253756': ['adscom'], // UTC04
  // 'CID_5857090949': ['adscom'], // UTC05 - DEPRECATED (no longer using ads.com)
  'CID_6201189752': ['adscom'], // UTC06
  'CID_4071621621': ['adscom'], // UTC07
  // 'CID_7579121709': ['adscom'], // UTC08 - DEPRECATED (no longer using ads.com)
  'CID_1918795911': ['adscom'], // UTC09
  // 'CID_2849704713': ['adscom'], // UTC10 - DEPRECATED (no longer using ads.com)
  // 'CID_7605096292': ['adscom'], // UTC11 - DEPRECATED (no longer using ads.com)
  // 'CID_5719842337': ['adscom'], // UTC12 - DEPRECATED (no longer using ads.com)
  // 'CID_9341614254': ['adscom'], // UTC13 - DEPRECATED (no longer using ads.com)
  'CID_9790364217': ['adscom'], // UTC14 - Special: Previously had inuvo access too
  'CID_2420687578': ['adscom'], // UTC16
  // 'CID_6324595978': ['adscom'], // UTC17 - DEPRECATED (no longer using ads.com)
  'CID_5133038944': ['adscom'], // UTC18
  // 'CID_9084731648': ['adscom'], // UTC19 - DEPRECATED (no longer using ads.com)
  // 'CID_5109995931': ['adscom'], // UTC20 - DEPRECATED (no longer using ads.com)
  'CID_3218250684': ['adscom'], // UTC21
  // 'CID_7035336235': ['adscom'], // UTC22 - DEPRECATED (no longer using ads.com)
  // 'CID_5343981146': ['adscom'], // UTC23 - DEPRECATED (no longer using ads.com)
  'CID_1908857409': ['adscom'], // UTC24
  'CID_3848887282': ['adscom'], // UTC25
  'CID_4213092623': ['adscom'], // UTC26
  // 'CID_6626619603': ['adscom'], // UTC27 - DEPRECATED (no longer using ads.com)
  // 'CID_8914190629': ['adscom'], // UTC28 - DEPRECATED (no longer using ads.com)
  'CID_9876515601': ['adscom'], // UTC29
  'CID_8600545272': ['adscom'], // UTC30
  // 'CID_3118222043': ['adscom'], // UTC31 - DEPRECATED (no longer using ads.com)
  'CID_7824950746': ['adscom'], // UTC32
  'CID_5675630727': ['adscom'], // UTC34
  'CID_3304906147': ['adscom'], // UTC35
  'CID_8825176554': ['adscom'], // UTC36
  'CID_8321499303': ['adscom'], // UTC37
  'CID_7953604784': ['adscom'], // UTC38
  'CID_9436130288': ['adscom'], // UTC39
  'CID_7572891295': ['adscom'], // UTC40
  'CID_8807720960': ['adscom'], // Yahoo
  'CID_4277350349': ['adscom'], // Siddhi - Special: Previously had inuvo access too
};

/**
 * Feed route paths mapping
 */
export const FEED_ROUTES: Record<FeedType, string[]> = {
  adscom: ['/dashboard', '/api/adscom'],
  compado: ['/compado', '/api/compado', '/api/compado-cost-revenue'],
  inuvo: ['/inuvo-dashboard', '/api/inuvo'],
  adsense: ['/adsense', '/adsense-test', '/api/adsense', '/api/adsense-cost-revenue', '/api/adsense-test-revenue'],
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
