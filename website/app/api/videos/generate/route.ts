import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// Queue a full video render for one of the user's channels: checks credits, creates a videos row,
// decrements a credit, and dispatches the job to the render worker (RENDER_API_URL). If the worker
// isn't configured yet, the row stays 'queued'.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });

  let body: { channelId?: string; topic?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const channelId = (body.channelId || '').trim();
  const topic = (body.topic || '').trim();
  if (!channelId || topic.length < 4) return NextResponse.json({ error: 'Pick a channel and enter a topic.' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Server not configured.' }, { status: 503 });

  const { data: ch } = await admin.from('channels').select('id,title,user_id').eq('id', channelId).single();
  if (!ch || ch.user_id !== user.id) return NextResponse.json({ error: 'Channel not found.' }, { status: 404 });

  const { data: profile } = await admin.from('profiles').select('credits').eq('id', user.id).single();
  const credits = profile?.credits ?? 0;
  if (credits <= 0) return NextResponse.json({ error: "You're out of credits." }, { status: 402 });

  const { data: vid, error: vErr } = await admin
    .from('videos')
    .insert({ user_id: user.id, channel_id: channelId, title: ch.title, topic, status: 'queued' })
    .select('id')
    .single();
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  await admin.from('profiles').update({ credits: credits - 1 }).eq('id', user.id);

  const renderUrl = process.env.RENDER_API_URL;
  const secret = process.env.RENDER_SECRET;
  if (renderUrl && secret) {
    try {
      const r = await fetch(`${renderUrl.replace(/\/$/, '')}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ videoId: vid.id, userId: user.id, channelId, topic }),
      });
      if (!r.ok) await admin.from('videos').update({ status: 'failed', error: `dispatch ${r.status}` }).eq('id', vid.id);
    } catch {
      await admin.from('videos').update({ status: 'failed', error: 'render worker unreachable' }).eq('id', vid.id);
    }
  }

  return NextResponse.json({ ok: true, id: vid.id, configured: !!(renderUrl && secret) });
}
