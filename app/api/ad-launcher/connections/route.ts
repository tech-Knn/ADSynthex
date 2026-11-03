import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
const AV_KEY = 'activeview_adsense_key';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Google Ads is connected via server credentials — adjust these env names to yours.
  const gaConnected = !!(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_REFRESH_TOKEN);
  const av = await prisma.appSetting.findUnique({ where: { key: AV_KEY } }).catch(() => null);

  return NextResponse.json({
    googleAds: {
      connected: gaConnected,
      label: 'AndroidAdvice Google Ads',
      version: 'v' + (process.env.GOOGLE_ADS_API_VERSION || '26'),
      note: 'direct creative upload',
    },
    activeView: {
      connected: !!av?.value,
      note: av?.value ? 'AdSense key saved.' : 'Connect your own revenue-reporting key (AdSense).',
    },
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  if (body.action === 'connectActiveView') {
    if (!body.key) return NextResponse.json({ error: 'Key required' }, { status: 400 });
    await prisma.appSetting.upsert({
      where: { key: AV_KEY }, update: { value: String(body.key) }, create: { key: AV_KEY, value: String(body.key) },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}