create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  genero text,
  status text,
  ultima_sessao date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.historico_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'model', 'system')),
  content text not null check (char_length(content) <= 20000),
  created_at timestamptz not null default now()
);

create table if not exists public.diario_gratidao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null check (char_length(prompt) <= 1000),
  entrada text not null check (char_length(entrada) <= 12000),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.historico_conversas enable row level security;
alter table public.diario_gratidao enable row level security;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, delete on public.historico_conversas to authenticated;
grant select, insert, delete on public.diario_gratidao to authenticated;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can create own profile" on public.profiles;
create policy "Users can create own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can delete own profile" on public.profiles;
create policy "Users can delete own profile"
on public.profiles for delete
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can view own conversations" on public.historico_conversas;
create policy "Users can view own conversations"
on public.historico_conversas for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own conversations" on public.historico_conversas;
create policy "Users can insert own conversations"
on public.historico_conversas for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own conversations" on public.historico_conversas;
create policy "Users can delete own conversations"
on public.historico_conversas for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view own diary entries" on public.diario_gratidao;
create policy "Users can view own diary entries"
on public.diario_gratidao for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own diary entries" on public.diario_gratidao;
create policy "Users can insert own diary entries"
on public.diario_gratidao for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own diary entries" on public.diario_gratidao;
create policy "Users can delete own diary entries"
on public.diario_gratidao for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists profiles_ultima_sessao_idx on public.profiles (ultima_sessao);
create index if not exists historico_conversas_user_created_idx on public.historico_conversas (user_id, created_at desc);
create index if not exists diario_gratidao_user_created_idx on public.diario_gratidao (user_id, created_at desc);

revoke execute on function public.set_updated_at() from anon, authenticated;
