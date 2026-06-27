-- Clinicou SaaS schema for Supabase
-- Run this file in the Supabase SQL Editor for project yhftbfpkuchxfblhfvva.

create extension if not exists pgcrypto;

do $$
begin
  create type public.clinic_role as enum ('owner', 'admin', 'receptionist', 'professional', 'billing');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.appointment_status as enum ('scheduled', 'confirmed', 'waiting', 'in_service', 'finished', 'no_show', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.transaction_status as enum ('open', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.transaction_type as enum ('income', 'expense');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  document text,
  phone text,
  plan text not null default 'basic',
  status text not null default 'active',
  settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_memberships (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.clinic_role not null default 'receptionist',
  status text not null default 'active',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null,
  phone text,
  email text,
  birth_date date,
  document text,
  insurance text,
  risk text not null default 'low',
  no_show_score int not null default 0 check (no_show_score between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  specialty text not null,
  license text,
  commission_percent numeric(5,2) not null default 0,
  working_hours jsonb not null default '{"mon":["08:00","18:00"],"tue":["08:00","18:00"],"wed":["08:00","18:00"],"thu":["08:00","18:00"],"fri":["08:00","18:00"]}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  specialty text,
  duration_minutes int not null default 30,
  price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  resources jsonb not null default '[]'::jsonb,
  active boolean not null default true
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  service_id uuid references public.services(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'scheduled',
  source text not null default 'manual',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_valid_time check (ends_at > starts_at)
);

create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  status public.appointment_status not null,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  professional_id uuid references public.professionals(id) on delete set null,
  template text not null default 'geral',
  complaint text,
  payload jsonb not null default '{}'::jsonb,
  signed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  title text not null,
  status text not null default 'draft',
  total_amount numeric(12,2) not null default 0,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  treatment_plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity int not null default 1,
  unit_price numeric(12,2) not null default 0
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  description text not null,
  type public.transaction_type not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null default current_date,
  paid_at timestamptz,
  status public.transaction_status not null default 'open',
  payment_method text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  transaction_id uuid not null references public.financial_transactions(id) on delete cascade,
  rule text not null default 'paid_on_settlement',
  percent numeric(5,2) not null default 0,
  amount numeric(12,2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  channel text not null default 'whatsapp',
  trigger text not null,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists clinic_memberships_user_idx on public.clinic_memberships(user_id);
create index if not exists patients_clinic_name_idx on public.patients(clinic_id, full_name);
create index if not exists appointments_clinic_starts_idx on public.appointments(clinic_id, starts_at);
create index if not exists appointments_professional_time_idx on public.appointments(professional_id, starts_at, ends_at);
create index if not exists financial_transactions_clinic_due_idx on public.financial_transactions(clinic_id, due_date, status);
create index if not exists audit_logs_clinic_created_idx on public.audit_logs(clinic_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_clinic_member(p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_memberships cm
    where cm.clinic_id = p_clinic_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
  );
$$;

create or replace function public.has_clinic_role(p_clinic_id uuid, p_roles public.clinic_role[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.clinic_memberships cm
    where cm.clinic_id = p_clinic_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.role = any(p_roles)
  );
$$;

create or replace function public.is_clinic_member_path(p_clinic_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  return public.is_clinic_member(p_clinic_id::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.create_clinic(p_name text, p_slug text)
returns public.clinics
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_clinic public.clinics;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  insert into public.clinics (name, slug, created_by)
  values (p_name, p_slug, v_user)
  returning * into v_clinic;

  insert into public.clinic_memberships (clinic_id, user_id, role)
  values (v_clinic.id, v_user, 'owner');

  return v_clinic;
end;
$$;

create or replace function public.audit_clinic_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clinic uuid;
  v_entity_id uuid;
begin
  v_clinic := coalesce(new.clinic_id, old.clinic_id);
  v_entity_id := coalesce(new.id, old.id);

  insert into public.audit_logs (clinic_id, actor_id, action, entity, entity_id, metadata)
  values (
    v_clinic,
    auth.uid(),
    tg_op,
    tg_table_name,
    v_entity_id,
    jsonb_build_object('at', now())
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'clinics', 'patients', 'professionals', 'services', 'appointments',
    'medical_records', 'treatment_plans', 'financial_transactions', 'notification_templates'
  ]
  loop
    execute format('drop trigger if exists touch_%I on public.%I', t, t);
    execute format('create trigger touch_%I before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

drop trigger if exists audit_patients on public.patients;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function public.audit_clinic_row();
drop trigger if exists audit_appointments on public.appointments;
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.audit_clinic_row();
drop trigger if exists audit_financial_transactions on public.financial_transactions;
create trigger audit_financial_transactions after insert or update or delete on public.financial_transactions for each row execute function public.audit_clinic_row();
drop trigger if exists audit_medical_records on public.medical_records;
create trigger audit_medical_records after insert or update or delete on public.medical_records for each row execute function public.audit_clinic_row();

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.patients enable row level security;
alter table public.professionals enable row level security;
alter table public.services enable row level security;
alter table public.rooms enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table public.medical_records enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.commissions enable row level security;
alter table public.notification_templates enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "profiles own select" on public.profiles;
create policy "profiles own select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles own update" on public.profiles;
create policy "profiles own update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "clinics member select" on public.clinics;
create policy "clinics member select" on public.clinics for select to authenticated using (public.is_clinic_member(id));
drop policy if exists "clinics owner update" on public.clinics;
create policy "clinics owner update" on public.clinics for update to authenticated using (public.has_clinic_role(id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(id, array['owner','admin']::public.clinic_role[]));

drop policy if exists "memberships member select" on public.clinic_memberships;
create policy "memberships member select" on public.clinic_memberships for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "memberships admin write" on public.clinic_memberships;
create policy "memberships admin write" on public.clinic_memberships for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));

drop policy if exists "patients member crud" on public.patients;
create policy "patients member crud" on public.patients for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "professionals member crud" on public.professionals;
create policy "professionals member crud" on public.professionals for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "services member crud" on public.services;
create policy "services member crud" on public.services for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "rooms member crud" on public.rooms;
create policy "rooms member crud" on public.rooms for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "appointments member crud" on public.appointments;
create policy "appointments member crud" on public.appointments for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "appointment events member crud" on public.appointment_events;
create policy "appointment events member crud" on public.appointment_events for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "medical records member crud" on public.medical_records;
create policy "medical records member crud" on public.medical_records for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "treatment plans member crud" on public.treatment_plans;
create policy "treatment plans member crud" on public.treatment_plans for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "treatment plan items member crud" on public.treatment_plan_items;
create policy "treatment plan items member crud" on public.treatment_plan_items for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "financial role crud" on public.financial_transactions;
create policy "financial role crud" on public.financial_transactions for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[]));
drop policy if exists "commissions financial crud" on public.commissions;
create policy "commissions financial crud" on public.commissions for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[]));
drop policy if exists "notification templates member crud" on public.notification_templates;
create policy "notification templates member crud" on public.notification_templates for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "audit logs member select" on public.audit_logs;
create policy "audit logs member select" on public.audit_logs for select to authenticated using (public.is_clinic_member(clinic_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clinics to authenticated;
grant select, insert, update, delete on public.clinic_memberships to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.professionals to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.appointment_events to authenticated;
grant select, insert, update, delete on public.medical_records to authenticated;
grant select, insert, update, delete on public.treatment_plans to authenticated;
grant select, insert, update, delete on public.treatment_plan_items to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;
grant select, insert, update, delete on public.commissions to authenticated;
grant select, insert, update, delete on public.notification_templates to authenticated;
grant select on public.audit_logs to authenticated;

revoke all on function public.handle_new_user() from public;
revoke all on function public.is_clinic_member(uuid) from public;
revoke all on function public.is_clinic_member_path(text) from public;
revoke all on function public.has_clinic_role(uuid, public.clinic_role[]) from public;
revoke all on function public.create_clinic(text, text) from public;
revoke all on function public.audit_clinic_row() from public;
grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.is_clinic_member_path(text) to authenticated;
grant execute on function public.has_clinic_role(uuid, public.clinic_role[]) to authenticated;
grant execute on function public.create_clinic(text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinicou-documents',
  'clinicou-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clinic documents member select" on storage.objects;
create policy "clinic documents member select" on storage.objects
for select to authenticated
using (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member_path((storage.foldername(name))[1])
);

drop policy if exists "clinic documents member insert" on storage.objects;
create policy "clinic documents member insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member_path((storage.foldername(name))[1])
);

drop policy if exists "clinic documents member update" on storage.objects;
create policy "clinic documents member update" on storage.objects
for update to authenticated
using (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member_path((storage.foldername(name))[1])
)
with check (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member_path((storage.foldername(name))[1])
);

notify pgrst, 'reload schema';
