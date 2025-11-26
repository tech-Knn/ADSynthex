import { NextResponse } from 'next/server';
import { currencyService } from '@/lib/currency-service';

export async function POST() {
  try {
    const result = await currencyService.forceRefresh();
    const cacheStatus = await currencyService.getCacheStatus();

    return NextResponse.json({
      success: result.success,
      rate: result.rate,
      source: result.source,
      message: result.success
        ? `ECB: 1 EUR = ${result.rate} USD`
        : `Fallback: 1 EUR = ${result.rate} USD`,
      error: result.error || null,
      cache: cacheStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const rate = await currencyService.getEurToUsdRate();
    const cacheStatus = await currencyService.getCacheStatus();

    return NextResponse.json({
      success: true,
      currentRate: rate,
      cache: cacheStatus,
      timestamp: new Date().toISOString(),
      message: `1 EUR = ${rate} USD`,
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
