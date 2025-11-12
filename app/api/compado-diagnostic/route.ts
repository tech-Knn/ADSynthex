import { NextRequest, NextResponse } from 'next/server';
import { fetchAllCompadoConversions } from '@/lib/compado-api';
import { getAccountsByFeed } from '@/lib/google-ads-api';
import { fetchLiveGoogleAdsData } from '@/lib/google-ads-api';
import { getExchangeRate } from '@/lib/currency-service';

/**
 * Diagnostic endpoint to compare Compado revenue with dashboard calculations
 * Usage: GET /api/compado-diagnostic?start_date=2025-11-01&end_date=2025-11-01&customerId=1671699399
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || startDate;
    const customerId = searchParams.get('customerId');

    console.log(`[COMPADO_DIAGNOSTIC] Starting diagnostic for ${startDate} to ${endDate}${customerId ? ` (Account: ${customerId})` : ' (ALL ACCOUNTS)'}`);

    // 1. Get current exchange rate
    const exchangeRate = await getExchangeRate();

    // 2. Fetch raw Compado data (unfiltered)
    const allCompadoConversions = await fetchAllCompadoConversions(startDate, endDate);

    // Calculate totals from ALL Compado data
    const totalAllConversions = allCompadoConversions.length;
    const totalAllRevenueEur = allCompadoConversions.reduce((sum, c) => sum + c.revenue, 0);
    const totalAllRevenueUsd = allCompadoConversions.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);

    // 3. Fetch Google Ads data to get GCLIDs
    const accounts = customerId
      ? [{ id: customerId, name: `Account ${customerId}` }]
      : getAccountsByFeed('compado');

    const accountReports = [];

    for (const account of accounts) {
      try {
        const googleAdsData = await fetchLiveGoogleAdsData(account.id, startDate, endDate, 'compado');

        // Build GCLID set from Google Ads clicks
        const googleAdsGclids = new Set(
          (googleAdsData?.clicks || []).map((click: any) => click.gclid.toLowerCase().trim())
        );

        // Filter Compado conversions for this account
        const accountCompadoConversions = allCompadoConversions.filter(conv =>
          googleAdsGclids.has(conv.gclid.toLowerCase().trim())
        );

        // Calculate filtered totals
        const filteredConversions = accountCompadoConversions.length;
        const filteredRevenueEur = accountCompadoConversions.reduce((sum, c) => sum + c.revenue, 0);
        const filteredRevenueUsd = accountCompadoConversions.reduce((sum, c) => sum + (c.revenueUsd || 0), 0);

        // Calculate what was filtered out
        const unfilteredForAccount = allCompadoConversions.length;
        const filteredOut = unfilteredForAccount - filteredConversions;
        const revenueLostEur = totalAllRevenueEur - filteredRevenueEur;
        const revenueLostUsd = totalAllRevenueUsd - filteredRevenueUsd;

        accountReports.push({
          accountId: account.id,
          accountName: account.name || `Account ${account.id}`,
          googleAdsGclids: googleAdsGclids.size,
          compado: {
            totalConversions: unfilteredForAccount,
            matchedConversions: filteredConversions,
            unmatchedConversions: filteredOut,
            matchRate: unfilteredForAccount > 0 ? (filteredConversions / unfilteredForAccount * 100).toFixed(1) + '%' : 'N/A'
          },
          revenue: {
            totalRevenueEur: totalAllRevenueEur.toFixed(2),
            totalRevenueUsd: totalAllRevenueUsd.toFixed(2),
            filteredRevenueEur: filteredRevenueEur.toFixed(2),
            filteredRevenueUsd: filteredRevenueUsd.toFixed(2),
            revenueLostEur: revenueLostEur.toFixed(2),
            revenueLostUsd: revenueLostUsd.toFixed(2),
            percentageLost: totalAllRevenueUsd > 0 ? ((revenueLostUsd / totalAllRevenueUsd) * 100).toFixed(1) + '%' : '0%'
          }
        });
      } catch (error: any) {
        accountReports.push({
          accountId: account.id,
          accountName: account.name || `Account ${account.id}`,
          error: error.message
        });
      }
    }

    // 4. Calculate aggregate totals
    const aggregateFiltered = {
      conversions: accountReports.reduce((sum, r) => sum + (r.compado?.matchedConversions || 0), 0),
      revenueEur: accountReports.reduce((sum, r) => {
        const val = r.revenue?.filteredRevenueEur;
        return sum + (val ? parseFloat(val) : 0);
      }, 0),
      revenueUsd: accountReports.reduce((sum, r) => {
        const val = r.revenue?.filteredRevenueUsd;
        return sum + (val ? parseFloat(val) : 0);
      }, 0)
    };

    // 5. Prepare response
    const diagnostic = {
      dateRange: {
        start: startDate,
        end: endDate
      },
      exchangeRate: {
        rate: exchangeRate,
        source: 'Live API',
        timestamp: new Date().toISOString()
      },
      compadoAPI: {
        description: 'Raw data from Compado API (what you see in Postman)',
        totalConversions: totalAllConversions,
        totalRevenueEur: totalAllRevenueEur.toFixed(2),
        totalRevenueUsd: totalAllRevenueUsd.toFixed(2),
        calculatedUsdFromEur: (totalAllRevenueEur * exchangeRate).toFixed(2)
      },
      dashboard: {
        description: 'After GCLID filtering (what dashboard shows)',
        totalConversionsMatched: aggregateFiltered.conversions,
        totalRevenueEur: aggregateFiltered.revenueEur.toFixed(2),
        totalRevenueUsd: aggregateFiltered.revenueUsd.toFixed(2)
      },
      discrepancy: {
        conversionsFiltered: totalAllConversions - aggregateFiltered.conversions,
        revenueFilteredEur: (totalAllRevenueEur - aggregateFiltered.revenueEur).toFixed(2),
        revenueFilteredUsd: (totalAllRevenueUsd - aggregateFiltered.revenueUsd).toFixed(2),
        percentageLost: totalAllRevenueUsd > 0
          ? (((totalAllRevenueUsd - aggregateFiltered.revenueUsd) / totalAllRevenueUsd) * 100).toFixed(1) + '%'
          : '0%'
      },
      accountBreakdown: accountReports,
      explanation: {
        whyDiscrepancy: 'The dashboard filters conversions to only show those with GCLIDs matching Google Ads clicks from the SAME date range. This prevents showing revenue from other accounts\' traffic.',
        commonReasons: [
          '1. Attribution Window: Clicks happened BEFORE your selected date range but conversions happened DURING it',
          '2. Cross-Account Traffic: Conversions from different Google Ads accounts',
          '3. Data Quality: Invalid, missing, or placeholder GCLIDs in Compado data',
          '4. GCLID Format Issues: Case sensitivity or special character mismatches (now fixed with normalization)'
        ],
        howToFixForAnyDateRange: [
          '1. Query WIDER date ranges: Include 7-30 days before your conversion date to capture historical clicks',
          '2. Use monthly ranges instead of daily: Query full months (e.g., 2025-11-01 to 2025-11-30) to capture more attribution',
          '3. Check filtered-out GCLIDs in logs: Server logs show which specific GCLIDs are missing and their revenue'
        ],
        currentBehavior: 'Dashboard shows revenue only from conversions with matching GCLIDs in the same date range. This ensures accurate account-level filtering but may exclude conversions with older clicks.'
      }
    };

    return NextResponse.json(diagnostic, { status: 200 });

  } catch (error: any) {
    console.error('[COMPADO_DIAGNOSTIC] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate diagnostic report',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
