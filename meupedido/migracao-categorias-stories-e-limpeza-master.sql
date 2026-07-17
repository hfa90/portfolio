-- Categorias de produtos, stories no cliente, limpeza Master completa
-- e fidelidade pontuando apenas marmita/lanche.

alter table public.pratos add column if not exists categoria text not null default 'marmita';
alter table public.pratos drop constraint if exists pratos_categoria_check;
alter table public.pratos
  add constraint pratos_categoria_check
  check (categoria in ('marmita','bebida','sobremesa','lanche'));

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
  prato_categoria text,
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
    coalesce(p.categoria, 'marmita'),
    p.preco
  from public.cardapio_dia cd
  join public.fornecedores f on f.id = cd.fornecedor_id
  join public.pratos p on p.id = cd.prato_id
  where cd.data = public.hoje_sp()
    and cd.disponivel = true
    and f.ativo = true
    and p.ativo = true
    and extract(dow from public.hoje_sp())::int = any(f.dias_atendimento)
  order by
    case coalesce(p.categoria, 'marmita')
      when 'marmita' then 0
      when 'bebida' then 1
      when 'sobremesa' then 2
      when 'lanche' then 3
      else 4
    end,
    f.nome,
    p.nome;
$$;

create or replace function public.admin_limpar_dados()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode apagar os dados do banco.' using errcode = '42501';
  end if;

  execute 'truncate table ' || array_to_string(array[
    'public.cliente_fidelidade_eventos',
    'public.pedido_avaliacoes',
    'public.cliente_preferencias',
    'public.cliente_favoritos',
    'public.auditoria_admin',
    'public.pedido_acompanhamentos',
    'public.pedidos_coletivos_itens',
    'public.pedidos_coletivos',
    'public.pagamentos',
    'public.pedidos',
    'public.cardapio_dia',
    'public.acompanhamentos',
    'public.pratos',
    'public.fornecedores',
    'public.push_subscriptions',
    'public.login_tentativas',
    'public.colaboradores'
  ], ', ') || ' restart identity cascade';

  delete from public.admins
   where perfil <> 'master';

  return 'Dados do banco apagados. Apenas perfis Master e configuracoes do site foram preservados.';
end;
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

  if not exists (
    select 1
      from public.pratos pr
     where pr.id = new.prato_id
       and coalesce(pr.categoria, 'marmita') in ('marmita', 'lanche')
  ) then
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
    join public.pratos pr on pr.id = p.prato_id
   where p.colaborador_id = new.colaborador_id
     and p.status_pagamento = 'pago'
     and p.status <> 'cancelado'
     and coalesce(pr.categoria, 'marmita') in ('marmita', 'lanche');

  v_indice := greatest(coalesce(v_indice, 1), 1);
  v_recompensa := cfg.pedidos_meta > 0 and (v_indice % cfg.pedidos_meta = 0);

  if v_recompensa then
    v_titulo := 'Voce ganhou uma recompensa!';
    v_msg := 'Voce completou ' || cfg.pedidos_meta || ' pedido(s) pagos no programa de fidelidade e ganhou: ' || cfg.recompensa_descricao || '.';
  else
    v_titulo := 'Ponto de fidelidade recebido';
    v_msg := 'Voce recebeu ' || cfg.pontos_por_pedido || ' ponto(s) por comprar hoje. Faltam ' || (cfg.pedidos_meta - (v_indice % cfg.pedidos_meta)) || ' pedido(s) pago(s) para ganhar: ' || cfg.recompensa_descricao || '.';
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

revoke all on function public.cardapio_hoje() from public;
grant execute on function public.cardapio_hoje() to anon, authenticated;
revoke all on function public.admin_limpar_dados() from public;
revoke all on function public.admin_limpar_dados() from anon;
grant execute on function public.admin_limpar_dados() to authenticated;

notify pgrst, 'reload schema';
