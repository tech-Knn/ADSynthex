import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getCustomerForAccount } from '@/lib/google-ads-api';

/**
 * Batch-fetch daily budgets for all campaigns in the given accounts.
 * Response shape:
 *   { budgets: { [accountCid]: { [campaignId]: { dailyAmountUsd, isShared } } } }
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get('accountCids') || '';
  const requested = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (requested.length === 0) return NextResponse.json({ budgets: {} });

  const allowed = await getAccountsForUser(session.userId, session.role);
  const targets = requested.filter((c) => allowed.includes(c));
  if (targets.length === 0) return NextResponse.json({ budgets: {} });

  const results = await Promise.all(
    targets.map(async (cid) => {
      try {
        const customer = getCustomerForAccount(cid);
        const rows = await customer.query(`
          SELECT
            campaign.id,
            campaign_budget.amount_micros,
            campaign_budget.explicitly_shared
          FROM campaign
          WHERE campaign.status != 'REMOVED'
        `);
        const map: Record<string, { dailyAmountUsd: number; isShared: boolean }> = {};
        for (const row of rows || []) {
          const id = String(row.campaign?.id ?? '');
          if (!id) continue;
          const micros = Number(row.campaign_budget?.amount_micros ?? 0);
          map[id] = {
            dailyAmountUsd: micros / 1_000_000,
            isShared: Boolean(row.campaign_budget?.explicitly_shared),
          };
        }
        return [cid, map] as const;
      } catch (err: any) {
        console.error('[campaigns/budgets] account query failed', { cid, err: err?.message || String(err) });
        return [cid, {}] as const;
      }
    }),
  );

  const budgets: Record<string, Record<string, { dailyAmountUsd: number; isShared: boolean }>> = {};
  for (const [cid, map] of results) budgets[cid] = map;
  return NextResponse.json({ budgets });
}
