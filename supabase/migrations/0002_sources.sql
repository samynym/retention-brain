-- retention-brain — connected data sources per user.
-- Credentials are AES-GCM encrypted by the server before insert; this table is
-- service-role only (RLS on, no public policy) so the anon client can't read it.

create table if not exists public.sources (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,             -- 'stripe', later 'revenuecat', 'posthog', ...
  label text,                     -- display label (e.g. provider name)
  secret_enc text not null,       -- AES-256-GCM encrypted credential
  created_at timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table public.sources enable row level security;
