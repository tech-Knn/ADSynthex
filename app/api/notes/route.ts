import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialise Supabase server client using service role if available, else fall back to anon key (requires open RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
  },
});

const TABLE = 'article_notes';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const slug = searchParams.get('slug');

  let query = supabase.from(TABLE).select('*').order('updated_at', { ascending: false });
  if (slug) query = query.eq('slug', slug);

  const { data, error } = await query;
  if (error) {
    console.error('Supabase GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notes: data }, { status: 200 });
}

export async function POST(request: NextRequest) {
  try {
    const { slug, text } = await request.json();
    if (!slug || !text) throw new Error('slug and text are required');

    const { data, error } = await supabase.from(TABLE).insert({ slug, text }).select().single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    console.error('Supabase POST error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { id, text } = await request.json();
    if (!id || !text) throw new Error('id and text are required');

    const { data, error } = await supabase.from(TABLE).update({ text, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error('Supabase PUT error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    if (!id) throw new Error('id is required');

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error('Supabase DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
} 