-- =====================================================================
--  INVENTÁRIO QUALLIT — 03: compra/garantia, empréstimos e alerta de peça removida
--  Rode DEPOIS do 01 e do 02 (SQL Editor > New query > Run). Pode rodar mais de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Compra e garantia + controle do alerta de hardware reduzido
-- ---------------------------------------------------------------------
alter table public.maquinas
  add column if not exists data_compra      date,
  add column if not exists fornecedor       text,
  add column if not exists nota_fiscal      text,
  add column if not exists valor_compra     numeric(12,2),
  add column if not exists garantia_fim     date,
  add column if not exists hw_verificado_em timestamptz;   -- técnico marcou o alerta de peça como verificado

-- auditoria passa a registrar também os campos de compra/garantia
create or replace function public._maquinas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['hostname','ativo','tipo','status','numero_serie','fabricante','modelo',
                         'cpu','memoria_gb','armazenamento_total_gb','so_nome','so_display_version',
                         'so_build','setor','localizacao','responsavel',
                         'data_compra','fornecedor','nota_fiscal','garantia_fim'];
  f text; v_old text; v_new text;
begin
  if tg_op = 'INSERT' then
    insert into maquinas_historico (maquina_id, campo, valor_novo, origem)
    values (new.id, 'cadastro', new.hostname, _origem_atual());
    return new;
  end if;
  foreach f in array campos loop
    v_old := to_jsonb(old) ->> f;
    v_new := to_jsonb(new) ->> f;
    if v_old is distinct from v_new
       and not (v_old is null and _origem_atual() = 'agente') then
      insert into maquinas_historico (maquina_id, campo, valor_anterior, valor_novo, origem)
      values (new.id, f, v_old, v_new, _origem_atual());
    end if;
  end loop;
  if old.hw_verificado_em is distinct from new.hw_verificado_em and new.hw_verificado_em is not null then
    insert into maquinas_historico (maquina_id, campo, valor_novo, origem)
    values (new.id, 'hw_verificado', 'Alerta de peça verificado', _origem_atual());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- EMPRÉSTIMOS
-- ---------------------------------------------------------------------
create table if not exists public.emprestimos (
  id                   uuid primary key default gen_random_uuid(),
  maquina_id           uuid not null references public.maquinas(id) on delete cascade,
  colaborador          text not null,
  matricula            text,
  setor                text,
  contato              text,
  retirado_em          timestamptz not null default now(),
  previsto_devolucao   timestamptz,
  devolvido_em         timestamptz,
  status_anterior      text,
  status_retorno       text check (status_retorno in ('em_uso','estoque','manutencao')),
  condicao_devolucao   text check (condicao_devolucao in ('ok','avaria','faltando_item')),
  obs_retirada         text,
  obs_devolucao        text,
  assinatura_retirada  text,          -- imagem (data URL) da assinatura na retirada
  assinatura_devolucao text,
  entregue_por         text default public._origem_atual(),
  recebido_por         text,
  criado_em            timestamptz not null default now()
);
create unique index if not exists emprestimo_aberto_uk on public.emprestimos (maquina_id) where devolvido_em is null;
create index if not exists emprestimos_data_idx on public.emprestimos (retirado_em desc);

create or replace function public._emprestimo_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select status into new.status_anterior from maquinas where id = new.maquina_id;
  return new;
end $$;

create or replace function public._emprestimo_ai()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update maquinas set status = 'emprestado' where id = new.maquina_id and status <> 'emprestado';
  elsif old.devolvido_em is null and new.devolvido_em is not null then
    update maquinas set status = coalesce(
             new.status_retorno,
             case when new.condicao_devolucao = 'avaria' then 'manutencao' end,
             case when new.status_anterior in ('em_uso','estoque','manutencao') then new.status_anterior end,
             'estoque')
     where id = new.maquina_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_emprestimo_bi on public.emprestimos;
create trigger trg_emprestimo_bi before insert on public.emprestimos
  for each row execute function public._emprestimo_bi();
drop trigger if exists trg_emprestimo_ai on public.emprestimos;
create trigger trg_emprestimo_ai after insert or update on public.emprestimos
  for each row execute function public._emprestimo_ai();

