/**
 * Configuration options for Google Ads API queries
 */
module.exports = {
  // Target accounts to query
  TARGET_ACCOUNTS: [
    // AFS - IST Accounts (DISABLED - search.termuxtools.com domain issue)
    // { id: '7072817229', name: 'AFS - IST - 01' },
    // { id: '1353234754', name: 'AFS - IST - 02' },
    // { id: '6610446272', name: 'AFS - IST - 03' },
    // { id: '5700221831', name: 'AFS - IST - 04' },
    // { id: '3961840839', name: 'AFS - IST - 05' },
    // { id: '1769246493', name: 'AFS - IST - 06' },
    // { id: '8077371478', name: 'AFS - IST - 07' },
    // { id: '5932592680', name: 'AFS - IST - 08' },
    // { id: '9657188741', name: 'AFS - 08 - GMT - 7' },
    // { id: '5898780123', name: 'AFS - IST - 09' },
    // { id: '3851198549', name: 'AFS - IST - 10' },
    // { id: '9841818774', name: 'AFS - IST - 11' },
    // { id: '5351234641', name: 'AFS - IST - 12' },
    // { id: '7918808672', name: 'AFS - IST - 13' },
    // { id: '5136436733', name: 'AFS - IST - 14' },
    // { id: '4985953086', name: 'AFS - IST - 15' },
    // { id: '1086706941', name: 'AFS - IST - 16' },
    // { id: '7142427325', name: 'AFS - IST - 17' },
    // { id: '1173588441', name: 'AFS - IST - 18' },
    // { id: '1786688915', name: 'AFS - IST - 19' },
    // { id: '5822945286', name: 'AFS - IST - 20' },
    // { id: '7507601023', name: 'AFS - IST - 21' },
    // { id: '5767125301', name: 'AFS - IST - 22' },
    // { id: '8238574545', name: 'AFS - IST - 23' },
    // { id: '5297662537', name: 'AFS - IST - 24' },
    // { id: '1749739427', name: 'AFS - IST - 25' },
    // { id: '3000221235', name: 'AFS - IST - 26' },
    // { id: '5039273517', name: 'AFS - IST - 27' },
    // { id: '3985887988', name: 'AFS - IST - 30' },
    // { id: '1209239435', name: 'AFS - IST - 31' },
    // { id: '8804029676', name: 'AFS - IST - 32' },
    // { id: '7993255100', name: 'AFS - IST - 33' },

    // AdSense for Search (AFS) - TRT Accounts (ACTIVE - search.topreserchtopics.com)
    { id: '9249163427', name: 'TRT - AFS 01' },
    { id: '7072817229', name: 'AFS - IST - 01' },
    { id: '8077371478', name: 'AFS - IST - 07' },
    { id: '3851198549', name: 'AFS - IST - 10' },
    { id: '9841818774', name: 'AFS - IST - 11' },
    { id: '5351234641', name: 'AFS - IST - 12' },
    { id: '7918808672', name: 'AFS - IST - 13' },
    { id: '5136436733', name: 'AFS - IST - 14' },
    { id: '7142427325', name: 'AFS - IST - 17' },
    { id: '1209239435', name: 'AFS - TRT - IST - 01' },
    { id: '8804029676', name: 'AFS - TRT - IST - 02' },
    { id: '7993255100', name: 'AFS - TRT - IST - 03' },
    { id: '1910623888', name: 'AFS - TRT - IST - 04' },
    { id: '3516620995', name: 'AFS - TRT - IST - 05' },
    { id: '3723100505', name: 'AFS - TRT - IST - 06' },
    { id: '7667229570', name: 'AFS - TRT - IST - 07' },
    { id: '5312022044', name: 'AFS - TRT - IST - 08' },
    { id: '6117738068', name: 'AFS - TRT - IST - 09' },
    { id: '8862303731', name: 'AFS - TRT - IST - 10' },
    { id: '8811269949', name: 'AFS - TRT - IST - 11' },
    { id: '1013027376', name: 'AFS - TRT - IST - 12' },
    { id: '4518158484', name: 'AFS - TRT - IST - 13' },
    { id: '1056018921', name: 'AFS - TRT - IST - 14' },
    { id: '8739175417', name: 'AFS - TRT - IST - 15' },

    // CarHp Accounts (search.carhp.com - GEO-based campaigns)
    { id: '5771818790', name: 'CarHp - IST - 01' },
    { id: '5928432468', name: 'CarHp - IST - 02' },
    { id: '4116426800', name: 'CarHp - IST - 03' },
    { id: '3638704299', name: 'CarHp - IST - 04' },
    { id: '3944625172', name: 'CarHp - IST - 05' },
    { id: '5079394847', name: 'CarHp New 02' },
    { id: '8536037999', name: 'CarHp New 01' },
    { id: '1558940550', name: 'CarHp New 03' },
    { id: '1791919543', name: 'CarHp New 04' },
    { id: '7839557944', name: 'CarHp New 05' },

    { id: '2324382023', name: 'CarHp New 06' },
    { id: '8613393445', name: 'CarHp New 07' },
    { id: '8817588152', name: 'CarHp New 08' },
    { id: '5106471180', name: 'CarHp New 09' },
    { id: '1594975507', name: 'CarHp New 10' },
    { id: '3888711550', name: 'CarHp New 11' },
    { id: '3229140299', name: 'CarHp New 12' },
    { id: '5415515697', name: 'CarHp New 13' },
    { id: '7933010158', name: 'CarHp New 14' },
    { id: '6180138197', name: 'CarHp New 15' },
    { id: '2636181354', name: 'CarHp New 16' },
    { id: '9085210041', name: 'CarHp New 17' },
    { id: '6616851341', name: 'CarHp New 18' },
    { id: '5827892184', name: 'CarHp New 19' },
    { id: '1757864848', name: 'CarHp New 20' },
    { id: '1792814156', name: 'CarHp New 21' },
    { id: '7087102807', name: 'CarHp New 22' },
    { id: '7903347315', name: 'CarHp New 23' },
    { id: '1131535915', name: 'CarHp New 24' },
    { id: '6738120407', name: 'CarHp New 25' },
    { id: '7454337227', name: 'CarHp New 26' },
    { id: '2502787460', name: 'CarHp New 27' },
    { id: '1161525078', name: 'CAR-HP-01' },
    { id: '9345796923', name: 'CAR-HP-02' },

    // Compado Accounts
    { id: '5416418019', name: 'Compado - UTC - 01' },
    { id: '5108802445', name: 'Compado - UTC - 02' },
    { id: '1671699399', name: 'Compado - UTC - 03' },
    { id: '9197380684', name: 'Compado - UTC - 04' },
    { id: '9669088480', name: 'Compado - UTC - 05' },
    { id: '6725067013', name: 'Compado - UTC - 06' },
    { id: '9299147464', name: 'Compado - UTC - 07' },
    { id: '2126478207', name: 'Compado - UTC - 08' },
    { id: '8711828676', name: 'Compado - UTC - 09' },
    { id: '5496110293', name: 'Compado - UTC - 10' },
    { id: '3963323643', name: 'Compado - UTC - 11' },
    { id: '1751028486', name: 'Compado - UTC - 12' },
    { id: '9248809715', name: 'Compado - UTC - 13' },
    { id: '9922466223', name: 'Compado - UTC - 14' },
    { id: '9524489917', name: 'Compado - UTC - 15' },

    // Compado BoldmoveGuide Accounts
    { id: '1235076035', name: 'Compado - BoldmoveGuide - UTC01' },
    { id: '3471023162', name: 'Compado - BoldmoveGuide - UTC02' },
    { id: '8871395768', name: 'Compado - BoldmoveGuide - UTC03' },
    { id: '3475645746', name: 'Compado - BoldmoveGuide - UTC04' },
    { id: '8994182684', name: 'Compado - BoldmoveGuide - UTC05' },
    { id: '9622143895', name: 'Compado - BoldmoveGuide - UTC06' },
    { id: '7949737807', name: 'Compado - BoldmoveGuide - UTC07' },
    { id: '8138817445', name: 'Compado - BoldmoveGuide - UTC08' },
    { id: '4315436458', name: 'Compado - BoldmoveGuide - UTC09' },
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
    { id: '5675630727', name: 'Ads.com - RSOC - UTC - 34' },
    { id: '3304906147', name: 'Ads.com - RSOC - UTC - 35' },
    { id: '8825176554', name: 'Ads.com - RSOC - UTC - 36' },
    { id: '8321499303', name: 'Ads.com - RSOC - UTC - 37' },
    { id: '7953604784', name: 'Ads.com - RSOC - UTC - 38' },
    { id: '9436130288', name: 'Ads.com - RSOC - UTC - 39' },
    { id: '7572891295', name: 'Ads.com - RSOC - UTC - 40' },
    { id: '8807720960', name: 'Ads.com - RSOC - UTC - Yahoo' },
    { id: '4277350349', name: 'RSOC - UTC - Ads.com' },
    { id: '9532228491', name: 'kaptinklunk - Inuvo - PST' },
    { id: '9375852176', name: 'kaptinklunk - Inuvo - PST 2' },
    { id: '6641065048', name: 'kaptinklunk - Inuvo - PST 3' },
    { id: '7053668495', name: 'kaptinklunk - Inuvo - PST 4' },
    { id: '6463288476', name: 'kaptinklunk - Inuvo - PST 5' },

    // TheFactRelay Accounts (Oarex Funding LLC - pub-6567805284657549)
    { id: '2144311178', name: 'TheFactRelay 01' },
    { id: '7371749207', name: 'TheFactRelay 02' },
    { id: '2334822533', name: 'TheFactRelay 03' },
    { id: '7600645594', name: 'TheFactRelay 04' },
    { id: '2722142680', name: 'TheFactRelay 05' },

    // AndroidAdvice Accounts (androidadvices.com - pub-5666608633267855)
    { id: '8701280199', name: 'androidadvices 01' },
    { id: '3765399744', name: 'androidadvices 02' },
    { id: '3617356950', name: 'androidadvices 03' },
    { id: '4932880256', name: 'androidadvices 04' },
    { id: '3764963776', name: 'androidadvices 05' },
    { id: '4702286319', name: 'androidadvices 06' },
    { id: '8182947427', name: 'androidadvices 07' },
    { id: '7423206633', name: 'androidadvices 08' },
    { id: '7753453760', name: 'androidadvice 09' },
    { id: '9785664835', name: 'androidadvices 10' },
    { id: '5418244007', name: 'androidadvices 11' },
    { id: '1223790856', name: 'androidadvices 12' },
    { id: '7416756000', name: 'androidadvices 13' },

    // Predicto Accounts
    { id: '2382992113', name: 'Predicto - EST - 01' },
    { id: '2192245899', name: 'Predicto - EST - 32' },
    { id: '6043127003', name: 'Predicto - EST - 33' },
    { id: '2851239327', name: 'Predicto - EST - 34' },
    { id: '7262761952', name: 'Predicto - EST - 35' },
    { id: '5651153058', name: 'Predicto - EST - 36' },
    { id: '8588048670', name: 'Predicto - EST - 37' },
    { id: '7974960490', name: 'Predicto - EST - 38' },
    { id: '8683194652', name: 'Predicto - EST - 39' },
    { id: '5947639623', name: 'Predicto - EST - 40' },
    { id: '1191411049', name: 'Predicto - EST - 41' },
    { id: '7080789309', name: 'Predicto - EST - 42' },
    { id: '7292070150', name: 'Predicto - EST - 43' },
    { id: '5813682086', name: 'Predicto - EST - 44' },
    { id: '2019271596', name: 'Predicto - EST - 45' },
    { id: '2101474690', name: 'Predicto - EST - 46' },
    { id: '5918243431', name: 'Predicto - EST - 47' },
    { id: '6855103527', name: 'Predicto - EST - 48' },
    { id: '5352884756', name: 'Predicto - EST - 49' },
    { id: '6499341400', name: 'Predicto - EST - 50' },
  ],

  // Default time range for metrics query
  // Dynamic date range will be used instead of static value
  timeRange: 'TODAY',

  // Minimum number of metrics to include in results
  // Set to 0 to include all campaigns regardless of metrics
  minImpressions: 0,

  // Campaign status filter
  // Options: ['ENABLED'], ['PAUSED'], ['ENABLED', 'PAUSED'], etc.
  campaignStatusFilter: ['ENABLED', 'PAUSED'],

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

  queries: {
    activeCampaignQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.final_url_suffix,
        customer.currency_code,
        segments.date,
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
      WHERE campaign.status IN ('ENABLED', 'PAUSED')
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,

    allCampaignsQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.final_url_suffix,
        customer.currency_code,
        segments.date,
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
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE campaign.status IN ('ENABLED', 'PAUSED')
      AND ad_group.status IN ('ENABLED', 'PAUSED')
      AND ad_group_ad.status IN ('ENABLED', 'PAUSED')
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,

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
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM ad_group_ad
      WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,

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
        segments.date,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM asset_group
      WHERE campaign.advertising_channel_type = 'PERFORMANCE_MAX'
      AND segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'`,

    clickViewQuery: `
      SELECT
        click_view.gclid,
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        segments.date,
        segments.click_type
      FROM click_view
      WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'
      AND click_view.gclid != ''
      ORDER BY segments.date DESC`,

    campaignGeoTargetsQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign_criterion.location.geo_target_constant,
        campaign_criterion.criterion_id
      FROM campaign_criterion
      WHERE campaign_criterion.type = 'LOCATION'
      AND campaign_criterion.status != 'REMOVED'`,

    geographicViewQuery: `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        geographic_view.country_criterion_id,
        segments.date,
        metrics.conversions_value,
        metrics.conversions,
        metrics.clicks,
        metrics.impressions,
        metrics.cost_micros
      FROM geographic_view
      WHERE segments.date BETWEEN 'DATE_RANGE_START' AND 'DATE_RANGE_END'
      AND geographic_view.country_criterion_id IS NOT NULL`
  },

  // Build the complete GAQL query based on configuration
  buildCampaignQuery: function (options = {}) {
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
