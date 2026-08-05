import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const { userId } = params;

  if (userId === guard.session.userId) {
    return NextResponse.json({ error: 'cannot delete yourself' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: 'user not found' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'cannot delete an admin' }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // close/remove their allocations first (FK integrity), then delete the user
    await tx.allocation.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true, email: true, username: true, role: true, status: true,
      createdAt: true, approvedAt: true,
      allocations: { where: { removedAt: null }, select: { accountCid: true } },
    },
  });
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  return NextResponse.json({
    user: { ...user, accounts: user.allocations.map(a => a.accountCid) },
  });
}