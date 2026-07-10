create table if not exists public.banco_games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  name text not null default 'Partida',
  state jsonb not null,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banco_games_updated_at_idx
  on public.banco_games (updated_at desc);

alter table public.banco_games enable row level security;

grant select, insert, update, delete on public.banco_games to anon;

drop policy if exists "Public can read game rooms" on public.banco_games;
create policy "Public can read game rooms"
  on public.banco_games
  for select
  to anon
  using (true);

drop policy if exists "Public can create game rooms" on public.banco_games;
create policy "Public can create game rooms"
  on public.banco_games
  for insert
  to anon
  with check (true);

drop policy if exists "Public can update game rooms" on public.banco_games;
create policy "Public can update game rooms"
  on public.banco_games
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "Public can delete game rooms" on public.banco_games;
create policy "Public can delete game rooms"
  on public.banco_games
  for delete
  to anon
  using (true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'banco_games'
  ) then
    alter publication supabase_realtime add table public.banco_games;
  end if;
end $$;
