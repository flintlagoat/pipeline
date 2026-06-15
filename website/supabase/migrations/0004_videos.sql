-- Generated videos: one row per render job. The render worker (service role) updates status +
-- storage_path; the MP4 lives in the private 'videos' Storage bucket. Applied live via the
-- Management API + Storage API; kept here as the source-of-truth record.

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  title text,
  topic text,
  status text not null default 'queued',  -- queued | rendering | ready | failed
  storage_path text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.videos enable row level security;

drop policy if exists videos_select_own on public.videos;
create policy videos_select_own on public.videos for select using (auth.uid() = user_id);
drop policy if exists videos_insert_own on public.videos;
create policy videos_insert_own on public.videos for insert with check (auth.uid() = user_id);
-- updates are performed by the render worker via the service-role key (bypasses RLS).

-- Storage: a private bucket named 'videos' holds <user_id>/<video_id>.mp4 (signed URLs for playback).
