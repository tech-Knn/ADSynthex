import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });

  const { prompt, n } = await req.json();
  if (!prompt || !String(prompt).trim()) return NextResponse.json({ error: 'prompt is required' }, { status: 400 });

  const count = Math.min(Math.max(Number(n) || 4, 1), 6);
  const model = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  const size = process.env.OPENAI_IMAGE_SIZE || '1024x1024'; // valid for gpt-image-1 AND dall-e-2/3

  const one = async () => {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: String(prompt).trim(), n: 1, size }), // no response_format
    });
    if (!res.ok) throw new Error(`OpenAI image ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    const item = d?.data?.[0];
    if (item?.b64_json) return 'data:image/png;base64,' + item.b64_json;        // gpt-image-1 returns b64
    if (item?.url) {                                                            // dall-e returns a URL
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) throw new Error('Failed to fetch generated image');
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const ct = imgRes.headers.get('content-type') || 'image/png';
      return `data:${ct};base64,` + buf.toString('base64');
    }
    throw new Error('No image returned');
  };

  const results = await Promise.allSettled(Array.from({ length: count }, () => one()));
  const images = results.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<string>).value);
  if (!images.length) {
    const firstErr = results.find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
    return NextResponse.json({ error: String((firstErr?.reason as any)?.message || firstErr?.reason || 'Image generation failed') }, { status: 500 });
  }
  return NextResponse.json({ images });
}