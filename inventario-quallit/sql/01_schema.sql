-- =====================================================================
--  INVENTÁRIO QUALLIT — Schema Supabase
--  Rode este arquivo inteiro no Supabase: Dashboard > SQL Editor > New query
--  Pode rodar mais de uma vez (é idempotente nas partes principais).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- MÁQUINAS
-- ---------------------------------------------------------------------
create table if not exists public.maquinas (
  id                      uuid primary key default gen_random_uuid(),
  hostname                text not null,
  ativo                   text,                         -- nº de patrimônio / etiqueta
  tipo                    text not null default 'desktop'
                          check (tipo in ('desktop','notebook','servidor','outro')),
  status                  text not null default 'em_uso'
                          check (status in ('em_uso','estoque','manutencao','emprestado','descartado','extraviado')),
  fabricante              text,
  modelo                  text,
  numero_serie            text,
  cpu                     text,
  cpu_nucleos             int,
  memoria_gb              numeric(6,1),
  memoria_slots_total     int,
  memoria_modulos         jsonb not null default '[]'::jsonb,
  armazenamento_total_gb  numeric(10,1),
  armazenamento_livre_gb  numeric(10,1),
  discos                  jsonb not null default '[]'::jsonb,
  volumes                 jsonb not null default '[]'::jsonb,
  so_nome                 text,
  so_versao               text,
  so_build                text,
  so_display_version      text,                         -- 22H2, 23H2, 24H2...
  so_arquitetura          text,
  so_instalado_em         timestamptz,
  ultimo_boot             timestamptz,
  ip                      text,
  mac                     text,
  dominio                 text,
  usuario_logado          text,
  setor                   text,
  localizacao             text,
  responsavel             text,
  observacoes             text,
  agente_versao           text,
  origem                  text not null default 'manual' check (origem in ('manual','agente')),
  ultimo_online           timestamptz,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now()
);

create unique index if not exists maquinas_ativo_uk
  on public.maquinas (upper(ativo)) where ativo is not null and ativo <> '';
create unique index if not exists maquinas_serie_uk
  on public.maquinas (upper(numero_serie)) where numero_serie is not null and numero_serie <> '';
create index if not exists maquinas_hostname_idx on public.maquinas (upper(hostname));
create index if not exists maquinas_online_idx   on public.maquinas (ultimo_online desc);

-- ---------------------------------------------------------------------
-- HISTÓRICO DE ALTERAÇÕES (troca de memória, disco, SO, status, setor...)
-- ---------------------------------------------------------------------
create table if not exists public.maquinas_historico (
  id             bigint generated always as identity primary key,
  maquina_id     uuid not null references public.maquinas(id) on delete cascade,
  campo          text not null,
  valor_anterior text,
  valor_novo     text,
  origem         text,
  criado_em      timestamptz not null default now()
);
create index if not exists hist_maquina_idx on public.maquinas_historico (maquina_id, criado_em desc);
create index if not exists hist_data_idx    on public.maquinas_historico (criado_em desc);

-- quem fez a alteração: 'agente' (via RPC) ou o e-mail do usuário logado
create or replace function public._origem_atual()
returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('app.origem', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    'sistema'
  );
$$;

create or replace function public._maquinas_before_update()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

create or replace function public._maquinas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['hostname','ativo','tipo','status','numero_serie','fabricante','modelo',
                         'cpu','memoria_gb','armazenamento_total_gb','so_nome','so_display_version',
                         'so_build','setor','localizacao','responsavel'];
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
    -- ignora o 1º preenchimento automático (null -> valor) feito pelo agente
    if v_old is distinct from v_new
       and not (v_old is null and _origem_atual() = 'agente') then
      insert into maquinas_historico (maquina_id, campo, valor_anterior, valor_novo, origem)
      values (new.id, f, v_old, v_new, _origem_atual());
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists trg_maquinas_bu on public.maquinas;
create trigger trg_maquinas_bu before update on public.maquinas
  for each row execute function public._maquinas_before_update();

