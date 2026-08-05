import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const guard = await requireAdmin();
  if ('error' in guard) return guard.error;

  const pending = await prisma.user.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, email: true, username: true, createdAt: true },
  });

  return NextResponse.json({ pending });
}