import sharp from 'sharp';

export type Creative = {
  headlines: string[]; descriptions: string[]; businessName: string; cta: string;
  logoInitial: string; logoColor: string; imageUrl: string | null;
};

const BANNED = ['our services','expertise','best','guarantee','now','today','proven','cost','boost','free'];

const truncate = (s: string, n: number) => { s = s.trim(); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…'; };
function colorFor(seed: string){ let h=0; for(let i=0;i<seed.length;i++) h=(h*31+seed.charCodeAt(i))%360; return `hsl(${h},55%,42%)`; }
function stripHtml(html: string){ return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }

// keep only on-policy, within-limit, unique items
function clean(list: any[] | undefined, maxLen: number): string[] {
  return (Array.isArray(list) ? list : [])
    .map(s => String(s).trim())
    .filter(Boolean)
    .filter(s => s.length <= maxLen)
    .filter(s => !BANNED.some(b => s.toLowerCase().includes(b)))
    .filter((s, i, a) => a.indexOf(s) === i);
}

// ---- your compliance prompt, baked in ----
const COMPLIANCE_PROMPT = `You are a blog writer providing information only — NOT services. Read the blog content and write:
- 25 short headlines, each STRICTLY 30 characters or fewer.
- 5 descriptions, each STRICTLY 60 characters or fewer.
Tone: informational and compliant with Google Ads financial and health policies (the author provides no services, makes no promises or false claims, and describes no health procedure that would violate policy).
Use words like: you could, you can, might, may, explore, discover, find, find ways, learn, read about, get to know, info, insights.
Avoid clickbait and any health/financial claim that violates Google Ads policy.
NEVER use these words: our services, expertise, best, guarantee, now, today, proven, cost, boost, free.
Return ONLY JSON: {"headlines": string[], "descriptions": string[]}.`;

async function fetchText(url: string, timeoutMs = 9000): Promise<string> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

function extractOg(html: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

// ---- AI generation (OpenAI by default; swap the call for another provider if needed) ----
async function aiGenerate(title: string, articleText: string): Promise<{ headlines: string[]; descriptions: string[] } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: COMPLIANCE_PROMPT },
          { role: 'user', content: `Title: ${title}\n\nBlog content:\n${articleText.slice(0, 6000)}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return { headlines: parsed.headlines || [], descriptions: parsed.descriptions || [] };
  } catch { return null; }
}

// template fallback (used only if AI key is missing or the call fails)
const fbHeadlines = (t: string) => [truncate(t, 30), 'Learn more about this', 'Explore the details', 'Read about it here', 'Find insights inside'];
const fbDescriptions = (t: string) => [truncate(`Read about ${t} and learn more.`, 60), 'Explore info and insights you can use.'];

export async function buildCreative(opts: { title: string; articleUrl: string; businessName?: string; cta?: string }): Promise<Creative> {
  const businessName = opts.businessName || 'AndroidAdvice';
  let html = ''; try { html = await fetchText(opts.articleUrl); } catch {}
  const imageUrl = html ? extractOg(html) : null;
  const articleText = html ? stripHtml(html) : opts.title;

  const ai = await aiGenerate(opts.title, articleText);
  let headlines = clean(ai?.headlines, 30);
  let descriptions = clean(ai?.descriptions, 60);
  if (!headlines.length) headlines = clean(fbHeadlines(opts.title), 30);
  if (!descriptions.length) descriptions = clean(fbDescriptions(opts.title), 60);

  return {
    headlines, descriptions, businessName,
    cta: opts.cta || 'Learn more',
    logoInitial: (businessName.trim()[0] || 'A').toUpperCase(),
    logoColor: colorFor(businessName),
    imageUrl,
  };
}

// Logo → square PNG (letter on a colored tile)
export async function generateLogoPng(initial: string, hsl: string, size = 1200): Promise<Buffer> {
  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="${Math.round(size * 0.12)}" fill="${hsl}"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
          font-size="${Math.round(size * 0.5)}" font-weight="700" fill="#ffffff">${initial}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// Marketing image → resize the og:image to Google's size, or a gradient fallback
export async function generateMarketingPng(ogImageUrl: string | null, w: number, h: number): Promise<Buffer> {
  if (ogImageUrl) {
    try {
      const res = await fetch(ogImageUrl, { cache: 'no-store' });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        return await sharp(buf).resize(w, h, { fit: 'cover', position: 'centre' }).png().toBuffer();
      }
    } catch {}
  }
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}