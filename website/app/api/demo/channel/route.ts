import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DEMO_SYSTEM_PROMPT, demoUserPrompt } from '@/lib/channelPrompt';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const DAILY_LIMIT = 15;

function stripFences(t: string): string {
  return t.replace(/^```(?:json)?\r?\n?/, '').replace(/\r?\n?```$/, '').trim();
}

export async function POST(req: Request) {
  let body: { idea?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const idea = (body.idea ?? '').trim();
  if (idea.length < 4) return NextResponse.json({ error: 'Describe your channel in a few words.' }, { status: 400 });
  if (idea.length > 400) return NextResponse.json({ error: 'Keep the idea under 400 characters.' }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'The demo is not configured yet.' }, { status: 503 });

  // Best-effort per-IP daily rate limit (cost protection for the public demo). Skips silently if
  // Supabase isn't configured. IP comes from the platform's forwarded header.
  const admin = getSupabaseAdmin();
  if (admin) {
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || 'unknown';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin
      .from('demo_runs')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('created_at', since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return NextResponse.json(
        { error: "You've reached today's free demo limit. Join the waitlist to keep going." },
        { status: 429 }
      );
    }
    await admin.from('demo_runs').insert({ ip });
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: DEMO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: demoUserPrompt(idea) }],
    });
    const block = resp.content[0];
    if (block.type !== 'text') throw new Error('unexpected response');
    const spec = JSON.parse(stripFences(block.text));
    return NextResponse.json({ ok: true, spec });
  } catch {
    return NextResponse.json({ error: 'Generation failed — please try again.' }, { status: 500 });
  }
}
