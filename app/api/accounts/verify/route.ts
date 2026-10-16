import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { MCC_CONFIGS, FEED_TO_MCC, registerAccountMCC } from '@/lib/mcc-config';
import { getCustomerForAccount } from '@/lib/google-ads-api';

/**
 * Probe a (cid, feed) combo against Google Ads before we actually create
 * the account row. Lets admins catch wrong feed / dead cid / missing
 * linkage issues in the UI instead of 24h later via sync failure.
 *
 * Body: { cid: string, feed: string }
 * Returns: { ok, customerName, customerStatus, mccKey, error }
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  let body: { cid?: string; feed?: string } = {};
  try { body = await req.json(); } catch { /* fall through */ }
  const { cid, feed } = body;
  if (!cid || !/^\d{10}$/.test(cid)) {
    return NextResponse.json({ ok: false, error: 'cid must be a 10-digit number' }, { status: 400 });
  }
  if (!feed) {
    return NextResponse.json({ ok: false, error: 'feed required' }, { status: 400 });
  }

  const mccKey = FEED_TO_MCC[feed];
  if (!mccKey) {
    return NextResponse.json(
      { ok: false, error: `unknown feed "${feed}" — not in FEED_TO_MCC` },
      { status: 400 },
    );
  }
  const creds = MCC_CONFIGS[mccKey];
  const missing: string[] = [];
  if (!creds.mccId) missing.push('mccId');
  if (!creds.googleAds.clientId) missing.push('clientId');
  if (!creds.googleAds.clientSecret) missing.push('clientSecret');
  if (!creds.googleAds.developerToken) missing.push('developerToken');
  if (!creds.googleAds.refreshToken) missing.push('refreshToken');
  if (missing.length > 0) {
    return NextResponse.json({
      ok: false, mccKey,
      error: `missing env vars for MCC "${mccKey}": ${missing.join(', ')}`,
    }, { status: 500 });
  }

  // Pre-register so getCustomerForAccount routes the probe through the
  // right MCC credentials even though the DB row doesn't exist yet.
  registerAccountMCC(cid, mccKey);

  const t0 = Date.now();
  try {
    const customer = getCustomerForAccount(cid);
    const rows = await customer.query(
      'SELECT customer.id, customer.descriptive_name, customer.status, customer.currency_code, customer.time_zone FROM customer LIMIT 1',
    );
    const row = rows?.[0]?.customer;
    return NextResponse.json({
      ok: true,
      mccKey,
      cid,
      customerName: row?.descriptive_name || null,
      customerStatus: row?.status ?? null,
      currencyCode: row?.currency_code || null,
      timeZone: row?.time_zone || null,
      ms: Date.now() - t0,
    });
  } catch (err: any) {
    const errs = err?.errors || err?.failure?.errors;
    const first = Array.isArray(errs) ? errs[0] : null;
    const detail = first?.message
      ? `${first.message} ${first.error_code ? JSON.stringify(first.error_code) : ''}`.trim()
      : (err?.message || String(err));
    return NextResponse.json({
      ok: false,
      mccKey,
      cid,
      error: detail,
      ms: Date.now() - t0,
    });
  }
}
