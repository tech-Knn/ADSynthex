import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { buildCreative, generateLogoPng, generateMarketingPng } from '@/lib/ad-creative';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const articleUrl = sp.get('articleUrl');
  const type = sp.get('type') || 'image';           // 'logo' | 'image'
  if (!articleUrl) return NextResponse.json({ error: 'articleUrl required' }, { status: 400 });

  const cached = await prisma.appSetting.findUnique({ where: { key: 'creative:' + articleUrl } });
  const creative = cached?.value ? JSON.parse(cached.value) : await buildCreative({ title: sp.get('title') || '', articleUrl });

  const png = type === 'logo'
    ? await generateLogoPng(creative.logoInitial || 'A', creative.logoColor || 'hsl(220,55%,42%)')
    : await generateMarketingPng(creative.imageUrl, 1200, 628);

  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
}