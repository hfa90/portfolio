-- Experiencia do cliente: favoritos, perfil, fidelidade e avaliacoes.

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
