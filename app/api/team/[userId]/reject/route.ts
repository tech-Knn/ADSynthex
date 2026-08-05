import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) return NextResponse.json({ error: 'user not found' }, { status: 404 });

  await prisma.user.update({
    where: { id: params.userId },
    data: { status: 'rejected' },
  });

  return NextResponse.json({ ok: true });
}