/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'adscom' | 'compado' | 'inuvo' | 'adsense' | 'predicto' | 'carhp';

export interface AccountAccessConfig {
  accountId: string;
  accountName: string;
  allowedFeeds: FeedType[];
}

/**
 * EMERGENCY FIX 2026-02-07: Disabled feeds to prevent quota exhaustion
 * Set to empty array to disable a feed entirely
 */
export const DISABLED_FEEDS: FeedType[] = ['adscom', 'compado', 'inuvo'];

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
  // AFS - TRT Accounts (ACTIVE - search.topresearchtopics.com)
  'CID_9249163427': ['adsense'], // TRT-AFS 01
  'CID_1209239435': ['adsense'], // AFS-TRT-IST-01 (formerly AFS-IST-31)
  'CID_8804029676': ['adsense'], // AFS-TRT-IST-02 (formerly AFS-IST-32)
  'CID_7993255100': ['adsense'], // AFS-TRT-IST-03 (formerly AFS-IST-33)
  'CID_3516620995': ['adsense'], // AFS-TRT-IST-05 (formerly AFS-IST-28)
  'CID_1910623888': ['adsense'], // AFS-TRT-IST-04 (formerly AFS-IST-29)

  // AFS - IST Accounts (DISABLED - search.termuxtools.com domain issue)
  // 'CID_7072817229': ['adsense'], // AFS-IST-01
  // 'CID_1353234754': ['adsense'], // AFS-IST-02
  // 'CID_6610446272': ['adsense'], // AFS-IST-03
  // 'CID_5700221831': ['adsense'], // AFS-IST-04
  // 'CID_3961840839': ['adsense'], // AFS-IST-05
  // 'CID_1769246493': ['adsense'], // AFS-IST-06
  // 'CID_8077371478': ['adsense'], // AFS-IST-07
  // 'CID_5932592680': ['adsense'], // AFS-IST-08
  // 'CID_9657188741': ['adsense'], // AFS-08-GMT-7
  // 'CID_5898780123': ['adsense'], // AFS-IST-09
  // 'CID_3851198549': ['adsense'], // AFS-IST-10
  // 'CID_9841818774': ['adsense'], // AFS-IST-11
  // 'CID_5351234641': ['adsense'], // AFS-IST-12
  // 'CID_7918808672': ['adsense'], // AFS-IST-13
  // 'CID_5136436733': ['adsense'], // AFS-IST-14
  // 'CID_4985953086': ['adsense'], // AFS-IST-15
  // 'CID_1086706941': ['adsense'], // AFS-IST-16
  // 'CID_7142427325': ['adsense'], // AFS-IST-17
  // 'CID_1173588441': ['adsense'], // AFS-IST-18
  // 'CID_1786688915': ['adsense'], // AFS-IST-19
  // 'CID_5822945286': ['adsense'], // AFS-IST-20
  // 'CID_7507601023': ['adsense'], // AFS-IST-21
  // 'CID_5767125301': ['adsense'], // AFS-IST-22
  // 'CID_8238574545': ['adsense'], // AFS-IST-23
  // 'CID_5297662537': ['adsense'], // AFS-IST-24
  // 'CID_1749739427': ['adsense'], // AFS-IST-25
  // 'CID_3000221235': ['adsense'], // AFS-IST-26
  // 'CID_5039273517': ['adsense'], // AFS-IST-27
  // 'CID_3985887988': ['adsense'], // AFS-IST-30
  // 'CID_1209239435': ['adsense'], // AFS-IST-31
  // 'CID_8804029676': ['adsense'], // AFS-IST-32
  // 'CID_7993255100': ['adsense'], // AFS-IST-33

  // AFS - TRT Accounts (search.topresearchtopics.com)
  // TRT-IST-04 (CID_1910623888) and TRT-IST-05 (CID_3516620995) are listed above
  'CID_3723100505': ['adsense'], // AFS-TRT-IST-06
  'CID_7667229570': ['adsense'], // AFS-TRT-IST-07
  'CID_5312022044': ['adsense'], // AFS-TRT-IST-08
  'CID_6117738068': ['adsense'], // AFS-TRT-IST-09
  'CID_8862303731': ['adsense'], // AFS-TRT-IST-10
  'CID_8811269949': ['adsense'], // AFS-TRT-IST-11
  'CID_1013027376': ['adsense'], // AFS-TRT-IST-12
  'CID_4518158484': ['adsense'], // AFS-TRT-IST-13
  'CID_1056018921': ['adsense'], // AFS-TRT-IST-14
  'CID_8739175417': ['adsense'], // AFS-TRT-IST-15

  // CarHp Accounts (search.carhp.com - GEO-based campaigns) - dedicated /carhp page
  'CID_5771818790': ['carhp'], // CarHp-IST-01
  'CID_5928432468': ['carhp'], // CarHp-IST-02
  'CID_4116426800': ['carhp'], // CarHp-IST-03
  'CID_3638704299': ['carhp'], // CarHp-IST-04
  'CID_3944625172': ['carhp'], // CarHp-IST-05

  // EMERGENCY FIX 2026-02-07: Compado accounts DISABLED (not in use, wasting quota)
  // 'CID_5416418019': ['compado'],
  // 'CID_5108802445': ['compado'],
  // 'CID_1671699399': ['compado'],
  // 'CID_9197380684': ['compado'],
  // 'CID_9669088480': ['compado'],
  // 'CID_6725067013': ['compado'],
  // 'CID_9299147464': ['compado'],
  // 'CID_2126478207': ['compado'],
  // 'CID_8711828676': ['compado'],
  // 'CID_5496110293': ['compado'],
  // 'CID_3963323643': ['compado'],
  // 'CID_1751028486': ['compado'],
  // 'CID_9248809715': ['compado'],
  // 'CID_9922466223': ['compado'],

  // Compado BoldmoveGuide Accounts (DISABLED)
  // 'CID_1235076035': ['compado'],
  // 'CID_3471023162': ['compado'],
  // 'CID_8871395768': ['compado'],
  // 'CID_3475645746': ['compado'],
  // 'CID_8994182684': ['compado'],
  // 'CID_9524489917': ['compado'],
  // 'CID_9622143895': ['compado'], // Compado - BoldmoveGuide - UTC06
  // 'CID_7949737807': ['compado'], // Compado - BoldmoveGuide - UTC07
  // 'CID_8138817445': ['compado'], // Compado - BoldmoveGuide - UTC08
  // 'CID_4315436458': ['compado'], // Compado - BoldmoveGuide - UTC09

  // Predicto Accounts - Only access Predicto feed
  'CID_2382992113': ['predicto'], // Predicto - EST - 01
  'CID_1640518611': ['predicto'], // Predicto - EST - 02
  'CID_8091270364': ['predicto'], // Predicto - EST - 03
  'CID_8846129452': ['predicto'], // Predicto - EST - 04
  'CID_6474140466': ['predicto'], // Predicto - EST - 05
  'CID_4920639194': ['predicto'], // Predicto - EST - 06
  'CID_7282297343': ['predicto'], // Predicto - EST - 07
  'CID_1298005744': ['predicto'], // Predicto - EST - 08
  'CID_5777354952': ['predicto'], // Predicto - EST - 09
  'CID_1449565595': ['predicto'], // Predicto - EST - 10
  'CID_3485355192': ['predicto'], // Predicto - EST - 11
  'CID_8395624186': ['predicto'], // Predicto - EST - 12
  'CID_2866937044': ['predicto'], // Predicto - EST - 13
  'CID_8474169341': ['predicto'], // Predicto - EST - 14
  'CID_4690287335': ['predicto'], // Predicto - EST - 15
  'CID_9352426268': ['predicto'], // Predicto - EST - 16
  'CID_9084810037': ['predicto'], // Predicto - EST - 17
  'CID_4517107811': ['predicto'], // Predicto - EST - 18
  'CID_4272056005': ['predicto'], // Predicto - EST - 19
  'CID_2563438099': ['predicto'], // Predicto - EST - 20
  'CID_815308036': ['predicto'],  // Predicto - EST - 21 (IDR)
  'CID_5230757999': ['predicto'], // Predicto - EST - 22 (IDR)
  'CID_3146472862': ['predicto'], // Predicto - EST - 23 (IDR)
  'CID_8775212280': ['predicto'], // Predicto - EST - 24 (IDR)
  'CID_4714948356': ['predicto'], // Predicto - EST - 25 (IDR)

  // EMERGENCY FIX 2026-02-07: Ads.com accounts DISABLED (not in use, wasting quota)
  // These accounts were consuming click_view queries (1 per account per fetch!)
  // 'CID_8677814915': ['adscom'], // IST
  // 'CID_9071440966': ['adscom'], // UTC02
  // 'CID_3146253756': ['adscom'], // UTC04
  // 'CID_6201189752': ['adscom'], // UTC06
  // 'CID_4071621621': ['adscom'], // UTC07
  // 'CID_1918795911': ['adscom'], // UTC09
  // 'CID_9790364217': ['adscom'], // UTC14 - Special: Previously had inuvo access too
  // 'CID_2420687578': ['adscom'], // UTC16
  // 'CID_5133038944': ['adscom'], // UTC18
  // 'CID_3218250684': ['adscom'], // UTC21
  // 'CID_1908857409': ['adscom'], // UTC24
  // 'CID_3848887282': ['adscom'], // UTC25
  // 'CID_4213092623': ['adscom'], // UTC26
  // 'CID_9876515601': ['adscom'], // UTC29
  // 'CID_8600545272': ['adscom'], // UTC30
  // 'CID_7824950746': ['adscom'], // UTC32
  // 'CID_5675630727': ['adscom'], // UTC34
  // 'CID_3304906147': ['adscom'], // UTC35
  // 'CID_8825176554': ['adscom'], // UTC36
  // 'CID_8321499303': ['adscom'], // UTC37
  // 'CID_7953604784': ['adscom'], // UTC38
  // 'CID_9436130288': ['adscom'], // UTC39
  // 'CID_7572891295': ['adscom'], // UTC40
  // 'CID_8807720960': ['adscom'], // Yahoo
  // 'CID_4277350349': ['adscom'], // Siddhi - Special: Previously had inuvo access too
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
  carhp: ['/carhp', '/api/adsense-cost-revenue'],
};

