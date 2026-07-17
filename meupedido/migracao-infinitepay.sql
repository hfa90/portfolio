-- Integracao InfinitePay Checkout
-- Rode este arquivo no SQL Editor do Supabase em bases ja existentes.

alter table public.pedidos add column if not exists infinitepay_checkout_url text;
alter table public.pedidos add column if not exists infinitepay_invoice_slug text;
alter table public.pedidos add column if not exists infinitepay_transaction_nsu text;
alter table public.pedidos add column if not exists infinitepay_receipt_url text;
alter table public.pedidos add column if not exists infinitepay_capture_method text;
alter table public.pedidos add column if not exists infinitepay_paid_amount numeric(10,2);
alter table public.pedidos add column if not exists infinitepay_checked_em timestamptz;
alter table public.pedidos add column if not exists infinitepay_payload jsonb;

alter table public.pedidos drop constraint if exists pedidos_forma_pagamento_check;
alter table public.pedidos
  add constraint pedidos_forma_pagamento_check
  check (forma_pagamento in ('pix_empresa','pix_fornecedor','dinheiro','fiado','pagar_mais_tarde','cartao_infinitepay'));

insert into public.configuracoes (chave, valor)
values ('infinitepay_handle', '')
on conflict (chave) do nothing;

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

grant execute on function public.criar_pedido(uuid, uuid, text, text, uuid[]) to anon, authenticated;
