import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { email?: string; role?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = (body.role ?? '').trim() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    // Supabase not configured yet — accept gracefully so the funnel works in preview/dev.
    return NextResponse.json({ ok: true, stored: false, note: 'storage not configured yet' });
  }

  const { error } = await admin.from('leads').insert({ email, role, source: 'landing' });
  if (error && !/duplicate key|unique constraint/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, stored: true });
}
