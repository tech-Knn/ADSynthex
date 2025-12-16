import { NextRequest, NextResponse } from 'next/server';
import { getAdSenseAccounts } from '@/lib/adsense-api';

export async function GET(request: NextRequest) {
  try {
    const accounts = await getAdSenseAccounts();

    return NextResponse.json({
      accounts,
      total: accounts.length
    });
  } catch (error: any) {
    console.error('[ADSENSE_ACCOUNTS_API] Error:', error.message);

    return NextResponse.json({
      error: 'Failed to fetch AdSense accounts',
      message: error.message
    }, { status: 500 });
  }
}
