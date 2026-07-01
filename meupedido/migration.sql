-- =====================================================================
-- MEUPEDIDO - MIGRACAO COMPLEMENTAR
-- Execute este arquivo no SQL Editor do Supabase depois de banco.sql.
-- Ele e idempotente: pode ser executado mais de uma vez sem apagar dados.
-- =====================================================================

create extension if not exists "pgcrypto";

-- Campos que as telas atuais ja utilizam.
alter table colaboradores add column if not exists empresa text;
alter table colaboradores add column if not exists whatsapp text;
alter table pedidos add column if not exists comprovante_url text;
alter table pedidos add column if not exists pedido_coletivo_id uuid;
alter table pedidos add column if not exists nome_pessoa text;

-- Estado global de abertura dos pedidos.
insert into configuracoes (chave, valor)
values ('pedidos_abertos', 'true')
on conflict (chave) do nothing;

-- Assinaturas de push do navegador.
create table if not exists push_subscriptions (
  endpoint       text primary key,
  p256dh         text not null,
  auth           text not null,
  colaborador_id uuid references colaboradores(id) on delete cascade,
  criado_em      timestamptz default now(),
  atualizado_em  timestamptz default now()
);

create index if not exists idx_push_subscriptions_colaborador
  on push_subscriptions(colaborador_id);

alter table push_subscriptions enable row level security;

-- Agrupador de pedidos coletivos.
create table if not exists pedidos_coletivos (
  id              uuid primary key default gen_random_uuid(),
  colaborador_id  uuid not null references colaboradores(id),
  data            date not null default current_date,
  total           numeric(10,2) not null default 0 check (total >= 0),
  criado_em       timestamptz default now()
);

alter table pedidos_coletivos enable row level security;
create index if not exists idx_pedidos_coletivos_data on pedidos_coletivos(data);
create index if not exists idx_pedidos_coletivos_colaborador on pedidos_coletivos(colaborador_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'pedidos_pedido_coletivo_id_fkey'
       and conrelid = 'pedidos'::regclass
  ) then
    alter table pedidos
      add constraint pedidos_pedido_coletivo_id_fkey
      foreign key (pedido_coletivo_id) references pedidos_coletivos(id) on delete set null;
  end if;
end $$;

-- Storage para comprovantes PIX.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-pix',
  'comprovantes-pix',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Funcao de admin sem depender de policies da propria tabela admins.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from admins
     where id = auth.uid()
       and ativo = true
  );
$$;

-- Policies administrativas para as tabelas novas.
do $$
declare t text;
begin
  for t in select unnest(array['pedidos_coletivos','push_subscriptions'])
  loop
    execute format(
      'drop policy if exists "admin_full_%1$s" on %1$s;
       create policy "admin_full_%1$s" on %1$s
         for all to authenticated
         using (is_admin())
         with check (is_admin());', t);
  end loop;
end $$;

drop policy if exists "anon_upsert_push_subscriptions" on push_subscriptions;
create policy "anon_upsert_push_subscriptions" on push_subscriptions
  for insert to anon, authenticated
  with check (true);

drop policy if exists "anon_update_own_push_subscriptions" on push_subscriptions;
create policy "anon_update_own_push_subscriptions" on push_subscriptions
  for update to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon_upload_comprovantes_pix" on storage.objects;
create policy "anon_upload_comprovantes_pix" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprovantes-pix');

drop policy if exists "anon_update_comprovantes_pix" on storage.objects;
create policy "anon_update_comprovantes_pix" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'comprovantes-pix')
  with check (bucket_id = 'comprovantes-pix');

drop policy if exists "public_read_comprovantes_pix" on storage.objects;
create policy "public_read_comprovantes_pix" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'comprovantes-pix');

-- Grants explicitos para projetos criados depois da mudanca da Data API.
grant usage on schema public to anon, authenticated;
grant select on configuracoes, fornecedores, pratos, acompanhamentos, cardapio_dia to anon, authenticated;
grant all on admins, colaboradores, fornecedores, pratos, acompanhamentos, cardapio_dia,
  pedidos, pedido_acompanhamentos, pagamentos, pedidos_coletivos, push_subscriptions
  to authenticated;
grant select, insert, update on push_subscriptions to anon;

