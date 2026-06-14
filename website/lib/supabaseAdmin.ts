import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Server-only Supabase client (uses the service-role key, bypasses RLS). NEVER import this into a
// client component. Returns null when env keys are absent so the site still builds/runs before
// Supabase is configured — API routes degrade gracefully instead of crashing.
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
