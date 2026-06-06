-- Telegram quick access for Venus 092.
-- Secrets are intentionally not stored here. Configure bot_token,
-- webhook_secret, bot_username and site_base_url directly in Supabase.

create table if not exists public.telegram_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.telegram_settings enable row level security;
revoke all on table public.telegram_settings from anon, authenticated;
grant all on table public.telegram_settings to service_role;

drop policy if exists "telegram_settings_no_client_access" on public.telegram_settings;
create policy "telegram_settings_no_client_access"
on public.telegram_settings
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.telegram_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  telegram_id bigint not null unique,
  role text not null check (role in ('cliente', 'profissional')),
  username text,
  first_name text,
  last_name text,
  photo_url text,
  auth_date timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  unique (telegram_id, role)
);

alter table public.telegram_accounts enable row level security;

create index if not exists idx_telegram_accounts_user_id
  on public.telegram_accounts(user_id);

create index if not exists idx_telegram_accounts_telegram_id
  on public.telegram_accounts(telegram_id);

create or replace function public.set_telegram_accounts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_telegram_accounts_updated_at on public.telegram_accounts;
create trigger trg_telegram_accounts_updated_at
before update on public.telegram_accounts
for each row execute function public.set_telegram_accounts_updated_at();

drop policy if exists "telegram_accounts_select_own" on public.telegram_accounts;
create policy "telegram_accounts_select_own"
on public.telegram_accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "telegram_accounts_delete_own" on public.telegram_accounts;
create policy "telegram_accounts_delete_own"
on public.telegram_accounts
for delete
to authenticated
using (auth.uid() = user_id);
