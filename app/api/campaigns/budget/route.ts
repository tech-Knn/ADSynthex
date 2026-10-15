import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getCustomerForAccount } from '@/lib/google-ads-api';

const MIN_BUDGET_USD = 1;
const MAX_BUDGET_USD = 10000;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const accountCid = searchParams.get('accountCid');
  const campaignId = searchParams.get('campaignId');
  if (!accountCid || !campaignId) {
    return NextResponse.json({ error: 'accountCid and campaignId required' }, { status: 400 });
  }

  const allowed = await getAccountsForUser(session.userId, session.role);
  if (!allowed.includes(accountCid)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const current = await fetchCurrentBudget(accountCid, campaignId);
    if (!current) return NextResponse.json({ error: 'campaign not found on Google Ads' }, { status: 404 });
    return NextResponse.json(current);
  } catch (err: any) {
    console.error('[campaigns/budget GET] failed', { accountCid, campaignId, err: err?.message || String(err) });
    return NextResponse.json({ error: err?.message || 'Google Ads read failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: { accountCid?: string; campaignId?: string; dailyBudget?: number } = {};
  try { body = await req.json(); } catch { /* fall through */ }
  const { accountCid, campaignId, dailyBudget } = body;

  if (!accountCid || !campaignId || typeof dailyBudget !== 'number') {
    return NextResponse.json({ error: 'accountCid, campaignId, dailyBudget required' }, { status: 400 });
  }
  if (!isFinite(dailyBudget) || dailyBudget < MIN_BUDGET_USD || dailyBudget > MAX_BUDGET_USD) {
    return NextResponse.json(
      { error: `dailyBudget must be between $${MIN_BUDGET_USD} and $${MAX_BUDGET_USD}` },
      { status: 400 },
    );
  }

  const allowed = await getAccountsForUser(session.userId, session.role);
  if (!allowed.includes(accountCid)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const t0 = Date.now();
  try {
    const current = await fetchCurrentBudget(accountCid, campaignId);
    if (!current) return NextResponse.json({ error: 'campaign not found on Google Ads' }, { status: 404 });

    const customer = getCustomerForAccount(accountCid);
    const newAmountMicros = Math.round(dailyBudget * 1_000_000);

    const mutate = customer.campaignBudgets.update([{
      resource_name: current.budgetResourceName,
      amount_micros: newAmountMicros,
    }]);

    await Promise.race([
      mutate,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Google Ads budget mutation timed out after 25s')), 25000)),
    ]);
    console.log('[campaigns/budget POST] ok', { accountCid, campaignId, dailyBudget, ms: Date.now() - t0 });
    return NextResponse.json({ ok: true, accountCid, campaignId, dailyBudget, isShared: current.isShared });
  } catch (err: any) {
    console.error('[campaigns/budget POST] failed', {
      accountCid, campaignId, dailyBudget, ms: Date.now() - t0,
      err: err?.message || String(err),
      errors: err?.errors || err?.failure?.errors,
    });
    const details = err?.errors?.[0]?.message || err?.failure?.errors?.[0]?.message || err?.message;
    return NextResponse.json({ error: details || 'Google Ads update failed' }, { status: 500 });
  }
}

async function fetchCurrentBudget(accountCid: string, campaignId: string) {
  const customer = getCustomerForAccount(accountCid);
  const rows = await customer.query(`
    SELECT
      campaign.id,
      campaign.campaign_budget,
      campaign_budget.resource_name,
      campaign_budget.amount_micros,
      campaign_budget.name,
      campaign_budget.explicitly_shared
    FROM campaign
    WHERE campaign.id = ${campaignId}
    LIMIT 1
  `);
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const budget = row.campaign_budget;
  const amountMicros = Number(budget?.amount_micros ?? 0);
  return {
    budgetResourceName: budget?.resource_name as string,
    budgetName: (budget?.name as string) || null,
    dailyAmountUsd: amountMicros / 1_000_000,
    isShared: Boolean(budget?.explicitly_shared),
  };
}
