// Google Ads Constants - Exact values from Google interface

export const CAMPAIGN_TYPES = [
  {
    id: 'PERFORMANCE_MAX',
    name: 'Performance Max',
    description: 'Reach audiences across all of Google with a single campaign.',
    icon: '🚀',
    subtext: 'See how it works'
  },
  {
    id: 'DISPLAY', 
    name: 'Display',
    description: 'Reach customers across three million sites and apps with engaging creative',
    icon: '🖼️'
  }
] as const;

export const CAMPAIGN_OBJECTIVES = [
  {
    id: 'SALES',
    name: 'Sales',
    description: 'Drive sales online, in app, by phone or in store',
    icon: '🏷️'
  },
  {
    id: 'LEADS',
    name: 'Leads', 
    description: 'Get leads and other conversions by encouraging customers to take action',
    icon: '👥',
    recommended: true
  },
  {
    id: 'WEBSITE_TRAFFIC',
    name: 'Website traffic',
    description: 'Get the right people to visit your website',
    icon: '🌐'
  },
  {
    id: 'APP_PROMOTION',
    name: 'App promotion',
    description: 'Get more installs, engagement and pre-registration for your app',
    icon: '📱'
  },
  {
    id: 'AWARENESS',
    name: 'Awareness and consideration',
    description: 'Reach a broad audience and build interest in your products or brand',
    icon: '🔊'
  },
  {
    id: 'LOCAL_VISITS',
    name: 'Local shop visits and promotions',
    description: 'Drive visits to local shops, including restaurants and dealerships.',
    icon: '📍'
  },
  {
    id: 'NO_GUIDANCE',
    name: 'Create a campaign without guidance',
    description: "You'll choose a campaign next",
    icon: '⚙️'
  }
] as const;

export const BIDDING_STRATEGIES = {
  PERFORMANCE_MAX: [
    'MAXIMIZE_CONVERSIONS',
    'TARGET_CPA',
    'MAXIMIZE_CONVERSION_VALUE',
    'TARGET_ROAS'
  ],
  DISPLAY: [
    'MAXIMIZE_CONVERSIONS',
    'TARGET_CPA', 
    'MAXIMIZE_CLICKS',
    'TARGET_IMPRESSIONS',
    'MANUAL_CPC'
  ]
} as const;

export const LOCATION_OPTIONS = [
  'ALL_COUNTRIES',
  'UNITED_STATES_CANADA',
  'UNITED_STATES',
  'ENTER_ANOTHER_LOCATION'
] as const;

export const GOOGLE_ADS_COLORS = {
  primary: '#1a73e8',
  primaryHover: '#1557b0',
  success: '#34a853',
  warning: '#fbbc04',
  error: '#ea4335',
  text: '#202124',
  textSecondary: '#5f6368',
  border: '#dadce0',
  background: '#ffffff',
  backgroundSecondary: '#f8f9fa'
} as const;


