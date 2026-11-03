// app/api/ad-launcher/articles/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { fetchArticlesForFeed, siteForFeed } from '@/lib/article-sources';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const feed = new URL(req.url).searchParams.get('feed') || 'androidadvice';
  const site = siteForFeed(feed);
  if (!site) {
    return NextResponse.json({ error: `No website configured for feed "${feed}"`, articles: [] }, { status: 400 });
  }

  try {
    const articles = await fetchArticlesForFeed(feed);
    return NextResponse.json({ feed, site, count: articles.length, articles });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), articles: [] }, { status: 500 });
  }
}