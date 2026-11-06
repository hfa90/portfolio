-- =====================================================================
--  INVENTÁRIO QUALLIT — 05: inventários programados com prazo
--  Rode DEPOIS do 01 a 04 (SQL Editor > New query > Run). Pode rodar mais de uma vez.
--
--  • O administrador cria agendamentos (única vez, diário, semanal ou mensal)
--    para um CD ou para todos, com prazo em horas para concluir.
--  • No horário, cada CD ganha um inventário aberto com início e prazo.
--  • A geração roda pelo pg_cron do Supabase (a cada 5 min) e também quando
--    o painel ou o app de campo são abertos — funciona mesmo sem pg_cron.
-- =====================================================================

create table if not exists public.agendamentos (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  cd_id            uuid references public.cds(id) on delete cascade,  -- vazio = todos os CDs ativos
  setor            text,
  recorrencia      text not null check (recorrencia in ('unica','diaria','semanal','mensal')),
  dias_semana      int[] not null default '{}',                       -- 0 = domingo … 6 = sábado
  dia_mes          int check (dia_mes between 1 and 31),              -- 31 = último dia do mês
  hora             time not null default '08:00',
  data_inicio      date not null default current_date,
  data_fim         date,
  prazo_horas      int not null default 8 check (prazo_horas between 1 and 2160),
  fuso             text not null default 'America/Sao_Paulo',
  ativo            boolean not null default true,
  proxima_execucao timestamptz,
  ultima_execucao  timestamptz,
  criado_por       text default public._origem_atual(),
  criado_em        timestamptz not null default now(),
  constraint agend_semanal_tem_dia check (recorrencia <> 'semanal' or cardinality(dias_semana) > 0),
  constraint agend_mensal_tem_dia  check (recorrencia <> 'mensal' or dia_mes is not null)
);
create index if not exists agend_proxima_idx on public.agendamentos (proxima_execucao) where ativo;

alter table public.conferencias
  add column if not exists agendamento_id uuid references public.agendamentos(id) on delete set null,
  add column if not exists inicio_em      timestamptz,
  add column if not exists prazo_em       timestamptz;
create unique index if not exists conf_agend_uk on public.conferencias (agendamento_id, cd_id, inicio_em) where agendamento_id is not null;
create index if not exists conf_prazo_idx on public.conferencias (prazo_em) where status = 'aberta';

-- ---------------------------------------------------------------------
-- Próxima execução (no fuso do agendamento)
-- ---------------------------------------------------------------------
create or replace function public._proxima_execucao(
  p_rec text, p_dias int[], p_dia_mes int, p_hora time, p_inicio date, p_fim date, p_fuso text, p_depois timestamptz)
returns timestamptz language plpgsql stable as $$
declare d date; ts timestamptz; ultimo int;
begin
  d := greatest(p_inicio, (p_depois at time zone p_fuso)::date);
  for i in 0..400 loop
    if p_fim is not null and d > p_fim then return null; end if;
    ultimo := extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int;
    if (p_rec = 'unica'   and d = p_inicio)
    or (p_rec = 'diaria')
    or (p_rec = 'semanal' and extract(dow from d)::int = any (coalesce(p_dias, '{}')))
    or (p_rec = 'mensal'  and extract(day from d)::int = least(p_dia_mes, ultimo)) then
      ts := (d + p_hora) at time zone p_fuso;
      if ts > p_depois then return ts; end if;
    end if;
    if p_rec = 'unica' and d >= p_inicio then return null; end if;
    d := d + 1;
  end loop;
  return null;
end $$;

create or replace function public._agend_calcular()
returns trigger language plpgsql as $$
begin
  -- na geração automática só a data muda: mantém a próxima execução calculada por ela
  if tg_op = 'UPDATE'
     and (new.recorrencia, new.dias_semana, new.dia_mes, new.hora, new.data_inicio, new.data_fim, new.fuso, new.ativo)
         is not distinct from (old.recorrencia, old.dias_semana, old.dia_mes, old.hora, old.data_inicio, old.data_fim, old.fuso, old.ativo) then
    return new;
  end if;
  if not new.ativo then
    new.proxima_execucao := null;
  else
    -- 5 min de folga: agendar "para agora" já gera o inventário
    new.proxima_execucao := public._proxima_execucao(new.recorrencia, new.dias_semana, new.dia_mes, new.hora,
                                                     new.data_inicio, new.data_fim, new.fuso, now() - interval '5 minutes');
  end if;
  return new;
