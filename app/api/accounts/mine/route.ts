import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getAccountsForUser } from '@/lib/account-scope';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scopeUserId = searchParams.get('scopeUserId');
  const effectiveUserId = scopeUserId && session.role === 'admin' ? scopeUserId : session.userId;
  const effectiveRole = scopeUserId && session.role === 'admin' ? 'user' : session.role;
  const cids = await getAccountsForUser(effectiveUserId, effectiveRole);
  if (cids.length === 0) return NextResponse.json({ accounts: [] });

  const accounts = await prisma.account.findMany({
    where: { cid: { in: cids } },
    select: { cid: true, seq: true, feedName: true },
    orderBy: [{ feedName: 'asc' }, { seq: 'asc' }],
  });
  return NextResponse.json({ accounts });
}