drop trigger if exists trg_maquinas_audit on public.maquinas;
create trigger trg_maquinas_audit after insert or update on public.maquinas
  for each row execute function public._maquinas_auditoria();

-- ---------------------------------------------------------------------
-- CONFERÊNCIAS (inventário físico com leitor de código de barras)
-- ---------------------------------------------------------------------
create table if not exists public.conferencias (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  setor          text,                        -- se preenchido, só espera máquinas desse setor
  status         text not null default 'aberta' check (status in ('aberta','finalizada')),
  criado_por     text default public._origem_atual(),
  criado_em      timestamptz not null default now(),
  finalizado_em  timestamptz
);

create table if not exists public.conferencia_itens (
  id              bigint generated always as identity primary key,
  conferencia_id  uuid not null references public.conferencias(id) on delete cascade,
  maquina_id      uuid references public.maquinas(id) on delete set null,
  codigo_lido     text not null,
  localizacao     text,
  lido_por        text default public._origem_atual(),
  lido_em         timestamptz not null default now()
);
create unique index if not exists conf_itens_codigo_uk
  on public.conferencia_itens (conferencia_id, upper(codigo_lido));
create unique index if not exists conf_itens_maquina_uk
  on public.conferencia_itens (conferencia_id, maquina_id) where maquina_id is not null;

-- ---------------------------------------------------------------------
-- TOKENS DO AGENTE COLETOR
-- ---------------------------------------------------------------------
create table if not exists public.agente_tokens (
  id          uuid primary key default gen_random_uuid(),
  descricao   text not null,
  token_hash  text not null unique,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  ultimo_uso  timestamptz
);

-- token inicial (o valor em texto está em agente/config.json — NÃO vai para o GitHub)
insert into public.agente_tokens (descricao, token_hash)
values ('Token inicial', '70decb5addfaa2fdc0d2684fb7aec20dad1686e2da80c86a6f9c446f31f7fe9f')
on conflict (token_hash) do nothing;

-- ---------------------------------------------------------------------
-- VIEW com situação e alertas calculados
-- ---------------------------------------------------------------------
create or replace view public.vw_maquinas with (security_invoker = true) as
select
  m.*,
  case
    when m.ultimo_online is null                         then 'nunca'
    when m.ultimo_online > now() - interval '2 hours'    then 'online'
    when m.ultimo_online > now() - interval '7 days'     then 'recente'
    when m.ultimo_online > now() - interval '30 days'    then 'ausente'
    else 'offline'
  end as situacao,
  floor(extract(epoch from (now() - m.ultimo_online)) / 86400)::int as dias_sem_contato,
  case when m.armazenamento_total_gb > 0
       then round(100 * m.armazenamento_livre_gb / m.armazenamento_total_gb, 1) end as livre_pct,
  array_remove(array[
    case when m.memoria_gb is not null and m.memoria_gb < 8                         then 'ram_baixa' end,
    case when m.armazenamento_livre_gb is not null and
              (m.armazenamento_livre_gb < 15 or
               m.armazenamento_livre_gb < m.armazenamento_total_gb * 0.10)          then 'disco_cheio' end,
    case when m.discos @> '[{"tipo":"HDD"}]'::jsonb                                 then 'hdd' end,
    case when m.so_nome ilike '%windows 10%' or m.so_nome ilike '%windows 7%'
              or m.so_nome ilike '%windows 8%'                                      then 'so_sem_suporte' end,
    case when m.status not in ('descartado','extraviado') and
              m.ultimo_online < now() - interval '30 days'                          then 'sem_contato' end,
    case when m.status in ('estoque','descartado','extraviado') and
              m.ultimo_online > now() - interval '3 days'                           then 'estoque_online' end,
    case when coalesce(m.ativo,'') = '' and m.status <> 'descartado'                then 'sem_ativo' end,
    case when exists (select 1 from public.maquinas d
                      where d.id <> m.id and upper(d.hostname) = upper(m.hostname)
                        and d.status not in ('descartado'))                         then 'hostname_duplicado' end
  ], null) as alertas
