import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { FEED_TO_MCC, MCC_CONFIGS, registerAccountMCC } from '@/lib/mcc-config';
import { getCustomerForAccount } from '@/lib/google-ads-api';

/**
 * Probe daily spend for a cid using a specific feed's MCC credentials.
 * Used to verify ingestion is wired correctly for a brand-new account
 * before it's inserted into the accounts table.
 *
 *   GET /api/accounts/spend-probe?cid=XXX&feed=founderzest&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Defaults: startDate = today - 2, endDate = today.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const cid = searchParams.get('cid') || '';
  const feed = (searchParams.get('feed') || '').trim();
  if (!/^\d{10}$/.test(cid) || !feed) {
    return NextResponse.json({ error: 'cid (10 digits) and feed required' }, { status: 400 });
  }

  const mccKey = FEED_TO_MCC[feed];
  if (!mccKey) return NextResponse.json({ error: `unknown feed "${feed}"` }, { status: 400 });
  const creds = MCC_CONFIGS[mccKey];
  const missing: string[] = [];
  if (!creds.mccId) missing.push('mccId');
  if (!creds.googleAds.clientId) missing.push('clientId');
  if (!creds.googleAds.clientSecret) missing.push('clientSecret');
  if (!creds.googleAds.developerToken) missing.push('developerToken');
  if (!creds.googleAds.refreshToken) missing.push('refreshToken');
  if (missing.length > 0) {
    return NextResponse.json({ error: `missing env vars for MCC "${mccKey}": ${missing.join(', ')}` }, { status: 500 });
  }
  registerAccountMCC(cid, mccKey);

  const todayStr = iso(new Date());
  const defaultStart = iso(new Date(Date.now() - 2 * 86400000));
  const startDate = (searchParams.get('startDate') || defaultStart).trim();
  const endDate = (searchParams.get('endDate') || todayStr).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: 'startDate/endDate must be YYYY-MM-DD' }, { status: 400 });
  }

  const t0 = Date.now();
  try {
    const customer = getCustomerForAccount(cid);
    const rows = await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions
      FROM customer
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ORDER BY segments.date ASC
    `);

    type Day = { date: string; cost: number; clicks: number; impressions: number; conversions: number };
    const perDay: Day[] = (rows || []).map((r: any) => ({
      date: r.segments?.date,
      cost: Number(r.metrics?.cost_micros ?? 0) / 1_000_000,
      clicks: Number(r.metrics?.clicks ?? 0),
      impressions: Number(r.metrics?.impressions ?? 0),
      conversions: Number(r.metrics?.conversions ?? 0),
    }));

    const totals = perDay.reduce(
      (acc, d) => {
        acc.cost += d.cost; acc.clicks += d.clicks;
        acc.impressions += d.impressions; acc.conversions += d.conversions;
        return acc;
      },
      { cost: 0, clicks: 0, impressions: 0, conversions: 0 },
    );

    // Customer details so admin can confirm it's the right account
    const customerRows = await customer.query(
      'SELECT customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1',
    );
    const customerInfo = customerRows?.[0]?.customer;

    return NextResponse.json({
      ok: true,
      cid,
      feed,
      mccKey,
      customer: {
        name: customerInfo?.descriptive_name || null,
        currency: customerInfo?.currency_code || null,
        timeZone: customerInfo?.time_zone || null,
        status: customerInfo?.status ?? null,
      },
      range: { startDate, endDate },
      totals,
      perDay,
      ms: Date.now() - t0,
    });
  } catch (err: any) {
    const errs = err?.errors || err?.failure?.errors;
    const first = Array.isArray(errs) ? errs[0] : null;
    const detail = first?.message
      ? `${first.message} ${first.error_code ? JSON.stringify(first.error_code) : ''}`.trim()
      : (err?.message || String(err));
    return NextResponse.json({ ok: false, cid, feed, mccKey, error: detail, ms: Date.now() - t0 });
  }
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