alter table public.emprestimos enable row level security;
revoke all on public.emprestimos from anon;
drop policy if exists "auth_all" on public.emprestimos;
create policy "auth_all" on public.emprestimos for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.emprestimos to authenticated;

-- ---------------------------------------------------------------------
-- VIEW recriada com os novos alertas
-- ---------------------------------------------------------------------
drop view if exists public.vw_maquinas;
create view public.vw_maquinas with (security_invoker = true) as
with base as (
  select
    m.*,
    (select jsonb_build_object('campo', h.campo, 'de', h.valor_anterior, 'para', h.valor_novo, 'em', h.criado_em)
       from public.maquinas_historico h
      where h.maquina_id = m.id
        and h.campo in ('memoria_gb','armazenamento_total_gb')
        and h.valor_anterior ~ '^[0-9]+(\.[0-9]+)?$' and h.valor_novo ~ '^[0-9]+(\.[0-9]+)?$'
        and h.valor_novo::numeric < h.valor_anterior::numeric
                                   - case h.campo when 'memoria_gb' then 0.5 else 10 end
        and h.criado_em > coalesce(m.hw_verificado_em, '-infinity'::timestamptz)
        and h.criado_em > now() - interval '120 days'
      order by h.criado_em desc limit 1) as hw_reducao,
    (select jsonb_build_object('id', e.id, 'colaborador', e.colaborador, 'matricula', e.matricula,
                               'retirado_em', e.retirado_em, 'previsto_devolucao', e.previsto_devolucao)
       from public.emprestimos e
      where e.maquina_id = m.id and e.devolvido_em is null) as emprestimo_atual
  from public.maquinas m
)
select
  b.*,
  case
    when b.ultimo_online is null                         then 'nunca'
    when b.ultimo_online > now() - interval '2 hours'    then 'online'
    when b.ultimo_online > now() - interval '7 days'     then 'recente'
    when b.ultimo_online > now() - interval '30 days'    then 'ausente'
    else 'offline'
  end as situacao,
  floor(extract(epoch from (now() - b.ultimo_online)) / 86400)::int as dias_sem_contato,
  case when b.armazenamento_total_gb > 0
       then round(100 * b.armazenamento_livre_gb / b.armazenamento_total_gb, 1) end as livre_pct,
  case when b.data_compra is not null
       then extract(year from age(current_date, b.data_compra))::int end as idade_anos,
  array_remove(array[
    case when b.hw_reducao is not null                                              then 'hw_reduzido' end,
    case when (b.emprestimo_atual ->> 'previsto_devolucao')::timestamptz < now()    then 'emprestimo_atrasado' end,
    case when b.memoria_gb is not null and b.memoria_gb < 8                         then 'ram_baixa' end,
    case when b.armazenamento_livre_gb is not null and
              (b.armazenamento_livre_gb < 15 or
               b.armazenamento_livre_gb < b.armazenamento_total_gb * 0.10)          then 'disco_cheio' end,
    case when b.discos @> '[{"tipo":"HDD"}]'::jsonb                                 then 'hdd' end,
    case when b.so_nome ilike '%windows 10%' or b.so_nome ilike '%windows 7%'
              or b.so_nome ilike '%windows 8%'                                      then 'so_sem_suporte' end,
    case when b.status not in ('descartado','extraviado','emprestado') and
              b.ultimo_online < now() - interval '30 days'                          then 'sem_contato' end,
    case when b.status in ('estoque','descartado','extraviado') and
              b.ultimo_online > now() - interval '3 days'                           then 'estoque_online' end,
    case when coalesce(b.ativo,'') = '' and b.status <> 'descartado'                then 'sem_ativo' end,
    case when exists (select 1 from public.maquinas d
                      where d.id <> b.id and upper(d.hostname) = upper(b.hostname)
                        and d.status not in ('descartado'))                         then 'hostname_duplicado' end,
    case when b.garantia_fim between current_date and current_date + 30
              and b.status <> 'descartado'                                          then 'garantia_vencendo' end,
    case when b.data_compra < current_date - interval '5 years'
              and b.status <> 'descartado'                                          then 'renovacao' end
  ], null) as alertas
from base b;

revoke all on public.vw_maquinas from anon;
grant select on public.vw_maquinas to authenticated;

-- realtime para a tela de empréstimos
do $$
begin
  begin
    alter publication supabase_realtime add table public.emprestimos;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;
