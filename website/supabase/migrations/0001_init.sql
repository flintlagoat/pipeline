-- Inkwell — initial schema. Run this in the Supabase dashboard → SQL Editor (no CLI needed).
-- Captures landing-page waitlist signups. The service-role key (server-side API route) writes here;
-- RLS is on with NO public policy, so the anon/browser key can never read or write leads.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role text,
  source text not null default 'landing',
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

-- (Intentionally no anon/authenticated policies — only the service role, which bypasses RLS,
--  may read/write. Add policies later if you build a logged-in dashboard over this table.)
