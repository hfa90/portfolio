-- Clinicou SaaS schema for Supabase
-- Run this file in the Supabase SQL Editor for project yhftbfpkuchxfblhfvva.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'clinic_role'
      and n.nspname = 'public'
  ) then
    create type public.clinic_role as enum ('owner', 'admin', 'receptionist', 'professional', 'billing');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'appointment_status'
      and n.nspname = 'public'
  ) then
    create type public.appointment_status as enum ('scheduled', 'confirmed', 'waiting', 'in_service', 'finished', 'no_show', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'transaction_status'
      and n.nspname = 'public'
  ) then
    create type public.transaction_status as enum ('open', 'paid', 'overdue', 'cancelled');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'transaction_type'
      and n.nspname = 'public'
  ) then
    create type public.transaction_type as enum ('income', 'expense');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'employee_role'
      and n.nspname = 'public'
  ) then
    create type public.employee_role as enum ('doctor', 'nurse', 'assistant', 'cleaning', 'secretary');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'staff_status'
      and n.nspname = 'public'
  ) then
    create type public.staff_status as enum ('active', 'suspended');
  end if;
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

create table if not exists public.insurance_plans (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  contact text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, name)
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp text,
  email text,
  birth_date date,
  document text,
  cpf text,
  insurance_plan_id uuid references public.insurance_plans(id) on delete set null,
  insurance text,
  risk text not null default 'low',
  no_show_score int not null default 0 check (no_show_score between 0 and 100),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients
  add column if not exists insurance_plan_id uuid references public.insurance_plans(id) on delete set null;

alter table public.patients
  add column if not exists cpf text,
  add column if not exists whatsapp text;

update public.patients
set cpf = coalesce(cpf, document),
    whatsapp = coalesce(whatsapp, phone)
where cpf is null
   or whatsapp is null;

create unique index if not exists patients_clinic_name_cpf_uidx
  on public.patients (clinic_id, lower(full_name), regexp_replace(coalesce(cpf, document, ''), '\D', '', 'g'))
  where regexp_replace(coalesce(cpf, document, ''), '\D', '', 'g') <> '';

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

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  full_name text not null,
  role public.employee_role not null,
  crm text,
  specialty text,
  phone text,
  whatsapp text,
  email text,
  commission_percent numeric(5,2) not null default 0,
  working_hours jsonb not null default '{"start":"08:00","end":"18:00"}'::jsonb,
  access_role text check (access_role in ('admin', 'medical', 'receptionist')),
  permissions jsonb,
  status public.staff_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_members_doctor_crm check (role <> 'doctor' or nullif(trim(coalesce(crm, '')), '') is not null)
);

alter table public.staff_members add column if not exists access_role text;
alter table public.staff_members add column if not exists permissions jsonb;
alter table public.staff_members drop constraint if exists staff_members_access_role_check;
alter table public.staff_members add constraint staff_members_access_role_check check (access_role is null or access_role in ('admin', 'medical', 'receptionist'));

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

