-- Meu Pedido / Marmita App
-- Banco completo para Supabase: tabelas, RLS, RPCs, storage e dados iniciais.
-- Rode este arquivo no Supabase SQL Editor.
--
-- Admin solicitado:
--   Email: haydenfernandes.ti@gmail.com
--   Senha no Supabase Auth: Acesso@2026
--
-- Importante: por seguranca, este script nao grava senha diretamente nas tabelas
-- internas do Supabase Auth. Crie o usuario em Authentication > Users com o email
-- e senha acima, marque "Auto Confirm User", e rode este SQL. Se voce rodar o SQL
-- antes, rode novamente apenas o bloco "ADMIN INICIAL" ao final depois de criar o user.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- TABELAS
-- ---------------------------------------------------------------------------

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,
  endereco text,
  chave_pix text,
  frete_entrega numeric(10,2) not null default 0 check (frete_entrega >= 0),
  dias_atendimento integer[] not null default array[1,2,3,4,5],
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.pratos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  nome text not null,
  descricao text,
  foto_url text,
  preco numeric(10,2) not null check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  nome text not null,
  foto_url text,
  preco_extra numeric(10,2) not null default 0 check (preco_extra >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text unique,
  empresa text,
  endereco_empresa text,
  whatsapp text,
  fiado_bloqueado boolean not null default false,
  pin_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on update cascade on delete cascade,
  nome text not null,
  email text not null unique,
  perfil text not null default 'gestor' check (perfil in ('master','gestor','financeiro','cozinha')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.configuracoes (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.login_tentativas (
  matricula text primary key,
  tentativas integer not null default 0,
  bloqueado_ate timestamptz,
  ultima_tentativa timestamptz not null default now()
);

create table if not exists public.cardapio_dia (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  prato_id uuid not null references public.pratos(id) on update cascade on delete cascade,
  disponivel boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete restrict,
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  prato_id uuid not null references public.pratos(id) on update cascade on delete restrict,
  data date not null default current_date,
  preco_total numeric(10,2) not null check (preco_total >= 0),
  observacoes text,
  status text not null default 'aberto' check (status in ('aguardando_pagamento','aberto','fechado','enviado','entregue','concluido','cancelado')),
  forma_pagamento text not null check (forma_pagamento in ('pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde','cartao_infinitepay')),
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente','pago','cancelado')),
  pago_em timestamptz,
  fechado_em timestamptz,
  enviado_em timestamptz,
  entregue_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  pedido_coletivo_id uuid,
  nome_pessoa text,
  comprovante_url text,
  comprovante_status text not null default 'sem_comprovante' check (comprovante_status in ('sem_comprovante','enviado','aprovado','rejeitado')),
  comprovante_motivo text,
  comprovante_revisado_em timestamptz,
  comprovante_revisado_por uuid references auth.users(id) on update cascade on delete set null,
  infinitepay_checkout_url text,
  infinitepay_invoice_slug text,
  infinitepay_transaction_nsu text,
  infinitepay_receipt_url text,
  infinitepay_capture_method text,
  infinitepay_paid_amount numeric(10,2),
  infinitepay_checked_em timestamptz,
  infinitepay_payload jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedido_acompanhamentos (
  pedido_id uuid not null references public.pedidos(id) on update cascade on delete cascade,
  acompanhamento_id uuid not null references public.acompanhamentos(id) on update cascade on delete restrict,
  primary key (pedido_id, acompanhamento_id)
);

create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete restrict,
  valor numeric(10,2) not null check (valor > 0),
  data date not null default current_date,
  metodo text not null check (metodo in ('pix','dinheiro')),
  referencia_periodo text,
  observacoes text,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedidos_coletivos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete restrict,
  data date not null default current_date,
  total numeric(10,2) not null default 0 check (total >= 0),
  qtd_pessoas integer not null default 0 check (qtd_pessoas >= 0),
  status text not null default 'aberto' check (status in ('aberto','fechado','cancelado')),
  criado_em timestamptz not null default now()
);

create table if not exists public.pedidos_coletivos_itens (
  id uuid primary key default gen_random_uuid(),
  coletivo_id uuid not null references public.pedidos_coletivos(id) on update cascade on delete cascade,
  colaborador_id uuid references public.colaboradores(id) on update cascade on delete set null,
  nome_pessoa text not null,
  prato_id uuid not null references public.pratos(id) on update cascade on delete restrict,
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  preco numeric(10,2) not null default 0 check (preco >= 0),
  observacoes text,
  pedido_id uuid references public.pedidos(id) on update cascade on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  criado_em timestamptz not null default now()
);

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

-- Compatibilidade caso o projeto ja tenha sido criado com o schema antigo.
alter table public.admins add column if not exists perfil text not null default 'gestor';
alter table public.admins drop constraint if exists admins_perfil_check;
alter table public.admins
  add constraint admins_perfil_check
  check (perfil in ('master','gestor','financeiro','cozinha'));
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.colaboradores add column if not exists empresa text;
alter table public.colaboradores add column if not exists endereco_empresa text;
alter table public.colaboradores add column if not exists whatsapp text;
alter table public.colaboradores add column if not exists fiado_bloqueado boolean not null default false;
alter table public.pratos add column if not exists foto_url text;
alter table public.acompanhamentos add column if not exists foto_url text;
notify pgrst, 'reload schema';
alter table public.pedidos add column if not exists comprovante_url text;
alter table public.pedidos add column if not exists fechado_em timestamptz;
alter table public.pedidos add column if not exists enviado_em timestamptz;
alter table public.pedidos add column if not exists entregue_em timestamptz;
alter table public.pedidos add column if not exists concluido_em timestamptz;
alter table public.pedidos add column if not exists cancelado_em timestamptz;
alter table public.pedidos add column if not exists pedido_coletivo_id uuid;
alter table public.pedidos add column if not exists nome_pessoa text;
alter table public.pedidos_coletivos_itens add column if not exists colaborador_id uuid references public.colaboradores(id) on update cascade on delete set null;
alter table public.pedidos
  drop constraint if exists pedidos_pedido_coletivo_id_fkey;
alter table public.pedidos
  add constraint pedidos_pedido_coletivo_id_fkey
  foreign key (pedido_coletivo_id) references public.pedidos_coletivos(id) on update cascade on delete set null;
alter table public.pedidos add column if not exists comprovante_status text not null default 'sem_comprovante';
alter table public.pedidos add column if not exists comprovante_motivo text;
alter table public.pedidos add column if not exists comprovante_revisado_em timestamptz;
alter table public.pedidos add column if not exists comprovante_revisado_por uuid references auth.users(id) on update cascade on delete set null;
alter table public.pedidos add column if not exists infinitepay_checkout_url text;
alter table public.pedidos add column if not exists infinitepay_invoice_slug text;
alter table public.pedidos add column if not exists infinitepay_transaction_nsu text;
alter table public.pedidos add column if not exists infinitepay_receipt_url text;
alter table public.pedidos add column if not exists infinitepay_capture_method text;
alter table public.pedidos add column if not exists infinitepay_paid_amount numeric(10,2);
alter table public.pedidos add column if not exists infinitepay_checked_em timestamptz;
alter table public.pedidos add column if not exists infinitepay_payload jsonb;
alter table public.pedidos drop constraint if exists pedidos_status_check;
alter table public.pedidos
  add constraint pedidos_status_check
  check (status in ('aguardando_pagamento','aberto','fechado','enviado','entregue','concluido','cancelado'));
alter table public.pedidos drop constraint if exists pedidos_forma_pagamento_check;
alter table public.pedidos
  add constraint pedidos_forma_pagamento_check
  check (forma_pagamento in ('pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde','cartao_infinitepay'));

update public.pedidos
   set comprovante_status = 'enviado'
 where comprovante_url is not null
   and comprovante_status = 'sem_comprovante'
   and status_pagamento = 'pendente';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pedidos_comprovante_status_check'
       and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos
      add constraint pedidos_comprovante_status_check
      check (comprovante_status in ('sem_comprovante','enviado','aprovado','rejeitado'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'colaboradores'
       and column_name = 'setor'
  ) then
    execute 'update public.colaboradores set empresa = setor where empresa is null and setor is not null';
  end if;
end $$;

-- Saneamento para bases onde o script ja foi executado parcialmente antes dos
-- indices unicos existirem. Mantem o registro mais antigo e reaponta as FKs.
alter table public.cardapio_dia drop constraint if exists cardapio_dia_data_prato_id_key;
alter table public.cardapio_dia drop constraint if exists cardapio_dia_data_prato_key;
drop index if exists public.fornecedores_nome_uidx;
drop index if exists public.pratos_fornecedor_nome_uidx;
drop index if exists public.acompanhamentos_fornecedor_nome_uidx;
drop index if exists public.cardapio_dia_data_prato_uidx;
drop index if exists public.cardapio_dia_data_prato_id_key;
drop index if exists public.cardapio_dia_data_prato_key;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
update public.pratos p
   set fornecedor_id = mapa.manter_id
  from mapa
 where p.fornecedor_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
update public.acompanhamentos a
   set fornecedor_id = mapa.manter_id
  from mapa
 where a.fornecedor_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
update public.cardapio_dia cd
   set fornecedor_id = mapa.manter_id
  from mapa
 where cd.fornecedor_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
update public.pedidos pe
   set fornecedor_id = mapa.manter_id
  from mapa
 where pe.fornecedor_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
update public.pedidos_coletivos_itens pci
   set fornecedor_id = mapa.manter_id
  from mapa
 where pci.fornecedor_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by nome order by criado_em, id) as manter_id
    from public.fornecedores
)
delete from public.fornecedores f
 using mapa
 where f.id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.pratos
)
delete from public.cardapio_dia cd
 using mapa
 where cd.prato_id = mapa.id
   and mapa.id <> mapa.manter_id
   and exists (
     select 1
       from public.cardapio_dia cd2
      where cd2.data = cd.data
        and cd2.prato_id = mapa.manter_id
   );

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.pratos
)
update public.cardapio_dia cd
   set prato_id = mapa.manter_id
  from mapa
 where cd.prato_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.pratos
)
update public.pedidos pe
   set prato_id = mapa.manter_id
  from mapa
 where pe.prato_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.pratos
)
update public.pedidos_coletivos_itens pci
   set prato_id = mapa.manter_id
  from mapa
 where pci.prato_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.pratos
)
delete from public.pratos p
 using mapa
 where p.id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.acompanhamentos
)
delete from public.pedido_acompanhamentos pa
 using mapa
 where pa.acompanhamento_id = mapa.id
   and mapa.id <> mapa.manter_id
   and exists (
     select 1
       from public.pedido_acompanhamentos pa2
      where pa2.pedido_id = pa.pedido_id
        and pa2.acompanhamento_id = mapa.manter_id
   );

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.acompanhamentos
)
update public.pedido_acompanhamentos pa
   set acompanhamento_id = mapa.manter_id
  from mapa
 where pa.acompanhamento_id = mapa.id
   and mapa.id <> mapa.manter_id;

