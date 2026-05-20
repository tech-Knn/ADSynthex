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

  // Founderzest MCC — Predicto EST-46 to EST-50
  founderzest: {
    mccId: process.env.FOUNDERZEST_MCC_ID || '',
    name: 'Founderzest MCC',
    googleAds: {
      clientId: process.env.FOUNDERZEST_GOOGLE_ADS_CLIENT_ID || '',
      clientSecret: process.env.FOUNDERZEST_GOOGLE_ADS_CLIENT_SECRET || '',
      developerToken: process.env.FOUNDERZEST_GOOGLE_ADS_DEVELOPER_TOKEN || '',
      refreshToken: process.env.FOUNDERZEST_GOOGLE_ADS_REFRESH_TOKEN || '',
    },
  },
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
  '2192245899': 'primary', // Predicto EST-32
  '6043127003': 'primary', // Predicto EST-33
  '2851239327': 'primary', // Predicto EST-34
  '7262761952': 'primary', // Predicto EST-35
  '5651153058': 'primary', // Predicto EST-36
  '8588048670': 'primary', // Predicto EST-37
  '7974960490': 'primary', // Predicto EST-38
  '8683194652': 'primary', // Predicto EST-39
  '5947639623': 'primary', // Predicto EST-40
  '1191411049': 'primary', // Predicto EST-41
  '7080789309': 'primary', // Predicto EST-42
  '7292070150': 'primary', // Predicto EST-43
  '5813682086': 'primary', // Predicto EST-44
  '2019271596': 'primary', // Predicto EST-45
  '2101474690': 'founderzest', // Predicto EST-46
  '5918243431': 'founderzest', // Predicto EST-47
  '6855103527': 'founderzest', // Predicto EST-48
  '5352884756': 'founderzest', // Predicto EST-49
  '6499341400': 'founderzest', // Predicto EST-50
  '2052501595': 'founderzest', // Predicto EST-51
  '8906500043': 'founderzest', // Predicto EST-52
  '4601371562': 'founderzest', // Predicto EST-53

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
  '1792814156': 'primary',  // CarHp New 21
  '7087102807': 'primary',  // CarHp New 22
  '7903347315': 'primary',  // CarHp New 23
  '1131535915': 'primary',  // CarHp New 24
  '6738120407': 'primary',  // CarHp New 25
  '7454337227': 'primary',  // CarHp New 26
  '2502787460': 'primary',  // CarHp New 27
  '1161525078': 'primary',  // CAR-HP-01 (PST)
  '9345796923': 'primary',  // CAR-HP-02 (PST)

  // Inuvo Accounts
  '9532228491': 'primary',  // kaptinklunk - Inuvo - PST
  '9375852176': 'primary',  // kaptinklunk - Inuvo - PST 2
  '6641065048': 'primary',  // kaptinklunk - Inuvo - PST 3
  '7053668495': 'primary',  // kaptinklunk - Inuvo - PST 4
  '6463288476': 'primary',  // kaptinklunk - Inuvo - PST 5

  // TheFactRelay Accounts
  '2144311178': 'primary',  // TheFactRelay 01
  '7371749207': 'primary',  // TheFactRelay 02
  '2334822533': 'primary',  // TheFactRelay 03
  '7600645594': 'primary',  // TheFactRelay 04
  '2722142680': 'primary',  // TheFactRelay 05

  // AndroidAdvice Accounts (androidadvices.com)
  '8701280199': 'primary',  // androidadvices 01
  '3765399744': 'primary',  // androidadvices 02
  '3617356950': 'primary',  // androidadvices 03
  '4932880256': 'primary',  // androidadvices 04
  '3764963776': 'primary',  // androidadvices 05
  '4702286319': 'primary',  // androidadvices 06
  '8182947427': 'primary',  // androidadvices 07
  '7423206633': 'primary',  // androidadvices 08
  '7753453760': 'primary',  // androidadvice 09
  '9785664835': 'primary',  // androidadvices 10
  '5418244007': 'primary',  // androidadvices 11
  '1223790856': 'primary',  // androidadvices 12
  '7416756000': 'primary',  // androidadvices 13
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
