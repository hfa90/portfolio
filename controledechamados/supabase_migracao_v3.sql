-- =====================================================================
-- TI Control v3 — Migração (agenda, cores por empresa, financeiro detalhado)
-- Pode ser executado mais de uma vez com segurança (idempotente).
-- Supabase → SQL Editor → colar tudo → Run
-- =====================================================================

-- ---------- EMPRESAS ----------
alter table public.empresas add column if not exists cor text;
alter table public.empresas add column if not exists valor_padrao numeric(12,2) default 0;
alter table public.empresas add column if not exists prazo_pagamento_dias integer default 30;
alter table public.empresas add column if not exists observacoes text;

-- cada empresa existente ganha uma cor diferente (pode trocar depois na tela Empresas)
with p as (select id, row_number() over (order by nome) - 1 as rn from public.empresas where cor is null)
update public.empresas e
   set cor = (array['#4f8ef7','#34d399','#f59e0b','#f87171','#a78bfa','#22d3ee','#fb923c','#ec4899','#84cc16','#14b8a6','#eab308','#8b5cf6'])[(p.rn % 12) + 1]
  from p where e.id = p.id;

-- ---------- CHAMADOS ----------
alter table public.chamados add column if not exists hora_inicio time;
alter table public.chamados add column if not exists hora_fim time;
alter table public.chamados add column if not exists local_atendimento text;
alter table public.chamados add column if not exists numero_chamado_cliente text;
alter table public.chamados add column if not exists valor_extra numeric(12,2) default 0;
alter table public.chamados add column if not exists data_prevista_pagamento date;
alter table public.chamados add column if not exists obs_financeiro text;

create index if not exists idx_chamados_data_atendimento on public.chamados (data_atendimento);
create index if not exists idx_chamados_empresa on public.chamados (empresa_id);

-- ---------- RECEBIMENTOS (pagamentos parciais / totais de cada chamado) ----------
do $$
declare
  id_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into id_type
  from pg_attribute a
  where a.attrelid = 'public.chamados'::regclass and a.attname = 'id';

  if to_regclass('public.recebimentos') is null then
    execute format($f$
      create table public.recebimentos (
        id uuid primary key default gen_random_uuid(),
        chamado_id %s not null references public.chamados(id) on delete cascade,
        valor numeric(12,2) not null check (valor > 0),
        data_recebimento date not null default current_date,
        forma text,
        observacao text,
        created_at timestamptz not null default now()
      )$f$, id_type);
  end if;
end $$;

create index if not exists idx_recebimentos_chamado on public.recebimentos (chamado_id);

-- ---------- ACESSO: somente o DONO do sistema ----------
-- A primeira conta criada no app vira a dona automaticamente.
-- Contas criadas depois conseguem logar, mas não enxergam nem alteram nada.
create table if not exists public.usuarios_autorizados (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);
alter table public.usuarios_autorizados enable row level security;
drop policy if exists usuarios_autorizados_ver_proprio on public.usuarios_autorizados;
create policy usuarios_autorizados_ver_proprio on public.usuarios_autorizados for select to authenticated using (user_id = auth.uid());
revoke all on public.usuarios_autorizados from anon;
grant select on public.usuarios_autorizados to authenticated;

create or replace function public.autoriza_primeiro_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.usuarios_autorizados) then
    insert into public.usuarios_autorizados (user_id, email) values (new.id, new.email);
  end if;
  return new;
end $$;
drop trigger if exists trg_autoriza_primeiro_usuario on auth.users;
create trigger trg_autoriza_primeiro_usuario after insert on auth.users
  for each row execute function public.autoriza_primeiro_usuario();

create or replace function public.is_autorizado() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.usuarios_autorizados where user_id = auth.uid())
$$;

alter table public.empresas enable row level security;
alter table public.chamados enable row level security;
alter table public.recebimentos enable row level security;

drop policy if exists recebimentos_acesso_app on public.recebimentos;
drop policy if exists empresas_usuarios_logados on public.empresas;
drop policy if exists chamados_usuarios_logados on public.chamados;
drop policy if exists recebimentos_usuarios_logados on public.recebimentos;
drop policy if exists empresas_dono on public.empresas;
drop policy if exists chamados_dono on public.chamados;
drop policy if exists recebimentos_dono on public.recebimentos;
create policy empresas_dono on public.empresas for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());
create policy chamados_dono on public.chamados for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());
create policy recebimentos_dono on public.recebimentos for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());

revoke all on public.empresas, public.chamados, public.recebimentos from anon;
grant select, insert, update, delete on public.empresas, public.chamados, public.recebimentos to authenticated;

-- Anexos (Storage): bucket privado 'chamados-anexos' acessível só por usuários logados
insert into storage.buckets (id, name, public) values ('chamados-anexos', 'chamados-anexos', false)
on conflict (id) do nothing;
update storage.buckets set public = false where id = 'chamados-anexos';
drop policy if exists ler_anexos on storage.objects;
drop policy if exists upload_anexos on storage.objects;
drop policy if exists excluir_anexos on storage.objects;
drop policy if exists anexos_usuarios_logados on storage.objects;
drop policy if exists anexos_dono on storage.objects;
create policy anexos_dono on storage.objects for all to authenticated
  using (bucket_id = 'chamados-anexos' and public.is_autorizado())
  with check (bucket_id = 'chamados-anexos' and public.is_autorizado());

-- Atualiza o cache do PostgREST para as novas colunas aparecerem na API na hora
notify pgrst, 'reload schema';
