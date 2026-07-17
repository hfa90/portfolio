-- Corrige agregacoes do perfil do cliente para evitar duplicacao por joins.

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
