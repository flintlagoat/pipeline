import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// Return a short-lived signed URL to watch a finished video (owner only).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server not configured.' }, { status: 503 });

  const { data: v } = await admin.from('videos').select('user_id,status,storage_path').eq('id', params.id).single();
  if (!v || v.user_id !== user.id) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (v.status !== 'ready' || !v.storage_path) return NextResponse.json({ error: 'Not ready yet.' }, { status: 409 });

  const { data: signed, error } = await admin.storage.from('videos').createSignedUrl(v.storage_path, 3600);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
