-- retention-brain — in-flight OAuth state for the hosted MCP connect bridge.
-- A row is created when a user starts "Connect <provider>", looked up on the
-- provider's redirect back, then deleted. Short-lived; service-role only.
-- (The resulting tokens are stored encrypted in public.sources, kind=provider.)

create table if not exists public.oauth_flows (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  code_verifier text not null,
  auth_server_url text not null,
  client_info jsonb not null,
  resource text,
  created_at timestamptz not null default now()
);
alter table public.oauth_flows enable row level security;
