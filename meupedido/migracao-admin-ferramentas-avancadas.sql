-- Ferramentas administrativas: perfis de admin e auditoria.

alter table public.admins
  add column if not exists perfil text not null default 'gestor';

alter table public.admins drop constraint if exists admins_perfil_check;
alter table public.admins
  add constraint admins_perfil_check
  check (perfil in ('master','gestor','financeiro','cozinha'));

update public.admins
   set perfil = 'master'
 where email = 'haydenfernandes.ti@gmail.com'
    or id = (select id from public.admins order by criado_em asc limit 1);

create table if not exists public.auditoria_admin (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on update cascade on delete set null,
  admin_nome text,
  acao text not null,
  entidade text,
  entidade_id uuid,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_admin_criado_idx on public.auditoria_admin (criado_em desc);
create index if not exists auditoria_admin_entidade_idx on public.auditoria_admin (entidade, entidade_id);

create or replace function public.is_admin_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.admins a
     where a.id = (select auth.uid())
       and a.ativo = true
       and a.perfil = 'master'
  );
$$;

alter table public.auditoria_admin enable row level security;

drop policy if exists "admins_master_all" on public.admins;
create policy "admins_master_all" on public.admins
for all to authenticated
using (public.is_admin_master())
with check (public.is_admin_master());

drop policy if exists "auditoria_admin_select" on public.auditoria_admin;
drop policy if exists "auditoria_admin_insert" on public.auditoria_admin;
create policy "auditoria_admin_select" on public.auditoria_admin
for select to authenticated
using (public.is_admin());
create policy "auditoria_admin_insert" on public.auditoria_admin
for insert to authenticated
with check (public.is_admin() and admin_id = (select auth.uid()));

grant select, insert, update, delete on public.admins to authenticated;
grant select, insert on public.auditoria_admin to authenticated;
revoke all on function public.is_admin_master() from public;
grant execute on function public.is_admin_master() to authenticated;
