import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, email: true, username: true, role: true, status: true,
      allocations: { where: { removedAt: null }, select: { accountCid: true } },
    },
  });

  return NextResponse.json({
    user: user
      ? { ...user, accounts: user.allocations.map(a => a.accountCid) }
      : null,
  });
}