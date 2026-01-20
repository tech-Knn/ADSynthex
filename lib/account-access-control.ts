/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'adscom' | 'compado' | 'inuvo' | 'adsense' | 'predicto';

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
 * - 'predicto': Predicto cost-revenue mapping (campaign_id based)
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
  'CID_1086706941': ['adsense'], // AFS-IST-16
  'CID_7142427325': ['adsense'], // AFS-IST-17
  'CID_1173588441': ['adsense'], // AFS-IST-18
  'CID_1786688915': ['adsense'], // AFS-IST-19
  'CID_5822945286': ['adsense'], // AFS-IST-20
  'CID_7507601023': ['adsense'], // AFS-IST-21
  'CID_5767125301': ['adsense'], // AFS-IST-22
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

  // Predicto Accounts - Only access Predicto feed
  'CID_2382992113': ['predicto'], // Predicto - EST - 01
  'CID_1640518611': ['predicto'], // Predicto - EST - 02
  'CID_8091270364': ['predicto'], // Predicto - EST - 03
  'CID_8846129452': ['predicto'], // Predicto - EST - 04
  'CID_6474140466': ['predicto'], // Predicto - EST - 05
  'CID_4920639194': ['predicto'], // Predicto - EST - 06
  'CID_7282297343': ['predicto'], // Predicto - EST - 07
  'CID_1298005744': ['predicto'], // Predicto - EST - 08

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
  predicto: ['/predicto', '/api/predicto', '/api/predicto-cost-revenue'],
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

/**
 * Channel Access Control for Predicto
 *
 * ⚠️ IMPORTANT: THIS IS THE SOURCE OF TRUTH FOR CHANNEL OWNERSHIP
 * This configuration is used by app/api/predicto-cost-revenue/route.ts
 *
 * Maps account IDs to their allowed channel IDs (custom_channel_id from Predicto)
 * Channel IDs are extracted from Google Ads Final URLs (cid parameter)
 * Example: https://site.com/page?cid=ch88087 -> channel ID is "ch88087"
 *
 * Channel Ownership Rules:
 * - Ch88099, Ch88103, Ch88108, Ch88109, Ch88111 belong to Predicto 01
 * - Ch88100 belongs to Predicto 02
 * - Ch88101, Ch88102, Ch88105, Ch88106, Ch88107, Ch88112 belong to Predicto 03
 * - Ch88104 belongs to Predicto 04
 * - Ch88110 belongs to Predicto 07
 * - Predicto 05, 06, 08 have no channels assigned
 *
 * NOTE: Also update lib/predicto-channel-ownership.ts if you modify this!
 */
export const ACCOUNT_CHANNEL_ACCESS: Record<string, string[]> = {
  // Predicto - EST - 01: Main channels including orphans that belong here
  'CID_2382992113': [
    'ch88087', 'ch88092', 'ch88095', 'ch88096', 'ch88097', 'ch88098',
    'ch88099', 'ch88103', 'ch88108', 'ch88109', 'ch88111',
    'ch46405', 'ch46406', 'ch46407', 'ch46409', 'ch46410', 'ch46411',
    'ch46418', 'ch4642', 'ch46420', 'ch46421', 'ch46423', 'ch46428',
    'ch46433', 'ch4644', 'ch46441'
  ],

  // Predicto - EST - 02: Only ch88100
  'CID_1640518611': ['ch88100'],

  // Predicto - EST - 03: Includes orphans ch88105, ch88106, ch88107, ch88112
  'CID_8091270364': ['ch88101', 'ch88102', 'ch88105', 'ch88106', 'ch88107', 'ch88112'],

  // Predicto - EST - 04: Only ch88104
  'CID_8846129452': ['ch88104'],

  // Predicto - EST - 05: No channels assigned
  'CID_6474140466': [],

  // Predicto - EST - 06: No channels assigned
  'CID_4920639194': [],

  // Predicto - EST - 07: Only ch88110
  'CID_7282297343': ['ch88110'],

  // Predicto - EST - 08: No channels assigned
  'CID_1298005744': [],

  // Add more account-channel mappings as needed
};

/**
 * Check if an account has access to a specific channel
 */
export function hasAccessToChannel(accountId: string | null, channelId: string): boolean {
  if (!accountId) return false;

  // Normalize account ID
  const normalizedAccountId = accountId.startsWith('CID_') ? accountId : `CID_${accountId}`;

  const allowedChannels = ACCOUNT_CHANNEL_ACCESS[normalizedAccountId];
  if (!allowedChannels) {
    // If no specific channel access is defined, deny access
    return false;
  }

  return allowedChannels.includes(channelId);
}

/**
 * Get all channels an account has access to
 */
