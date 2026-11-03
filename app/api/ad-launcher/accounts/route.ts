import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const feed = new URL(req.url).searchParams.get('feed');
  try {
    const accounts = await prisma.account.findMany({
      where: { active: true, ...(feed ? { feedName: feed } : {}) },
      select: { cid: true, seq: true, feedName: true },
      orderBy: { seq: 'asc' },
    });
    return NextResponse.json({ accounts });
  } catch (e: any) {
    console.error('[ad-launcher/accounts] failed', e?.message);
    return NextResponse.json({ accounts: [] });
  }
}