create table if not exists public.attendance_guides (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  professional_id uuid references public.professionals(id) on delete set null,
  service_date date not null default current_date,
  procedure text,
  description text,
  signature_data text,
  downloaded_at timestamptz,
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
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.commissions
  add column if not exists settled_at timestamptz;

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

create table if not exists public.billing_plans (
  id text primary key,
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'BRL',
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null unique references public.clinics(id) on delete cascade,
  plan_id text not null references public.billing_plans(id),
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  task_key text not null,
  title text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, task_key)
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  category text not null check (category in ('whatsapp', 'documents', 'analytics', 'automation', 'billing')),
  provider text not null,
  status text not null default 'disabled' check (status in ('disabled', 'pending', 'active', 'error')),
  settings jsonb not null default '{}'::jsonb,
  secret_ref text,
  last_error text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, category, provider)
);

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  trigger_key text not null,
  channel text not null default 'whatsapp',
  template_id uuid references public.notification_templates(id) on delete set null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('guide', 'certificate', 'prescription', 'receipt')),
  body text not null,
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  entity text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
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
create index if not exists insurance_plans_clinic_name_idx on public.insurance_plans(clinic_id, name);
create index if not exists patients_clinic_name_idx on public.patients(clinic_id, full_name);
create index if not exists patients_clinic_cpf_idx on public.patients(clinic_id, cpf);
create index if not exists staff_members_clinic_role_idx on public.staff_members(clinic_id, role, status);
create index if not exists appointments_clinic_starts_idx on public.appointments(clinic_id, starts_at);
create index if not exists appointments_professional_time_idx on public.appointments(professional_id, starts_at, ends_at);
create index if not exists attendance_guides_clinic_patient_idx on public.attendance_guides(clinic_id, patient_id, service_date desc);
create index if not exists financial_transactions_clinic_due_idx on public.financial_transactions(clinic_id, due_date, status);
create index if not exists clinic_subscriptions_status_idx on public.clinic_subscriptions(status, current_period_ends_at);
create index if not exists onboarding_tasks_clinic_status_idx on public.onboarding_tasks(clinic_id, status);
create index if not exists integration_connections_clinic_category_idx on public.integration_connections(clinic_id, category, status);
create index if not exists automation_rules_clinic_trigger_idx on public.automation_rules(clinic_id, trigger_key, active);
create index if not exists document_templates_clinic_kind_idx on public.document_templates(clinic_id, kind, active);
create index if not exists analytics_events_clinic_created_idx on public.analytics_events(clinic_id, created_at desc);
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

create or replace function public.has_clinic_permission(p_clinic_id uuid, p_permission text)
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
      and (
        cm.role in ('owner', 'admin')
        or coalesce(cm.permissions->'screens', '[]'::jsonb) ? p_permission
      )
  );
$$;

create or replace function public.is_assigned_professional(p_clinic_id uuid, p_professional_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.professionals p
    where p.id = p_professional_id
      and p.clinic_id = p_clinic_id
      and p.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.staff_members sm
    where sm.clinic_id = p_clinic_id
      and sm.professional_id = p_professional_id
      and sm.user_id = (select auth.uid())
      and sm.status = 'active'
  );
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
  v_requested_plan text;
  v_plan text := 'starter';
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select nullif(raw_user_meta_data->>'selected_plan', '')
  into v_requested_plan
  from auth.users
  where id = v_user;

  if exists (
    select 1
    from public.billing_plans bp
    where bp.id = v_requested_plan
      and bp.active = true
  ) then
    v_plan := v_requested_plan;
  end if;

  insert into public.clinics (name, slug, created_by)
  values (p_name, p_slug, v_user)
  returning * into v_clinic;

  insert into public.clinic_memberships (clinic_id, user_id, role)
  values (v_clinic.id, v_user, 'owner');

  insert into public.clinic_subscriptions (
    clinic_id,
    plan_id,
    provider,
    status,
    trial_ends_at,
    current_period_ends_at,
    metadata
  )
  values (
    v_clinic.id,
    v_plan,
    'trial',
    'trialing',
    now() + interval '30 days',
    now() + interval '30 days',
    jsonb_build_object('created_from', 'clinicou_trial')
  )
  on conflict (clinic_id) do nothing;

  insert into public.onboarding_tasks (clinic_id, task_key, title, metadata)
  values
    (v_clinic.id, 'profile', 'Completar dados da clinica', '{"screen":"admin"}'::jsonb),
    (v_clinic.id, 'team', 'Cadastrar equipe e permissoes', '{"screen":"funcionarios"}'::jsonb),
    (v_clinic.id, 'agenda', 'Configurar agenda e disponibilidade', '{"screen":"agenda"}'::jsonb),
    (v_clinic.id, 'patients', 'Importar ou cadastrar primeiros pacientes', '{"screen":"pacientes"}'::jsonb),
    (v_clinic.id, 'billing', 'Escolher plano antes do fim do trial', '{"screen":"admin"}'::jsonb)
  on conflict (clinic_id, task_key) do nothing;

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
    'profiles', 'clinics', 'patients', 'professionals', 'staff_members', 'services', 'appointments',
    'insurance_plans', 'medical_records', 'attendance_guides', 'treatment_plans', 'financial_transactions', 'notification_templates',
    'billing_plans', 'clinic_subscriptions', 'onboarding_tasks', 'integration_connections', 'automation_rules', 'document_templates'
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
drop trigger if exists audit_staff_members on public.staff_members;
create trigger audit_staff_members after insert or update or delete on public.staff_members for each row execute function public.audit_clinic_row();
drop trigger if exists audit_attendance_guides on public.attendance_guides;
create trigger audit_attendance_guides after insert or update or delete on public.attendance_guides for each row execute function public.audit_clinic_row();

