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
  dias_atendimento integer[] not null default array[1,2,3,4,5],
  observacoes text,
  ativo boolean not null default true,
  horario_limite time without time zone not null default '11:00',
  criado_em timestamptz not null default now()
);

create table if not exists public.pratos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  nome text not null,
  descricao text,
  preco numeric(10,2) not null check (preco >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.acompanhamentos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedores(id) on update cascade on delete restrict,
  nome text not null,
  preco_extra numeric(10,2) not null default 0 check (preco_extra >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text unique,
  empresa text,
  whatsapp text,
  pin_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key references auth.users(id) on update cascade on delete cascade,
  nome text not null,
  email text not null unique,
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
  horario_limite time without time zone,
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
  status text not null default 'aberto' check (status in ('aberto','fechado','enviado','entregue','cancelado')),
  forma_pagamento text not null check (forma_pagamento in ('pix_empresa','pix_fornecedor','dinheiro','fiado')),
  status_pagamento text not null default 'pendente' check (status_pagamento in ('pendente','pago','cancelado')),
  pago_em timestamptz,
  comprovante_url text,
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

-- Compatibilidade caso o projeto ja tenha sido criado com o schema antigo.
alter table public.fornecedores add column if not exists horario_limite time without time zone not null default '11:00';
alter table public.cardapio_dia add column if not exists horario_limite time without time zone;
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.colaboradores add column if not exists empresa text;
alter table public.colaboradores add column if not exists whatsapp text;
alter table public.pedidos add column if not exists comprovante_url text;

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

create or replace function public.preencher_horario_cardapio()
returns trigger
language plpgsql
as $$
begin
  if new.horario_limite is null then
    select f.horario_limite into new.horario_limite
      from public.fornecedores f
     where f.id = new.fornecedor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cardapio_horario_default on public.cardapio_dia;
create trigger cardapio_horario_default
before insert or update of fornecedor_id, horario_limite on public.cardapio_dia
for each row execute function public.preencher_horario_cardapio();

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

drop function if exists public.login_colaborador(text, text);

create or replace function public.login_colaborador(p_matricula text, p_pin text)
returns table (
  sucesso boolean,
  mensagem_erro text,
  bloqueado_ate timestamptz,
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
  v_colab public.colaboradores%rowtype;
  v_tent public.login_tentativas%rowtype;
  v_tentativas integer;
  v_bloqueado timestamptz;
begin
  p_matricula := trim(coalesce(p_matricula, ''));
  p_pin := trim(coalesce(p_pin, ''));

  if p_matricula = '' or p_pin = '' then
    return query select false, 'Informe matricula e PIN.', null::timestamptz, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  select * into v_tent from public.login_tentativas lt where lt.matricula = p_matricula;
  if v_tent.bloqueado_ate is not null and v_tent.bloqueado_ate > now() then
    return query select false, 'Muitas tentativas. Tente novamente mais tarde.', v_tent.bloqueado_ate, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  select * into v_colab
    from public.colaboradores c
   where c.matricula = p_matricula
     and c.ativo = true
   limit 1;

  if v_colab.id is not null and v_colab.pin_hash = crypt(p_pin, v_colab.pin_hash) then
    delete from public.login_tentativas lt where lt.matricula = p_matricula;
    return query select true, null::text, null::timestamptz, v_colab.id, v_colab.nome, v_colab.matricula, v_colab.empresa;
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

  return query select false, 'Matricula ou PIN incorretos.', v_bloqueado, null::uuid, null::text, null::text, null::text;
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

create or replace function public.cardapio_hoje()
returns table (
  cardapio_id uuid,
  data date,
  fornecedor_id uuid,
  fornecedor_nome text,
  fornecedor_pix text,
  horario_limite time without time zone,
  prato_id uuid,
  prato_nome text,
  prato_descricao text,
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
    coalesce(cd.horario_limite, f.horario_limite),
    p.id,
    p.nome,
    p.descricao,
    p.preco
  from public.cardapio_dia cd
  join public.fornecedores f on f.id = cd.fornecedor_id
  join public.pratos p on p.id = cd.prato_id
  where cd.data = current_date
    and cd.disponivel = true
    and f.ativo = true
    and p.ativo = true
    and extract(dow from current_date)::int = any(f.dias_atendimento)
  order by f.nome, p.nome;
$$;

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
  criado_em timestamptz,
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
    pe.criado_em,
    pr.nome,
    fo.nome,
    coalesce(string_agg(ac.nome, ', ' order by ac.nome), '') as acompanhamentos
  from public.pedidos pe
  join public.colaboradores c on c.id = pe.colaborador_id and c.ativo = true
  join public.pratos pr on pr.id = pe.prato_id
  join public.fornecedores fo on fo.id = pe.fornecedor_id
  left join public.pedido_acompanhamentos pa on pa.pedido_id = pe.id
  left join public.acompanhamentos ac on ac.id = pa.acompanhamento_id
  where pe.colaborador_id = p_colaborador_id
    and pe.data >= current_date - interval '180 days'
  group by pe.id, pr.nome, fo.nome
  order by pe.data desc, pe.criado_em desc;
$$;

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

  if p_forma_pagamento not in ('pix_empresa','pix_fornecedor','dinheiro','fiado') then
    raise exception 'Forma de pagamento invalida.';
  end if;

  select * into v_colab from public.colaboradores where id = p_colaborador_id and ativo = true;
  if v_colab.id is null then
    raise exception 'Colaborador invalido ou inativo.';
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
     where cd.data = current_date
       and cd.prato_id = p_prato_id
       and cd.fornecedor_id = v_prato.fornecedor_id
       and cd.disponivel = true
  ) then
    raise exception 'Este prato nao esta disponivel no cardapio de hoje.';
  end if;

  v_total := v_prato.preco;

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
    observacoes, forma_pagamento, status_pagamento
  )
  values (
    p_colaborador_id, v_prato.fornecedor_id, p_prato_id, current_date, v_total,
    nullif(trim(coalesce(p_observacoes, '')), ''), p_forma_pagamento, 'pendente'
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
     set comprovante_url = nullif(trim(coalesce(p_comprovante_url, '')), '')
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

  insert into public.cardapio_dia (data, fornecedor_id, prato_id, disponivel, horario_limite)
  select p_data_destino, cd.fornecedor_id, cd.prato_id, cd.disponivel, cd.horario_limite
    from public.cardapio_dia cd
   where cd.data = p_data_origem
     and cd.disponivel = true
  on conflict (data, prato_id) do update
     set disponivel = excluded.disponivel,
         fornecedor_id = excluded.fornecedor_id,
         horario_limite = excluded.horario_limite;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.criar_pedido_coletivo(
  p_colaborador_id uuid,
  p_itens jsonb
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
  v_obs text;
  v_total numeric(10,2) := 0;
  v_qtd integer := 0;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item.';
  end if;

  select * into v_colab from public.colaboradores where id = p_colaborador_id and ativo = true;
  if v_colab.id is null then
    raise exception 'Colaborador invalido ou inativo.';
  end if;

  insert into public.pedidos_coletivos (colaborador_id, data, total, qtd_pessoas)
  values (p_colaborador_id, current_date, 0, 0)
  returning id into v_coletivo_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_nome_pessoa := nullif(trim(v_item->>'nome'), '');
    v_obs := nullif(trim(coalesce(v_item->>'observacoes', '')), '');

    if v_nome_pessoa is null then
      raise exception 'Nome da pessoa e obrigatorio no pedido coletivo.';
    end if;

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
      select 1 from public.cardapio_dia cd
       where cd.data = current_date
         and cd.prato_id = v_prato.id
         and cd.fornecedor_id = v_prato.fornecedor_id
         and cd.disponivel = true
    ) then
      raise exception 'Um dos pratos nao esta no cardapio de hoje.';
    end if;

    insert into public.pedidos (
      colaborador_id, fornecedor_id, prato_id, data, preco_total,
      observacoes, forma_pagamento, status_pagamento
    )
    values (
      p_colaborador_id,
      v_prato.fornecedor_id,
      v_prato.id,
      current_date,
      v_prato.preco,
      concat('[Coletivo: ', v_nome_pessoa, ']', case when v_obs is not null then ' ' || v_obs else '' end),
      'fiado',
      'pendente'
    )
    returning id into v_pedido_id;

    insert into public.pedidos_coletivos_itens (
      coletivo_id, nome_pessoa, prato_id, fornecedor_id, preco, observacoes, pedido_id
    )
    values (
      v_coletivo_id, v_nome_pessoa, v_prato.id, v_prato.fornecedor_id, v_prato.preco, v_obs, v_pedido_id
    );

    v_total := v_total + v_prato.preco;
    v_qtd := v_qtd + 1;
  end loop;

  update public.pedidos_coletivos
     set total = v_total,
         qtd_pessoas = v_qtd
   where id = v_coletivo_id;

  return v_coletivo_id;
end;
$$;

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

-- Policies antigas podem ter nomes diferentes; estas ficam com nomes estaveis.
drop policy if exists "admins_select_own" on public.admins;
drop policy if exists "admins_admin_all" on public.admins;
create policy "admins_select_own" on public.admins
for select to authenticated
using (id = (select auth.uid()));

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

-- login_tentativas fica sem policy publica: apenas RPC security definer usa.

grant usage on schema public to anon, authenticated;
grant select on public.fornecedores, public.pratos, public.acompanhamentos, public.cardapio_dia, public.configuracoes to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

grant execute on function public.login_colaborador(text, text) to anon, authenticated;
grant execute on function public.cardapio_hoje() to anon, authenticated;
grant execute on function public.meus_pedidos(uuid) to anon, authenticated;
grant execute on function public.buscar_pedido(uuid, uuid) to anon, authenticated;
grant execute on function public.criar_pedido(uuid, uuid, text, text, uuid[]) to anon, authenticated;
grant execute on function public.anexar_comprovante_pedido(uuid, uuid, text) to anon, authenticated;
grant execute on function public.salvar_push_subscription(uuid, text, text, text, text) to anon, authenticated;
grant execute on function public.criar_pedido_coletivo(uuid, jsonb) to anon, authenticated;
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
-- DADOS INICIAIS
-- ---------------------------------------------------------------------------

insert into public.configuracoes (chave, valor)
values
  ('nome_empresa', 'Meu Pedido'),
  ('pix_empresa', 'haydenfernandes.ti@gmail.com'),
  ('pedidos_abertos', 'true'),
  ('fechamento_fiado_periodo', 'semanal'),
  ('fechamento_fiado_dia_semana', '5'),
  ('fechamento_fiado_dia_mes', '30')
on conflict (chave) do update set valor = excluded.valor;

insert into public.fornecedores (nome, whatsapp, endereco, chave_pix, dias_atendimento, horario_limite, ativo)
values
  ('Restaurante da Dona Maria', '5592999990001', 'Centro', 'maria@restaurante.com', array[1,2,3,4,5], '11:00', true),
  ('Marmitex do Ze', '5592999990002', 'Adrianopolis', 'ze@marmitex.com', array[1,2,3,4,5], '11:15', true)
on conflict (nome) do update
   set whatsapp = excluded.whatsapp,
       endereco = excluded.endereco,
       chave_pix = excluded.chave_pix,
       dias_atendimento = excluded.dias_atendimento,
       horario_limite = excluded.horario_limite,
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
select current_date, p.fornecedor_id, p.id, true
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

commit;
