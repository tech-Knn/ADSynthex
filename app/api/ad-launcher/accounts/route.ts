import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const feed = new URL(req.url).searchParams.get('feed');
  try {
    // buyer → restrict to their assigned accounts; admin → all
    let scopeCids: string[] | null = null;
    if (session.role !== 'admin') {
      scopeCids = await getAccountsForUser((session as any).userId, session.role);
      if (scopeCids.length === 0) return NextResponse.json({ accounts: [] });
    }

    const accounts = await prisma.account.findMany({
      where: {
        active: true,
        ...(feed ? { feedName: feed } : {}),
        ...(scopeCids ? { cid: { in: scopeCids } } : {}),
      },
      select: { cid: true, seq: true, feedName: true },
      orderBy: { seq: 'asc' },
    });
    return NextResponse.json({ accounts });
  } catch (e: any) {
    console.error('[ad-launcher/accounts] failed', e?.message);
    return NextResponse.json({ accounts: [] });
  }
}