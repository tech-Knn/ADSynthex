/**
 * Utility functions for Google Ads data processing
 */

/**
 * Validates required environment variables
 * @returns {Object} Object containing validation results
 */
function validateEnv() {
  const requiredVars = ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_MANAGER_ID'];
  const missing = [];
  
  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  });
  
  return {
    isValid: missing.length === 0,
    missing
  };
}

/**
 * Format currency value from micros
 * @param {number} microValue Value in micros (millionths)
 * @param {string} currencyCode Currency code (e.g., 'USD')
 * @returns {string} Formatted currency string
 */
function formatCurrency(microValue, currencyCode = 'USD') {
  const actualValue = microValue / 1000000;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  }).format(actualValue);
}

/**
 * Calculate performance metrics
 * @param {Object} campaign Campaign data
 * @returns {Object} Calculated metrics
 */
function calculateMetrics(campaign) {
  const clicks = parseInt(campaign.metrics.clicks, 10) || 0;
  const impressions = parseInt(campaign.metrics.impressions, 10) || 0;
  const costMicros = parseInt(campaign.metrics.cost_micros, 10) || 0;
  
  // Calculate CTR (Click-Through Rate)
  const ctr = impressions ? (clicks / impressions) * 100 : 0;
  
  // Calculate CPC (Cost Per Click)
  const cpc = clicks ? costMicros / clicks / 1000000 : 0;
  
  return {
    clicks,
    impressions,
    costMicros,
    cost: costMicros / 1000000,
    ctr: parseFloat(ctr.toFixed(2)),
    cpc: parseFloat(cpc.toFixed(2)),
  };
}

/**
 * Enriches campaign data with additional calculated metrics
 * @param {Array} campaigns Array of campaign data objects
 * @returns {Array} Enriched campaign data
 */
function enrichCampaignData(campaigns) {
  return campaigns.map(campaign => {
    const metrics = calculateMetrics(campaign);
    
    return {
      ...campaign,
      calculatedMetrics: metrics
    };
  });
}

module.exports = {
  validateEnv,
  formatCurrency,
  calculateMetrics,
  enrichCampaignData
}; 