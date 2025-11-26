import { NextRequest, NextResponse } from 'next/server';
import { bulletproofAPI } from '@/lib/bulletproof-google-ads-api';
import { extractStyleIdFromUrl, extractDomainFromUrl } from '@/lib/adsense-api';

/**
 * Diagnostic endpoint to find duplicate style_ids across AFS accounts
 */
export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, accountIds } = await request.json();

    console.log('[DUPLICATE_CHECKER] ===== STARTING DUPLICATE STYLE_ID AUDIT =====');
    console.log('[DUPLICATE_CHECKER] Checking accounts:', accountIds);

    // Fetch Google Ads data for all accounts
    const allAccountsData: any[] = [];

    for (const accId of accountIds || []) {
      const result = await bulletproofAPI.getData(startDate, endDate, accId, {
        priority: 8,
        allowStale: true,
        maxWait: 30000,
        feedType: 'adsense'
      });

      allAccountsData.push({
        accountId: accId,
        data: result.data
      });
    }

    // Build a map of style_id -> accounts using it
    const styleIdToAccounts = new Map<string, Set<string>>();
    const styleIdToCampaigns = new Map<string, any[]>();

    for (const accountData of allAccountsData) {
      const accountId = accountData.accountId;
      const ads = accountData.data?.ads || [];

      for (const ad of ads) {
        const finalUrls = ad.final_urls || [];

        for (const url of finalUrls) {
          const styleId = extractStyleIdFromUrl(url);
          const domain = extractDomainFromUrl(url);

          if (styleId) {
            // Track which accounts use this style_id
            if (!styleIdToAccounts.has(styleId)) {
              styleIdToAccounts.set(styleId, new Set());
            }
            styleIdToAccounts.get(styleId)!.add(accountId);

            // Track campaign details
            if (!styleIdToCampaigns.has(styleId)) {
              styleIdToCampaigns.set(styleId, []);
            }

            styleIdToCampaigns.get(styleId)!.push({
              accountId,
              campaignId: ad.campaign_id,
              campaignName: ad.campaign_name,
              adId: ad.ad_id,
              domain,
              url
            });
          }
        }
      }
    }

    // Find duplicates
    const duplicates: any[] = [];
    const unique: any[] = [];

    for (const [styleId, accounts] of styleIdToAccounts.entries()) {
      const accountsArray = Array.from(accounts);
      const campaigns = styleIdToCampaigns.get(styleId) || [];

      if (accountsArray.length > 1) {
        // DUPLICATE - multiple accounts use this style_id
        duplicates.push({
          styleId,
          accountCount: accountsArray.length,
          accounts: accountsArray,
          campaigns,
          severity: 'HIGH' // This will inflate revenue
        });
      } else {
        // Unique - only one account uses this
        unique.push({
          styleId,
          account: accountsArray[0],
          campaignCount: campaigns.length
        });
      }
    }

    // Sort duplicates by number of accounts (worst offenders first)
    duplicates.sort((a, b) => b.accountCount - a.accountCount);

    console.log('[DUPLICATE_CHECKER] ===== AUDIT COMPLETE =====');
    console.log(`[DUPLICATE_CHECKER] Found ${duplicates.length} DUPLICATE style_ids`);
    console.log(`[DUPLICATE_CHECKER] Found ${unique.length} UNIQUE style_ids`);

    if (duplicates.length > 0) {
      console.log('[DUPLICATE_CHECKER] ⚠️  TOP 5 DUPLICATES:');
      duplicates.slice(0, 5).forEach((dup, idx) => {
        console.log(`  ${idx + 1}. Style ${dup.styleId} used by ${dup.accountCount} accounts: ${dup.accounts.join(', ')}`);
      });
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalStyleIds: styleIdToAccounts.size,
        duplicateStyleIds: duplicates.length,
        uniqueStyleIds: unique.length,
        accountsChecked: accountIds.length
      },
      duplicates: duplicates.map(d => ({
        styleId: d.styleId,
        accountCount: d.accountCount,
        accounts: d.accounts,
        severity: d.severity,
        campaigns: d.campaigns.map((c: any) => ({
          accountId: c.accountId,
          campaignName: c.campaignName,
          domain: c.domain
        }))
      })),
      unique: unique.slice(0, 20), // Return first 20 unique for reference
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[DUPLICATE_CHECKER] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    message: 'Duplicate Style ID Checker',
    endpoint: '/api/find-duplicate-style-ids',
    method: 'POST',
    requiredFields: ['startDate', 'endDate', 'accountIds'],
    description: 'Finds style_ids that are used by multiple Google Ads accounts, causing revenue inflation'
  });
}
