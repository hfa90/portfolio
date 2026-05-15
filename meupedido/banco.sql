-- =====================================================================
-- SISTEMA DE GESTÃO DE MARMITAS - BANCO COMPLETO
-- Banco: Supabase (PostgreSQL)
-- =====================================================================
-- Execute este arquivo INTEIRO no SQL Editor do Supabase.
-- Ele cria todas as tabelas, índices, funções, políticas RLS e
-- já popula com dados de exemplo (fornecedores, pratos, 3 colaboradores).
-- =====================================================================

create extension if not exists "pgcrypto";

-- =====================================================================
-- TABELAS
-- =====================================================================

create table if not exists configuracoes (
  chave        text primary key,
  valor        text not null,
  atualizado_em timestamptz default now()
);

create table if not exists admins (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  email       text unique not null,
  ativo       boolean default true,
  criado_em   timestamptz default now()
);

create table if not exists colaboradores (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  matricula    text unique,
  setor        text,
  pin_hash     text not null,
  ativo        boolean default true,
  criado_em    timestamptz default now()
);

create table if not exists fornecedores (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null,
  whatsapp            text not null,
  endereco            text,
  chave_pix           text,
  dias_atendimento    int[] default '{1,2,3,4,5}',
  observacoes         text,
  ativo               boolean default true,
  criado_em           timestamptz default now()
);

create table if not exists pratos (
  id              uuid primary key default gen_random_uuid(),
  fornecedor_id   uuid not null references fornecedores(id) on delete cascade,
  nome            text not null,
  descricao       text,
  preco           numeric(10,2) not null check (preco >= 0),
  ativo           boolean default true,
  criado_em       timestamptz default now()
);

create table if not exists acompanhamentos (
  id              uuid primary key default gen_random_uuid(),
  fornecedor_id   uuid not null references fornecedores(id) on delete cascade,
  nome            text not null,
  preco_extra     numeric(10,2) default 0 check (preco_extra >= 0),
  ativo           boolean default true,
  criado_em       timestamptz default now()
);

create table if not exists cardapio_dia (
  id              uuid primary key default gen_random_uuid(),
  data            date not null,
  fornecedor_id   uuid not null references fornecedores(id) on delete cascade,
  prato_id        uuid not null references pratos(id) on delete cascade,
  disponivel      boolean default true,
  horario_limite  time default '10:30',
  criado_em       timestamptz default now(),
  unique (data, prato_id)
);

create table if not exists pedidos (
  id                  uuid primary key default gen_random_uuid(),
  colaborador_id      uuid not null references colaboradores(id),
  fornecedor_id       uuid not null references fornecedores(id),
  prato_id            uuid not null references pratos(id),
  data                date not null default current_date,
  preco_total         numeric(10,2) not null check (preco_total >= 0),
  observacoes         text,
  status              text not null default 'aberto'
                       check (status in ('aberto','fechado','enviado','entregue','cancelado')),
  forma_pagamento     text not null
                       check (forma_pagamento in ('pix_empresa','pix_fornecedor','dinheiro','fiado')),
  status_pagamento    text not null default 'pendente'
                       check (status_pagamento in ('pendente','pago','cancelado')),
  pago_em             timestamptz,
  criado_em           timestamptz default now()
);

create table if not exists pedido_acompanhamentos (
  pedido_id          uuid not null references pedidos(id) on delete cascade,
  acompanhamento_id  uuid not null references acompanhamentos(id),
  primary key (pedido_id, acompanhamento_id)
);

create table if not exists pagamentos (
  id                  uuid primary key default gen_random_uuid(),
  colaborador_id      uuid not null references colaboradores(id),
  valor               numeric(10,2) not null check (valor > 0),
  data                date not null default current_date,
  metodo              text not null check (metodo in ('pix','dinheiro')),
  referencia_periodo  text,
  observacoes         text,
  criado_em           timestamptz default now()
);

