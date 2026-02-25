/**
 * Multi-MCC configuration for Google Ads API
 * Maps accounts to their respective MCC credentials
 */

export interface MCCCredentials {
  mccId: string;
  name: string;
  googleAds: {
    clientId: string;
    clientSecret: string;
    developerToken: string;
    refreshToken: string;
  };
  adSense?: {
    refreshToken: string;
    publisherId?: string;
  };
}

// MCC configurations - add more as needed
export const MCC_CONFIGS: Record<string, MCCCredentials> = {
  primary: {
    mccId: process.env.GOOGLE_ADS_MANAGER_ID || '2780664133',
    name: 'Primary MCC (TRT)',
    googleAds: {
      clientId: process.env.GOOGLE_ADS_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET || '',
      developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
      refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN || '',
    },
    adSense: {
      refreshToken: process.env.ADSENSE_REFRESH_TOKEN || '',
      publisherId: process.env.ADSENSE_PUBLISHER_ID,
    },
  },

  // Note: Secondary MCC not in use — all accounts (TRT, CARHP) use primary MCC for Google Ads cost
};

// Account -> MCC mapping (single source of truth)
export const ACCOUNT_TO_MCC: Record<string, keyof typeof MCC_CONFIGS> = {
  // Primary MCC accounts
  '9249163427': 'primary',
  '1209239435': 'primary',
  '8804029676': 'primary',
  '7993255100': 'primary',
  '1910623888': 'primary',
  '3516620995': 'primary',
  '3723100505': 'primary',
  '7667229570': 'primary',
  '5312022044': 'primary',
  '6117738068': 'primary',
  '8862303731': 'primary',
  '8811269949': 'primary',
  '1013027376': 'primary',
  '4518158484': 'primary',
  '1056018921': 'primary',
  '8739175417': 'primary',
  '815308036': 'primary',  // Predicto EST-21 (IDR)
  '5230757999': 'primary', // Predicto EST-22 (IDR)
  '3146472862': 'primary', // Predicto EST-23 (IDR)
  '8775212280': 'primary', // Predicto EST-24 (IDR)
  '4714948356': 'primary', // Predicto EST-25 (IDR)

  // CarHp Accounts (use PRIMARY MCC for Google Ads cost)
  '5771818790': 'primary',
  '5928432468': 'primary',
  '4116426800': 'primary',
  '3638704299': 'primary',
  '3944625172': 'primary',
  '5079394847': 'primary',  // CarHp New 02
  '8536037999': 'primary',  // CarHp New 01
};

export function getMCCForAccount(customerId: string): MCCCredentials | null {
  const mccKey = ACCOUNT_TO_MCC[customerId];
  if (!mccKey) {
    console.warn(`[MCC] No mapping for account ${customerId}`);
    return null;
  }
  return MCC_CONFIGS[mccKey] || null;
}

export function getAccountsByMCC(mccKey: keyof typeof MCC_CONFIGS): string[] {
  return Object.entries(ACCOUNT_TO_MCC)
    .filter(([_, mcc]) => mcc === mccKey)
    .map(([id]) => id);
}

export function getDefaultMCC(): MCCCredentials {
  return MCC_CONFIGS.primary;
}

export function getAllMCCs(): Array<keyof typeof MCC_CONFIGS> {
  return Object.keys(MCC_CONFIGS) as Array<keyof typeof MCC_CONFIGS>;
}
