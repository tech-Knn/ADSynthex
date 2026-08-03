import { NextRequest, NextResponse } from 'next/server';
import { syncIncremental } from '@/lib/sync-incremental';
import { syncRange } from '@/lib/sync';
import { prisma } from '@/lib/prisma';

export const maxDuration = 300; // lamba job hai

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') || '';
  return header === `Bearer ${secret}`;
}

/**
 * POST /api/sync
 *   body (optional): { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
 *   body na do  -> incremental (dates khud nikalti hain) — cron ke liye
 */
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body = incremental */ }

    const { startDate, endDate, accountIds } = body || {};

    const result = startDate && endDate
      ? await syncRange(startDate, endDate, accountIds)   // manual backfill
      : await syncIncremental();                          // cron

    return NextResponse.json({
      success: result.errors.length === 0,
      mode: startDate && endDate ? 'manual' : 'incremental',
      ...result,
      _tookMs: Date.now() - t0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: String(err?.message || err), _tookMs: Date.now() - t0 },
      { status: 500 }
    );
  }
}

/** GET /api/sync — status dekhne ke liye (secret nahi chahiye) */
export async function GET() {
  const state = await prisma.syncState.findUnique({ where: { feedName: 'androidadvice' } });
  const [ads, adsense] = await Promise.all([
    prisma.adsDaily.count(),
    prisma.adsenseDaily.count(),
  ]);

  return NextResponse.json({
    lastSyncedDate: state?.lastSyncedDate ?? null,
    lastRunAt: state?.lastRunAt ?? null,
    status: state?.status ?? 'never_run',
    message: state?.message ?? null,
    rows: { ads_daily: ads, adsense_daily: adsense },
  });
}
