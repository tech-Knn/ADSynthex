import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, email: true, username: true, role: true, status: true, createdAt: true,
      allocations: { where: { removedAt: null }, select: { accountCid: true } },
    },
  });

  const result = users.map((u) => ({
    id: u.id, email: u.email, username: u.username, role: u.role,
    status: u.status, createdAt: u.createdAt,
    accountCount: u.allocations.length,
    accounts: u.allocations.map((a) => a.accountCid),
  }));

  return NextResponse.json({ users: result });
}