export function getAllowedChannels(accountId: string | null): string[] {
  if (!accountId) return [];

  // Normalize account ID
  const normalizedAccountId = accountId.startsWith('CID_') ? accountId : `CID_${accountId}`;

  return ACCOUNT_CHANNEL_ACCESS[normalizedAccountId] || [];
}

/**
 * Filter channel data based on account access
 * Returns only the channels that the account has access to
 */
export function filterChannelsByAccess<T extends { campaign_id?: string; channel_ids?: string[] }>(
  accountId: string | null,
  data: T[]
): T[] {
  if (!accountId) return [];

  const allowedChannels = getAllowedChannels(accountId);

  // If no channel restrictions, return all data
  if (allowedChannels.length === 0) {
    return data;
  }

  // Filter data to only include allowed channels
  return data.filter(item => {
    // Check if item has channel_ids array
    if (item.channel_ids && Array.isArray(item.channel_ids)) {
      return item.channel_ids.some(channelId => allowedChannels.includes(channelId));
    }

    // Check if item has campaign_id (which might be a channel_id)
    if (item.campaign_id) {
      return allowedChannels.includes(item.campaign_id);
    }

    return false;
  });
}

/**
 * Check if account should see all channels (admin override)
 * Admin accounts or accounts without specific channel restrictions see everything
 */
export function canAccessAllChannels(accountId: string | null, isAdmin: boolean): boolean {
  if (!accountId) return false;
  if (isAdmin) return true;

  // Normalize account ID
  const normalizedAccountId = accountId.startsWith('CID_') ? accountId : `CID_${accountId}`;

  // If no channel access defined, assume they can see all (backward compatibility)
  return !ACCOUNT_CHANNEL_ACCESS[normalizedAccountId];
}

/**
 * Get channel access summary for an account
 * Returns information about the account's channel access configuration
 */
export function getChannelAccessSummary(accountId: string | null): {
  hasChannelRestrictions: boolean;
  allowedChannels: string[];
  channelCount: number;
} {
  if (!accountId) {
    return {
      hasChannelRestrictions: false,
      allowedChannels: [],
      channelCount: 0,
    };
  }

  const normalizedAccountId = accountId.startsWith('CID_') ? accountId : `CID_${accountId}`;
  const allowedChannels = ACCOUNT_CHANNEL_ACCESS[normalizedAccountId] || [];

  return {
    hasChannelRestrictions: allowedChannels.length > 0,
    allowedChannels,
    channelCount: allowedChannels.length,
  };
}

/**
 * Validate and filter Predicto revenue data by channel access
 * Only returns revenue records for channels the account has access to
 */
export function filterPredictoRevenueByChannelAccess(
  accountId: string | null,
  revenueData: Array<{ custom_channel_id?: string; [key: string]: any }>
): Array<{ custom_channel_id?: string; [key: string]: any }> {
  if (!accountId) return [];

  const allowedChannels = getAllowedChannels(accountId);

  // If no channel restrictions, return all data
  if (allowedChannels.length === 0) {
    return revenueData;
  }

  // Filter to only allowed channels
  return revenueData.filter(record => {
    if (!record.custom_channel_id) return false;
    return allowedChannels.includes(record.custom_channel_id);
  });
}

/**
 * Get all accounts that have access to a specific channel
 * Useful for finding which accounts should see data for a given channel
 */
export function getAccountsWithChannelAccess(channelId: string): string[] {
  const accountsWithAccess: string[] = [];

  for (const [accountId, channels] of Object.entries(ACCOUNT_CHANNEL_ACCESS)) {
    if (channels.includes(channelId)) {
      accountsWithAccess.push(accountId);
    }
  }

  return accountsWithAccess;
}

/**
 * Validate if multiple channels are all accessible by an account
 * Returns true only if ALL channels are accessible
 */
export function hasAccessToAllChannels(accountId: string | null, channelIds: string[]): boolean {
  if (!accountId || channelIds.length === 0) return false;

  const allowedChannels = getAllowedChannels(accountId);

  // If no restrictions, has access to all
  if (allowedChannels.length === 0) return true;

  // Check if all requested channels are in allowed list
  return channelIds.every(channelId => allowedChannels.includes(channelId));
}

/**
 * Get channel access intersection between multiple accounts
 * Returns channels that ALL specified accounts have access to
 */
export function getSharedChannelAccess(accountIds: string[]): string[] {
  if (accountIds.length === 0) return [];

  const normalizedIds = accountIds.map(id => (id.startsWith('CID_') ? id : `CID_${id}`));

  // Get channels for first account
  const firstAccountChannels = getAllowedChannels(normalizedIds[0]);

  if (firstAccountChannels.length === 0) return [];

  // Find intersection with other accounts
  return firstAccountChannels.filter(channel =>
    normalizedIds.every(accountId => hasAccessToChannel(accountId, channel))
  );
}
