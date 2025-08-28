// Google Ads Campaign Types - Exact Google Interface Types

export interface CampaignType {
  id: 'PERFORMANCE_MAX' | 'DISPLAY';
  name: string;
  description: string;
  icon: string;
  subtext?: string;
}

export interface CampaignObjective {
  id: 'SALES' | 'LEADS' | 'WEBSITE_TRAFFIC' | 'APP_PROMOTION' | 'AWARENESS' | 'LOCAL_VISITS' | 'NO_GUIDANCE';
  name: string;
  description: string;
  icon: string;
  recommended?: boolean;
}

export interface ConversionGoal {
  id: string;
  name: string;
  type: 'OUTBOUND_CLICKS' | 'PURCHASE' | 'LEAD' | 'PHONE_CALL';
  value: number;
  currency: string;
  status: 'RECORDING' | 'NOT_RECORDING';
}

export interface CampaignSettings {
  locations: string[];
  languages: string[];
  budget: {
    daily: number;
    currency: string;
  };
  bidding: {
    strategy: string;
    targetCpa?: number;
    targetRoas?: number;
  };
  schedule: {
    startDate: Date;
    endDate?: Date;
  };
}

export interface AdCreative {
  headlines: string[];
  descriptions: string[];
  longHeadline?: string;
  businessName: string;
  images: File[];
  logos: File[];
  videos?: File[];
  finalUrls: string[];
}

export interface GoogleAdsCampaign {
  type: CampaignType['id'];
  objective: CampaignObjective['id'];
  conversionGoals: ConversionGoal[];
  settings: CampaignSettings;
  creative: AdCreative;
  name?: string;
}


