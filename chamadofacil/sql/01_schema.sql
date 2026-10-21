-- =====================================================================
--  CHAMADO FÁCIL · CD-AM  —  Estrutura do banco (Supabase / Postgres)
--  Rode este arquivo PRIMEIRO no SQL Editor do Supabase.
--  Pode ser executado mais de uma vez (idempotente).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. COLABORADORES (vem da listagem WorkArea)
-- ---------------------------------------------------------------------
create table if not exists public.colaboradores (
  matricula     text primary key,
  nome          text not null,
  cargo         text,
  setor         text,
  equipe        text,                       -- ex.: PRD, MOV, REC/EXP, PCP, RESS T2 ...
  turno         text,                       -- T1 / T2 / T3 (opcional)
  perfil        text not null default 'colaborador'
                check (perfil in ('colaborador','supervisor','coordenador','admin')),
  ativo         boolean not null default true,
  user_id       uuid unique references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);
create index if not exists colaboradores_equipe_idx on public.colaboradores(equipe);

-- ---------------------------------------------------------------------
-- 2. COLETORES DE DADOS
-- ---------------------------------------------------------------------
create table if not exists public.coletores (
  id                    uuid primary key default gen_random_uuid(),
  numero                integer not null unique check (numero > 0),
  codigo                text generated always as ('COL-' || lpad(numero::text, 3, '0')) stored unique,
  modelo                text,
  serie                 text,
  propriedade           text not null default 'CD' check (propriedade in ('CD','ALUGADO')),
  locadora              text,
  equipe                text,
  supervisor_matricula  text references public.colaboradores(matricula) on delete set null,
  status                text not null default 'DISPONIVEL'
                        check (status in ('DISPONIVEL','EM_USO','MANUTENCAO','INATIVO')),
  portador_matricula    text references public.colaboradores(matricula) on delete set null,
  portador_nome         text,
  retirado_em           timestamptz,
  turno_retirada        text,
  observacao            text,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. MOVIMENTAÇÕES (histórico imutável de retiradas e devoluções)
-- ---------------------------------------------------------------------
create table if not exists public.movimentos (
  id                    bigserial primary key,
  coletor_id            uuid references public.coletores(id) on delete set null,
  coletor_codigo        text not null,
  tipo                  text not null check (tipo in ('RETIRADA','DEVOLUCAO')),
  matricula             text not null,
  nome                  text not null,
  equipe                text,
  turno                 text,
  supervisor_matricula  text,
  origem                text not null default 'TERMINAL' check (origem in ('TERMINAL','MANUAL')),
  observacao            text,
  registrado_por        uuid default auth.uid(),
  criado_em             timestamptz not null default now()
);
create index if not exists movimentos_data_idx    on public.movimentos(criado_em desc);
create index if not exists movimentos_coletor_idx on public.movimentos(coletor_id, criado_em desc);
create index if not exists movimentos_mat_idx     on public.movimentos(matricula, criado_em desc);

-- ---------------------------------------------------------------------
-- 4. CHAMADOS (registro dos chamados abertos pelo sistema)
-- ---------------------------------------------------------------------
create table if not exists public.chamados (
  id                 bigserial primary key,
  tipo               text not null check (tipo in ('TEAMS','WMS')),
  acao               text not null,
  matricula          text,
  nome               text,
  descricao          text,
  numero_servicenow  text,
  status             text not null default 'ABERTO' check (status in ('ABERTO','RESOLVIDO')),
  aberto_por         text,                 -- matrícula do supervisor
  aberto_por_nome    text,
  criado_em          timestamptz not null default now(),
  resolvido_em       timestamptz
);
create index if not exists chamados_data_idx on public.chamados(criado_em desc);

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES AUXILIARES
-- ---------------------------------------------------------------------

-- Turno pela hora local de Manaus (ajuste os horários se necessário)
create or replace function public.turno_atual(p_ts timestamptz default now())
returns text language sql stable as $$
  select case
    when (p_ts at time zone 'America/Manaus')::time >= time '06:00'
     and (p_ts at time zone 'America/Manaus')::time <  time '14:20' then 'T1'
    when (p_ts at time zone 'America/Manaus')::time >= time '14:20'
     and (p_ts at time zone 'America/Manaus')::time <  time '22:40' then 'T2'
    else 'T3'
  end;
$$;

-- Perfil do usuário logado
create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.colaboradores where user_id = auth.uid() and ativo;
$$;

create or replace function public.e_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() in ('supervisor','coordenador','admin'), false);
$$;

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end; $$;

