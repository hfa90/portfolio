-- Programa de fidelidade configuravel, opcional e com avisos por cliente.

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
