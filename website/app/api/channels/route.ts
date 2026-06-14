import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const str = (v: unknown) => (typeof v === 'string' ? v : null);

// Save a generated channel to the signed-in user's studio (RLS scopes to auth.uid()).
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in to save.' }, { status: 401 });

  let body: { spec?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const spec = body.spec;
  if (!spec || typeof spec !== 'object') return NextResponse.json({ error: 'Missing channel spec.' }, { status: 400 });

  const { data, error } = await supabase
    .from('channels')
    .insert({ user_id: user.id, title: str(spec.title), niche: str(spec.niche), archetype: str(spec.archetype), spec })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// List the signed-in user's saved channels.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const { data, error } = await supabase
    .from('channels')
    .select('id,title,niche,archetype,created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, channels: data });
}
