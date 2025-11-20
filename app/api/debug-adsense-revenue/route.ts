import { NextRequest, NextResponse } from 'next/server';
import {
  fetchAdSenseRevenueByStyleId,
  extractStyleIdFromUrl,
  extractDomainFromUrl,
} from '@/lib/adsense-api';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';

/**
 * Debug endpoint to diagnose AFS revenue allocation issues
 * Compares AdSense revenue style_ids with Google Ads campaign style_ids
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate, adsenseAccountId, accountIds } = body;

    console.log('[DEBUG] ===== REVENUE DIAGNOSTIC START =====');
    console.log('[DEBUG] Accounts:', accountIds);
    console.log('[DEBUG] Date range:', startDate, 'to', endDate);
    console.log('[DEBUG] AdSense Account:', adsenseAccountId);

    // Fetch AdSense revenue
    const adsenseRevenue = await fetchAdSenseRevenueByStyleId(adsenseAccountId, startDate, endDate);

    // Extract unique style_ids and domains from AdSense
    const adsenseStyleIds = new Set<string>();
    const adsenseDomains = new Set<string>();
    const adsenseStyleDomainPairs = new Set<string>();
    let totalAdsenseRevenue = 0;

    for (const rev of adsenseRevenue) {
      adsenseStyleIds.add(rev.style_id);
      if (rev.domain_name) adsenseDomains.add(rev.domain_name);
      adsenseStyleDomainPairs.add(`${rev.style_id}_${rev.domain_name || 'N/A'}`);
      totalAdsenseRevenue += rev.earnings;
    }

    console.log('[DEBUG] AdSense Revenue Summary:');
    console.log(`  - Total records: ${adsenseRevenue.length}`);
    console.log(`  - Total revenue: $${totalAdsenseRevenue.toFixed(2)}`);
    console.log(`  - Unique style_ids: ${adsenseStyleIds.size}`);
    console.log(`  - Unique domains: ${adsenseDomains.size}`);
    console.log(`  - Unique style+domain pairs: ${adsenseStyleDomainPairs.size}`);
    console.log(`  - Top 10 style_ids: ${Array.from(adsenseStyleIds).slice(0, 10).join(', ')}`);

    // Fetch Google Ads data for the specified accounts
    const allResults: any[] = [];
    for (const accId of accountIds || []) {
      const result = await bulletproofAPI.getData(startDate, endDate, accId, {
        priority: 8,
        allowStale: true,
        maxWait: 30000,
        feedType: 'adsense'
      });
      allResults.push({ accountId: accId, ...result });
    }

    const googleAdsData = { campaigns: [], ads: [] };
    for (const accountResult of allResults) {
      const accData = accountResult.data;
      if (accData?.campaigns) googleAdsData.campaigns.push(...accData.campaigns);
      if (accData?.ads) googleAdsData.ads.push(...accData.ads);
    }

    // Extract style_ids from Google Ads final URLs
    const googleAdsStyleIds = new Set<string>();
    const googleAdsDomains = new Set<string>();
    const googleAdsStyleDomainPairs = new Set<string>();
    const googleAdsUrls: string[] = [];
    const failedExtractions: string[] = [];

    for (const ad of googleAdsData.ads || []) {
      const finalUrls = ad.final_urls || [];
      for (const url of finalUrls) {
        googleAdsUrls.push(url);
        const styleId = extractStyleIdFromUrl(url);
        const domain = extractDomainFromUrl(url);

        if (styleId) {
          googleAdsStyleIds.add(styleId);
          if (domain) {
            googleAdsDomains.add(domain);
            googleAdsStyleDomainPairs.add(`${styleId}_${domain}`);
          }
        } else {
          // No style_id found in URL
          failedExtractions.push(url);
        }
      }
    }

    console.log('[DEBUG] Google Ads Summary:');
    console.log(`  - Total campaigns: ${googleAdsData.campaigns.length}`);
    console.log(`  - Total ads: ${googleAdsData.ads.length}`);
    console.log(`  - Total final URLs: ${googleAdsUrls.length}`);
    console.log(`  - Unique style_ids extracted: ${googleAdsStyleIds.size}`);
    console.log(`  - Unique domains extracted: ${googleAdsDomains.size}`);
    console.log(`  - Unique style+domain pairs: ${googleAdsStyleDomainPairs.size}`);
    console.log(`  - Failed extractions: ${failedExtractions.length}`);
    console.log(`  - Top 10 style_ids: ${Array.from(googleAdsStyleIds).slice(0, 10).join(', ')}`);

    // Find matching and missing style_ids
    const matchingStyleIds = Array.from(adsenseStyleIds).filter(id => googleAdsStyleIds.has(id));
    const missingInGoogleAds = Array.from(adsenseStyleIds).filter(id => !googleAdsStyleIds.has(id));
    const missingInAdSense = Array.from(googleAdsStyleIds).filter(id => !adsenseStyleIds.has(id));

    // Calculate revenue for matching vs missing style_ids
    let matchedRevenue = 0;
    let unmatchedRevenue = 0;

    for (const rev of adsenseRevenue) {
      if (googleAdsStyleIds.has(rev.style_id)) {
        matchedRevenue += rev.earnings;
      } else {
        unmatchedRevenue += rev.earnings;
      }
    }

    console.log('[DEBUG] Style ID Matching:');
    console.log(`  - Matching style_ids: ${matchingStyleIds.length} (revenue: $${matchedRevenue.toFixed(2)})`);
    console.log(`  - Missing in Google Ads: ${missingInGoogleAds.length} (lost revenue: $${unmatchedRevenue.toFixed(2)})`);
    console.log(`  - Missing in AdSense: ${missingInAdSense.length}`);

    // Sample URLs and extraction results
    const sampleUrls = googleAdsUrls.slice(0, 10).map(url => ({
      url,
      styleId: extractStyleIdFromUrl(url),
      domain: extractDomainFromUrl(url)
    }));

    // Sample AdSense revenue records
    const sampleRevenue = adsenseRevenue.slice(0, 10).map(rev => ({
      style_id: rev.style_id,
      domain: rev.domain_name,
      earnings: rev.earnings,
      clicks: rev.clicks,
      matched: googleAdsStyleIds.has(rev.style_id)
    }));

    return NextResponse.json({
      success: true,
      summary: {
        adsense: {
          totalRecords: adsenseRevenue.length,
          totalRevenue: totalAdsenseRevenue,
          uniqueStyleIds: adsenseStyleIds.size,
          uniqueDomains: adsenseDomains.size,
          uniquePairs: adsenseStyleDomainPairs.size
        },
        googleAds: {
          totalCampaigns: googleAdsData.campaigns.length,
          totalAds: googleAdsData.ads.length,
          totalUrls: googleAdsUrls.length,
          uniqueStyleIds: googleAdsStyleIds.size,
          uniqueDomains: googleAdsDomains.size,
          uniquePairs: googleAdsStyleDomainPairs.size,
          failedExtractions: failedExtractions.length
        },
        matching: {
          matchingStyleIds: matchingStyleIds.length,
          matchedRevenue: matchedRevenue,
          unmatchedRevenue: unmatchedRevenue,
          missingInGoogleAds: missingInGoogleAds.length,
          missingInAdSense: missingInAdSense.length
        }
      },
      details: {
        adsenseStyleIds: Array.from(adsenseStyleIds).slice(0, 20),
        googleAdsStyleIds: Array.from(googleAdsStyleIds).slice(0, 20),
        matchingStyleIds: matchingStyleIds.slice(0, 20),
        missingInGoogleAds: missingInGoogleAds.slice(0, 20),
        missingInAdSense: missingInAdSense.slice(0, 20),
        sampleUrls,
        sampleRevenue,
        failedExtractionSamples: failedExtractions.slice(0, 10)
      }
    });

  } catch (error) {
    console.error('[DEBUG] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    message: 'AdSense Revenue Debugging Endpoint',
    endpoint: '/api/debug-adsense-revenue',
    method: 'POST',
    requiredFields: ['startDate', 'endDate', 'adsenseAccountId', 'accountIds'],
    description: 'Diagnoses revenue allocation issues by comparing AdSense style_ids with Google Ads campaign style_ids'
  });
}
