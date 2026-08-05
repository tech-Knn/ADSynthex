import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const open = await prisma.allocation.findMany({
    where: { removedAt: null },
    select: { accountCid: true, user: { select: { email: true, username: true } } },
  });

  const holders: Record<string, string> = {};
  for (const a of open) {
    holders[a.accountCid] = a.user.username || a.user.email;
  }

  return NextResponse.json({ holders });
}