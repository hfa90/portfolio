-- Correcao dos horarios do cardapio.
-- Rode este arquivo uma vez no SQL Editor do Supabase.

alter table public.fornecedores add column if not exists horario_inicio time without time zone not null default '00:00';
alter table public.fornecedores add column if not exists horario_limite time without time zone not null default '11:00';
alter table public.cardapio_dia add column if not exists horario_inicio time without time zone;
alter table public.cardapio_dia add column if not exists horario_limite time without time zone;

-- A janela de pedidos pertence ao fornecedor. Limpa copias antigas no cardapio_dia
-- que podiam manter, por exemplo, o limite antigo 10:30 mesmo apos editar para 23:45.
update public.cardapio_dia
   set horario_inicio = null,
       horario_limite = null
 where horario_inicio is not null
    or horario_limite is not null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'fornecedores_horario_janela_check'
       and conrelid = 'public.fornecedores'::regclass
  ) then
    alter table public.fornecedores
      add constraint fornecedores_horario_janela_check
      check (horario_inicio < horario_limite);
  end if;
end $$;

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
alter table public.pedidos alter column data set default public.hoje_sp();
alter table public.pedidos_coletivos alter column data set default public.hoje_sp();

create or replace function public.cardapio_hoje()
returns table (
  cardapio_id uuid,
  data date,
  fornecedor_id uuid,
  fornecedor_nome text,
  fornecedor_pix text,
  horario_inicio time without time zone,
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
    f.horario_inicio,
    f.horario_limite,
    p.id,
    p.nome,
    p.descricao,
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
  v_horario_inicio time without time zone;
  v_horario_limite time without time zone;
  v_agora time without time zone;
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

  select v_forn.horario_inicio,
         v_forn.horario_limite
    into v_horario_inicio, v_horario_limite
      from public.cardapio_dia cd
     where cd.data = public.hoje_sp()
       and cd.prato_id = p_prato_id
       and cd.fornecedor_id = v_prato.fornecedor_id
       and cd.disponivel = true
     limit 1;

  if v_horario_limite is null then
    raise exception 'Este prato nao esta disponivel no cardapio de hoje.';
  end if;

  v_agora := (now() at time zone 'America/Sao_Paulo')::time;

  if v_agora < coalesce(v_horario_inicio, '00:00'::time) then
    raise exception 'Pedidos disponiveis a partir das % para este fornecedor.', to_char(v_horario_inicio, 'HH24:MI');
  end if;

  if v_agora > v_horario_limite then
    raise exception 'Pedidos encerrados as % para este fornecedor.', to_char(v_horario_limite, 'HH24:MI');
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
    p_colaborador_id, v_prato.fornecedor_id, p_prato_id, public.hoje_sp(), v_total,
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
         fornecedor_id = excluded.fornecedor_id,
         horario_inicio = null,
         horario_limite = null;

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
  v_horario_inicio time without time zone;
  v_horario_limite time without time zone;
  v_agora time without time zone;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Informe ao menos um item.';
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

    select v_forn.horario_inicio,
           v_forn.horario_limite
      into v_horario_inicio, v_horario_limite
      from public.cardapio_dia cd
     where cd.data = public.hoje_sp()
       and cd.prato_id = v_prato.id
       and cd.fornecedor_id = v_prato.fornecedor_id
       and cd.disponivel = true
     limit 1;

    if v_horario_limite is null then
      raise exception 'Um dos pratos nao esta no cardapio de hoje.';
    end if;

    v_agora := (now() at time zone 'America/Sao_Paulo')::time;

    if v_agora < coalesce(v_horario_inicio, '00:00'::time) then
      raise exception 'Pedidos disponiveis a partir das % para o fornecedor %.', to_char(v_horario_inicio, 'HH24:MI'), v_forn.nome;
    end if;

    if v_agora > v_horario_limite then
      raise exception 'Pedidos encerrados as % para o fornecedor %.', to_char(v_horario_limite, 'HH24:MI'), v_forn.nome;
    end if;

    insert into public.pedidos (
      colaborador_id, fornecedor_id, prato_id, data, preco_total,
      observacoes, forma_pagamento, status_pagamento
    )
    values (
      p_colaborador_id,
      v_prato.fornecedor_id,
      v_prato.id,
      public.hoje_sp(),
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

grant execute on function public.hoje_sp() to anon, authenticated;
grant execute on function public.cardapio_hoje() to anon, authenticated;
grant execute on function public.criar_pedido(uuid, uuid, text, text, uuid[]) to anon, authenticated;
grant execute on function public.criar_pedido_coletivo(uuid, jsonb) to anon, authenticated;
grant execute on function public.copiar_cardapio(date, date) to authenticated;