-- =====================================================================
-- ÍNDICES
-- =====================================================================
create index if not exists idx_pedidos_data         on pedidos(data);
create index if not exists idx_pedidos_colaborador  on pedidos(colaborador_id);
create index if not exists idx_pedidos_fornecedor   on pedidos(fornecedor_id);
create index if not exists idx_pedidos_status_pag   on pedidos(status_pagamento);
create index if not exists idx_cardapio_data        on cardapio_dia(data);
create index if not exists idx_pratos_fornecedor    on pratos(fornecedor_id);
create index if not exists idx_acomp_fornecedor     on acompanhamentos(fornecedor_id);

-- =====================================================================
-- CONFIGURAÇÕES PADRÃO
-- =====================================================================
insert into configuracoes (chave, valor) values
  ('pix_empresa',                   ''),
  ('nome_empresa',                  'Minha Empresa'),
  ('fechamento_fiado_periodo',      'semanal'),
  ('fechamento_fiado_dia_semana',   '5'),
  ('fechamento_fiado_dia_mes',      '30'),
  ('horario_limite_padrao',         '10:30')
on conflict (chave) do nothing;

-- =====================================================================
-- FUNÇÕES DE AUTENTICAÇÃO POR PIN
-- =====================================================================

create or replace function set_pin_colaborador(p_colaborador_id uuid, p_pin text)
returns void
language plpgsql
security definer
as $$
begin
  if length(p_pin) < 4 or length(p_pin) > 8 or p_pin !~ '^[0-9]+$' then
    raise exception 'PIN deve ter entre 4 e 8 dígitos numéricos';
  end if;
  update colaboradores
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_colaborador_id;
end;
$$;

create or replace function login_colaborador(p_matricula text, p_pin text)
returns table (
  id        uuid,
  nome      text,
  matricula text,
  setor     text
)
language plpgsql
security definer
as $$
declare
  v_row colaboradores%rowtype;
begin
  select * into v_row
    from colaboradores
   where matricula = p_matricula and ativo = true;

  if not found then
    return;
  end if;

  if v_row.pin_hash = crypt(p_pin, v_row.pin_hash) then
    return query select v_row.id, v_row.nome, v_row.matricula, v_row.setor;
  end if;
end;
$$;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================

alter table configuracoes          enable row level security;
alter table admins                 enable row level security;
alter table colaboradores          enable row level security;
alter table fornecedores           enable row level security;
alter table pratos                 enable row level security;
alter table acompanhamentos        enable row level security;
alter table cardapio_dia           enable row level security;
alter table pedidos                enable row level security;
alter table pedido_acompanhamentos enable row level security;
alter table pagamentos             enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from admins
    where id = auth.uid() and ativo = true
  );
$$;

