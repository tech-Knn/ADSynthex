import { NextRequest, NextResponse } from 'next/server';
import { POST as adsenseCostRevenuePOST } from '@/app/api/adsense-cost-revenue/route';

// Same 18 AA accounts the dashboard sends in app/androidadvice/page.tsx.
const AA_ACCOUNT_IDS = [
  '8701280199', '3765399744', '3617356950', '4932880256', '3764963776',
  '4702286319', '8182947427', '7423206633', '7753453760', '9785664835',
  '5418244007', '1223790856', '7416756000', '2039691127', '5193468964',
  '4457984442', '9220539746', '8693469647',
];

function todayUTC(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

async function authorize(request: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server' }, { status: 500 });
  }
  const header = request.headers.get('authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const ok =
    header === `Bearer ${expected}` ||
    querySecret === expected;
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

// Warm the aggregated Redis cache the /androidadvice dashboard reads
// (androidadvice_aggregated:<ids>:<pubId>:<start>:<end>) by invoking the same
// route handler the browser calls, but server-side so it bypasses cookie auth.
// Runs on a Render cron every ~12 min so the cache is always within the 15-min
// freshness window.
async function warmRange(startDate: string, endDate: string) {
  const payload = {
    startDate,
    endDate,
    adsenseAccountType: 'androidadvice',
    accountIds: AA_ACCOUNT_IDS,
    forceLive: false,
  };

  const innerReq = new NextRequest('http://internal/api/adsense-cost-revenue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const started = Date.now();
  const res = await adsenseCostRevenuePOST(innerReq);
  const ms = Date.now() - started;

  let source = 'unknown';
  let totalRevenue: number | undefined;
  let totalCost: number | undefined;
  try {
    const body: any = await res.clone().json();
    source = body?._source ?? 'unknown';
    totalRevenue = body?.summary?.totalRevenue;
    totalCost = body?.summary?.totalCost;
  } catch { /* body may be non-JSON on error */ }

  return { startDate, endDate, status: res.status, ms, source, totalRevenue, totalCost };
}

export async function POST(request: NextRequest) {
  const authFail = await authorize(request);
  if (authFail) return authFail;

  const today = todayUTC();
  try {
    const result = await warmRange(today, today);
    return NextResponse.json({ ok: true, warmed: [result], at: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'unknown', at: new Date().toISOString() },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