alter table public.profiles enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.insurance_plans enable row level security;
alter table public.patients enable row level security;
alter table public.professionals enable row level security;
alter table public.staff_members enable row level security;
alter table public.services enable row level security;
alter table public.rooms enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_events enable row level security;
alter table public.medical_records enable row level security;
alter table public.attendance_guides enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.commissions enable row level security;
alter table public.notification_templates enable row level security;
alter table public.billing_plans enable row level security;
alter table public.clinic_subscriptions enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.integration_connections enable row level security;
alter table public.automation_rules enable row level security;
alter table public.document_templates enable row level security;
alter table public.analytics_events enable row level security;
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

drop policy if exists "insurance plans member crud" on public.insurance_plans;
drop policy if exists "insurance plans member select" on public.insurance_plans;
create policy "insurance plans member select" on public.insurance_plans for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "insurance plans staff write" on public.insurance_plans;
create policy "insurance plans staff write" on public.insurance_plans for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "patients member crud" on public.patients;
drop policy if exists "patients member select" on public.patients;
create policy "patients member select" on public.patients for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "patients front desk write" on public.patients;
create policy "patients front desk write" on public.patients for insert to authenticated with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "patients front desk update" on public.patients;
create policy "patients front desk update" on public.patients for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "patients admin delete" on public.patients;
create policy "patients admin delete" on public.patients for delete to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "professionals member crud" on public.professionals;
drop policy if exists "professionals member select" on public.professionals;
create policy "professionals member select" on public.professionals for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "professionals admin write" on public.professionals;
create policy "professionals admin write" on public.professionals for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "staff members member crud" on public.staff_members;
drop policy if exists "staff members member select" on public.staff_members;
create policy "staff members member select" on public.staff_members for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "staff members admin write" on public.staff_members;
create policy "staff members admin write" on public.staff_members for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "services member crud" on public.services;
drop policy if exists "services member select" on public.services;
create policy "services member select" on public.services for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "services admin write" on public.services;
create policy "services admin write" on public.services for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "rooms member crud" on public.rooms;
drop policy if exists "rooms member select" on public.rooms;
create policy "rooms member select" on public.rooms for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "rooms admin write" on public.rooms;
create policy "rooms admin write" on public.rooms for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "appointments member crud" on public.appointments;
drop policy if exists "appointments member select" on public.appointments;
create policy "appointments member select" on public.appointments for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "appointments front desk insert" on public.appointments;
create policy "appointments front desk insert" on public.appointments for insert to authenticated with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "appointments front desk update" on public.appointments;
create policy "appointments front desk update" on public.appointments for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]) or public.is_assigned_professional(clinic_id, professional_id)) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]) or public.is_assigned_professional(clinic_id, professional_id));
drop policy if exists "appointments admin delete" on public.appointments;
create policy "appointments admin delete" on public.appointments for delete to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "appointment events member crud" on public.appointment_events;
drop policy if exists "appointment events member select" on public.appointment_events;
create policy "appointment events member select" on public.appointment_events for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "appointment events staff insert" on public.appointment_events;
create policy "appointment events staff insert" on public.appointment_events for insert to authenticated with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist','professional']::public.clinic_role[]));
drop policy if exists "medical records member crud" on public.medical_records;
drop policy if exists "medical records clinical select" on public.medical_records;
create policy "medical records clinical select" on public.medical_records for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario'));
drop policy if exists "medical records clinical insert" on public.medical_records;
create policy "medical records clinical insert" on public.medical_records for insert to authenticated with check (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario'));
drop policy if exists "medical records clinical update" on public.medical_records;
create policy "medical records clinical update" on public.medical_records for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario')) with check (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario'));
drop policy if exists "attendance guides member crud" on public.attendance_guides;
drop policy if exists "attendance guides member select" on public.attendance_guides;
create policy "attendance guides member select" on public.attendance_guides for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "attendance guides clinical write" on public.attendance_guides;
create policy "attendance guides clinical write" on public.attendance_guides for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist','professional']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist','professional']::public.clinic_role[]));
drop policy if exists "treatment plans member crud" on public.treatment_plans;
drop policy if exists "treatment plans member select" on public.treatment_plans;
create policy "treatment plans member select" on public.treatment_plans for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "treatment plans clinical write" on public.treatment_plans;
create policy "treatment plans clinical write" on public.treatment_plans for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario')) with check (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario'));
drop policy if exists "treatment plan items member crud" on public.treatment_plan_items;
drop policy if exists "treatment plan items member select" on public.treatment_plan_items;
create policy "treatment plan items member select" on public.treatment_plan_items for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "treatment plan items clinical write" on public.treatment_plan_items;
create policy "treatment plan items clinical write" on public.treatment_plan_items for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario')) with check (public.has_clinic_role(clinic_id, array['owner','admin','professional']::public.clinic_role[]) or public.has_clinic_permission(clinic_id, 'prontuario'));
drop policy if exists "financial role crud" on public.financial_transactions;
create policy "financial role crud" on public.financial_transactions for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[]));
drop policy if exists "commissions financial crud" on public.commissions;
create policy "commissions financial crud" on public.commissions for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[]));
drop policy if exists "notification templates member crud" on public.notification_templates;
create policy "notification templates member crud" on public.notification_templates for all to authenticated using (public.is_clinic_member(clinic_id)) with check (public.is_clinic_member(clinic_id));
drop policy if exists "billing plans authenticated select" on public.billing_plans;
create policy "billing plans authenticated select" on public.billing_plans for select to authenticated using (active = true);
drop policy if exists "clinic subscriptions financial select" on public.clinic_subscriptions;
create policy "clinic subscriptions financial select" on public.clinic_subscriptions for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','billing']::public.clinic_role[]));
drop policy if exists "onboarding tasks member select" on public.onboarding_tasks;
create policy "onboarding tasks member select" on public.onboarding_tasks for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "onboarding tasks staff update" on public.onboarding_tasks;
create policy "onboarding tasks staff update" on public.onboarding_tasks for update to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "integration connections admin select" on public.integration_connections;
create policy "integration connections admin select" on public.integration_connections for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "integration connections admin write" on public.integration_connections;
create policy "integration connections admin write" on public.integration_connections for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "automation rules staff select" on public.automation_rules;
create policy "automation rules staff select" on public.automation_rules for select to authenticated using (public.is_clinic_member(clinic_id));
drop policy if exists "automation rules admin write" on public.automation_rules;
create policy "automation rules admin write" on public.automation_rules for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin','receptionist']::public.clinic_role[]));
drop policy if exists "document templates clinical select" on public.document_templates;
create policy "document templates clinical select" on public.document_templates for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin','receptionist','professional']::public.clinic_role[]));
drop policy if exists "document templates admin write" on public.document_templates;
create policy "document templates admin write" on public.document_templates for all to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[])) with check (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "analytics events member insert" on public.analytics_events;
create policy "analytics events member insert" on public.analytics_events for insert to authenticated with check (public.is_clinic_member(clinic_id) and actor_id = (select auth.uid()));
drop policy if exists "analytics events admin select" on public.analytics_events;
create policy "analytics events admin select" on public.analytics_events for select to authenticated using (public.has_clinic_role(clinic_id, array['owner','admin']::public.clinic_role[]));
drop policy if exists "audit logs member select" on public.audit_logs;
create policy "audit logs member select" on public.audit_logs for select to authenticated using (public.is_clinic_member(clinic_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.clinics to authenticated;
grant select, insert, update, delete on public.clinic_memberships to authenticated;
grant select, insert, update, delete on public.insurance_plans to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.professionals to authenticated;
grant select, insert, update, delete on public.staff_members to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.appointment_events to authenticated;
grant select, insert, update, delete on public.medical_records to authenticated;
grant select, insert, update, delete on public.attendance_guides to authenticated;
grant select, insert, update, delete on public.treatment_plans to authenticated;
grant select, insert, update, delete on public.treatment_plan_items to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;
grant select, insert, update, delete on public.commissions to authenticated;
grant select, insert, update, delete on public.notification_templates to authenticated;
grant select on public.billing_plans to authenticated;
grant select on public.clinic_subscriptions to authenticated;
grant select, update on public.onboarding_tasks to authenticated;
grant select, insert, update, delete on public.integration_connections to authenticated;
grant select, insert, update, delete on public.automation_rules to authenticated;
grant select, insert, update, delete on public.document_templates to authenticated;
grant select, insert on public.analytics_events to authenticated;
grant select on public.audit_logs to authenticated;

revoke all on function public.handle_new_user() from public;
revoke all on function public.is_clinic_member(uuid) from public;
revoke all on function public.has_clinic_role(uuid, public.clinic_role[]) from public;
revoke all on function public.has_clinic_permission(uuid, text) from public;
revoke all on function public.is_assigned_professional(uuid, uuid) from public;
revoke all on function public.create_clinic(text, text) from public;
revoke all on function public.audit_clinic_row() from public;
grant execute on function public.is_clinic_member(uuid) to authenticated;
grant execute on function public.has_clinic_role(uuid, public.clinic_role[]) to authenticated;
grant execute on function public.has_clinic_permission(uuid, text) to authenticated;
grant execute on function public.is_assigned_professional(uuid, uuid) to authenticated;
grant execute on function public.create_clinic(text, text) to authenticated;

insert into public.billing_plans (id, name, price_cents, currency, billing_interval, limits, features, active)
values
  (
    'starter',
    'Starter',
    9900,
    'BRL',
    'month',
    '{"users":3,"patients":500,"automations":1}'::jsonb,
    '["agenda","pacientes","financeiro_basico"]'::jsonb,
    true
  ),
  (
    'growth',
    'Growth',
    19900,
    'BRL',
    'month',
    '{"users":10,"patients":3000,"automations":10}'::jsonb,
    '["agenda","prontuario","financeiro","whatsapp","documentos"]'::jsonb,
    true
  ),
  (
    'scale',
    'Scale',
    39900,
    'BRL',
    'month',
    '{"users":50,"patients":20000,"automations":50}'::jsonb,
    '["agenda","prontuario","financeiro","whatsapp","documentos","analytics","suporte_prioritario"]'::jsonb,
    true
  ),
  (
    'starter_annual',
    'Starter Anual',
    99000,
    'BRL',
    'year',
    '{"users":3,"patients":500,"automations":1}'::jsonb,
    '["agenda","pacientes","financeiro_basico","economia_2_meses"]'::jsonb,
    true
  ),
  (
    'growth_annual',
    'Growth Anual',
    199000,
    'BRL',
    'year',
    '{"users":10,"patients":3000,"automations":10}'::jsonb,
    '["agenda","prontuario","financeiro","whatsapp","documentos","economia_2_meses"]'::jsonb,
    true
  ),
  (
    'scale_annual',
    'Scale Anual',
    399000,
    'BRL',
    'year',
    '{"users":50,"patients":20000,"automations":50}'::jsonb,
    '["agenda","prontuario","financeiro","whatsapp","documentos","analytics","suporte_prioritario","economia_2_meses"]'::jsonb,
    true
  )
on conflict (id) do update
set name = excluded.name,
    price_cents = excluded.price_cents,
    currency = excluded.currency,
    billing_interval = excluded.billing_interval,
    limits = excluded.limits,
    features = excluded.features,
    active = excluded.active,
    updated_at = now();

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
  and public.is_clinic_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "clinic documents member insert" on storage.objects;
create policy "clinic documents member insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member((storage.foldername(name))[1]::uuid)
);

drop policy if exists "clinic documents member update" on storage.objects;
create policy "clinic documents member update" on storage.objects
for update to authenticated
using (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'clinicou-documents'
  and public.is_clinic_member((storage.foldername(name))[1]::uuid)
);

notify pgrst, 'reload schema';
