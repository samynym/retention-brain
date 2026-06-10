-- retention-brain — first-party onboarding analytics.
-- Service-role only: the browser sends events through the backend, which
-- attaches auth.user_id when a valid session is present.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_event_created_idx
  on public.analytics_events (event_name, created_at desc);

create index if not exists analytics_events_user_created_idx
  on public.analytics_events (user_id, created_at desc);

alter table public.analytics_events enable row level security;
