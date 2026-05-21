/**
 * Account Access Control Configuration
 *
 * This file defines which feeds each account type can access.
 * Admin users have access to all feeds.
 * Regular users only have access to specific feeds based on their account type.
 */

export type FeedType = 'adscom' | 'compado' | 'inuvo' | 'adsense' | 'predicto' | 'carhp' | 'thefactrelay' | 'androidadvice';

export interface AccountAccessConfig {
  accountId: string;
  accountName: string;
  allowedFeeds: FeedType[];
}

/**
 * EMERGENCY FIX 2026-02-07: Disabled feeds to prevent quota exhaustion
 * Set to empty array to disable a feed entirely
 */
export const DISABLED_FEEDS: FeedType[] = ['adscom', 'compado'];

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
  'CID_9249163427': ['adsense'], // TRT-AFS 01
  'CID_7072817229': ['adsense'], // AFS-IST-01
  'CID_8077371478': ['adsense'], // AFS-IST-07
  'CID_3851198549': ['adsense'], // AFS-IST-10
  'CID_9841818774': ['adsense'], // AFS-IST-11
  'CID_5351234641': ['adsense'], // AFS-IST-12
  'CID_7918808672': ['adsense'], // AFS-IST-13
  'CID_5136436733': ['adsense'], // AFS-IST-14
  'CID_7142427325': ['adsense'], // AFS-IST-17
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

  // AFS - TRT Accounts (search.topreserchtopics.com)
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

  // Inuvo Accounts
  'CID_9532228491': ['inuvo'], // kaptinklunk - Inuvo - PST
  'CID_9375852176': ['inuvo'], // kaptinklunk - Inuvo - PST 2
  'CID_6641065048': ['inuvo'], // kaptinklunk - Inuvo - PST 3
  'CID_7053668495': ['inuvo'], // kaptinklunk - Inuvo - PST 4
  'CID_6463288476': ['inuvo'], // kaptinklunk - Inuvo - PST 5

  // CarHp Accounts (search.carhp.com - GEO-based campaigns) - dedicated /carhp page
  'CID_5079394847': ['carhp'], // CarHp New 02
  'CID_8536037999': ['carhp'], // CarHp New 01
  'CID_1161525078': ['carhp'], // CAR-HP-01
  'CID_9345796923': ['carhp'], // CAR-HP-02
  'CID_1558940550': ['carhp'], // CarHp New 03 (IST)
  'CID_1791919543': ['carhp'], // CarHp New 04 (IST)
  'CID_7839557944': ['carhp'], // CarHp New 05 (IST)
  'CID_2324382023': ['carhp'], // CarHp New 06 (IST)
  'CID_8613393445': ['carhp'], // CarHp New 07 (IST)
  'CID_8817588152': ['carhp'], // CarHp New 08 (IST)
  'CID_5106471180': ['carhp'], // CarHp New 09 (IST)
  'CID_1594975507': ['carhp'], // CarHp New 10 (IST)
  'CID_3888711550': ['carhp'], // CarHp New 11
  'CID_3229140299': ['carhp'], // CarHp New 12
  'CID_5415515697': ['carhp'], // CarHp New 13
  'CID_7933010158': ['carhp'], // CarHp New 14
  'CID_6180138197': ['carhp'], // CarHp New 15
  'CID_2636181354': ['carhp'], // CarHp New 16
  'CID_9085210041': ['carhp'], // CarHp New 17
  'CID_6616851341': ['carhp'], // CarHp New 18
  'CID_5827892184': ['carhp'], // CarHp New 19
  'CID_1757864848': ['carhp'], // CarHp New 20
  'CID_1792814156': ['carhp'], // CarHp New 21
  'CID_7087102807': ['carhp'], // CarHp New 22
  'CID_7903347315': ['carhp'], // CarHp New 23
  'CID_1131535915': ['carhp'], // CarHp New 24
  'CID_6738120407': ['carhp'], // CarHp New 25
  'CID_7454337227': ['carhp'], // CarHp New 26
  'CID_2502787460': ['carhp'], // CarHp New 27

  // TheFactRelay Accounts
  'CID_2144311178': ['thefactrelay'], // TheFactRelay 01
  'CID_7371749207': ['thefactrelay'], // TheFactRelay 02
  'CID_2334822533': ['thefactrelay'], // TheFactRelay 03
  'CID_7600645594': ['thefactrelay'], // TheFactRelay 04
  'CID_2722142680': ['thefactrelay'], // TheFactRelay 05

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
  'CID_2192245899': ['predicto'], // Predicto - EST - 32
  'CID_6043127003': ['predicto'], // Predicto - EST - 33
  'CID_2851239327': ['predicto'], // Predicto - EST - 34
  'CID_7262761952': ['predicto'], // Predicto - EST - 35
  'CID_5651153058': ['predicto'], // Predicto - EST - 36
  'CID_8588048670': ['predicto'], // Predicto - EST - 37
  'CID_7974960490': ['predicto'], // Predicto - EST - 38
  'CID_8683194652': ['predicto'], // Predicto - EST - 39
  'CID_5947639623': ['predicto'], // Predicto - EST - 40
  'CID_1191411049': ['predicto'], // Predicto - EST - 41
  'CID_7080789309': ['predicto'], // Predicto - EST - 42
  'CID_7292070150': ['predicto'], // Predicto - EST - 43
  'CID_5813682086': ['predicto'], // Predicto - EST - 44
  'CID_2019271596': ['predicto'], // Predicto - EST - 45
  'CID_2101474690': ['predicto'], // Predicto - EST - 46
  'CID_5918243431': ['predicto'], // Predicto - EST - 47
  'CID_6855103527': ['predicto'], // Predicto - EST - 48
  'CID_5352884756': ['predicto'], // Predicto - EST - 49
  'CID_6499341400': ['predicto'], // Predicto - EST - 50
  'CID_9308336690': ['predicto'], // Predicto - EST - 54
  'CID_4337848325': ['predicto'], // Predicto - EST - 55
  'CID_8737177088': ['predicto'], // Predicto - EST - 56
  'CID_5929198423': ['predicto'], // Predicto - EST - 57
  'CID_3540908401': ['predicto'], // Predicto - EST - 61

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
  thefactrelay: ['/thefactrelay', '/api/adsense-cost-revenue'],
  androidadvice: ['/androidadvice', '/api/adsense-cost-revenue'],
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
  // Predicto - EST - 01: Main channels (includes channels reassigned from EST-02/03/04/31 after their accounts were removed)
  'CID_2382992113': [
    'ch88087', 'ch88092', 'ch88095', 'ch88096', 'ch88097', 'ch88098',
    'ch88099', 'ch88100', 'ch88101', 'ch88102', 'ch88103', 'ch88104',
    'ch88105', 'ch88106', 'ch88107', 'ch88108', 'ch88109', 'ch88111', 'ch88112',
    'ch46405', 'ch46406', 'ch46407', 'ch46409', 'ch46410', 'ch46411',
    'ch46418', 'ch4642', 'ch46420', 'ch46421', 'ch46423', 'ch46428',
    'ch46433', 'ch4644', 'ch46441',
    'ch605', 'ch71389', 'ch60772', 'ch71383', 'ch6091'
  ],

  // Predicto - EST - 32: No channels assigned
  'CID_2192245899': [],

  // Predicto - EST - 33: No channels assigned
  'CID_6043127003': [],

  // Predicto - EST - 34: No channels assigned
  'CID_2851239327': [],

  // Predicto - EST - 35: No channels assigned
  'CID_7262761952': [],

  // Predicto - EST - 36: No channels assigned
  'CID_5651153058': [],

  // Predicto - EST - 37: No channels assigned
  'CID_8588048670': [],

  // Predicto - EST - 38: No channels assigned
  'CID_7974960490': [],

  // Predicto - EST - 39: No channels assigned
  'CID_8683194652': [],

  // Predicto - EST - 40: No channels assigned
  'CID_5947639623': [],

  // Predicto - EST - 41: No channels assigned
  'CID_1191411049': [],

  // Predicto - EST - 42: No channels assigned
  'CID_7080789309': [],

  // Predicto - EST - 43: No channels assigned
  'CID_7292070150': [],

  // Predicto - EST - 44: No channels assigned
  'CID_5813682086': [],

  // Predicto - EST - 45: No channels assigned
  'CID_2019271596': [],

  // Predicto - EST - 46: No channels assigned
  'CID_2101474690': [],

  // Predicto - EST - 47: No channels assigned
  'CID_5918243431': [],

  // Predicto - EST - 48: No channels assigned
  'CID_6855103527': [],

  // Predicto - EST - 49: No channels assigned
  'CID_5352884756': [],

  // Predicto - EST - 50: No channels assigned
  'CID_6499341400': [],

  // Predicto - EST - 54: No channels assigned
  'CID_9308336690': [],

  // Predicto - EST - 55: No channels assigned
  'CID_4337848325': [],

  // Predicto - EST - 56: No channels assigned
  'CID_8737177088': [],

  // Predicto - EST - 57: No channels assigned
  'CID_5929198423': [],

  // Predicto - EST - 61: No channels assigned
  'CID_3540908401': [],
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