from public.maquinas m;

-- ---------------------------------------------------------------------
-- RPC: o agente coletor chama esta função (com a chave anon + token)
-- ---------------------------------------------------------------------
create or replace function public._serial_valido(v text)
returns text language sql immutable as $$
  select case
    when v is null or trim(v) = '' then null
    when lower(trim(v)) in ('to be filled by o.e.m.','default string','system serial number',
                            'none','n/a','na','not specified','not applicable','chassis serial number',
                            'asset tag','no asset tag','no asset information','asset-1234567890',
                            '123456789','1234567890','invalid','unknown','oem')
         then null
    when trim(v) ~ '^[0 .-]+$' then null
    else trim(v)
  end;
$$;

create or replace function public.agente_reportar(p_token text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tok   uuid;
  v_id    uuid;
  v_host  text := upper(nullif(trim(p_dados->>'hostname'), ''));
  v_serie text := public._serial_valido(p_dados->>'numero_serie');
  v_ativo text := public._serial_valido(p_dados->>'ativo');
  v_novo  boolean := false;
begin
  select id into v_tok from agente_tokens
   where ativo and token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex');
  if v_tok is null then
    raise exception 'token do agente invalido' using errcode = '28000';
  end if;
  if v_host is null then
    raise exception 'hostname obrigatorio';
  end if;

  perform set_config('app.origem', 'agente', true);
  update agente_tokens set ultimo_uso = now() where id = v_tok;

  -- 1) número de série (mais confiável)  2) patrimônio  3) hostname
  if v_serie is not null then
    select id into v_id from maquinas where upper(numero_serie) = upper(v_serie);
  end if;
  if v_id is null and v_ativo is not null then
    select id into v_id from maquinas where upper(ativo) = upper(v_ativo);
  end if;
  if v_id is null then
    select id into v_id from maquinas
     where upper(hostname) = v_host
       and (coalesce(numero_serie,'') = '' or v_serie is null)
     order by ultimo_online desc nulls last limit 1;
  end if;

  -- não sobrescreve patrimônio que já pertence a outra máquina
  if v_ativo is not null and exists (
       select 1 from maquinas where upper(ativo) = upper(v_ativo) and id is distinct from v_id) then
    v_ativo := null;
  end if;

  if v_id is null then
    insert into maquinas (hostname, origem, tipo, numero_serie, ativo)
    values (v_host, 'agente',
            coalesce(nullif(p_dados->>'tipo',''), 'desktop'),
            v_serie, v_ativo)
    returning id into v_id;
    v_novo := true;
  end if;

  update maquinas set
    hostname               = v_host,
    origem                 = 'agente',
    numero_serie           = coalesce(v_serie, numero_serie),
    ativo                  = case when coalesce(ativo,'') = '' then v_ativo else ativo end,
    fabricante             = coalesce(nullif(p_dados->>'fabricante',''), fabricante),
    modelo                 = coalesce(nullif(p_dados->>'modelo',''), modelo),
    cpu                    = coalesce(nullif(p_dados->>'cpu',''), cpu),
    cpu_nucleos            = coalesce((p_dados->>'cpu_nucleos')::int, cpu_nucleos),
    memoria_gb             = coalesce((p_dados->>'memoria_gb')::numeric, memoria_gb),
    memoria_slots_total    = coalesce((p_dados->>'memoria_slots_total')::int, memoria_slots_total),
    memoria_modulos        = coalesce(p_dados->'memoria_modulos', memoria_modulos),
    armazenamento_total_gb = coalesce((p_dados->>'armazenamento_total_gb')::numeric, armazenamento_total_gb),
    armazenamento_livre_gb = coalesce((p_dados->>'armazenamento_livre_gb')::numeric, armazenamento_livre_gb),
    discos                 = coalesce(p_dados->'discos', discos),
    volumes                = coalesce(p_dados->'volumes', volumes),
    so_nome                = coalesce(nullif(p_dados->>'so_nome',''), so_nome),
    so_versao              = coalesce(nullif(p_dados->>'so_versao',''), so_versao),
    so_build               = coalesce(nullif(p_dados->>'so_build',''), so_build),
    so_display_version     = coalesce(nullif(p_dados->>'so_display_version',''), so_display_version),
    so_arquitetura         = coalesce(nullif(p_dados->>'so_arquitetura',''), so_arquitetura),
    so_instalado_em        = coalesce((p_dados->>'so_instalado_em')::timestamptz, so_instalado_em),
    ultimo_boot            = coalesce((p_dados->>'ultimo_boot')::timestamptz, ultimo_boot),
    ip                     = coalesce(nullif(p_dados->>'ip',''), ip),
    mac                    = coalesce(nullif(p_dados->>'mac',''), mac),
    dominio                = coalesce(nullif(p_dados->>'dominio',''), dominio),
    usuario_logado         = coalesce(nullif(p_dados->>'usuario_logado',''), usuario_logado),
    agente_versao          = coalesce(nullif(p_dados->>'agente_versao',''), agente_versao),
    ultimo_online          = now()
  where id = v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'novo', v_novo);
