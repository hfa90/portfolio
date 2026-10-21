-- =====================================================================
--  CHAMADO FÁCIL · CD-AM — Supervisão de turno
--  Fechamento de turno, cobrança de não devolvidos, ocorrências,
--  presença e passagem de turno.
--  Rode DEPOIS do 01_schema.sql (pode rodar mais de uma vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TURNOS: horários (Manaus). Mantenha igual a TURNOS em js/config.js
-- ---------------------------------------------------------------------
create or replace function public.horario_turno(p_turno text, out inicio time, out fim time)
language sql immutable as $$
  select case p_turno when 'T1' then time '06:00' when 'T2' then time '14:20' when 'T3' then time '22:40' end,
         case p_turno when 'T1' then time '14:20' when 'T2' then time '22:40' when 'T3' then time '06:00' end;
$$;

-- Próximo fim do turno p_turno depois do instante p_ts
create or replace function public.fim_turno(p_ts timestamptz, p_turno text)
returns timestamptz language sql stable as $$
  with h as (select fim from public.horario_turno(coalesce(nullif(p_turno,''), public.turno_atual(p_ts)))),
       l as (select (p_ts at time zone 'America/Manaus') as lt)
  select case when (l.lt::date + h.fim) > l.lt
              then (l.lt::date + h.fim) at time zone 'America/Manaus'
              else (l.lt::date + 1 + h.fim) at time zone 'America/Manaus' end
    from h, l;
$$;

-- ---------------------------------------------------------------------
-- 2. OCORRÊNCIAS (problemas relatados nos coletores)
-- ---------------------------------------------------------------------
create table if not exists public.ocorrencias (
  id                    bigserial primary key,
  coletor_id            uuid references public.coletores(id) on delete set null,
  coletor_codigo        text not null,
  tipo                  text not null check (tipo in ('BATERIA','TELA','NAO_LIGA','LEITOR','TECLADO','OUTRO')),
  descricao             text,
  matricula             text,
  nome                  text,
  equipe                text,
  supervisor_matricula  text,
  origem                text not null default 'TERMINAL' check (origem in ('TERMINAL','MANUAL')),
  status                text not null default 'ABERTA' check (status in ('ABERTA','RESOLVIDA')),
  criado_em             timestamptz not null default now(),
  resolvido_em          timestamptz,
  solucao               text
);
create index if not exists ocorrencias_col_idx  on public.ocorrencias(coletor_id, criado_em desc);
create index if not exists ocorrencias_data_idx on public.ocorrencias(criado_em desc);

-- ---------------------------------------------------------------------
-- 3. PRESENÇA (marcação do supervisor por data/turno)
-- ---------------------------------------------------------------------
create table if not exists public.presencas (
  data          date not null,
  turno         text not null,
  matricula     text not null references public.colaboradores(matricula) on delete cascade,
  status        text not null check (status in ('PRESENTE','ATRASO','FALTA','FOLGA','ATESTADO','FERIAS','AFASTADO')),
  obs           text,
  marcado_por   text,
  atualizado_em timestamptz not null default now(),
  primary key (data, turno, matricula)
);

-- ---------------------------------------------------------------------
-- 4. PASSAGEM DE TURNO
-- ---------------------------------------------------------------------
create table if not exists public.passagens (
  id                bigserial primary key,
  data              date not null,
  turno             text not null,
  equipe            text,
  autor_matricula   text not null,
  autor_nome        text,
  resumo            text,
  anotacoes         text,
  pendencias        jsonb not null default '{}'::jsonb,
  ciente_matricula  text,
  ciente_nome       text,
  ciente_em         timestamptz,
  criado_em         timestamptz not null default now()
);
create index if not exists passagens_data_idx on public.passagens(criado_em desc);

-- ---------------------------------------------------------------------
-- 5. EMPRÉSTIMOS: cada retirada com sua devolução e se atrasou
--    (atraso = devolvido mais de 30 min depois do fim do turno)
-- ---------------------------------------------------------------------
create or replace view public.v_emprestimos with (security_invoker = true) as
select r.id, r.coletor_id, r.coletor_codigo, r.matricula, r.nome, r.equipe, r.turno,
       r.supervisor_matricula, r.criado_em as retirado_em,
       d.criado_em as devolvido_em,
       public.fim_turno(r.criado_em, r.turno) as fim_turno,
       coalesce(d.criado_em, now()) > public.fim_turno(r.criado_em, r.turno) + interval '30 minutes' as atrasou
  from public.movimentos r
  left join lateral (
    select m.criado_em from public.movimentos m
     where m.coletor_id = r.coletor_id and m.tipo = 'DEVOLUCAO' and m.id > r.id
     order by m.id limit 1
  ) d on true
 where r.tipo = 'RETIRADA';

-- ---------------------------------------------------------------------
-- 6. REGISTRAR OCORRÊNCIA (terminal ou painel)
--    p_manutencao: envia o coletor para manutenção (se não estiver em uso)
-- ---------------------------------------------------------------------
create or replace function public.registrar_ocorrencia(
  p_coletor    text,
  p_tipo       text,
  p_matricula  text    default null,
  p_descricao  text    default null,
  p_origem     text    default 'TERMINAL',
  p_manutencao boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_col public.coletores%rowtype;
  v_pes public.colaboradores%rowtype;
  v_oc  public.ocorrencias%rowtype;
  v_rot text;
begin
  if not public.e_gestor() then
    return jsonb_build_object('ok',false,'mensagem','Sem permissão.');
  end if;
  select * into v_col from public.coletores where numero = public.numero_coletor(p_coletor) for update;
  if not found then
    return jsonb_build_object('ok',false,'mensagem','Coletor não encontrado.');
  end if;
  if p_matricula is not null then
    select * into v_pes from public.colaboradores
     where ltrim(matricula,'0') = ltrim(regexp_replace(p_matricula,'\D','','g'),'0') limit 1;
  end if;
  v_rot := case upper(p_tipo) when 'BATERIA' then 'Bateria' when 'TELA' then 'Tela' when 'NAO_LIGA' then 'Não liga'
            when 'LEITOR' then 'Leitor/gatilho' when 'TECLADO' then 'Teclado' else 'Outro' end;

  insert into public.ocorrencias(coletor_id,coletor_codigo,tipo,descricao,matricula,nome,equipe,supervisor_matricula,origem)
  values (v_col.id, v_col.codigo, upper(p_tipo), nullif(trim(p_descricao),''),
          v_pes.matricula, v_pes.nome, coalesce(v_pes.equipe, v_col.equipe), v_col.supervisor_matricula, p_origem)
  returning * into v_oc;

  if p_manutencao and v_col.status <> 'EM_USO' then
    update public.coletores
       set status = 'MANUTENCAO',
           observacao = v_rot || coalesce(': ' || nullif(trim(p_descricao),''), '')
                        || coalesce(' · relatado por ' || split_part(v_pes.nome,' ',1), '')
     where id = v_col.id;
  end if;
  return jsonb_build_object('ok',true,'id',v_oc.id,'coletor',v_col.codigo,'tipo',v_rot);
end; $$;

-- Ao voltar de MANUTENÇÃO para DISPONÍVEL, fecha as ocorrências abertas
create or replace function public.resolver_ocorrencias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'MANUTENCAO' and new.status = 'DISPONIVEL' then
    update public.ocorrencias set status = 'RESOLVIDA', resolvido_em = now(),
           solucao = coalesce(solucao, 'Coletor liberado para uso')
     where coletor_id = new.id and status = 'ABERTA';
    new.observacao := null;
  end if;
  return new;
end; $$;
drop trigger if exists trg_resolver_ocorrencias on public.coletores;
create trigger trg_resolver_ocorrencias before update on public.coletores
  for each row execute function public.resolver_ocorrencias();

-- ---------------------------------------------------------------------
-- 7. SEGURANÇA
-- ---------------------------------------------------------------------
alter table public.ocorrencias enable row level security;
alter table public.presencas   enable row level security;
alter table public.passagens   enable row level security;

drop policy if exists oc_sel on public.ocorrencias;
drop policy if exists oc_upd on public.ocorrencias;
create policy oc_sel on public.ocorrencias for select to authenticated using (public.e_gestor());
create policy oc_upd on public.ocorrencias for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

drop policy if exists pr_sel on public.presencas;
drop policy if exists pr_ins on public.presencas;
drop policy if exists pr_upd on public.presencas;
drop policy if exists pr_del on public.presencas;
create policy pr_sel on public.presencas for select to authenticated using (public.e_gestor());
create policy pr_ins on public.presencas for insert to authenticated with check (public.e_gestor());
create policy pr_upd on public.presencas for update to authenticated using (public.e_gestor()) with check (public.e_gestor());
create policy pr_del on public.presencas for delete to authenticated using (public.e_gestor());

drop policy if exists pa_sel on public.passagens;
drop policy if exists pa_ins on public.passagens;
drop policy if exists pa_upd on public.passagens;
create policy pa_sel on public.passagens for select to authenticated using (public.e_gestor());
create policy pa_ins on public.passagens for insert to authenticated with check (public.e_gestor());
create policy pa_upd on public.passagens for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

revoke all on public.ocorrencias, public.presencas, public.passagens, public.v_emprestimos from anon;
grant select, update on public.ocorrencias to authenticated;
grant select, insert, update, delete on public.presencas to authenticated;
grant select, insert, update on public.passagens to authenticated;
grant select on public.v_emprestimos to authenticated;
grant usage on sequence public.passagens_id_seq to authenticated;
revoke execute on function public.registrar_ocorrencia(text,text,text,text,text,boolean) from public, anon;
grant  execute on function public.registrar_ocorrencia(text,text,text,text,text,boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 8. TEMPO REAL
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.ocorrencias; exception when others then null; end;
  begin alter publication supabase_realtime add table public.passagens;   exception when others then null; end;
end $$;
