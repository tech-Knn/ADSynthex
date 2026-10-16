import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { MCC_CONFIGS, getAccountsByMCC } from '@/lib/mcc-config';
import { getCustomerForAccount } from '@/lib/google-ads-api';

/**
 * Validate every configured MCC's Google Ads credentials by issuing a
 * tiny query against each mapped account. Reports per-account pass/fail.
 *
 *   /api/diagnostics/mcc          → test every account under every MCC
 *   /api/diagnostics/mcc?mcc=X    → test only MCC key X
 *   /api/diagnostics/mcc?summary  → first-account-only (fast, old shape)
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const mccFilter = searchParams.get('mcc');
  const summaryOnly = searchParams.has('summary');

  const results: any[] = [];

  for (const [mccKey, creds] of Object.entries(MCC_CONFIGS)) {
    if (mccFilter && mccFilter !== mccKey) continue;

    const envVarsSet = {
      mccId: !!creds.mccId,
      clientId: !!creds.googleAds.clientId,
      clientSecret: !!creds.googleAds.clientSecret,
      developerToken: !!creds.googleAds.developerToken,
      refreshToken: !!creds.googleAds.refreshToken,
    };
    const accountCids = getAccountsByMCC(mccKey as any);
    const missing = Object.entries(envVarsSet).filter(([, v]) => !v).map(([k]) => k);

    const base: any = {
      mccKey, name: creds.name, mccId: creds.mccId, envVarsSet,
      accountCount: accountCids.length,
    };

    if (accountCids.length === 0) {
      results.push({ ...base, status: 'error', error: 'no accounts mapped to this MCC in lib/mcc-config.ts' });
      continue;
    }
    if (missing.length > 0) {
      results.push({ ...base, status: 'error', error: `missing env vars: ${missing.join(', ')}` });
      continue;
    }

    const targets = summaryOnly ? accountCids.slice(0, 1) : accountCids;
    const t0 = Date.now();

    const perAccount = await Promise.all(targets.map(async (cid) => {
      const a0 = Date.now();
      try {
        const customer = getCustomerForAccount(cid);
        const rows = await customer.query('SELECT customer.id, customer.descriptive_name, customer.status FROM customer LIMIT 1');
        const row = rows?.[0];
        return {
          cid,
          status: 'ok' as const,
          customerName: row?.customer?.descriptive_name || null,
          customerStatus: row?.customer?.status ?? null,
          ms: Date.now() - a0,
        };
      } catch (err: any) {
        const errs = err?.errors || err?.failure?.errors;
        const first = Array.isArray(errs) ? errs[0] : null;
        const detail = first?.message
          ? `${first.message} ${first.error_code ? JSON.stringify(first.error_code) : ''}`.trim()
          : (err?.message || String(err));
        return { cid, status: 'error' as const, error: detail, ms: Date.now() - a0 };
      }
    }));

    const okCount = perAccount.filter((a) => a.status === 'ok').length;
    const errCount = perAccount.length - okCount;
    const uniqueErrors = Array.from(new Set(perAccount.filter((a) => a.status === 'error').map((a: any) => a.error)));

    results.push({
      ...base,
      status: okCount > 0 ? 'ok' : 'error',
      tested: perAccount.length,
      ok: okCount,
      failed: errCount,
      uniqueErrorMessages: uniqueErrors,
      ms: Date.now() - t0,
      accounts: perAccount,
    });
  }

  return NextResponse.json({ results });
}
