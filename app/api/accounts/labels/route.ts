import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const accounts = await prisma.account.findMany({
    where: { feedName: 'androidadvice' },
    select: { cid: true, seq: true },
    orderBy: { seq: 'asc' },
  });
  return NextResponse.json({ accounts });
}