end $$;
drop trigger if exists trg_agend_calc on public.agendamentos;
create trigger trg_agend_calc before insert or update of recorrencia, dias_semana, dia_mes, hora, data_inicio, data_fim, fuso, ativo
  on public.agendamentos for each row execute function public._agend_calcular();

-- ---------------------------------------------------------------------
-- Gera os inventários que chegaram na hora (idempotente)
-- ---------------------------------------------------------------------
create or replace function public.gerar_inventarios_agendados()
returns int language plpgsql security definer set search_path = public as $$
declare a record; c record; n int := 0; k int; v_ini timestamptz;
begin
  perform set_config('app.origem', 'agendamento', true);
  for a in select * from agendamentos
            where ativo and proxima_execucao is not null and proxima_execucao <= now()
            for update skip locked loop
    v_ini := a.proxima_execucao;
    -- não cria execuções que já venceram (ex.: sistema ficou dias sem ninguém abrir e sem pg_cron)
    if v_ini + make_interval(hours => a.prazo_horas) > now() then
      for c in select id from cds where ativo and (a.cd_id is null or id = a.cd_id) loop
        insert into conferencias (nome, setor, cd_id, status, criado_por, agendamento_id, inicio_em, prazo_em, criado_em)
        values (a.nome || ' · ' || to_char(v_ini at time zone a.fuso, 'DD/MM HH24:MI'), a.setor, c.id, 'aberta',
                'agendamento', a.id, v_ini, v_ini + make_interval(hours => a.prazo_horas), v_ini)
        on conflict do nothing;
        get diagnostics k = row_count;
        n := n + k;
      end loop;
    end if;
    update agendamentos set
      ultima_execucao  = v_ini,
      ativo            = case when recorrencia = 'unica' then false else ativo end,
      proxima_execucao = case when recorrencia = 'unica' then null
                              else _proxima_execucao(recorrencia, dias_semana, dia_mes, hora, data_inicio, data_fim, fuso, greatest(v_ini, now())) end
    where id = a.id;
  end loop;
  return n;
end $$;
revoke all on function public.gerar_inventarios_agendados() from public, anon;
grant execute on function public.gerar_inventarios_agendados() to authenticated;

-- Field não altera prazo nem vínculo com o agendamento
create or replace function public._conf_protege_prazo()
returns trigger language plpgsql as $$
begin
  if not public.eh_admin() and coalesce(current_setting('app.origem', true), '') <> 'agendamento' then
    new.prazo_em := old.prazo_em;
    new.inicio_em := old.inicio_em;
    new.agendamento_id := old.agendamento_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_conf_prazo on public.conferencias;
create trigger trg_conf_prazo before update on public.conferencias for each row execute function public._conf_protege_prazo();

-- ---------------------------------------------------------------------
-- Acesso: todos veem os agendamentos do seu CD; só admin cria/edita
-- ---------------------------------------------------------------------
alter table public.agendamentos enable row level security;
revoke all on public.agendamentos from anon;
grant select, insert, update, delete on public.agendamentos to authenticated;
drop policy if exists agend_ler on public.agendamentos;
drop policy if exists agend_admin on public.agendamentos;
create policy agend_ler   on public.agendamentos for select to authenticated
  using ((select eh_admin()) or cd_id is null or cd_id = (select meu_cd()));
create policy agend_admin on public.agendamentos for all to authenticated
  using ((select eh_admin())) with check ((select eh_admin()));

-- ---------------------------------------------------------------------
-- Agendador do Supabase (pg_cron): roda a cada 5 minutos.
-- Se a extensão não estiver liberada no seu plano, o app gera ao abrir.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron não disponível (%). Os inventários serão gerados quando o painel/app forem abertos.', sqlerrm;
  end;
  begin
    perform cron.schedule('inventarios-agendados', '*/5 * * * *', 'select public.gerar_inventarios_agendados()');
  exception when others then
    raise notice 'Agendador não configurado (%).', sqlerrm;
  end;
end $$;

-- realtime: painel atualiza quando um inventário é gerado
do $$
begin
  begin alter publication supabase_realtime add table public.conferencias;
  exception when duplicate_object then null; when undefined_object then null; end;
end $$;
