-- retention-brain — initial schema (beta)
-- allowlist: who may use the app (checked server-side; RLS on, no public policy
-- so only the service role can read it). briefings: per-user stored results.

create table if not exists public.allowlist (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);
alter table public.allowlist enable row level security;

create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists briefings_user_created_idx
  on public.briefings (user_id, created_at desc);

alter table public.briefings enable row level security;
drop policy if exists "own briefings" on public.briefings;
create policy "own briefings" on public.briefings
  for select using (auth.uid() = user_id);

-- seed the owner
insert into public.allowlist (email, note) values ('samynaayma@gmail.com', 'owner')
  on conflict (email) do nothing;
