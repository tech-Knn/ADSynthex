import { NextResponse } from 'next/server';
import { getAdSenseAccounts } from '@/lib/adsense-api';
import { MCC_CONFIGS, getAccountsByMCC } from '@/lib/mcc-config';

export async function GET() {
  try {
    const allAccounts: any[] = [];

    // 1. Fetch AFS AdSense accounts from PRIMARY MCC only
    // Secondary MCC is not in use — all cost data comes from primary MCC
    const primaryMCC = MCC_CONFIGS.primary;
    if (primaryMCC.adSense?.refreshToken || primaryMCC.googleAds?.refreshToken) {
      try {
        const accountIds = getAccountsByMCC('primary');
        const sampleAccountId = accountIds[0];
        const accounts = await getAdSenseAccounts(sampleAccountId, 'afs');
        allAccounts.push(...accounts.map(acc => ({ ...acc, type: 'afs', mcc: 'primary' })));
        console.log(`[ADSENSE_ACCOUNTS_API] Fetched ${accounts.length} AFS accounts from primary MCC`);
      } catch (err: any) {
        console.warn(`[ADSENSE_ACCOUNTS_API] Failed to fetch AFS accounts: ${err.message}. Using fallback hardcoded accounts.`);
        // Fallback for AFS to ensure Dashboard works even if API token fails in production
        allAccounts.push({
          name: 'accounts/pub-6567805284657549',
          displayName: 'Oarex Funding LLC',
          state: 'READY',
          type: 'afs',
          mcc: 'primary'
        });
      }
    }

    // 2. Fetch CARHP AdSense account (separate AdSense publisher, same primary MCC for cost)
    if (process.env.CARHP_ADSENSE_REFRESH_TOKEN) {
      try {
        const carhpAccounts = await getAdSenseAccounts(undefined, 'carhp');
        allAccounts.push(...carhpAccounts.map(acc => ({ ...acc, type: 'carhp', mcc: 'primary' })));
        console.log(`[ADSENSE_ACCOUNTS_API] Fetched ${carhpAccounts.length} CARHP AdSense accounts`);
      } catch (err) {
        console.warn('[ADSENSE_ACCOUNTS_API] Failed to fetch CARHP accounts:', err);
      }
    }

    console.log(`[ADSENSE_ACCOUNTS_API] Total: ${allAccounts.length} accounts (AFS: ${allAccounts.filter(a => a.type === 'afs').length}, CARHP: ${allAccounts.filter(a => a.type === 'carhp').length})`);

    return NextResponse.json({
      accounts: allAccounts,
      total: allAccounts.length,
      breakdown: {
        afs: allAccounts.filter(a => a.type === 'afs').length,
        carhp: allAccounts.filter(a => a.type === 'carhp').length
      }
    });
  } catch (error: any) {
    console.error('[ADSENSE_ACCOUNTS_API] Error:', error.message);
    return NextResponse.json({
      error: 'Failed to fetch AdSense accounts',
      message: error.message
    }, { status: 500 });
  }
}
