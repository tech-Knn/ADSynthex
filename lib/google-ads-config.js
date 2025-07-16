/**
 * Configuration options for Google Ads API queries
 */
module.exports = {
  // Target accounts to query
  TARGET_ACCOUNTS: [
    { id: '3146253756', name: 'Ads.com - RSOC - UTC - 04' },
    { id: '5723554317', name: 'Ads.com - RSOC - UTC - 03' },
    { id: '9071440966', name: 'Ads.com - RSOC - UTC - 02' },
    { id: '8677814915', name: 'Ads.com - RSOC - IST' },
    { id: '4277350349', name: 'RSOC - UTC - Ads.com' },
    { id: '5857090949', name: 'Ads.com - RSOC - UTC - 05' },
    { id: '6201189752', name: 'Ads.com - RSOC - UTC - 06' },
    { id: '4071621621', name: 'Ads.com - RSOC - UTC - 07' },
    { id: '7579121709', name: 'Ads.com - RSOC - UTC - 08' },
    { id: '1918795911', name: 'Ads.com - RSOC - UTC - 09' },
    { id: '2849704713', name: 'Ads.com - RSOC - UTC - 10' },
    { id: '7605096292', name: 'Ads.com - RSOC - UTC - 11' },
    { id: '5719842337', name: 'Ads.com - RSOC - UTC - 12' },
    { id: '9341614254', name: 'Ads.com - RSOC - UTC - 13' }
  ],
  
  // Default time range for metrics query
  // Dynamic date range will be used instead of static value
  timeRange: 'TODAY',
  
  // Minimum number of metrics to include in results
  // Set to 0 to include all campaigns regardless of metrics
  minImpressions: 0,
  
  // Campaign status filter
  // Options: ['ENABLED'], ['PAUSED'], ['ENABLED', 'PAUSED'], etc.
  campaignStatusFilter: ['ENABLED'],
  
  // Default output file name format
  outputFileName: 'google-ads-data',
  
  // Default output format (json or csv)
  outputFormat: 'json',
  
  // Additional metrics to fetch
  additionalMetrics: [
    // Uncomment to include additional metrics
    // 'metrics.average_cpc',
    // 'metrics.conversions',
    // 'metrics.conversion_value',
    // 'metrics.ctr',
  ],
  
  // Additional campaign fields to fetch
  additionalCampaignFields: [
    // Uncomment to include additional campaign fields
    // 'campaign.status',
    // 'campaign.advertising_channel_type',
    // 'campaign.bidding_strategy_type',
  ],
  
  // Query templates for Google Ads API
  queries: {
    // Active campaigns query - with dynamic date parameter placeholders
    activeCampaignQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.final_url_suffix,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.all_conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cost,
        metrics.average_target_cpa_micros
      FROM campaign
      WHERE campaign.status = 'ENABLED'
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,
    
    // All campaigns query (regardless of status)
    allCampaignsQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.final_url_suffix,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.cost_per_conversion,
        metrics.all_conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.average_cost,
        metrics.average_target_cpa_micros
      FROM campaign
      WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,
    
    // Active ad group ads query
    activeAdGroupAdQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE campaign.status = 'ENABLED'
      AND ad_group.status = 'ENABLED'
      AND ad_group_ad.status = 'ENABLED'
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,
    
    // All ad group ads query
    allAdGroupAdQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.type,
        ad_group_ad.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,
    
    // Performance Max asset group query
    assetGroupQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        asset_group.id,
        asset_group.name,
        asset_group.status,
        asset_group.final_urls,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM asset_group
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`
  },
  
  // Build the complete GAQL query based on configuration
  buildCampaignQuery: function(options = {}) {
    // Support dynamic date range instead of fixed DURING clause
    const startDate = options.startDate || '';
    const endDate = options.endDate || '';
    
    // Use either dynamic date range or fallback to configured timeRange
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    } else {
      dateFilter = `segments.date DURING ${this.timeRange}`;
    }
    
    const additionalMetrics = options.additionalMetrics || this.additionalMetrics;
    const additionalCampaignFields = options.additionalCampaignFields || this.additionalCampaignFields;
    
    // Build the SELECT clause
    let selectClause = `
      SELECT
        campaign.id,
        campaign.name`;
    
    // Add additional campaign fields if any
    if (additionalCampaignFields.length > 0) {
      selectClause += ',\n        ' + additionalCampaignFields.join(',\n        ');
    }
    
    // Add core metrics
    selectClause += `,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros`;
    
    // Add additional metrics if any
    if (additionalMetrics.length > 0) {
      selectClause += ',\n        ' + additionalMetrics.join(',\n        ');
    }
    
    // Build the complete query
    return `${selectClause}
      FROM campaign
      WHERE ${dateFilter}`;
  }
}; 