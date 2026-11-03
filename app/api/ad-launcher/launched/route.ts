import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const where: any = {};
  const account = sp.get('account'); const feed = sp.get('feed');
  if (account) where.accountCid = account;
  if (feed) where.feed = feed;

  const launched = await prisma.launchedCampaign.findMany({
    where, select: { articleUrl: true, campaignId: true, resourceName: true, country: true, accountCid: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ launched });
}