import { NextRequest, NextResponse } from 'next/server';
import { enums } from 'google-ads-api';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';
import { getCustomerForAccount } from '@/lib/google-ads-api';

type NewStatus = 'ENABLED' | 'PAUSED';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: { accountCid?: string; campaignId?: string; status?: NewStatus } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }

  const { accountCid, campaignId, status } = body;
  if (!accountCid || !campaignId || !status) {
    return NextResponse.json({ error: 'accountCid, campaignId, status required' }, { status: 400 });
  }
  if (status !== 'ENABLED' && status !== 'PAUSED') {
    return NextResponse.json({ error: 'status must be ENABLED or PAUSED' }, { status: 400 });
  }

  // Scope check: user must have access to this account.
  const allowed = await getAccountsForUser(session.userId, session.role);
  if (!allowed.includes(accountCid)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const campaign = await prisma.campaign.findUnique({
    where: { accountCid_campaignId: { accountCid, campaignId } },
    select: { accountCid: true, campaignId: true, status: true, name: true },
  });
  if (!campaign) {
    return NextResponse.json({ error: 'campaign not found' }, { status: 404 });
  }

  // Mutate on Google Ads.
  try {
    const customer = getCustomerForAccount(accountCid);
    await customer.service('CampaignService').mutate({
      customer_id: accountCid,
      operations: [{
        update: {
          resource_name: `customers/${accountCid}/campaigns/${campaignId}`,
          status: enums.CampaignStatus[status],
        },
        update_mask: { paths: ['status'] },
      }],
    });
  } catch (err: any) {
    console.error('[campaigns/status] Google Ads mutate failed', {
      accountCid, campaignId, status, err: err?.message || String(err),
    });
    const details = extractGoogleAdsError(err);
    return NextResponse.json(
      { error: details || 'Google Ads update failed' },
      { status: 502 },
    );
  }

  // Reflect in local DB so UI reads the new state immediately.
  await prisma.campaign.update({
    where: { accountCid_campaignId: { accountCid, campaignId } },
    data: { status, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, accountCid, campaignId, status });
}

function extractGoogleAdsError(err: any): string | null {
  const errors = err?.errors || err?.failure?.errors;
  if (Array.isArray(errors) && errors[0]?.message) return errors[0].message;
  return err?.message || null;
}
