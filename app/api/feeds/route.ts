import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const feeds = await prisma.feed.findMany({
    where: { active: true },
    select: { feedName: true, publisherId: true },
    orderBy: { feedName: 'asc' },
  });
  return NextResponse.json({ feeds });
}
