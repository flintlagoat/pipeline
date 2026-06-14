-- Saved channels: a user can save channel looks generated in the demo to their studio.
-- (Applied to the live project via the Management API; kept here as the source-of-truth record.)

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  niche text,
  archetype text,
  spec jsonb,
  created_at timestamptz not null default now()
);

alter table public.channels enable row level security;

drop policy if exists channels_select_own on public.channels;
create policy channels_select_own on public.channels for select using (auth.uid() = user_id);
drop policy if exists channels_insert_own on public.channels;
create policy channels_insert_own on public.channels for insert with check (auth.uid() = user_id);
drop policy if exists channels_delete_own on public.channels;
create policy channels_delete_own on public.channels for delete using (auth.uid() = user_id);