with mapa as (
  select id, first_value(id) over (partition by fornecedor_id, nome order by criado_em, id) as manter_id
    from public.acompanhamentos
)
delete from public.acompanhamentos a
 using mapa
 where a.id = mapa.id
   and mapa.id <> mapa.manter_id;

with duplicados as (
  select id,
         row_number() over (partition by data, prato_id order by criado_em, id) as rn
    from public.cardapio_dia
)
delete from public.cardapio_dia cd
 using duplicados
 where cd.id = duplicados.id
   and duplicados.rn > 1;

-- Unicidades naturais para evitar duplicidade no painel.
create unique index if not exists fornecedores_nome_uidx on public.fornecedores (nome);
create unique index if not exists pratos_fornecedor_nome_uidx on public.pratos (fornecedor_id, nome);
create unique index if not exists acompanhamentos_fornecedor_nome_uidx on public.acompanhamentos (fornecedor_id, nome);
create unique index if not exists cardapio_dia_data_prato_uidx on public.cardapio_dia (data, prato_id);

-- Indices dos fluxos principais.
create index if not exists pratos_fornecedor_idx on public.pratos (fornecedor_id);
create index if not exists acompanhamentos_fornecedor_idx on public.acompanhamentos (fornecedor_id);
create index if not exists cardapio_dia_data_idx on public.cardapio_dia (data);
create index if not exists pedidos_data_idx on public.pedidos (data);
create index if not exists pedidos_colaborador_idx on public.pedidos (colaborador_id);
create index if not exists pedidos_fornecedor_data_idx on public.pedidos (fornecedor_id, data);
create index if not exists pedidos_pagamento_idx on public.pedidos (status_pagamento, forma_pagamento);
create index if not exists pedidos_coletivos_data_idx on public.pedidos_coletivos (data);
create index if not exists auditoria_admin_criado_idx on public.auditoria_admin (criado_em desc);
create index if not exists auditoria_admin_entidade_idx on public.auditoria_admin (entidade, entidade_id);

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function public.touch_configuracoes()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists configuracoes_touch on public.configuracoes;
create trigger configuracoes_touch
before update on public.configuracoes
for each row execute function public.touch_configuracoes();

drop trigger if exists cardapio_horario_default on public.cardapio_dia;
drop function if exists public.preencher_horario_cardapio();

create or replace function public.hoje_sp()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

alter table public.cardapio_dia alter column data set default public.hoje_sp();
alter table public.fornecedores add column if not exists frete_entrega numeric(10,2) not null default 0 check (frete_entrega >= 0);
alter table public.pedidos alter column data set default public.hoje_sp();
alter table public.pedidos_coletivos alter column data set default public.hoje_sp();

-- ---------------------------------------------------------------------------
-- FUNCOES DE SEGURANCA E RPCS
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
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
  );
$$;

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

drop function if exists public.admin_criar_perfil(text, text, text, boolean);
drop function if exists public.admin_atualizar_perfil(uuid, text, text, boolean);
drop function if exists public.admin_excluir_perfil(uuid);

create or replace function public.admin_criar_perfil(
  p_email text,
  p_nome text,
  p_perfil text,
  p_ativo boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_nome text := nullif(btrim(p_nome), '');
  v_perfil text := lower(nullif(btrim(p_perfil), ''));
  v_ativo boolean := coalesce(p_ativo, true);
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode gerenciar admins.' using errcode = '42501';
  end if;

  if v_nome is null or nullif(btrim(p_email), '') is null then
    raise exception 'Informe nome e email do admin.' using errcode = '22023';
  end if;

  if v_perfil not in ('master', 'gestor', 'financeiro', 'cozinha') then
    raise exception 'Perfil de admin invalido.' using errcode = '22023';
  end if;

  select u.id, u.email
    into v_user_id, v_email
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;

  if v_user_id is null then
    raise exception 'Usuario nao encontrado no Supabase Auth. Crie o login em Authentication > Users antes de vincular o perfil.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.admins a
     where lower(a.email) = lower(v_email)
       and a.id <> v_user_id
  ) then
    raise exception 'Este email ja esta vinculado a outro perfil de admin.' using errcode = '23505';
  end if;

  if v_user_id = (select auth.uid()) and (v_perfil <> 'master' or v_ativo = false) then
    raise exception 'Voce nao pode remover seu proprio acesso master.' using errcode = '42501';
  end if;

  if exists (
       select 1 from public.admins a
        where a.id = v_user_id
          and a.perfil = 'master'
          and a.ativo = true
     )
     and (v_perfil <> 'master' or v_ativo = false)
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  insert into public.admins (id, nome, email, perfil, ativo)
  values (v_user_id, v_nome, v_email, v_perfil, v_ativo)
  on conflict (id) do update
     set nome = excluded.nome,
         email = excluded.email,
         perfil = excluded.perfil,
         ativo = excluded.ativo;

  return v_user_id;
end;
$$;