end $$;

-- gera um novo token para o agente (só usuário logado). Retorna o texto UMA vez.
create or replace function public.gerar_token_agente(p_descricao text)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     or (current_setting('request.jwt.claims', true)::jsonb ->> 'role') <> 'authenticated' then
    raise exception 'apenas usuarios autenticados';
  end if;
  insert into agente_tokens (descricao, token_hash)
  values (coalesce(nullif(p_descricao,''), 'Token'), encode(digest(v_token, 'sha256'), 'hex'));
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- SEGURANÇA (RLS): painel exige login; agente só entra pela RPC
-- ---------------------------------------------------------------------
alter table public.maquinas           enable row level security;
alter table public.maquinas_historico enable row level security;
alter table public.conferencias       enable row level security;
alter table public.conferencia_itens  enable row level security;
alter table public.agente_tokens      enable row level security;

revoke all on public.maquinas, public.maquinas_historico, public.conferencias,
              public.conferencia_itens, public.agente_tokens, public.vw_maquinas from anon;

do $$
declare t text;
begin
  foreach t in array array['maquinas','conferencias','conferencia_itens'] loop
    execute format('drop policy if exists "auth_all" on public.%I', t);
    execute format('create policy "auth_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

drop policy if exists "auth_read" on public.maquinas_historico;
create policy "auth_read" on public.maquinas_historico for select to authenticated using (true);

drop policy if exists "auth_read" on public.agente_tokens;
create policy "auth_read" on public.agente_tokens for select to authenticated using (true);
drop policy if exists "auth_update" on public.agente_tokens;
create policy "auth_update" on public.agente_tokens for update to authenticated using (true) with check (true);

grant select, insert, update, delete on public.maquinas, public.conferencias, public.conferencia_itens to authenticated;
grant select on public.maquinas_historico, public.vw_maquinas to authenticated;
grant select, update (ativo, descricao) on public.agente_tokens to authenticated;

revoke all on function public.agente_reportar(text, jsonb) from public;
grant execute on function public.agente_reportar(text, jsonb) to anon, authenticated;
revoke all on function public.gerar_token_agente(text) from public, anon;
grant execute on function public.gerar_token_agente(text) to authenticated;

-- ---------------------------------------------------------------------
-- REALTIME: painel atualiza sozinho quando uma máquina reporta
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.maquinas;
  exception when duplicate_object then null; when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conferencia_itens;
  exception when duplicate_object then null; when undefined_object then null;
  end;
end $$;
