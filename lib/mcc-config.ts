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
  '2382992113': 'primary', // Predicto EST-01
  '1640518611': 'primary', // Predicto EST-02
  '8091270364': 'primary', // Predicto EST-03
  '8846129452': 'primary', // Predicto EST-04
  '6474140466': 'primary', // Predicto EST-05
  '4920639194': 'primary', // Predicto EST-06
  '7282297343': 'primary', // Predicto EST-07
  '1298005744': 'primary', // Predicto EST-08
  '5777354952': 'primary', // Predicto EST-09
  '1449565595': 'primary', // Predicto EST-10
  '3485355192': 'primary', // Predicto EST-11
  '8395624186': 'primary', // Predicto EST-12
  '2866937044': 'primary', // Predicto EST-13
  '8474169341': 'primary', // Predicto EST-14
  '4690287335': 'primary', // Predicto EST-15
  '9352426268': 'primary', // Predicto EST-16
  '9084810037': 'primary', // Predicto EST-17
  '4517107811': 'primary', // Predicto EST-18
  '4272056005': 'primary', // Predicto EST-19
  '2563438099': 'primary', // Predicto EST-20
  '6731595092': 'primary', // Predicto EST-21
  '8656375545': 'primary', // Predicto EST-22
  '5802421650': 'primary', // Predicto EST-23
  '1213532895': 'primary', // Predicto EST-24
  '7273310309': 'primary', // Predicto EST-25
  '3318899588': 'primary', // Predicto EST-26
  '8997459454': 'primary', // Predicto EST-27
  '5556851600': 'primary', // Predicto EST-28
  '3907817554': 'primary', // Predicto EST-29
  '7505004095': 'primary', // Predicto EST-30

  // CarHp Accounts (use PRIMARY MCC for Google Ads cost) - Sequential order
  '8536037999': 'primary',  // CarHp New 01 (IST)
  '5079394847': 'primary',  // CarHp New 02 (IST)
  '1558940550': 'primary',  // CarHp New 03 (IST)
  '1791919543': 'primary',  // CarHp New 04 (IST)
  '7839557944': 'primary',  // CarHp New 05 (IST)
  '2324382023': 'primary',  // CarHp New 06 (IST)
  '8613393445': 'primary',  // CarHp New 07 (IST)
  '8817588152': 'primary',  // CarHp New 08 (IST)
  '5106471180': 'primary',  // CarHp New 09 (IST)
  '1594975507': 'primary',  // CarHp New 10 (IST)
  '3888711550': 'primary',  // CarHp New 11 (IST)
  '3229140299': 'primary',  // CarHp New 12 (IST)
  '5415515697': 'primary',  // CarHp New 13 (IST)
  '7933010158': 'primary',  // CarHp New 14 (IST)
  '6180138197': 'primary',  // CarHp New 15 (IST)
  '2636181354': 'primary',  // CarHp New 16 (IST)
  '9085210041': 'primary',  // CarHp New 17 (IST)
  '6616851341': 'primary',  // CarHp New 18 (IST)
  '5827892184': 'primary',  // CarHp New 19 (IST)
  '1757864848': 'primary',  // CarHp New 20 (IST)
  '1161525078': 'primary',  // CAR-HP-01 (PST)
  '9345796923': 'primary',  // CAR-HP-02 (PST)
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
