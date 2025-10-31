/**
 * Google Ads Constants
 * Centralized configuration and target accounts
 */

export const TARGET_ACCOUNTS = [
  { id: '5416418019', name: 'Compado - UTC - 01' },
  { id: '5108802445', name: 'Compado - UTC - 02' },
  { id: '1671699399', name: 'Compado - UTC - 03' },
  { id: '9669088480', name: 'Compado - UTC - 05' },
  { id: '6725067013', name: 'Compado - UTC - 06' },
  { id: '9299147464', name: 'Compado - UTC - 07' },
  { id: '8677814915', name: 'Ads.com - RSOC - IST' },
  { id: '9071440966', name: 'Ads.com - RSOC - UTC - 02' },
  { id: '5723554317', name: 'Ads.com - RSOC - UTC - 03' },
  { id: '3146253756', name: 'Ads.com - RSOC - UTC - 04' },
  { id: '5857090949', name: 'Ads.com - RSOC - UTC - 05' },
  { id: '6201189752', name: 'Ads.com - RSOC - UTC - 06' },
  { id: '4071621621', name: 'Ads.com - RSOC - UTC - 07' },
  { id: '7579121709', name: 'Ads.com - RSOC - UTC - 08' },
  { id: '1918795911', name: 'Ads.com - RSOC - UTC - 09' },
  { id: '2849704713', name: 'Ads.com - RSOC - UTC - 10' },
  { id: '7605096292', name: 'Ads.com - RSOC - UTC - 11' },
  { id: '5719842337', name: 'Ads.com - RSOC - UTC - 12' },
  { id: '9341614254', name: 'Ads.com - RSOC - UTC - 13' },
  { id: '9790364217', name: 'Ads.com - UTC - 14' },
  { id: '2420687578', name: 'Ads.com - UTC - 16' },
  { id: '6324595978', name: 'Ads.com - RSOC - UTC - 17' },
  { id: '5133038944', name: 'Ads.com - RSOC - UTC - 18' },
  { id: '9084731648', name: 'Ads.com - RSOC - UTC - 19' },
  { id: '5109995931', name: 'Ads.com - RSOC - UTC - 20' },
  { id: '3218250684', name: 'Ads.com - UTC - 21' },
  { id: '7035336235', name: 'Ads.com - UTC - 22' },
  { id: '5343981146', name: 'Ads.com - UTC - 23' },
  { id: '1908857409', name: 'Ads.com - UTC - 24' },
  { id: '3848887282', name: 'Ads.com - UTC - 25' },
  { id: '4213092623', name: 'Ads.com - UTC - 26' },
  { id: '6626619603', name: 'Ads.com - UTC - 27' },
  { id: '8914190629', name: 'Ads.com - UTC - 28' },
  { id: '9876515601', name: 'Ads.com - RSOC - UTC - 29' },
  { id: '8600545272', name: 'Ads.com - UTC - 30' },
  { id: '3118222043', name: 'Ads.com - UTC - 31' },
  { id: '7824950746', name: 'Ads.com - UTC - 32' },
  { id: '8807720960', name: 'Ads.com - RSOC - UTC - Yahoo' },
  { id: '4277350349', name: 'RSOC - UTC - Ads.com' }
];

export const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMultiplier: 2,
  maxBackoffDelay: 10000,
  initialDelay: 1000
};

export const CACHE_TTL = {
  individual: 10 * 60, // 10 minutes (in seconds)
  aggregated: 15 * 60, // 15 minutes
  cost: 20 * 60, // 20 minutes
  historical: 60 * 60 // 1 hour
};

