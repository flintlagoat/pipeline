-- Per-IP rate limiting for the public free demo (cost protection). The /api/demo/channel route
-- (service role) counts recent rows per IP and inserts one per call. Applied live via the
-- Management API; kept here as the source-of-truth record.

create table if not exists public.demo_runs (
  id bigint generated always as identity primary key,
  ip text,
  created_at timestamptz not null default now()
);

alter table public.demo_runs enable row level security;
-- No public policy: only the service role (server) reads/writes it.

create index if not exists demo_runs_ip_time on public.demo_runs (ip, created_at);