create or replace function public.admin_atualizar_perfil(
  p_admin_id uuid,
  p_nome text,
  p_perfil text,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admins%rowtype;
  v_nome text := nullif(btrim(p_nome), '');
  v_perfil text := lower(nullif(btrim(p_perfil), ''));
  v_ativo boolean := coalesce(p_ativo, true);
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode gerenciar admins.' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'Informe o nome do admin.' using errcode = '22023';
  end if;

  if v_perfil not in ('master', 'gestor', 'financeiro', 'cozinha') then
    raise exception 'Perfil de admin invalido.' using errcode = '22023';
  end if;

  select * into v_admin from public.admins where id = p_admin_id;
  if not found then
    raise exception 'Perfil de admin nao encontrado.' using errcode = 'P0002';
  end if;

  if p_admin_id = (select auth.uid()) and (v_perfil <> 'master' or v_ativo = false) then
    raise exception 'Voce nao pode remover seu proprio acesso master.' using errcode = '42501';
  end if;

  if v_admin.perfil = 'master'
     and v_admin.ativo = true
     and (v_perfil <> 'master' or v_ativo = false)
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  update public.admins
     set nome = v_nome,
         perfil = v_perfil,
         ativo = v_ativo
   where id = p_admin_id;
end;
$$;

create or replace function public.admin_excluir_perfil(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admins%rowtype;
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode excluir admins.' using errcode = '42501';
  end if;

  select * into v_admin from public.admins where id = p_admin_id;
  if not found then
    raise exception 'Perfil de admin nao encontrado.' using errcode = 'P0002';
  end if;

  if p_admin_id = (select auth.uid()) then
    raise exception 'Voce nao pode excluir seu proprio perfil master.' using errcode = '42501';
  end if;

  if v_admin.perfil = 'master'
     and v_admin.ativo = true
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  delete from public.admins where id = p_admin_id;
end;
$$;

drop function if exists public.admin_excluir_registro(text, uuid);
drop function if exists public.admin_excluir_registro(uuid, text);

create or replace function public.admin_excluir_registro(p_tipo text, p_id uuid)
returns table (
  acao text,
  mensagem text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := public.hoje_sp();
  v_tem_historico boolean;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if p_tipo = 'fornecedores' then
    select exists (select 1 from public.pedidos where fornecedor_id = p_id)
        or exists (select 1 from public.pedidos_coletivos_itens where fornecedor_id = p_id)
      into v_tem_historico;

    if v_tem_historico then
      update public.fornecedores set ativo = false where id = p_id;
      update public.pratos set ativo = false where fornecedor_id = p_id;
      update public.acompanhamentos set ativo = false where fornecedor_id = p_id;
      delete from public.cardapio_dia where fornecedor_id = p_id and data >= v_hoje;
      return query select 'desativado'::text, 'Fornecedor possui pedidos vinculados e foi desativado. O historico foi preservado.'::text;
      return;
    end if;

    delete from public.cardapio_dia where fornecedor_id = p_id;
    delete from public.acompanhamentos where fornecedor_id = p_id;
    delete from public.pratos where fornecedor_id = p_id;
    delete from public.fornecedores where id = p_id;
    return query select 'excluido'::text, 'Fornecedor excluido definitivamente.'::text;
    return;
  end if;

  if p_tipo = 'pratos' then
    select exists (select 1 from public.pedidos where prato_id = p_id)
        or exists (select 1 from public.pedidos_coletivos_itens where prato_id = p_id)
      into v_tem_historico;

    if v_tem_historico then
      update public.pratos set ativo = false where id = p_id;
      delete from public.cardapio_dia where prato_id = p_id and data >= v_hoje;
      return query select 'desativado'::text, 'Prato possui pedidos vinculados e foi desativado. O historico foi preservado.'::text;
      return;
    end if;

    delete from public.cardapio_dia where prato_id = p_id;
    delete from public.pratos where id = p_id;
    return query select 'excluido'::text, 'Prato excluido definitivamente.'::text;
    return;
  end if;

  if p_tipo = 'acompanhamentos' then
    select exists (select 1 from public.pedido_acompanhamentos where acompanhamento_id = p_id)
      into v_tem_historico;

    if v_tem_historico then
      update public.acompanhamentos set ativo = false where id = p_id;
      return query select 'removido'::text, 'Acompanhamento removido do cadastro. O historico foi preservado.'::text;
      return;
    end if;

    delete from public.acompanhamentos where id = p_id;
    return query select 'excluido'::text, 'Acompanhamento excluido definitivamente.'::text;
    return;
  end if;

  if p_tipo = 'colaboradores' then
    select exists (select 1 from public.pedidos where colaborador_id = p_id)
        or exists (select 1 from public.pedidos_coletivos where colaborador_id = p_id)
        or exists (select 1 from public.pagamentos where colaborador_id = p_id)
      into v_tem_historico;

    if v_tem_historico then
      update public.colaboradores set ativo = false where id = p_id;
      return query select 'desativado'::text, 'Colaborador possui historico vinculado e foi desativado. O historico foi preservado.'::text;
      return;
    end if;

    delete from public.login_tentativas
     where matricula = (select c.matricula from public.colaboradores c where c.id = p_id);
    delete from public.push_subscriptions where colaborador_id = p_id;
    delete from public.colaboradores where id = p_id;
    return query select 'excluido'::text, 'Colaborador excluido definitivamente.'::text;
    return;
  end if;

  raise exception 'Tipo de registro invalido: %', p_tipo;
end;
$$;

drop function if exists public.admin_limpar_dados();

create or replace function public.admin_limpar_dados()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  truncate table
    public.pedido_acompanhamentos,
    public.pedidos_coletivos_itens,
    public.pedidos_coletivos,
    public.pagamentos,
    public.pedidos,
    public.cardapio_dia,
    public.acompanhamentos,
    public.pratos,
    public.fornecedores,
    public.push_subscriptions,
    public.login_tentativas,
    public.colaboradores
  restart identity cascade;

  return 'Dados operacionais apagados. Admins e configuracoes foram preservados.';
end;
$$;

drop function if exists public.login_colaborador(text, text);

create or replace function public.login_colaborador(p_matricula text, p_pin text)
returns table (
  sucesso boolean,
  mensagem_erro text,
  bloqueado_ate timestamptz,
  id uuid,
  nome text,
  matricula text,
  empresa text,
  fiado_bloqueado boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_colab public.colaboradores%rowtype;
  v_tent public.login_tentativas%rowtype;
  v_tentativas integer;
  v_bloqueado timestamptz;
begin
  p_matricula := trim(coalesce(p_matricula, ''));
  p_pin := trim(coalesce(p_pin, ''));

  if p_matricula = '' or p_pin = '' then
    return query select false, 'Informe matricula e PIN.', null::timestamptz, null::uuid, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  select * into v_tent from public.login_tentativas lt where lt.matricula = p_matricula;
  if v_tent.bloqueado_ate is not null and v_tent.bloqueado_ate > now() then
    return query select false, 'Muitas tentativas. Tente novamente mais tarde.', v_tent.bloqueado_ate, null::uuid, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  select * into v_colab
    from public.colaboradores c
   where c.matricula = p_matricula
     and c.ativo = true
   limit 1;

  if v_colab.id is not null and v_colab.pin_hash = crypt(p_pin, v_colab.pin_hash) then
    delete from public.login_tentativas lt where lt.matricula = p_matricula;
    return query select true, null::text, null::timestamptz, v_colab.id, v_colab.nome, v_colab.matricula, v_colab.empresa, v_colab.fiado_bloqueado;
    return;
  end if;

  insert into public.login_tentativas as lt (matricula, tentativas, bloqueado_ate, ultima_tentativa)
  values (p_matricula, 1, null, now())
  on conflict on constraint login_tentativas_pkey do update
     set tentativas = case
           when lt.bloqueado_ate is not null and lt.bloqueado_ate <= now()
             then 1
           else lt.tentativas + 1
         end,
         bloqueado_ate = case
           when (case
                   when lt.bloqueado_ate is not null and lt.bloqueado_ate <= now()
                     then 1
                   else lt.tentativas + 1
                 end) >= 5
             then now() + interval '15 minutes'
           else null
         end,
         ultima_tentativa = now()
  returning lt.tentativas, lt.bloqueado_ate into v_tentativas, v_bloqueado;

  return query select false, 'Matricula ou PIN incorretos.', v_bloqueado, null::uuid, null::text, null::text, null::text, null::boolean;
end;
$$;

drop function if exists public.cadastrar_colaborador_publico(text, text, text, text, text, text);

create or replace function public.cadastrar_colaborador_publico(
  p_nome text,
  p_whatsapp text,
  p_matricula text,
  p_empresa text,
  p_endereco_empresa text,
  p_pin text
)
returns table (
  id uuid,
  nome text,
  matricula text,
  empresa text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_colab_id uuid;
begin
  p_nome := nullif(trim(coalesce(p_nome, '')), '');
  p_whatsapp := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  p_matricula := nullif(trim(coalesce(p_matricula, '')), '');
  p_empresa := nullif(trim(coalesce(p_empresa, '')), '');
  p_endereco_empresa := nullif(trim(coalesce(p_endereco_empresa, '')), '');
  p_pin := trim(coalesce(p_pin, ''));

  if p_nome is null then
    raise exception 'Informe seu nome.';
  end if;

  if p_matricula is null then
    raise exception 'Informe sua matricula.';
  end if;

  if p_empresa is null then
    raise exception 'Informe sua empresa.';
  end if;

  if p_whatsapp = '' then
    raise exception 'Informe seu WhatsApp.';
  end if;

  if p_pin !~ '^\d{4}$' then
    raise exception 'O PIN deve ter 4 digitos numericos.';
  end if;

  if exists (
    select 1
      from public.colaboradores c
     where c.matricula = p_matricula
  ) then
    raise exception 'Esta matricula ja esta cadastrada. Entre com sua matricula e PIN.';
  end if;

  insert into public.colaboradores (
    nome, matricula, empresa, endereco_empresa, whatsapp, pin_hash, ativo
  )
  values (
    p_nome,
    p_matricula,
    p_empresa,
    p_endereco_empresa,
    nullif(p_whatsapp, ''),
    crypt(p_pin, gen_salt('bf')),
    true
  )
  returning colaboradores.id into v_colab_id;

  return query
  select c.id, c.nome, c.matricula, c.empresa
    from public.colaboradores c
   where c.id = v_colab_id;
end;
$$;

create or replace function public.set_pin_colaborador(p_colaborador_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar PIN.';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN deve conter de 4 a 8 digitos numericos.';
  end if;

  update public.colaboradores
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_colaborador_id;

  if not found then
    raise exception 'Colaborador nao encontrado.';
  end if;
end;
$$;

drop function if exists public.cardapio_hoje();

create or replace function public.cardapio_hoje()
returns table (
  cardapio_id uuid,
  data date,
  fornecedor_id uuid,
  fornecedor_nome text,
  fornecedor_pix text,
  fornecedor_frete numeric,
  horario_inicio time without time zone,
  horario_limite time without time zone,
  prato_id uuid,
  prato_nome text,
  prato_descricao text,
  prato_foto_url text,
  prato_preco numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cd.id,
    cd.data,
    f.id,
    f.nome,
    f.chave_pix,
    coalesce(f.frete_entrega, 0),
    null::time,
    null::time,
    p.id,
    p.nome,
    p.descricao,
    p.foto_url,
    p.preco
  from public.cardapio_dia cd
  join public.fornecedores f on f.id = cd.fornecedor_id
  join public.pratos p on p.id = cd.prato_id
  where cd.data = public.hoje_sp()
    and cd.disponivel = true
    and f.ativo = true
    and p.ativo = true
    and extract(dow from public.hoje_sp())::int = any(f.dias_atendimento)
  order by f.nome, p.nome;
$$;

drop function if exists public.meus_pedidos(uuid);

create or replace function public.meus_pedidos(p_colaborador_id uuid)
returns table (
  id uuid,
  data date,
  preco_total numeric,
  observacoes text,
  status text,
  forma_pagamento text,
  status_pagamento text,
  comprovante_url text,
  comprovante_status text,
  comprovante_motivo text,
  criado_em timestamptz,
  pago_em timestamptz,
  fechado_em timestamptz,
  enviado_em timestamptz,
  entregue_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  pedido_coletivo_id uuid,
  nome_pessoa text,
  coletivo_criado_em timestamptz,
  coletivo_criador_nome text,
  prato_nome text,
  fornecedor_nome text,
  acompanhamentos text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.id,
    pe.data,
    pe.preco_total,
    pe.observacoes,
    pe.status,
    pe.forma_pagamento,
    pe.status_pagamento,
    pe.comprovante_url,
    pe.comprovante_status,
    pe.comprovante_motivo,
    pe.criado_em,
    pe.pago_em,
    pe.fechado_em,
    pe.enviado_em,
    pe.entregue_em,
    pe.concluido_em,
    pe.cancelado_em,
    pe.pedido_coletivo_id,
    pe.nome_pessoa,
    pc.criado_em,
    org.nome,
    pr.nome,
    fo.nome,
    coalesce(string_agg(ac.nome, ', ' order by ac.nome), '') as acompanhamentos
  from public.pedidos pe
  join public.colaboradores c on c.id = pe.colaborador_id and c.ativo = true
  join public.pratos pr on pr.id = pe.prato_id
  join public.fornecedores fo on fo.id = pe.fornecedor_id
  left join public.pedidos_coletivos pc on pc.id = pe.pedido_coletivo_id
  left join public.colaboradores org on org.id = pc.colaborador_id
  left join public.pedido_acompanhamentos pa on pa.pedido_id = pe.id
  left join public.acompanhamentos ac on ac.id = pa.acompanhamento_id
  where pe.colaborador_id = p_colaborador_id
    and pe.data >= public.hoje_sp() - interval '180 days'
    and pe.status <> 'aguardando_pagamento'
  group by pe.id, pc.criado_em, org.nome, pr.nome, fo.nome
  order by pe.data desc, pe.criado_em desc;
$$;

drop function if exists public.resumo_fiado_colaborador(uuid);

create or replace function public.resumo_fiado_colaborador(p_colaborador_id uuid)
returns table (
  colaborador_id uuid,
  fiado_bloqueado boolean,
  total_debito numeric,
  qtd_pedidos integer,
  whatsapp_admin text,
  pix_empresa text,
  total_aberto numeric,
  qtd_abertos integer,
  proximo_vencimento date,
  politica_fiado text
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select
      coalesce((select valor from public.configuracoes where chave = 'fechamento_fiado_periodo'), 'quinzenal') as periodo,
      least(greatest(coalesce((select nullif(valor, '')::int from public.configuracoes where chave = 'fechamento_fiado_dia_mes'), 30), 1), 31) as dia_mes
  ),
  fiados as (
    select
      pe.*,
      case
        when cfg.periodo = 'mensal' then
          make_date(
            extract(year from (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end))::int,
            extract(month from (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end))::int,
            least(
              cfg.dia_mes,
              extract(day from (
                date_trunc('month', (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end)) + interval '1 month - 1 day'
              ))::int
            )
          )
        when extract(day from pe.data)::int <= 15 then
          make_date(extract(year from pe.data)::int, extract(month from pe.data)::int, 15)
        else
          make_date(
            extract(year from pe.data)::int,
            extract(month from pe.data)::int,
            least(30, extract(day from (date_trunc('month', pe.data) + interval '1 month - 1 day'))::int)
          )
      end as vencimento,
      cfg.periodo
    from public.pedidos pe
    cross join cfg
    where pe.colaborador_id = p_colaborador_id
      and pe.forma_pagamento = 'fiado'
      and pe.status_pagamento = 'pendente'
      and pe.status <> 'cancelado'
  )
  select
    c.id,
    c.fiado_bloqueado,
    coalesce(sum(f.preco_total) filter (where f.vencimento < public.hoje_sp()), 0)::numeric as total_debito,
    coalesce(count(f.id) filter (where f.vencimento < public.hoje_sp()), 0)::integer as qtd_pedidos,
    coalesce((select valor from public.configuracoes where chave = 'whatsapp_admin'), '') as whatsapp_admin,
    coalesce((select valor from public.configuracoes where chave = 'pix_empresa'), '') as pix_empresa,
    coalesce(sum(f.preco_total), 0)::numeric as total_aberto,
    coalesce(count(f.id), 0)::integer as qtd_abertos,
    min(f.vencimento) as proximo_vencimento,
    coalesce(max(f.periodo), (select periodo from cfg)) as politica_fiado
  from public.colaboradores c
  left join fiados f on f.colaborador_id = c.id
  where c.id = p_colaborador_id
    and c.ativo = true
  group by c.id, c.fiado_bloqueado;
$$;

drop function if exists public.buscar_colaborador_coletivo(text);

create or replace function public.buscar_colaborador_coletivo(p_busca text)
returns table (
  id uuid,
  nome text,
  matricula text,
  empresa text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome, c.matricula, c.empresa
    from public.colaboradores c
   where c.ativo = true
     and length(trim(coalesce(p_busca, ''))) >= 2
     and (
       c.nome ilike '%' || trim(p_busca) || '%'
       or c.matricula ilike '%' || trim(p_busca) || '%'
       or c.empresa ilike '%' || trim(p_busca) || '%'
     )
   order by
     case when c.matricula = trim(p_busca) then 0 else 1 end,
     case when c.nome ilike trim(p_busca) || '%' then 0 else 1 end,
     c.nome
   limit 5;
$$;

drop function if exists public.buscar_pedido(uuid, uuid);

create or replace function public.buscar_pedido(p_pedido_id uuid, p_colaborador_id uuid)
returns table (
  prato_id uuid,
  fornecedor_id uuid,
  forma_pagamento text,
  observacoes text,
  acompanhamentos uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.prato_id,
    pe.fornecedor_id,
    pe.forma_pagamento,
    pe.observacoes,
    coalesce(array_agg(pa.acompanhamento_id) filter (where pa.acompanhamento_id is not null), array[]::uuid[])
  from public.pedidos pe
  left join public.pedido_acompanhamentos pa on pa.pedido_id = pe.id
  where pe.id = p_pedido_id
    and pe.colaborador_id = p_colaborador_id
  group by pe.id;
$$;

create or replace function public.criar_pedido(
  p_colaborador_id uuid,
  p_prato_id uuid,
  p_forma_pagamento text,
  p_observacoes text default null,
  p_acompanhamentos uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colab public.colaboradores%rowtype;
  v_prato public.pratos%rowtype;
  v_forn public.fornecedores%rowtype;
  v_total numeric(10,2);
  v_pedido_id uuid;
  v_pedidos_abertos text;
  v_acomp uuid;
  v_extra numeric(10,2);
begin
  select valor into v_pedidos_abertos
    from public.configuracoes
   where chave = 'pedidos_abertos';

  if coalesce(v_pedidos_abertos, 'true') = 'false' then
    raise exception 'Pedidos fechados no momento.';
  end if;

  if p_forma_pagamento not in ('pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde','cartao_infinitepay') then
    raise exception 'Forma de pagamento invalida.';
  end if;

  select * into v_colab from public.colaboradores where id = p_colaborador_id and ativo = true;
  if v_colab.id is null then
    raise exception 'Colaborador invalido ou inativo.';
  end if;

  if p_forma_pagamento = 'fiado' then
    if v_colab.fiado_bloqueado then
      raise exception 'Fiado bloqueado para este colaborador. Regularize o debito para habilitar novamente.';
    end if;
    if exists (
      with cfg as (
        select
          coalesce((select valor from public.configuracoes where chave = 'fechamento_fiado_periodo'), 'quinzenal') as periodo,
          least(greatest(coalesce((select nullif(valor, '')::int from public.configuracoes where chave = 'fechamento_fiado_dia_mes'), 30), 1), 31) as dia_mes
      )
      select 1
        from public.pedidos pe
        cross join cfg
       where pe.colaborador_id = p_colaborador_id
         and pe.forma_pagamento = 'fiado'
         and pe.status_pagamento = 'pendente'
         and pe.status <> 'cancelado'
         and (
           case
             when cfg.periodo = 'mensal' then
               make_date(
                 extract(year from (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end))::int,
                 extract(month from (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end))::int,
                 least(
                   cfg.dia_mes,
                   extract(day from (
                     date_trunc('month', (case when extract(day from pe.data)::int <= cfg.dia_mes then pe.data else pe.data + interval '1 month' end)) + interval '1 month - 1 day'
                   ))::int
                 )
               )
             when extract(day from pe.data)::int <= 15 then
               make_date(extract(year from pe.data)::int, extract(month from pe.data)::int, 15)
             else
               make_date(
                 extract(year from pe.data)::int,
                 extract(month from pe.data)::int,
                 least(30, extract(day from (date_trunc('month', pe.data) + interval '1 month - 1 day'))::int)
               )
           end
         ) < public.hoje_sp()
    ) then
      raise exception 'Voce possui fiado vencido. Regularize o debito para comprar no fiado novamente.';
    end if;
  end if;

  select * into v_prato from public.pratos where id = p_prato_id and ativo = true;
  if v_prato.id is null then
    raise exception 'Prato invalido ou inativo.';
  end if;

  select * into v_forn from public.fornecedores where id = v_prato.fornecedor_id and ativo = true;
  if v_forn.id is null then
    raise exception 'Fornecedor invalido ou inativo.';
  end if;

  if not exists (
    select 1
      from public.cardapio_dia cd
     where cd.data = public.hoje_sp()
       and cd.prato_id = p_prato_id
       and cd.fornecedor_id = v_prato.fornecedor_id
       and cd.disponivel = true
  ) then
    raise exception 'Este prato nao esta disponivel no cardapio de hoje.';
  end if;

  v_total := v_prato.preco + coalesce(v_forn.frete_entrega, 0);

  foreach v_acomp in array coalesce(p_acompanhamentos, array[]::uuid[]) loop
    select preco_extra into v_extra
      from public.acompanhamentos
     where id = v_acomp
       and fornecedor_id = v_prato.fornecedor_id
       and ativo = true;

    if v_extra is null then
      raise exception 'Acompanhamento invalido para este fornecedor.';
    end if;

    v_total := v_total + v_extra;
  end loop;

  if p_forma_pagamento = 'fiado' then
    v_total := v_total + 10.00;
  end if;

  insert into public.pedidos (
    colaborador_id, fornecedor_id, prato_id, data, preco_total,
    observacoes, forma_pagamento, status_pagamento, status
  )
  values (
    p_colaborador_id, v_prato.fornecedor_id, p_prato_id, public.hoje_sp(), v_total,
    nullif(trim(coalesce(p_observacoes, '')), ''), p_forma_pagamento, 'pendente',
    case when p_forma_pagamento = 'cartao_infinitepay' then 'aguardando_pagamento' else 'aberto' end
  )
  returning id into v_pedido_id;

  insert into public.pedido_acompanhamentos (pedido_id, acompanhamento_id)
  select v_pedido_id, x
    from unnest(coalesce(p_acompanhamentos, array[]::uuid[])) as x
  on conflict do nothing;

  return v_pedido_id;
end;
$$;

create or replace function public.anexar_comprovante_pedido(
  p_pedido_id uuid,
  p_colaborador_id uuid,
  p_comprovante_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pedidos
     set comprovante_url = nullif(trim(coalesce(p_comprovante_url, '')), ''),
         comprovante_status = case
           when nullif(trim(coalesce(p_comprovante_url, '')), '') is null then 'sem_comprovante'
           else 'enviado'
         end,
         comprovante_motivo = null,
         comprovante_revisado_em = null,
         comprovante_revisado_por = null
   where id = p_pedido_id
     and colaborador_id = p_colaborador_id
     and forma_pagamento in ('pix_empresa','pix_fornecedor','fiado')
     and status_pagamento = 'pendente'
     and status <> 'cancelado';

  if not found then
    raise exception 'Pedido nao encontrado ou nao aceita comprovante.';
  end if;
end;
$$;

create or replace function public.salvar_push_subscription(
  p_colaborador_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and ativo = true) then
    raise exception 'Colaborador invalido.';
  end if;

  insert into public.push_subscriptions (colaborador_id, endpoint, p256dh, auth, user_agent)
  values (p_colaborador_id, p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 200))
  on conflict (endpoint) do update
     set colaborador_id = excluded.colaborador_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         criado_em = now();
end;
$$;

create or replace function public.copiar_cardapio(p_data_origem date, p_data_destino date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem copiar cardapio.';
  end if;

  insert into public.cardapio_dia (data, fornecedor_id, prato_id, disponivel)
  select p_data_destino, cd.fornecedor_id, cd.prato_id, cd.disponivel
    from public.cardapio_dia cd
   where cd.data = p_data_origem
     and cd.disponivel = true
  on conflict (data, prato_id) do update
     set disponivel = excluded.disponivel,
         fornecedor_id = excluded.fornecedor_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop function if exists public.criar_pedido_coletivo(uuid, jsonb);

create or replace function public.criar_pedido_coletivo(
  p_colaborador_id uuid,
  p_itens jsonb,
  p_comprovante_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colab public.colaboradores%rowtype;
  v_item jsonb;
  v_prato public.pratos%rowtype;
  v_forn public.fornecedores%rowtype;
  v_coletivo_id uuid;
  v_pedido_id uuid;
  v_nome_pessoa text;
  v_item_colaborador_id uuid;
  v_item_colab public.colaboradores%rowtype;
  v_obs text;
  v_total numeric(10,2) := 0;
  v_preco_item numeric(10,2);
  v_frete_rateado numeric(10,2);
  v_qtd_fornecedor integer;
  v_qtd integer := 0;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item.';
  end if;

  if nullif(trim(coalesce(p_comprovante_url, '')), '') is null then
    raise exception 'Anexe o comprovante PIX do pedido coletivo.';
  end if;

  select * into v_colab from public.colaboradores where id = p_colaborador_id and ativo = true;
  if v_colab.id is null then
    raise exception 'Colaborador invalido ou inativo.';
  end if;

  insert into public.pedidos_coletivos (colaborador_id, data, total, qtd_pessoas)
  values (p_colaborador_id, public.hoje_sp(), 0, 0)
  returning id into v_coletivo_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome_pessoa := nullif(trim(v_item->>'nome'), '');
    v_item_colaborador_id := nullif(v_item->>'colaborador_id', '')::uuid;
    v_obs := nullif(trim(coalesce(v_item->>'observacoes', '')), '');

    if v_nome_pessoa is null then
      raise exception 'Nome da pessoa e obrigatorio no pedido coletivo.';
    end if;

    if v_item_colaborador_id is null then
      raise exception 'Selecione um colaborador cadastrado para cada item do pedido coletivo.';
    end if;

    select * into v_item_colab
      from public.colaboradores
     where id = v_item_colaborador_id
       and ativo = true;

    if v_item_colab.id is null then
      raise exception 'Um dos colaboradores do pedido coletivo esta invalido ou inativo.';
    end if;

    v_nome_pessoa := v_item_colab.nome;

    select * into v_prato
      from public.pratos
     where id = (v_item->>'prato_id')::uuid
       and ativo = true;

    if v_prato.id is null then
      raise exception 'Prato invalido no pedido coletivo.';
    end if;

    select * into v_forn from public.fornecedores where id = v_prato.fornecedor_id and ativo = true;
    if v_forn.id is null then
      raise exception 'Fornecedor invalido no pedido coletivo.';
    end if;

    if not exists (
      select 1
        from public.cardapio_dia cd
       where cd.data = public.hoje_sp()
         and cd.prato_id = v_prato.id
         and cd.fornecedor_id = v_prato.fornecedor_id
         and cd.disponivel = true
    ) then
      raise exception 'Um dos pratos nao esta no cardapio de hoje.';
    end if;

    select count(*) into v_qtd_fornecedor
      from jsonb_array_elements(p_itens) as it(item)
      join public.pratos pr on pr.id = (it.item->>'prato_id')::uuid
     where pr.fornecedor_id = v_prato.fornecedor_id;

    v_frete_rateado := coalesce(v_forn.frete_entrega, 0) / greatest(v_qtd_fornecedor, 1);
    v_preco_item := v_prato.preco + v_frete_rateado;

    insert into public.pedidos (
      colaborador_id, fornecedor_id, prato_id, data, preco_total,
      observacoes, forma_pagamento, status_pagamento,
      pedido_coletivo_id, nome_pessoa,
      comprovante_url, comprovante_status
    )
    values (
      v_item_colaborador_id,
      v_prato.fornecedor_id,
      v_prato.id,
      public.hoje_sp(),
      v_preco_item,
      concat('[Coletivo feito por ', v_colab.nome, ']', case when v_obs is not null then ' ' || v_obs else '' end),
      'pix_empresa',
      'pendente',
      v_coletivo_id,
      v_nome_pessoa,
      nullif(trim(coalesce(p_comprovante_url, '')), ''),
      'enviado'
    )
    returning id into v_pedido_id;

    insert into public.pedidos_coletivos_itens (
      coletivo_id, colaborador_id, nome_pessoa, prato_id, fornecedor_id, preco, observacoes, pedido_id
    )
    values (
      v_coletivo_id, v_item_colaborador_id, v_nome_pessoa, v_prato.id, v_prato.fornecedor_id, v_preco_item, v_obs, v_pedido_id
    );

    v_total := v_total + v_preco_item;
    v_qtd := v_qtd + 1;
  end loop;

  update public.pedidos_coletivos
     set total = v_total,
         qtd_pessoas = v_qtd
   where id = v_coletivo_id;

  return v_coletivo_id;
end;
$$;

drop function if exists public.listar_pedidos_coletivos(date);

create or replace function public.listar_pedidos_coletivos(p_data date)
returns table (
  id uuid,
  colaborador_id uuid,
  criado_por_nome text,
  criado_por_empresa text,
  data date,
  total numeric,
  qtd_pessoas integer,
  status text,
  criado_em timestamptz,
  itens jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.colaborador_id,
    c.nome,
    c.empresa,
    pc.data,
    pc.total,
    pc.qtd_pessoas,
    pc.status,
    pc.criado_em,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', pci.id,
          'nome_pessoa', pci.nome_pessoa,
          'prato_nome', p.nome,
          'fornecedor_nome', f.nome,
          'preco', pci.preco,
          'observacoes', pci.observacoes
        )
        order by pci.criado_em, pci.nome_pessoa
      ) filter (where pci.id is not null),
      '[]'::jsonb
    ) as itens
  from public.pedidos_coletivos pc
  join public.colaboradores c on c.id = pc.colaborador_id
  left join public.pedidos_coletivos_itens pci on pci.coletivo_id = pc.id
  left join public.pratos p on p.id = pci.prato_id
  left join public.fornecedores f on f.id = pci.fornecedor_id
  where pc.data = p_data
    and public.is_admin()
  group by pc.id, c.nome, c.empresa
  order by pc.criado_em desc;
$$;

-- ---------------------------------------------------------------------------
-- RLS E PERMISSOES
-- ---------------------------------------------------------------------------

alter table public.fornecedores enable row level security;
alter table public.pratos enable row level security;
alter table public.acompanhamentos enable row level security;
alter table public.colaboradores enable row level security;
alter table public.admins enable row level security;
alter table public.configuracoes enable row level security;
alter table public.login_tentativas enable row level security;
alter table public.cardapio_dia enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_acompanhamentos enable row level security;
alter table public.pagamentos enable row level security;
alter table public.pedidos_coletivos enable row level security;
alter table public.pedidos_coletivos_itens enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.auditoria_admin enable row level security;

-- Policies antigas podem ter nomes diferentes; estas ficam com nomes estaveis.
drop policy if exists "admins_select_own" on public.admins;
drop policy if exists "admins_admin_all" on public.admins;
drop policy if exists "admins_master_all" on public.admins;
create policy "admins_select_own" on public.admins
for select to authenticated
using (id = (select auth.uid()));
create policy "admins_master_all" on public.admins
for all to authenticated
using (public.is_admin_master())
with check (public.is_admin_master());

drop policy if exists "fornecedores_public_select" on public.fornecedores;
drop policy if exists "fornecedores_admin_all" on public.fornecedores;
create policy "fornecedores_public_select" on public.fornecedores
for select to anon, authenticated
using (ativo = true or public.is_admin());
create policy "fornecedores_admin_all" on public.fornecedores
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pratos_public_select" on public.pratos;
drop policy if exists "pratos_admin_all" on public.pratos;
create policy "pratos_public_select" on public.pratos
for select to anon, authenticated
using (
  ativo = true
  and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo = true)
  or public.is_admin()
);
create policy "pratos_admin_all" on public.pratos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "acomp_public_select" on public.acompanhamentos;
drop policy if exists "acomp_admin_all" on public.acompanhamentos;
create policy "acomp_public_select" on public.acompanhamentos
for select to anon, authenticated
using (
  ativo = true
  and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo = true)
  or public.is_admin()
);
create policy "acomp_admin_all" on public.acompanhamentos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "config_public_select" on public.configuracoes;
drop policy if exists "config_admin_all" on public.configuracoes;
create policy "config_public_select" on public.configuracoes
for select to anon, authenticated
using (true);
create policy "config_admin_all" on public.configuracoes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "cardapio_public_select" on public.cardapio_dia;
drop policy if exists "cardapio_admin_all" on public.cardapio_dia;
create policy "cardapio_public_select" on public.cardapio_dia
for select to anon, authenticated
using (
  disponivel = true
  and exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.ativo = true)
  and exists (select 1 from public.pratos p where p.id = prato_id and p.ativo = true)
  or public.is_admin()
);
create policy "cardapio_admin_all" on public.cardapio_dia
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "colaboradores_admin_all" on public.colaboradores;
create policy "colaboradores_admin_all" on public.colaboradores
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pedidos_admin_all" on public.pedidos;
create policy "pedidos_admin_all" on public.pedidos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pedido_acomp_admin_all" on public.pedido_acompanhamentos;
create policy "pedido_acomp_admin_all" on public.pedido_acompanhamentos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pagamentos_admin_all" on public.pagamentos;
create policy "pagamentos_admin_all" on public.pagamentos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "coletivos_admin_all" on public.pedidos_coletivos;
create policy "coletivos_admin_all" on public.pedidos_coletivos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "coletivos_itens_admin_all" on public.pedidos_coletivos_itens;
create policy "coletivos_itens_admin_all" on public.pedidos_coletivos_itens
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "push_admin_all" on public.push_subscriptions;
create policy "push_admin_all" on public.push_subscriptions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "auditoria_admin_select" on public.auditoria_admin;
drop policy if exists "auditoria_admin_insert" on public.auditoria_admin;
create policy "auditoria_admin_select" on public.auditoria_admin
for select to authenticated
using (public.is_admin());
create policy "auditoria_admin_insert" on public.auditoria_admin
for insert to authenticated
with check (public.is_admin() and admin_id = (select auth.uid()));

-- login_tentativas fica sem policy publica: apenas RPC security definer usa.

grant usage on schema public to anon, authenticated;
grant select on public.fornecedores, public.pratos, public.acompanhamentos, public.cardapio_dia, public.configuracoes to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
revoke all on function public.is_admin_master() from public;
grant execute on function public.is_admin_master() to authenticated;
grant execute on function public.hoje_sp() to anon, authenticated;

revoke all on function public.admin_criar_perfil(text, text, text, boolean) from public;
revoke all on function public.admin_criar_perfil(text, text, text, boolean) from anon;
grant execute on function public.admin_criar_perfil(text, text, text, boolean) to authenticated;
revoke all on function public.admin_atualizar_perfil(uuid, text, text, boolean) from public;
revoke all on function public.admin_atualizar_perfil(uuid, text, text, boolean) from anon;
grant execute on function public.admin_atualizar_perfil(uuid, text, text, boolean) to authenticated;
revoke all on function public.admin_excluir_perfil(uuid) from public;
revoke all on function public.admin_excluir_perfil(uuid) from anon;
grant execute on function public.admin_excluir_perfil(uuid) to authenticated;
grant execute on function public.admin_excluir_registro(text, uuid) to authenticated;
grant execute on function public.admin_limpar_dados() to authenticated;
grant execute on function public.login_colaborador(text, text) to anon, authenticated;
grant execute on function public.cadastrar_colaborador_publico(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.cardapio_hoje() to anon, authenticated;
grant execute on function public.meus_pedidos(uuid) to anon, authenticated;
grant execute on function public.resumo_fiado_colaborador(uuid) to anon, authenticated;
grant execute on function public.buscar_colaborador_coletivo(text) to anon, authenticated;
grant execute on function public.buscar_pedido(uuid, uuid) to anon, authenticated;
grant execute on function public.criar_pedido(uuid, uuid, text, text, uuid[]) to anon, authenticated;
grant execute on function public.anexar_comprovante_pedido(uuid, uuid, text) to anon, authenticated;
grant execute on function public.salvar_push_subscription(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.criar_pedido_coletivo(uuid, jsonb, text) to anon, authenticated;
grant execute on function public.set_pin_colaborador(uuid, text) to authenticated;
grant execute on function public.copiar_cardapio(date, date) to authenticated;
grant execute on function public.listar_pedidos_coletivos(date) to authenticated;

-- ---------------------------------------------------------------------------
-- STORAGE: comprovantes de PIX
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-pix',
  'comprovantes-pix',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "comprovantes_public_read" on storage.objects;
drop policy if exists "comprovantes_anon_insert" on storage.objects;
drop policy if exists "comprovantes_anon_update" on storage.objects;
drop policy if exists "comprovantes_admin_all" on storage.objects;

create policy "comprovantes_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'comprovantes-pix');

create policy "comprovantes_anon_insert" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'comprovantes-pix'
  and lower(name) like 'comprovantes/%'
);

create policy "comprovantes_anon_update" on storage.objects
for update to anon, authenticated
using (
  bucket_id = 'comprovantes-pix'
  and lower(name) like 'comprovantes/%'
)
with check (
  bucket_id = 'comprovantes-pix'
  and lower(name) like 'comprovantes/%'
);

create policy "comprovantes_admin_all" on storage.objects
for all to authenticated
using (bucket_id = 'comprovantes-pix' and public.is_admin())
with check (bucket_id = 'comprovantes-pix' and public.is_admin());

-- ---------------------------------------------------------------------------
-- STORAGE: fotos reais do cardapio
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cardapio-fotos',
  'cardapio-fotos',
  true,
  5242880,
  array['image/webp']
)
on conflict (id) do update
   set public = true,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cardapio_fotos_public_read" on storage.objects;
drop policy if exists "cardapio_fotos_admin_all" on storage.objects;

create policy "cardapio_fotos_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'cardapio-fotos');

create policy "cardapio_fotos_admin_all" on storage.objects
for all to authenticated
using (bucket_id = 'cardapio-fotos' and public.is_admin())
with check (bucket_id = 'cardapio-fotos' and public.is_admin());

-- ---------------------------------------------------------------------------
-- DADOS INICIAIS
-- ---------------------------------------------------------------------------

insert into public.configuracoes (chave, valor)
values
  ('nome_empresa', 'Meu Pedido'),
  ('pix_empresa', 'haydenfernandes.ti@gmail.com'),
  ('whatsapp_admin', ''),
  ('infinitepay_handle', ''),
  ('backup_hora', '22:00'),
  ('pedidos_abertos', 'true'),
  ('fechamento_fiado_periodo', 'quinzenal'),
  ('fechamento_fiado_dia_semana', '5'),
  ('fechamento_fiado_dia_mes', '30')
on conflict (chave) do update set valor = excluded.valor;

insert into public.fornecedores (nome, whatsapp, endereco, chave_pix, dias_atendimento, ativo)
values
  ('Restaurante da Dona Maria', '5592999990001', 'Centro', 'maria@restaurante.com', array[1,2,3,4,5], true),
  ('Marmitex do Ze', '5592999990002', 'Adrianopolis', 'ze@marmitex.com', array[1,2,3,4,5], true)
on conflict (nome) do update
   set whatsapp = excluded.whatsapp,
       endereco = excluded.endereco,
       chave_pix = excluded.chave_pix,
       dias_atendimento = excluded.dias_atendimento,
       ativo = true;

with f as (
  select id, nome from public.fornecedores
)
insert into public.pratos (fornecedor_id, nome, descricao, preco, ativo)
select f.id, x.nome, x.descricao, x.preco, true
from f
join (
  values
    ('Restaurante da Dona Maria', 'File acebolado', 'Arroz, feijao, farofa e salada', 24.00::numeric),
    ('Restaurante da Dona Maria', 'Frango grelhado', 'Frango, pure, arroz e salada', 22.00::numeric),
    ('Marmitex do Ze', 'Bife a parmegiana', 'Arroz, batata e salada', 28.00::numeric),
    ('Marmitex do Ze', 'Panqueca de carne', 'Arroz branco e salada', 23.00::numeric)
) as x(fornecedor_nome, nome, descricao, preco) on x.fornecedor_nome = f.nome
on conflict (fornecedor_id, nome) do update
   set descricao = excluded.descricao,
       preco = excluded.preco,
       ativo = true;

with f as (
  select id, nome from public.fornecedores
)
insert into public.acompanhamentos (fornecedor_id, nome, preco_extra, ativo)
select f.id, x.nome, x.preco_extra, true
from f
join (
  values
    ('Restaurante da Dona Maria', 'Arroz', 0.00::numeric),
    ('Restaurante da Dona Maria', 'Feijao', 0.00::numeric),
    ('Restaurante da Dona Maria', 'Salada', 0.00::numeric),
    ('Restaurante da Dona Maria', 'Ovo frito', 3.00::numeric),
    ('Marmitex do Ze', 'Batata frita', 4.00::numeric),
    ('Marmitex do Ze', 'Pure', 0.00::numeric),
    ('Marmitex do Ze', 'Salada', 0.00::numeric)
) as x(fornecedor_nome, nome, preco_extra) on x.fornecedor_nome = f.nome
on conflict (fornecedor_id, nome) do update
   set preco_extra = excluded.preco_extra,
       ativo = true;

insert into public.colaboradores (nome, matricula, empresa, whatsapp, pin_hash, ativo)
values
  ('Joao Silva', '001', 'Empresa Exemplo', '5592999910001', crypt('1234', gen_salt('bf')), true),
  ('Maria Souza', '002', 'Empresa Exemplo', '5592999910002', crypt('5678', gen_salt('bf')), true),
  ('Pedro Costa', '003', 'Empresa Exemplo', '5592999910003', crypt('9999', gen_salt('bf')), true)
on conflict (matricula) do update
   set nome = excluded.nome,
       empresa = excluded.empresa,
       whatsapp = excluded.whatsapp,
       pin_hash = excluded.pin_hash,
       ativo = true;

insert into public.cardapio_dia (data, fornecedor_id, prato_id, disponivel)
select public.hoje_sp(), p.fornecedor_id, p.id, true
  from public.pratos p
  join public.fornecedores f on f.id = p.fornecedor_id
 where p.ativo = true
   and f.ativo = true
on conflict (data, prato_id) do update
   set disponivel = true,
       fornecedor_id = excluded.fornecedor_id;

-- ---------------------------------------------------------------------------
-- ADMIN INICIAL
-- ---------------------------------------------------------------------------
-- Crie primeiro em Authentication > Users:
--   Email: haydenfernandes.ti@gmail.com
--   Password: Acesso@2026
--   Auto Confirm User: marcado

insert into public.admins (id, nome, email, ativo)
select u.id, 'Hayden Fernandes', u.email, true
  from auth.users u
 where lower(u.email) = lower('haydenfernandes.ti@gmail.com')
on conflict (email) do update
   set id = excluded.id,
       nome = excluded.nome,
       ativo = true;

do $$
begin
  if not exists (
    select 1 from public.admins
     where lower(email) = lower('haydenfernandes.ti@gmail.com')
  ) then
    raise notice 'Admin haydenfernandes.ti@gmail.com ainda nao foi vinculado. Crie o usuario no Supabase Auth com a senha informada e rode o bloco ADMIN INICIAL novamente.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- CLIENTE: favoritos, perfil, fidelidade e avaliacoes
-- ---------------------------------------------------------------------------

create table if not exists public.cliente_favoritos (
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete cascade,
  prato_id uuid not null references public.pratos(id) on update cascade on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (colaborador_id, prato_id)
);

create table if not exists public.cliente_preferencias (
  colaborador_id uuid primary key references public.colaboradores(id) on update cascade on delete cascade,
  pagamento_preferido text check (pagamento_preferido in ('cartao_infinitepay','pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde')),
  observacoes text,
  receber_notificacoes boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.pedido_avaliacoes (
  pedido_id uuid primary key references public.pedidos(id) on update cascade on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists cliente_favoritos_prato_idx on public.cliente_favoritos (prato_id);
create index if not exists pedido_avaliacoes_colaborador_idx on public.pedido_avaliacoes (colaborador_id, atualizado_em desc);

alter table public.cliente_favoritos enable row level security;
alter table public.cliente_preferencias enable row level security;
alter table public.pedido_avaliacoes enable row level security;

drop policy if exists "cliente_favoritos_admin_all" on public.cliente_favoritos;
create policy "cliente_favoritos_admin_all" on public.cliente_favoritos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "cliente_preferencias_admin_all" on public.cliente_preferencias;
create policy "cliente_preferencias_admin_all" on public.cliente_preferencias
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "pedido_avaliacoes_admin_all" on public.pedido_avaliacoes;
create policy "pedido_avaliacoes_admin_all" on public.pedido_avaliacoes
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop function if exists public.meus_favoritos(uuid);
create or replace function public.meus_favoritos(p_colaborador_id uuid)
returns table (prato_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select cf.prato_id
    from public.cliente_favoritos cf
    join public.colaboradores c on c.id = cf.colaborador_id and c.ativo = true
   where cf.colaborador_id = p_colaborador_id;
$$;

drop function if exists public.alternar_favorito(uuid, uuid);
create or replace function public.alternar_favorito(p_colaborador_id uuid, p_prato_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ativo boolean;
begin
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id and ativo = true) then
    raise exception 'Colaborador invalido.';
  end if;
  if not exists (select 1 from public.pratos where id = p_prato_id and ativo = true) then
    raise exception 'Prato invalido.';
  end if;

  if exists (select 1 from public.cliente_favoritos where colaborador_id = p_colaborador_id and prato_id = p_prato_id) then
    delete from public.cliente_favoritos where colaborador_id = p_colaborador_id and prato_id = p_prato_id;
    v_ativo := false;
  else
    insert into public.cliente_favoritos (colaborador_id, prato_id) values (p_colaborador_id, p_prato_id);
    v_ativo := true;
  end if;

  return v_ativo;
end;
$$;

drop function if exists public.salvar_perfil_cliente(uuid, text, text, text, text, text, boolean);
create or replace function public.salvar_perfil_cliente(
  p_colaborador_id uuid,
  p_whatsapp text,
  p_empresa text,
  p_endereco_empresa text,
  p_pagamento_preferido text,
  p_observacoes text,
  p_receber_notificacoes boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pagamento_preferido is not null
     and p_pagamento_preferido not in ('cartao_infinitepay','pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde') then
    raise exception 'Pagamento preferido invalido.';
  end if;

  update public.colaboradores
     set whatsapp = nullif(regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g'), ''),
         empresa = nullif(trim(coalesce(p_empresa, '')), ''),
         endereco_empresa = nullif(trim(coalesce(p_endereco_empresa, '')), '')
   where id = p_colaborador_id
     and ativo = true;

  if not found then
    raise exception 'Colaborador invalido.';
  end if;

  insert into public.cliente_preferencias (colaborador_id, pagamento_preferido, observacoes, receber_notificacoes, atualizado_em)
  values (
    p_colaborador_id,
    nullif(p_pagamento_preferido, ''),
    nullif(trim(coalesce(p_observacoes, '')), ''),
    coalesce(p_receber_notificacoes, true),
    now()
  )
  on conflict (colaborador_id) do update
     set pagamento_preferido = excluded.pagamento_preferido,
         observacoes = excluded.observacoes,
         receber_notificacoes = excluded.receber_notificacoes,
         atualizado_em = now();
end;
$$;

drop function if exists public.perfil_cliente(uuid);
create or replace function public.perfil_cliente(p_colaborador_id uuid)
returns table (
  id uuid,
  nome text,
  matricula text,
  empresa text,
  endereco_empresa text,
  whatsapp text,
  pagamento_preferido text,
  observacoes text,
  receber_notificacoes boolean,
  total_pedidos integer,
  total_gasto numeric,
  pontos integer,
  favoritos integer,
  media_avaliacoes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.nome,
    c.matricula,
    c.empresa,
    c.endereco_empresa,
    c.whatsapp,
    cp.pagamento_preferido,
    cp.observacoes,
    coalesce(cp.receber_notificacoes, true),
    coalesce(count(p.id) filter (where p.status <> 'cancelado'), 0)::integer,
    coalesce(sum(p.preco_total) filter (where p.status <> 'cancelado'), 0)::numeric,
    (coalesce(count(p.id) filter (where p.status_pagamento = 'pago' and p.status <> 'cancelado'), 0)::integer * 10),
    coalesce((select count(*) from public.cliente_favoritos cf where cf.colaborador_id = c.id), 0)::integer,
    round(coalesce(avg(pa.nota), 0)::numeric, 1)
  from public.colaboradores c
  left join public.cliente_preferencias cp on cp.colaborador_id = c.id
  left join public.pedidos p on p.colaborador_id = c.id
  left join public.pedido_avaliacoes pa on pa.colaborador_id = c.id
  where c.id = p_colaborador_id
    and c.ativo = true
  group by c.id, cp.pagamento_preferido, cp.observacoes, cp.receber_notificacoes;
$$;

drop function if exists public.avaliar_pedido(uuid, uuid, integer, text);
create or replace function public.avaliar_pedido(
  p_colaborador_id uuid,
  p_pedido_id uuid,
  p_nota integer,
  p_comentario text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_nota < 1 or p_nota > 5 then
    raise exception 'Escolha uma nota de 1 a 5.';
  end if;

  if not exists (
    select 1
      from public.pedidos
     where id = p_pedido_id
       and colaborador_id = p_colaborador_id
       and status in ('entregue','concluido')
       and status_pagamento = 'pago'
  ) then
    raise exception 'Este pedido ainda nao pode ser avaliado.';
  end if;

  insert into public.pedido_avaliacoes (pedido_id, colaborador_id, nota, comentario, atualizado_em)
  values (p_pedido_id, p_colaborador_id, p_nota, nullif(trim(coalesce(p_comentario, '')), ''), now())
  on conflict (pedido_id) do update
     set nota = excluded.nota,
         comentario = excluded.comentario,
         atualizado_em = now();
end;
$$;

drop function if exists public.meus_pedidos(uuid);
create or replace function public.meus_pedidos(p_colaborador_id uuid)
returns table (
  id uuid,
  prato_id uuid,
  fornecedor_id uuid,
  data date,
  preco_total numeric,
  observacoes text,
  status text,
  forma_pagamento text,
  status_pagamento text,
  comprovante_url text,
  comprovante_status text,
  comprovante_motivo text,
  criado_em timestamptz,
  pago_em timestamptz,
  fechado_em timestamptz,
  enviado_em timestamptz,
  entregue_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  pedido_coletivo_id uuid,
  nome_pessoa text,
  coletivo_criado_em timestamptz,
  coletivo_criador_nome text,
  avaliacao_nota smallint,
  prato_nome text,
  fornecedor_nome text,
  acompanhamentos text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pe.id,
    pe.prato_id,
    pe.fornecedor_id,
    pe.data,
    pe.preco_total,
    pe.observacoes,
    pe.status,
    pe.forma_pagamento,
    pe.status_pagamento,
    pe.comprovante_url,
    pe.comprovante_status,
    pe.comprovante_motivo,
    pe.criado_em,
    pe.pago_em,
    pe.fechado_em,
    pe.enviado_em,
    pe.entregue_em,
    pe.concluido_em,
    pe.cancelado_em,
    pe.pedido_coletivo_id,
    pe.nome_pessoa,
    pc.criado_em,
    org.nome,
    pa2.nota,
    pr.nome,
    fo.nome,
    coalesce(string_agg(ac.nome, ', ' order by ac.nome), '') as acompanhamentos
  from public.pedidos pe
  join public.colaboradores c on c.id = pe.colaborador_id and c.ativo = true
  join public.pratos pr on pr.id = pe.prato_id
  join public.fornecedores fo on fo.id = pe.fornecedor_id
  left join public.pedidos_coletivos pc on pc.id = pe.pedido_coletivo_id
  left join public.colaboradores org on org.id = pc.colaborador_id
  left join public.pedido_acompanhamentos pa on pa.pedido_id = pe.id
  left join public.acompanhamentos ac on ac.id = pa.acompanhamento_id
  left join public.pedido_avaliacoes pa2 on pa2.pedido_id = pe.id
  where pe.colaborador_id = p_colaborador_id
    and pe.data >= public.hoje_sp() - interval '180 days'
    and pe.status <> 'aguardando_pagamento'
  group by pe.id, pc.criado_em, org.nome, pa2.nota, pr.nome, fo.nome
  order by pe.data desc, pe.criado_em desc;
$$;

grant execute on function public.meus_favoritos(uuid) to anon, authenticated;
grant execute on function public.alternar_favorito(uuid, uuid) to anon, authenticated;
grant execute on function public.salvar_perfil_cliente(uuid, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.perfil_cliente(uuid) to anon, authenticated;
grant execute on function public.avaliar_pedido(uuid, uuid, integer, text) to anon, authenticated;
grant execute on function public.meus_pedidos(uuid) to anon, authenticated;
grant select, insert, update, delete on public.cliente_favoritos, public.cliente_preferencias, public.pedido_avaliacoes to authenticated;

create or replace function public.perfil_cliente(p_colaborador_id uuid)
returns table (
  id uuid,
  nome text,
  matricula text,
  empresa text,
  endereco_empresa text,
  whatsapp text,
  pagamento_preferido text,
  observacoes text,
  receber_notificacoes boolean,
  total_pedidos integer,
  total_gasto numeric,
  pontos integer,
  favoritos integer,
  media_avaliacoes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.nome,
    c.matricula,
    c.empresa,
    c.endereco_empresa,
    c.whatsapp,
    cp.pagamento_preferido,
    cp.observacoes,
    coalesce(cp.receber_notificacoes, true),
    coalesce(ps.total_pedidos, 0)::integer,
    coalesce(ps.total_gasto, 0)::numeric,
    coalesce(ps.pontos, 0)::integer,
    coalesce(fav.favoritos, 0)::integer,
    round(coalesce(av.media_avaliacoes, 0)::numeric, 1)
  from public.colaboradores c
  left join public.cliente_preferencias cp on cp.colaborador_id = c.id
  left join lateral (
    select
      count(*) filter (where p.status <> 'cancelado')::integer as total_pedidos,
      coalesce(sum(p.preco_total) filter (where p.status <> 'cancelado'), 0)::numeric as total_gasto,
      (count(*) filter (where p.status_pagamento = 'pago' and p.status <> 'cancelado')::integer * 10) as pontos
    from public.pedidos p
    where p.colaborador_id = c.id
  ) ps on true
  left join lateral (
    select count(*)::integer as favoritos
    from public.cliente_favoritos cf
    where cf.colaborador_id = c.id
  ) fav on true
  left join lateral (
    select avg(pa.nota)::numeric as media_avaliacoes
    from public.pedido_avaliacoes pa
    where pa.colaborador_id = c.id
  ) av on true
  where c.id = p_colaborador_id
    and c.ativo = true;
$$;

grant execute on function public.perfil_cliente(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- FIDELIDADE: configuracao opcional e eventos por pagamento confirmado
-- ---------------------------------------------------------------------------

create table if not exists public.cliente_fidelidade_eventos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on update cascade on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on update cascade on delete cascade,
  pontos integer not null default 1 check (pontos > 0),
  pedido_pago_indice integer not null default 1,
  recompensa_gerada boolean not null default false,
  recompensa_tipo text,
  recompensa_descricao text,
  titulo text not null,
  mensagem text not null,
  criado_em timestamptz not null default now(),
  visualizado_em timestamptz,
  unique (pedido_id)
);

create index if not exists fidelidade_eventos_colab_idx
  on public.cliente_fidelidade_eventos (colaborador_id, visualizado_em, criado_em desc);

alter table public.cliente_fidelidade_eventos enable row level security;

drop policy if exists "fidelidade_eventos_admin_all" on public.cliente_fidelidade_eventos;
create policy "fidelidade_eventos_admin_all" on public.cliente_fidelidade_eventos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.configuracoes (chave, valor)
values
  ('fidelidade_ativa', 'false'),
  ('fidelidade_pedidos_meta', '10'),
  ('fidelidade_recompensa_tipo', 'desconto'),
  ('fidelidade_recompensa_descricao', 'Desconto na proxima marmita'),
  ('fidelidade_pontos_por_pedido', '1')
on conflict (chave) do nothing;

create or replace function public.fidelidade_config_publica()
returns table (
  ativa boolean,
  pedidos_meta integer,
  recompensa_tipo text,
  recompensa_descricao text,
  pontos_por_pedido integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select valor from public.configuracoes where chave = 'fidelidade_ativa'), 'false') = 'true',
    greatest(coalesce((select nullif(valor, '')::int from public.configuracoes where chave = 'fidelidade_pedidos_meta'), 10), 1),
    coalesce((select valor from public.configuracoes where chave = 'fidelidade_recompensa_tipo'), 'desconto'),
    coalesce((select valor from public.configuracoes where chave = 'fidelidade_recompensa_descricao'), 'Desconto na proxima marmita'),
    greatest(coalesce((select nullif(valor, '')::int from public.configuracoes where chave = 'fidelidade_pontos_por_pedido'), 1), 1);
$$;

create or replace function public.registrar_fidelidade_pedido_pago()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg record;
  v_indice integer;
  v_recompensa boolean;
  v_titulo text;
  v_msg text;
begin
  if new.status_pagamento <> 'pago' or new.status = 'cancelado' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status_pagamento = 'pago' then
    return new;
  end if;

  select * into cfg from public.fidelidade_config_publica();
  if not coalesce(cfg.ativa, false) then
    return new;
  end if;

  select count(*)::integer
    into v_indice
    from public.pedidos p
   where p.colaborador_id = new.colaborador_id
     and p.status_pagamento = 'pago'
     and p.status <> 'cancelado';

  v_indice := greatest(coalesce(v_indice, 1), 1);
  v_recompensa := cfg.pedidos_meta > 0 and (v_indice % cfg.pedidos_meta = 0);

  if v_recompensa then
    v_titulo := 'Voce ganhou uma recompensa!';
    v_msg := 'Voce completou ' || cfg.pedidos_meta || ' pedido(s) pagos no programa de fidelidade e ganhou: ' || cfg.recompensa_descricao || '.';
  else
    v_titulo := 'Ponto de fidelidade recebido';
    v_msg := 'Voce recebeu ' || cfg.pontos_por_pedido || ' ponto(s) por comprar uma marmita hoje. Faltam ' || (cfg.pedidos_meta - (v_indice % cfg.pedidos_meta)) || ' pedido(s) pago(s) para ganhar: ' || cfg.recompensa_descricao || '.';
  end if;

  insert into public.cliente_fidelidade_eventos (
    colaborador_id,
    pedido_id,
    pontos,
    pedido_pago_indice,
    recompensa_gerada,
    recompensa_tipo,
    recompensa_descricao,
    titulo,
    mensagem
  )
  values (
    new.colaborador_id,
    new.id,
    cfg.pontos_por_pedido,
    v_indice,
    v_recompensa,
    cfg.recompensa_tipo,
    cfg.recompensa_descricao,
    v_titulo,
    v_msg
  )
  on conflict (pedido_id) do nothing;

  return new;
end;
$$;

drop trigger if exists pedidos_fidelidade_pago on public.pedidos;
create trigger pedidos_fidelidade_pago
after insert or update of status_pagamento on public.pedidos
for each row execute function public.registrar_fidelidade_pedido_pago();

drop function if exists public.fidelidade_resumo(uuid);
create or replace function public.fidelidade_resumo(p_colaborador_id uuid)
returns table (
  ativa boolean,
  pontos integer,
  pedidos_pontuados integer,
  pedidos_meta integer,
  faltam integer,
  recompensa_tipo text,
  recompensa_descricao text,
  eventos_pendentes integer
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select * from public.fidelidade_config_publica()
  ),
  ev as (
    select
      coalesce(sum(e.pontos), 0)::integer as pontos,
      count(*)::integer as pedidos_pontuados,
      count(*) filter (where e.visualizado_em is null)::integer as eventos_pendentes
    from public.cliente_fidelidade_eventos e
    where e.colaborador_id = p_colaborador_id
  )
  select
    cfg.ativa,
    ev.pontos,
    ev.pedidos_pontuados,
    cfg.pedidos_meta,
    case
      when cfg.pedidos_meta <= 0 then 0
      when ev.pedidos_pontuados = 0 then cfg.pedidos_meta
      when ev.pedidos_pontuados % cfg.pedidos_meta = 0 then cfg.pedidos_meta
      else cfg.pedidos_meta - (ev.pedidos_pontuados % cfg.pedidos_meta)
    end,
    cfg.recompensa_tipo,
    cfg.recompensa_descricao,
    ev.eventos_pendentes
  from cfg cross join ev;
$$;

drop function if exists public.fidelidade_eventos_pendentes(uuid);
create or replace function public.fidelidade_eventos_pendentes(p_colaborador_id uuid)
returns table (
  id uuid,
  pedido_id uuid,
  pontos integer,
  pedido_pago_indice integer,
  recompensa_gerada boolean,
  recompensa_tipo text,
  recompensa_descricao text,
  titulo text,
  mensagem text,
  criado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.pedido_id,
    e.pontos,
    e.pedido_pago_indice,
    e.recompensa_gerada,
    e.recompensa_tipo,
    e.recompensa_descricao,
    e.titulo,
    e.mensagem,
    e.criado_em
  from public.cliente_fidelidade_eventos e
  join public.colaboradores c on c.id = e.colaborador_id and c.ativo = true
  where e.colaborador_id = p_colaborador_id
    and e.visualizado_em is null
  order by e.criado_em asc
  limit 10;
$$;

drop function if exists public.marcar_fidelidade_eventos_vistos(uuid, uuid[]);
create or replace function public.marcar_fidelidade_eventos_vistos(p_colaborador_id uuid, p_eventos uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.cliente_fidelidade_eventos
     set visualizado_em = now()
   where colaborador_id = p_colaborador_id
     and id = any(coalesce(p_eventos, array[]::uuid[]));
$$;

grant select, insert, update, delete on public.cliente_fidelidade_eventos to authenticated;
grant execute on function public.fidelidade_config_publica() to anon, authenticated;
grant execute on function public.fidelidade_resumo(uuid) to anon, authenticated;
grant execute on function public.fidelidade_eventos_pendentes(uuid) to anon, authenticated;
grant execute on function public.marcar_fidelidade_eventos_vistos(uuid, uuid[]) to anon, authenticated;

commit;
