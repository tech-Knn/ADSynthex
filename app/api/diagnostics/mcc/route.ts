import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { MCC_CONFIGS, getAccountsByMCC } from '@/lib/mcc-config';
import { getCustomerForAccount } from '@/lib/google-ads-api';

/**
 * Validate every configured MCC's Google Ads credentials by issuing a
 * tiny query against the MCC itself. Reports per-MCC whether the auth
 * works and, if not, the real Google Ads error.
 */
export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const results: Array<{
    mccKey: string;
    name: string;
    mccId: string;
    envVarsSet: Record<string, boolean>;
    sampleAccountCid: string | null;
    status: 'ok' | 'error';
    error?: string;
    rowCount?: number;
    ms: number;
  }> = [];

  for (const [mccKey, creds] of Object.entries(MCC_CONFIGS)) {
    const t0 = Date.now();
    const envVarsSet = {
      mccId: !!creds.mccId,
      clientId: !!creds.googleAds.clientId,
      clientSecret: !!creds.googleAds.clientSecret,
      developerToken: !!creds.googleAds.developerToken,
      refreshToken: !!creds.googleAds.refreshToken,
    };
    const sampleAccountCid = getAccountsByMCC(mccKey as any)[0] || null;

    if (!sampleAccountCid) {
      results.push({
        mccKey, name: creds.name, mccId: creds.mccId, envVarsSet,
        sampleAccountCid: null, status: 'error',
        error: 'no accounts mapped to this MCC in lib/mcc-config.ts',
        ms: Date.now() - t0,
      });
      continue;
    }

    const missing = Object.entries(envVarsSet).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length > 0) {
      results.push({
        mccKey, name: creds.name, mccId: creds.mccId, envVarsSet,
        sampleAccountCid, status: 'error',
        error: `missing env vars: ${missing.join(', ')}`,
        ms: Date.now() - t0,
      });
      continue;
    }

    try {
      const customer = getCustomerForAccount(sampleAccountCid);
      // Smallest possible query — just name of the customer we're authed as.
      const rows = await customer.query('SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1');
      results.push({
        mccKey, name: creds.name, mccId: creds.mccId, envVarsSet,
        sampleAccountCid, status: 'ok', rowCount: rows?.length ?? 0,
        ms: Date.now() - t0,
      });
    } catch (err: any) {
      const errs = err?.errors || err?.failure?.errors;
      const first = Array.isArray(errs) ? errs[0] : null;
      const detail = first?.message
        ? `${first.message} ${first.error_code ? JSON.stringify(first.error_code) : ''}`.trim()
        : (err?.message || String(err));
      results.push({
        mccKey, name: creds.name, mccId: creds.mccId, envVarsSet,
        sampleAccountCid, status: 'error', error: detail,
        ms: Date.now() - t0,
      });
    }
  }

  return NextResponse.json({ results });
}