/**
 * Check if a feed is disabled globally
 * EMERGENCY FIX 2026-02-07: Prevents API calls to unused feeds
 */
export function isFeedDisabled(feed: FeedType): boolean {
  return DISABLED_FEEDS.includes(feed);
}

/**
 * Check if an account has access to a specific feed
 */
export function hasAccessToFeed(accountId: string | null, feed: FeedType): boolean {
  if (!accountId) return false;

  // EMERGENCY FIX: Check if feed is globally disabled
  if (isFeedDisabled(feed)) {
    console.log(`[ACCESS_CONTROL] Feed ${feed} is globally disabled`);
    return false;
  }

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
 * IMPORTANT: THIS IS THE SOURCE OF TRUTH FOR CHANNEL OWNERSHIP
 * This configuration is used by app/api/predicto-cost-revenue/route.ts
 *
 * Maps account IDs to their allowed channel IDs (custom_channel_id from Predicto)
 * Channel IDs are extracted from Google Ads Final URLs (cid parameter)
 * Example: https://site.com/page?cid=ch88087 -> channel ID is "ch88087"
 *
 * Channel Ownership Rules:
 * - Ch88099, Ch88101, Ch88102, Ch88103, Ch88108, Ch88109, Ch88111 belong to Predicto 01
 * - Ch88100 belongs to Predicto 02
 * - Ch88105, Ch88106, Ch88107, Ch88112 belong to Predicto 03
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
    'ch88099', 'ch88101', 'ch88102', 'ch88103', 'ch88108', 'ch88109', 'ch88111',
    'ch46405', 'ch46406', 'ch46407', 'ch46409', 'ch46410', 'ch46411',
    'ch46418', 'ch4642', 'ch46420', 'ch46421', 'ch46423', 'ch46428',
    'ch46433', 'ch4644', 'ch46441'
  ],

  // Predicto - EST - 02: Only ch88100
  'CID_1640518611': ['ch88100'],

  // Predicto - EST - 03: Includes orphans ch88105, ch88106, ch88107, ch88112
  'CID_8091270364': ['ch88105', 'ch88106', 'ch88107', 'ch88112'],

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

  // Predicto - EST - 09: No channels assigned
  'CID_5777354952': [],

  // Predicto - EST - 10: No channels assigned
  'CID_1449565595': [],

  // Predicto - EST - 11: No channels assigned
  'CID_3485355192': [],

  // Predicto - EST - 12: No channels assigned
  'CID_8395624186': [],

  // Predicto - EST - 13: No channels assigned
  'CID_2866937044': [],

  // Predicto - EST - 14: No channels assigned
  'CID_8474169341': [],

  // Predicto - EST - 15: No channels assigned
  'CID_4690287335': [],

  // Predicto - EST - 16: No channels assigned
  'CID_9352426268': [],

  // Predicto - EST - 17: No channels assigned
  'CID_9084810037': [],

  // Predicto - EST - 18: No channels assigned
  'CID_4517107811': [],

  // Predicto - EST - 19: No channels assigned
  'CID_4272056005': [],

  // Predicto - EST - 20: No channels assigned
  'CID_2563438099': [],

  // Predicto - EST - 21: No channels assigned (IDR)
  'CID_815308036': [],

  // Predicto - EST - 22: No channels assigned (IDR)
  'CID_5230757999': [],

  // Predicto - EST - 23: No channels assigned (IDR)
  'CID_3146472862': [],

  // Predicto - EST - 24: No channels assigned (IDR)
  'CID_8775212280': [],

  // Predicto - EST - 25: No channels assigned (IDR)
  'CID_4714948356': [],
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
  revenueData: Array<{ custom_channel_id?: string;[key: string]: any }>
): Array<{ custom_channel_id?: string;[key: string]: any }> {
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