-- Cardapio publicado do dia, ja no formato consumido pelo frontend.
create or replace function cardapio_hoje()
returns table (
  fornecedor_id uuid,
  fornecedor_nome text,
  fornecedor_pix text,
  prato_id uuid,
  prato_nome text,
  prato_descricao text,
  prato_preco numeric,
  horario_limite time
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.nome,
    f.chave_pix,
    p.id,
    p.nome,
    p.descricao,
    p.preco,
    c.horario_limite
  from cardapio_dia c
  join fornecedores f on f.id = c.fornecedor_id
  join pratos p on p.id = c.prato_id
  where c.data = current_date
    and c.disponivel = true
    and f.ativo = true
    and p.ativo = true
    and extract(isodow from current_date)::int = any(coalesce(f.dias_atendimento, '{1,2,3,4,5}'::int[]))
  order by f.nome, p.nome;
$$;

create or replace function criar_pedido(
  p_colaborador_id uuid,
  p_prato_id uuid,
  p_forma_pagamento text,
  p_observacoes text default null,
  p_acompanhamentos uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido_id uuid;
  v_fornecedor_id uuid;
  v_preco numeric(10,2);
  v_aberto text;
begin
  select valor into v_aberto from configuracoes where chave = 'pedidos_abertos';
  if coalesce(v_aberto, 'true') = 'false' then
    raise exception 'Pedidos fechados no momento';
  end if;

  if p_forma_pagamento not in ('pix_empresa','pix_fornecedor','dinheiro','fiado') then
    raise exception 'Forma de pagamento invalida';
  end if;

  if not exists (select 1 from colaboradores where id = p_colaborador_id and ativo = true) then
    raise exception 'Colaborador invalido ou inativo';
  end if;

  select p.fornecedor_id, p.preco
    into v_fornecedor_id, v_preco
    from pratos p
    join cardapio_dia c on c.prato_id = p.id
   where p.id = p_prato_id
     and p.ativo = true
     and c.data = current_date
     and c.disponivel = true;

  if v_fornecedor_id is null then
    raise exception 'Prato indisponivel no cardapio de hoje';
  end if;

  select v_preco + coalesce(sum(a.preco_extra), 0)
    into v_preco
    from acompanhamentos a
   where a.id = any(coalesce(p_acompanhamentos, '{}'::uuid[]))
     and a.fornecedor_id = v_fornecedor_id
     and a.ativo = true;

  if p_forma_pagamento = 'fiado' then
    v_preco := v_preco + 10;
  end if;

  insert into pedidos (
    colaborador_id, fornecedor_id, prato_id, preco_total,
    observacoes, forma_pagamento, status_pagamento
  )
  values (
    p_colaborador_id, v_fornecedor_id, p_prato_id, v_preco,
    p_observacoes, p_forma_pagamento, 'pendente'
  )
  returning id into v_pedido_id;

  insert into pedido_acompanhamentos (pedido_id, acompanhamento_id)
  select v_pedido_id, a.id
    from acompanhamentos a
   where a.id = any(coalesce(p_acompanhamentos, '{}'::uuid[]))
     and a.fornecedor_id = v_fornecedor_id
     and a.ativo = true
  on conflict do nothing;

  return v_pedido_id;
end;
$$;

create or replace function anexar_comprovante(
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
  update pedidos
     set comprovante_url = p_comprovante_url
   where id = p_pedido_id
     and colaborador_id = p_colaborador_id
     and forma_pagamento in ('pix_empresa','pix_fornecedor');

  if not found then
    raise exception 'Pedido nao encontrado para este colaborador';
  end if;
end;
$$;

create or replace function meus_pedidos(p_colaborador_id uuid)
returns table (
  id uuid,
  data date,
  preco_total numeric,
  observacoes text,
  status text,
  forma_pagamento text,
  status_pagamento text,
  comprovante_url text,
  prato_id uuid,
  fornecedor_id uuid,
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
    pe.prato_id,
    pe.fornecedor_id,
    pr.nome,
    f.nome,
    nullif(string_agg(a.nome, ', ' order by a.nome), '')
  from pedidos pe
  join pratos pr on pr.id = pe.prato_id
  join fornecedores f on f.id = pe.fornecedor_id
  left join pedido_acompanhamentos pa on pa.pedido_id = pe.id
  left join acompanhamentos a on a.id = pa.acompanhamento_id
  where pe.colaborador_id = p_colaborador_id
    and exists (select 1 from colaboradores c where c.id = p_colaborador_id and c.ativo = true)
  group by pe.id, pr.nome, f.nome
  order by pe.data desc, pe.criado_em desc;
$$;

create or replace function buscar_pedido(
  p_pedido_id uuid,
  p_colaborador_id uuid
)
returns table (
  id uuid,
  prato_id uuid,
  fornecedor_id uuid,
  observacoes text,
  forma_pagamento text,
  acompanhamentos uuid[]
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
    pe.observacoes,
    pe.forma_pagamento,
    coalesce(array_agg(pa.acompanhamento_id) filter (where pa.acompanhamento_id is not null), '{}'::uuid[])
  from pedidos pe
  left join pedido_acompanhamentos pa on pa.pedido_id = pe.id
  where pe.id = p_pedido_id
    and pe.colaborador_id = p_colaborador_id
  group by pe.id;
$$;

create or replace function copiar_cardapio(
  p_data_origem date,
  p_data_destino date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not is_admin() then
    raise exception 'Apenas administradores podem copiar cardapio';
  end if;

  insert into cardapio_dia (data, fornecedor_id, prato_id, disponivel, horario_limite)
  select p_data_destino, fornecedor_id, prato_id, disponivel, horario_limite
    from cardapio_dia
   where data = p_data_origem
  on conflict (data, prato_id) do update set
    fornecedor_id = excluded.fornecedor_id,
    disponivel = excluded.disponivel,
    horario_limite = excluded.horario_limite;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function criar_pedido_coletivo(
  p_colaborador_id uuid,
  p_itens jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coletivo_id uuid;
  v_item jsonb;
  v_pedido_id uuid;
  v_total numeric(10,2) := 0;
  v_preco numeric(10,2);
  v_fornecedor_id uuid;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item';
  end if;

  if not exists (select 1 from colaboradores where id = p_colaborador_id and ativo = true) then
    raise exception 'Colaborador invalido ou inativo';
  end if;

  insert into pedidos_coletivos (colaborador_id, data, total)
  values (p_colaborador_id, current_date, 0)
  returning id into v_coletivo_id;

  for v_item in select * from jsonb_array_elements(p_itens)
  loop
    select p.fornecedor_id, p.preco
      into v_fornecedor_id, v_preco
      from pratos p
      join cardapio_dia c on c.prato_id = p.id
     where p.id = (v_item->>'prato_id')::uuid
       and c.data = current_date
       and c.disponivel = true
       and p.ativo = true;

    if v_fornecedor_id is null then
      raise exception 'Um dos pratos esta indisponivel';
    end if;

    insert into pedidos (
      colaborador_id, fornecedor_id, prato_id, data, preco_total,
      observacoes, status, forma_pagamento, status_pagamento,
      pedido_coletivo_id, nome_pessoa
    )
    values (
      p_colaborador_id, v_fornecedor_id, (v_item->>'prato_id')::uuid, current_date, v_preco,
      nullif(v_item->>'observacoes', ''), 'aberto', 'dinheiro', 'pendente',
      v_coletivo_id, nullif(v_item->>'nome', '')
    )
    returning id into v_pedido_id;

    v_total := v_total + v_preco;
  end loop;

  update pedidos_coletivos set total = v_total where id = v_coletivo_id;
  return v_coletivo_id;
end;
$$;

create or replace function listar_pedidos_coletivos(p_data date)
returns table (
  id uuid,
  criado_em timestamptz,
  criado_por_nome text,
  criado_por_empresa text,
  qtd_pessoas integer,
  total numeric,
  itens jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pc.id,
    pc.criado_em,
    c.nome,
    c.empresa,
    count(p.id)::integer,
    pc.total,
    coalesce(jsonb_agg(jsonb_build_object(
      'nome_pessoa', coalesce(p.nome_pessoa, c.nome),
      'prato_nome', pr.nome,
      'fornecedor_nome', f.nome,
      'observacoes', p.observacoes,
      'preco', p.preco_total
    ) order by p.criado_em), '[]'::jsonb)
  from pedidos_coletivos pc
  join colaboradores c on c.id = pc.colaborador_id
  left join pedidos p on p.pedido_coletivo_id = pc.id and p.status <> 'cancelado'
  left join pratos pr on pr.id = p.prato_id
  left join fornecedores f on f.id = p.fornecedor_id
  where pc.data = p_data
    and is_admin()
  group by pc.id, c.nome, c.empresa
  order by pc.criado_em desc;
$$;

grant execute on function cardapio_hoje() to anon, authenticated;
grant execute on function criar_pedido(uuid, uuid, text, text, uuid[]) to anon, authenticated;
grant execute on function anexar_comprovante(uuid, uuid, text) to anon, authenticated;
grant execute on function meus_pedidos(uuid) to anon, authenticated;
grant execute on function buscar_pedido(uuid, uuid) to anon, authenticated;
grant execute on function copiar_cardapio(date, date) to authenticated;
grant execute on function criar_pedido_coletivo(uuid, jsonb) to anon, authenticated;
grant execute on function listar_pedidos_coletivos(date) to authenticated;
grant execute on function is_admin() to anon, authenticated;
