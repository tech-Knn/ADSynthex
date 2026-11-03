// lib/article-sources.ts
// Fetches the latest content articles for a feed's website.
// Primary: WordPress REST API (title + link + date + featured image).
// Fallback: sitemap.xml (URLs only; title derived from slug).

export type Article = {
  title: string;
  url: string;
  slug: string;
  image: string | null;  // featured image -> used later as the Demand Gen ad's main image
  date: string | null;   // ISO publish date
  source: 'wordpress' | 'sitemap';
};

// Each feed -> its public website root. CONFIRM these two URLs.
// (Wrong URL = empty article list for that feed.) Can move to the Feed table later.
const FEED_SITES: Record<string, string> = {
  androidadvice: 'https://info.androidadvices.com',
  founderzest: 'https://info.founderzest.com',
};

export function siteForFeed(feed: string): string | null {
  return FEED_SITES[feed] || null;
}

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .trim();
}

function slugFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p.split('/').filter(Boolean).pop() || '';
  } catch { return ''; }
}

function titleFromSlug(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchJson(url: string, timeoutMs = 10000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'ADSynthex/1.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function fetchText(url: string, timeoutMs = 10000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'ADSynthex/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ---- WordPress REST API ----
// limit = undefined -> fetch ALL posts; a number caps the total.
async function fromWordPress(site: string, limit?: number): Promise<Article[]> {
  const root = site.replace(/\/+$/, '');
  const perPage = 100;
  const base = `${root}/wp-json/wp/v2/posts?per_page=${perPage}&_embed=wp:featuredmedia`;

  const mapPost = (p: any): Article | null => {
    const url = p?.link || '';
    if (!url) return null;
    return {
      title: decodeEntities(p?.title?.rendered || titleFromSlug(slugFromUrl(url))),
      url,
      slug: p?.slug || slugFromUrl(url),
      image: p?._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      date: p?.date || null,
      source: 'wordpress' as const,
    };
  };

  // Fetch page 1 and read the total-pages header so we know how many pages exist.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  let firstRes: Response;
  try {
    firstRes = await fetch(`${base}&page=1`, {
      signal: ctrl.signal, cache: 'no-store',
      headers: { 'User-Agent': 'ADSynthex/1.0', Accept: 'application/json' },
    });
  } finally { clearTimeout(t); }
  if (!firstRes.ok) throw new Error(`HTTP ${firstRes.status}`);

  const firstBatch = await firstRes.json();
  if (!Array.isArray(firstBatch)) return [];
  const out: Article[] = firstBatch.map(mapPost).filter(Boolean) as Article[];

  let totalPages = Number(firstRes.headers.get('x-wp-totalpages') || '1');
  if (limit) totalPages = Math.min(totalPages, Math.ceil(limit / perPage));

  // Fetch pages 2..N in parallel.
  if (totalPages > 1) {
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
    const results = await Promise.all(
      pages.map(async (page) => {
        try {
          const batch = await fetchJson(`${base}&page=${page}`);
          return Array.isArray(batch) ? batch.map(mapPost).filter(Boolean) as Article[] : [];
        } catch { return []; }
      })
    );
    for (const r of results) out.push(...r);
  }

  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

// ---- Sitemap fallback ----
async function fromSitemap(site: string, limit?: number): Promise<Article[]> {
  const root = site.replace(/\/+$/, '');
  const candidates = [`${root}/sitemap_index.xml`, `${root}/sitemap.xml`, `${root}/post-sitemap.xml`];
  let xml = '';
  for (const c of candidates) {
    try { xml = await fetchText(c); if (xml) break; } catch { /* try next */ }
  }
  if (!xml) return [];

  let locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1].trim());

  // If this is a sitemap index, follow a post sub-sitemap.
  if (/sitemapindex/i.test(xml) && locs.length) {
    const sub = locs.find(u => /post|article|blog/i.test(u)) || locs[0];
    try {
      xml = await fetchText(sub);
      locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(m => m[1].trim());
    } catch { /* keep index locs */ }
  }

  const posts = locs
    .filter(u => !/\/(category|tag|author|page|wp-content|wp-json|feed)\b/i.test(u))
    .filter(u => slugFromUrl(u));
  const limited = typeof limit === 'number' ? posts.slice(0, limit) : posts;

  return posts.map(url => ({
    title: titleFromSlug(slugFromUrl(url)),
    url,
    slug: slugFromUrl(url),
    image: null,
    date: null,
    source: 'sitemap' as const,
  }));
}

export async function fetchArticlesForFeed(feed: string, limit?: number): Promise<Article[]> {
  const site = siteForFeed(feed);
  if (!site) throw new Error(`No website configured for feed "${feed}"`);
  try {
    const wp = await fromWordPress(site, limit);
    if (wp.length) return wp;
  } catch { /* fall through to sitemap */ }
  return await fromSitemap(site, limit);
}