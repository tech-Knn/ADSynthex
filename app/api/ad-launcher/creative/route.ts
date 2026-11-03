import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { buildCreative } from '@/lib/ad-creative';

export const dynamic = 'force-dynamic';
const SETUP_KEY = 'default_launch_setup';
const CTA_MAP: Record<string, string> = { LEARN_MORE: 'Learn more', SHOP_NOW: 'Shop now', SIGN_UP: 'Sign up', DOWNLOAD: 'Download', GET_QUOTE: 'Get quote', SUBSCRIBE: 'Subscribe' };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const articleUrl = sp.get('articleUrl');
  const title = sp.get('title') || '';
  if (!articleUrl) return NextResponse.json({ error: 'articleUrl required' }, { status: 400 });

  const row = await prisma.appSetting.findUnique({ where: { key: SETUP_KEY } });
  const setup = row?.value ? JSON.parse(row.value) : {};
  
  const CACHE_KEY = 'creative:' + articleUrl;
  const refresh = sp.get('refresh') === '1';

  if (!refresh) {
    const cached = await prisma.appSetting.findUnique({ where: { key: CACHE_KEY } });
    if (cached?.value) {
      try { return NextResponse.json({ creative: JSON.parse(cached.value), cached: true }); } catch {}
    }
  }

  const creative = await buildCreative({
    title, articleUrl,
    businessName: setup.businessName || 'AndroidAdvice',
    cta: CTA_MAP[setup.cta] || 'Learn more',
  });

  await prisma.appSetting.upsert({
    where: { key: CACHE_KEY },
    update: { value: JSON.stringify(creative) },
    create: { key: CACHE_KEY, value: JSON.stringify(creative) },
  });

  return NextResponse.json({ creative });
}