-- Política universal de admin
do $$
declare t text;
begin
  for t in select unnest(array[
    'configuracoes','admins','colaboradores','fornecedores','pratos',
    'acompanhamentos','cardapio_dia','pedidos','pedido_acompanhamentos','pagamentos'
  ])
  loop
    execute format(
      'drop policy if exists "admin_full_%1$s" on %1$s;
       create policy "admin_full_%1$s" on %1$s
         for all using (is_admin()) with check (is_admin());', t);
  end loop;
end$$;

-- Leitura pública de catálogo
drop policy if exists "anon_read_fornecedores"   on fornecedores;
create policy "anon_read_fornecedores" on fornecedores
  for select using (ativo = true);

drop policy if exists "anon_read_pratos"         on pratos;
create policy "anon_read_pratos" on pratos
  for select using (ativo = true);

drop policy if exists "anon_read_acomp"          on acompanhamentos;
create policy "anon_read_acomp" on acompanhamentos
  for select using (ativo = true);

drop policy if exists "anon_read_cardapio"       on cardapio_dia;
create policy "anon_read_cardapio" on cardapio_dia
  for select using (disponivel = true);

drop policy if exists "anon_read_config"         on configuracoes;
create policy "anon_read_config" on configuracoes
  for select using (chave in ('nome_empresa','pix_empresa','horario_limite_padrao'));

grant execute on function login_colaborador(text, text) to anon, authenticated;
grant execute on function set_pin_colaborador(uuid, text) to authenticated;
grant execute on function is_admin() to anon, authenticated;

-- =====================================================================
-- DADOS DE EXEMPLO (SEED)
-- =====================================================================
-- Comente este bloco em produção se não quiser dados de teste.

-- Fornecedores
insert into fornecedores (nome, whatsapp, endereco, chave_pix, dias_atendimento) values
  ('Restaurante da Dona Maria', '5511988887777', 'Rua das Flores, 123', 'maria@pix.com', '{1,2,3,4,5}'),
  ('Marmitex do Zé',            '5511977776666', 'Av. Brasil, 456',     '11977776666',   '{1,2,3,4,5}')
on conflict do nothing;

-- Pratos
with f as (select id from fornecedores where nome = 'Restaurante da Dona Maria')
insert into pratos (fornecedor_id, nome, descricao, preco)
select f.id, p.nome, p.descricao, p.preco from f cross join (values
  ('Filé acebolado',    'Filé de boi grelhado com cebola caramelizada', 22.00),
  ('Frango grelhado',   'Peito de frango temperado com ervas',          20.00),
  ('Bife à parmegiana', 'Bife empanado com queijo e molho de tomate',   25.00)
) as p(nome, descricao, preco);

with f as (select id from fornecedores where nome = 'Marmitex do Zé')
insert into pratos (fornecedor_id, nome, descricao, preco)
select f.id, p.nome, p.descricao, p.preco from f cross join (values
  ('Marmita P', 'Marmita pequena: arroz, feijão, mistura, salada',          15.00),
  ('Marmita M', 'Marmita média: arroz, feijão, 2 misturas, salada',         18.00),
  ('Marmita G', 'Marmita grande: arroz, feijão, 2 misturas, salada e fruta', 22.00)
) as p(nome, descricao, preco);

-- Acompanhamentos
with f as (select id from fornecedores where nome = 'Restaurante da Dona Maria')
insert into acompanhamentos (fornecedor_id, nome, preco_extra)
select f.id, a.nome, a.preco_extra from f cross join (values
  ('Arroz', 0.00), ('Feijão', 0.00), ('Salada', 0.00),
  ('Batata frita', 3.00), ('Purê', 2.00), ('Farofa', 1.50)
) as a(nome, preco_extra);

with f as (select id from fornecedores where nome = 'Marmitex do Zé')
insert into acompanhamentos (fornecedor_id, nome, preco_extra)
select f.id, a.nome, a.preco_extra from f cross join (values
  ('Refrigerante lata', 5.00),
  ('Suco natural',      6.00),
  ('Sobremesa',         4.00)
) as a(nome, preco_extra);

-- Cardápio de hoje
insert into cardapio_dia (data, fornecedor_id, prato_id, horario_limite)
select current_date, p.fornecedor_id, p.id, '10:30'
  from pratos p where p.ativo = true
on conflict do nothing;

-- Colaboradores: João (1234), Maria (5678), Pedro (9999)
insert into colaboradores (nome, matricula, setor, pin_hash) values
  ('João Silva',  '001', 'Produção',       crypt('1234', gen_salt('bf'))),
  ('Maria Souza', '002', 'Administrativo', crypt('5678', gen_salt('bf'))),
  ('Pedro Costa', '003', 'TI',             crypt('9999', gen_salt('bf')))
on conflict do nothing;

update configuracoes set valor = 'empresa@pix.com.br'  where chave = 'pix_empresa';
update configuracoes set valor = 'Empresa Exemplo Ltda' where chave = 'nome_empresa';

-- =====================================================================
-- PRONTO! Agora crie um admin no Authentication do Supabase e rode:
--   insert into admins (id, nome, email)
--   select id, 'Seu Nome', email from auth.users where email = 'seu@email.com';
-- =====================================================================
