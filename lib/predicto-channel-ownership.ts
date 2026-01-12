/**
 * Predicto Channel Ownership Configuration
 * Defines which channel IDs belong to which Google Ads account
 *
 * This is the SOURCE OF TRUTH for channel-to-account mapping
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
      // Add EST-01 channel IDs here
    ],
  },
  {
    customer_id: '1640518611',
    account_name: 'Predicto - EST - 02',
    channel_ids: [
      // Add EST-02 channel IDs here (excluding ch88099, ch88100)
    ],
  },
  {
    customer_id: '8091270364',
    account_name: 'Predicto - EST - 03',
    channel_ids: [
      // Add EST-03 channel IDs here (excluding ch88102)
    ],
  },
  {
    customer_id: '8846129452',
    account_name: 'Predicto - EST - 04',
    channel_ids: [
      // Add EST-04 channel IDs here (excluding ch88104)
    ],
  },
  {
    customer_id: '6474140466',
    account_name: 'Predicto - EST - 05',
    channel_ids: [
      // Add EST-05 channel IDs here (excluding ch88105)
    ],
  },
  {
    customer_id: '4920639194',
    account_name: 'Predicto - EST - 06',
    channel_ids: [
      // Add EST-06 channel IDs here
    ],
  },
  {
    customer_id: '7282297343',
    account_name: 'Predicto - EST - 07',
    channel_ids: [
      // Add EST-07 channel IDs here
    ],
  },
  {
    customer_id: '1298005744',
    account_name: 'Predicto - EST - 08',
    channel_ids: [
      // Add EST-08 channel IDs here (excluding ch88111)
    ],
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