drop trigger if exists trg_coletores_upd on public.coletores;
create trigger trg_coletores_upd before update on public.coletores
  for each row execute function public.tocar_atualizado_em();
drop trigger if exists trg_colab_upd on public.colaboradores;
create trigger trg_colab_upd before update on public.colaboradores
  for each row execute function public.tocar_atualizado_em();

-- Normaliza o que foi bipado: "COL-007", "col7", "7", "007" -> numero 7
create or replace function public.numero_coletor(p_txt text)
returns integer language sql immutable as $$
  select ((regexp_match(upper(trim(coalesce(p_txt,''))), '^(?:COL)?[-\s]*0*(\d{1,6})$'))[1])::integer;
$$;

-- ---------------------------------------------------------------------
-- 6. BIPAGEM: registra retirada/devolução de forma atômica
--    p_acao: 'AUTO' (alterna), 'RETIRADA', 'DEVOLUCAO'
--    p_transferir: true = coletor está com outra pessoa, devolve em nome
--                  dela e já retira para quem bipou
-- ---------------------------------------------------------------------
create or replace function public.registrar_bipagem(
  p_matricula  text,
  p_coletor    text,
  p_acao       text    default 'AUTO',
  p_transferir boolean default false,
  p_origem     text    default 'TERMINAL',
  p_obs        text    default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_col   public.coletores%rowtype;
  v_pes   public.colaboradores%rowtype;
  v_num   integer;
  v_tipo  text;
  v_turno text := public.turno_atual();
  v_mov   public.movimentos%rowtype;
  v_ant   text;
begin
  if not public.e_gestor() then
    return jsonb_build_object('ok',false,'erro','SEM_PERMISSAO',
      'mensagem','Terminal sem login de supervisor.');
  end if;

  v_num := public.numero_coletor(p_coletor);
  if v_num is null then
    return jsonb_build_object('ok',false,'erro','COLETOR_INVALIDO',
      'mensagem','Código de coletor inválido: '||coalesce(p_coletor,''));
  end if;

  select * into v_col from public.coletores where numero = v_num for update;
  if not found then
    return jsonb_build_object('ok',false,'erro','COLETOR_NAO_ENCONTRADO',
      'mensagem','Coletor COL-'||lpad(v_num::text,3,'0')||' não está cadastrado.');
  end if;

  select * into v_pes from public.colaboradores
   where ltrim(matricula,'0') = ltrim(regexp_replace(coalesce(p_matricula,''), '\D', '', 'g'),'0')
     and regexp_replace(coalesce(p_matricula,''), '\D', '', 'g') <> ''
   limit 1;
  if not found then
    return jsonb_build_object('ok',false,'erro','MATRICULA_NAO_ENCONTRADA',
      'mensagem','Matrícula '||coalesce(p_matricula,'')||' não encontrada.');
  end if;
  if not v_pes.ativo then
    return jsonb_build_object('ok',false,'erro','COLABORADOR_INATIVO',
      'mensagem',v_pes.nome||' está inativo no cadastro.');
  end if;
  v_turno := coalesce(nullif(v_pes.turno,''), v_turno);

  -- decide a ação
  v_tipo := upper(coalesce(p_acao,'AUTO'));
  if v_tipo = 'AUTO' then
    v_tipo := case when v_col.status = 'EM_USO' then 'DEVOLUCAO' else 'RETIRADA' end;
  end if;

  if v_tipo = 'RETIRADA' then
    if v_col.status in ('MANUTENCAO','INATIVO') then
      return jsonb_build_object('ok',false,'erro','COLETOR_BLOQUEADO',
        'mensagem',v_col.codigo||' está em '||lower(v_col.status)||'. Não pode ser retirado.');
    end if;
    if v_col.status = 'EM_USO' and v_col.portador_matricula <> v_pes.matricula then
      return jsonb_build_object('ok',false,'erro','EM_USO_OUTRO',
        'mensagem',v_col.codigo||' já está com '||v_col.portador_nome||'.',
        'portador',v_col.portador_nome,'portador_matricula',v_col.portador_matricula,
        'coletor',v_col.codigo);
    end if;
    if v_col.status = 'EM_USO' then
      return jsonb_build_object('ok',false,'erro','JA_RETIRADO',
        'mensagem',v_col.codigo||' já está com você.');
    end if;
  end if;

  if v_tipo = 'DEVOLUCAO' then
    if v_col.status <> 'EM_USO' then
      return jsonb_build_object('ok',false,'erro','NAO_ESTA_EM_USO',
        'mensagem',v_col.codigo||' não consta como retirado.');
    end if;
    if v_col.portador_matricula is distinct from v_pes.matricula then
      if not p_transferir then
        return jsonb_build_object('ok',false,'erro','EM_USO_OUTRO',
          'mensagem',v_col.codigo||' está com '||v_col.portador_nome||'.',
          'portador',v_col.portador_nome,'portador_matricula',v_col.portador_matricula,
          'coletor',v_col.codigo);
      end if;
      -- transferência: devolve em nome do portador anterior e retira para quem bipou
      v_ant := v_col.portador_nome;
      insert into public.movimentos(coletor_id,coletor_codigo,tipo,matricula,nome,equipe,turno,
                                    supervisor_matricula,origem,observacao)
      values (v_col.id, v_col.codigo, 'DEVOLUCAO', v_col.portador_matricula, v_col.portador_nome,
             (select equipe from public.colaboradores where matricula = v_col.portador_matricula),
             coalesce(v_col.turno_retirada, v_turno), v_col.supervisor_matricula, p_origem,
             'Transferido para '||v_pes.nome||' ('||v_pes.matricula||')');
      v_tipo := 'RETIRADA';
    end if;
  end if;

  insert into public.movimentos(coletor_id,coletor_codigo,tipo,matricula,nome,equipe,turno,
                                supervisor_matricula,origem,observacao)
  values (v_col.id, v_col.codigo, v_tipo, v_pes.matricula, v_pes.nome, v_pes.equipe, v_turno,
          v_col.supervisor_matricula, p_origem,
          coalesce(p_obs, case when v_ant is not null then 'Recebido de '||v_ant end))
  returning * into v_mov;

  if v_tipo = 'RETIRADA' then
    update public.coletores
       set status='EM_USO', portador_matricula=v_pes.matricula, portador_nome=v_pes.nome,
           retirado_em=now(), turno_retirada=v_turno
     where id = v_col.id;
  else
    update public.coletores
       set status='DISPONIVEL', portador_matricula=null, portador_nome=null,
           retirado_em=null, turno_retirada=null
     where id = v_col.id;
  end if;

  return jsonb_build_object('ok',true,'tipo',v_tipo,'coletor',v_col.codigo,
    'nome',v_pes.nome,'matricula',v_pes.matricula,'turno',v_turno,
    'transferido_de',v_ant,'movimento_id',v_mov.id,'criado_em',v_mov.criado_em);
end; $$;

-- ---------------------------------------------------------------------
-- 7. CRIAR ACESSO DE SUPERVISOR  (usuário = matrícula, senha = CPF)
--    Executável SOMENTE pelo SQL Editor (não fica exposto na API).
-- ---------------------------------------------------------------------
create or replace function public.criar_acesso(
  p_matricula text, p_cpf text, p_perfil text default 'supervisor'
) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_email text := regexp_replace(p_matricula,'\D','','g') || '@cdam.chamadofacil.app';
  v_cpf   text := regexp_replace(coalesce(p_cpf,''),'\D','','g');
  v_uid   uuid;
begin
  if length(v_cpf) <> 11 then
    raise exception 'CPF da matrícula % precisa ter 11 dígitos', p_matricula;
  end if;
  if not exists (select 1 from public.colaboradores where matricula = regexp_replace(p_matricula,'\D','','g')) then
    raise exception 'Matrícula % não existe em colaboradores', p_matricula;
  end if;

  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(v_cpf, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('matricula', p_matricula), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
      'email', now(), now(), now());
  else
    update auth.users set encrypted_password = crypt(v_cpf, gen_salt('bf')), updated_at = now()
     where id = v_uid;
  end if;

  update public.colaboradores
     set user_id = v_uid, perfil = p_perfil, ativo = true
   where matricula = regexp_replace(p_matricula,'\D','','g');
  return 'OK: ' || p_matricula || ' (' || p_perfil || ')';
end; $$;
revoke all on function public.criar_acesso(text,text,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. SEGURANÇA (RLS) — só supervisores/coordenadores logados acessam
-- ---------------------------------------------------------------------
alter table public.colaboradores enable row level security;
alter table public.coletores     enable row level security;
alter table public.movimentos    enable row level security;
alter table public.chamados      enable row level security;

drop policy if exists colab_sel on public.colaboradores;
drop policy if exists colab_ins on public.colaboradores;
drop policy if exists colab_upd on public.colaboradores;
create policy colab_sel on public.colaboradores for select to authenticated using (public.e_gestor());
create policy colab_ins on public.colaboradores for insert to authenticated with check (public.e_gestor() and perfil = 'colaborador' and user_id is null);
create policy colab_upd on public.colaboradores for update to authenticated using (public.e_gestor())
  with check (public.e_gestor());

drop policy if exists col_sel on public.coletores;
drop policy if exists col_ins on public.coletores;
drop policy if exists col_upd on public.coletores;
drop policy if exists col_del on public.coletores;
create policy col_sel on public.coletores for select to authenticated using (public.e_gestor());
create policy col_ins on public.coletores for insert to authenticated with check (public.e_gestor());
create policy col_upd on public.coletores for update to authenticated using (public.e_gestor()) with check (public.e_gestor());
create policy col_del on public.coletores for delete to authenticated using (public.e_gestor());

drop policy if exists mov_sel on public.movimentos;
create policy mov_sel on public.movimentos for select to authenticated using (public.e_gestor());
-- (inserção de movimentos só pela função registrar_bipagem)

drop policy if exists ch_sel on public.chamados;
drop policy if exists ch_ins on public.chamados;
drop policy if exists ch_upd on public.chamados;
create policy ch_sel on public.chamados for select to authenticated using (public.e_gestor());
create policy ch_ins on public.chamados for insert to authenticated with check (public.e_gestor());
create policy ch_upd on public.chamados for update to authenticated using (public.e_gestor()) with check (public.e_gestor());

-- Impede que o perfil/vínculo de login seja alterado pelo app
create or replace function public.proteger_perfil()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    new.perfil  := old.perfil;
    new.user_id := old.user_id;
  end if;
  return new;
end; $$;
drop trigger if exists trg_proteger_perfil on public.colaboradores;
create trigger trg_proteger_perfil before update on public.colaboradores
  for each row execute function public.proteger_perfil();

revoke all on public.colaboradores, public.coletores, public.movimentos, public.chamados from anon;
grant select, insert, update on public.colaboradores to authenticated;
grant select, insert, update, delete on public.coletores to authenticated;
grant select on public.movimentos to authenticated;
grant select, insert, update on public.chamados to authenticated;
grant usage on sequence public.chamados_id_seq to authenticated;
revoke execute on function public.registrar_bipagem(text,text,text,boolean,text,text) from public, anon;
grant  execute on function public.registrar_bipagem(text,text,text,boolean,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. TEMPO REAL (notificações instantâneas para o supervisor)
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.movimentos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.coletores;  exception when others then null; end;
end $$;
