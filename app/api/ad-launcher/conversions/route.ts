import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getCustomerForAccount } from '@/lib/google-ads-api';
import { resolveMccKeyForFeed, registerAccountMCC } from '@/lib/mcc-config';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const account = new URL(req.url).searchParams.get('account');
  if (!account) return NextResponse.json({ error: 'account required' }, { status: 400 });

  try {
    // DB-driven MCC: resolve this account's MCC from its feed and register it,
    // so getCustomerForAccount() picks the correct login-customer-id.
    const acct = await prisma.account.findUnique({ where: { cid: account }, select: { feedName: true } });
    const mccKey = resolveMccKeyForFeed(acct?.feedName);
    if (mccKey) registerAccountMCC(account, mccKey);

    const customer = getCustomerForAccount(account);
    const rows = await customer.query(`
      SELECT conversion_action.id, conversion_action.name, conversion_action.category, conversion_action.status
      FROM conversion_action
      WHERE conversion_action.status = 'ENABLED'
      ORDER BY conversion_action.name
    `);
    const conversions = (rows || []).map((r: any) => ({
      id: String(r.conversion_action?.id || ''),
      name: r.conversion_action?.name || '',
      category: r.conversion_action?.category || '',
    }));
    return NextResponse.json({ conversions });
  } catch (e: any) {
    const errs = e?.errors || e?.failure?.errors;
    const detail = Array.isArray(errs) && errs[0]?.message ? errs[0].message : (e?.message || 'Unknown error');
    console.warn('[ad-launcher/conversions] failed:', detail);
    return NextResponse.json({ conversions: [], error: detail });
  }
}