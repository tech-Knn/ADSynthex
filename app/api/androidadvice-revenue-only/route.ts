// Fast diagnostic: AndroidAdvice revenue ONLY (no Google Ads cost queries).
// Bypasses the slow cost-aggregation path so the team has a reliable revenue
// number while we debug per-account cost gaps.
//
// Auth: admin cookie (auth_type=admin) OR ?secret=<CRON_SECRET>.
//
// Usage:
//   GET /api/androidadvice-revenue-only                       (today, admin cookie)
//   GET /api/androidadvice-revenue-only?date=2026-06-17       (specific date)
//   GET /api/androidadvice-revenue-only?startDate=2026-06-01&endDate=2026-06-17
//   GET /api/androidadvice-revenue-only?secret=<CRON_SECRET>  (from curl)
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { fetchAdSenseDomainEarnings } from '@/lib/adsense-api';

function isAuthorized(request: NextRequest): boolean {
    const secret = new URL(request.url).searchParams.get('secret');
    if (secret && secret === process.env.CRON_SECRET) return true;
    const authType = cookies().get('auth_type')?.value;
    return authType === 'admin';
}

function todayDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();

    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const publisherId = process.env.ANDROIDADVICE_PUBLISHER_ID;
    if (!publisherId) {
        return NextResponse.json({
            error: 'Server misconfiguration',
            message: 'ANDROIDADVICE_PUBLISHER_ID env var is not set',
        }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const startDate = searchParams.get('startDate') || dateParam || todayDateString();
    const endDate = searchParams.get('endDate') || dateParam || todayDateString();

    try {
        const domainEarnings = await fetchAdSenseDomainEarnings(
            publisherId,
            startDate,
            endDate,
            undefined,
            'androidadvice'
        );

        const revenue = domainEarnings['androidadvices.com'] ?? 0;
        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            ok: true,
            feed: 'androidadvice',
            dateRange: { startDate, endDate },
            revenue: Number(revenue.toFixed(2)),
            domain: 'androidadvices.com',
            allDomainBreakdown: domainEarnings,
            _loadTimeMs: elapsed,
            _source: 'adsense_domain_earnings_direct',
        });
    } catch (err: any) {
        console.error('[AA_REVENUE_ONLY] AdSense fetch failed:', err?.message);
        return NextResponse.json({
            error: 'AdSense fetch failed',
            message: err?.message || 'Unknown error',
            _loadTimeMs: Date.now() - startTime,
        }, { status: 502 });
    }
}
