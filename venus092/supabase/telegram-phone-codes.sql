-- Phone + Telegram code login/signup flow.
-- The bot can only send Telegram messages after the user starts the bot
-- and shares their phone once.

create table if not exists public.telegram_contacts (
  phone text primary key,
  telegram_id bigint not null unique,
  chat_id bigint not null,
  first_name text,
  username text,
  verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.telegram_contacts enable row level security;
revoke all on table public.telegram_contacts from anon, authenticated;
grant all on table public.telegram_contacts to service_role;

drop policy if exists "telegram_contacts_no_client_access" on public.telegram_contacts;
create policy "telegram_contacts_no_client_access"
on public.telegram_contacts
for all
to anon, authenticated
using (false)
with check (false);

create table if not exists public.telegram_login_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  role text not null check (role in ('cliente', 'profissional')),
  purpose text not null check (purpose in ('login', 'signup', 'reset')),
  code text not null,
  start_token text not null unique,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_login_codes enable row level security;
revoke all on table public.telegram_login_codes from anon, authenticated;
grant all on table public.telegram_login_codes to service_role;

drop policy if exists "telegram_login_codes_no_client_access" on public.telegram_login_codes;
create policy "telegram_login_codes_no_client_access"
on public.telegram_login_codes
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists idx_telegram_login_codes_lookup
  on public.telegram_login_codes(phone, role, purpose, expires_at desc)
  where consumed_at is null;

alter table public.telegram_accounts
  add column if not exists phone text,
  add column if not exists chat_id bigint;

alter table public.telegram_accounts
  drop constraint if exists telegram_accounts_telegram_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'telegram_accounts_telegram_id_role_key'
  ) then
    alter table public.telegram_accounts
      add constraint telegram_accounts_telegram_id_role_key unique (telegram_id, role);
  end if;
end $$;

create index if not exists idx_telegram_accounts_phone_role
  on public.telegram_accounts(phone, role);

alter table public.customers
  add column if not exists telefone text;

create index if not exists idx_customers_telefone
  on public.customers(telefone);
