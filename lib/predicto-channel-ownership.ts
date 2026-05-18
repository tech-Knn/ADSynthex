/**
 * Predicto Channel Ownership Configuration
 * Defines which channel IDs belong to which Google Ads account
 *
 * IMPORTANT: Keep this in sync with lib/account-access-control.ts
 * The PRIMARY source of truth is lib/account-access-control.ts ACCOUNT_CHANNEL_ACCESS
 * which is used by the API routes. This file is used for validation and diagnostics.
 *
 * Use this to filter out channels that don't belong to an account
 */

export interface ChannelOwnershipConfig {
  customer_id: string;
  account_name: string;
  channel_ids: string[];
}

/**
 * Channel ownership configuration
 * Add/update channel IDs for each account here
 */
export const CHANNEL_OWNERSHIP: ChannelOwnershipConfig[] = [
  {
    customer_id: '2382992113',
    account_name: 'Predicto - EST - 01',
    channel_ids: [
      'ch88087', 'ch88092', 'ch88095', 'ch88096', 'ch88097', 'ch88098',
      'ch88099', 'ch88100', 'ch88101', 'ch88102', 'ch88103', 'ch88104',
      'ch88105', 'ch88106', 'ch88107', 'ch88108', 'ch88109', 'ch88111', 'ch88112',
      'ch46405', 'ch46406', 'ch46407', 'ch46409', 'ch46410', 'ch46411',
      'ch46418', 'ch4642', 'ch46420', 'ch46421', 'ch46423', 'ch46428',
      'ch46433', 'ch4644', 'ch46441',
      'ch605', 'ch71389', 'ch60772', 'ch71383', 'ch6091',
    ],
  },
  {
    customer_id: '2192245899',
    account_name: 'Predicto - EST - 32',
    channel_ids: [],
  },
  {
    customer_id: '6043127003',
    account_name: 'Predicto - EST - 33',
    channel_ids: [],
  },
  {
    customer_id: '2851239327',
    account_name: 'Predicto - EST - 34',
    channel_ids: [],
  },
  {
    customer_id: '7262761952',
    account_name: 'Predicto - EST - 35',
    channel_ids: [],
  },
  {
    customer_id: '5651153058',
    account_name: 'Predicto - EST - 36',
    channel_ids: [],
  },
  {
    customer_id: '8588048670',
    account_name: 'Predicto - EST - 37',
    channel_ids: [],
  },
  {
    customer_id: '7974960490',
    account_name: 'Predicto - EST - 38',
    channel_ids: [],
  },
  {
    customer_id: '8683194652',
    account_name: 'Predicto - EST - 39',
    channel_ids: [],
  },
  {
    customer_id: '5947639623',
    account_name: 'Predicto - EST - 40',
    channel_ids: [],
  },
  {
    customer_id: '1191411049',
    account_name: 'Predicto - EST - 41',
    channel_ids: [],
  },
  {
    customer_id: '7080789309',
    account_name: 'Predicto - EST - 42',
    channel_ids: [],
  },
  {
    customer_id: '7292070150',
    account_name: 'Predicto - EST - 43',
    channel_ids: [],
  },
  {
    customer_id: '5813682086',
    account_name: 'Predicto - EST - 44',
    channel_ids: [],
  },
  {
    customer_id: '2019271596',
    account_name: 'Predicto - EST - 45',
    channel_ids: [],
  },
  {
    customer_id: '2101474690',
    account_name: 'Predicto - EST - 46',
    channel_ids: [],
  },
  {
    customer_id: '5918243431',
    account_name: 'Predicto - EST - 47',
    channel_ids: [],
  },
  {
    customer_id: '6855103527',
    account_name: 'Predicto - EST - 48',
    channel_ids: [],
  },
  {
    customer_id: '5352884756',
    account_name: 'Predicto - EST - 49',
    channel_ids: [],
  },
  {
    customer_id: '6499341400',
    account_name: 'Predicto - EST - 50',
    channel_ids: [],
  },
];

/**
 * Build a reverse map: channel_id -> customer_id
 * This allows quick lookup of which account owns a channel
 */
export function buildChannelToAccountMap(): Map<string, string> {
  const map = new Map<string, string>();

  CHANNEL_OWNERSHIP.forEach(account => {
    account.channel_ids.forEach(channelId => {
      // Normalize to lowercase for consistent matching
      const normalizedId = channelId.toLowerCase();
      map.set(normalizedId, account.customer_id);
    });
  });

  return map;
}

/**
 * Check if a channel belongs to a specific account
 */
export function channelBelongsToAccount(
  channelId: string,
  customerId: string
): boolean {
  const normalizedChannelId = channelId.toLowerCase();
  const account = CHANNEL_OWNERSHIP.find(a => a.customer_id === customerId);

  if (!account) return false;

  return account.channel_ids.some(
    ch => ch.toLowerCase() === normalizedChannelId
  );
}

/**
 * Get all channel IDs for a specific account
 */
export function getAccountChannels(customerId: string): string[] {
  const account = CHANNEL_OWNERSHIP.find(a => a.customer_id === customerId);
  return account ? account.channel_ids.map(ch => ch.toLowerCase()) : [];
}

/**
 * Get the account that owns a specific channel
 */
export function getChannelOwner(channelId: string): string | undefined {
  const normalizedChannelId = channelId.toLowerCase();
  const map = buildChannelToAccountMap();
  return map.get(normalizedChannelId);
}

/**
 * Validate if channel IDs in campaign URLs match the account's ownership
 */
export function validateChannelOwnership(
  customerId: string,
  channelIdsInCampaigns: string[]
): {
  valid: string[];
  invalid: string[];
  missing: string[];
} {
  const accountChannels = getAccountChannels(customerId);
  const accountChannelSet = new Set(accountChannels);

  const valid: string[] = [];
  const invalid: string[] = [];

  channelIdsInCampaigns.forEach(channelId => {
    const normalizedId = channelId.toLowerCase();
    if (accountChannelSet.has(normalizedId)) {
      valid.push(channelId);
    } else {
      invalid.push(channelId);
    }
  });

  // Find channels in config but not in campaigns
  const campaignChannelSet = new Set(
    channelIdsInCampaigns.map(ch => ch.toLowerCase())
  );
  const missing = accountChannels.filter(
    ch => !campaignChannelSet.has(ch)
  );

  return { valid, invalid, missing };
}
