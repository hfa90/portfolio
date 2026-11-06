-- =====================================================================
--  INVENTÁRIO QUALLIT — 02: Link de instalação para o colaborador
--  Rode DEPOIS do 01_schema.sql (SQL Editor > New query > Run).
--  Pode rodar mais de uma vez.
-- =====================================================================

-- token usado nos links enviados aos colaboradores (texto visível só para usuários logados)
alter table public.agente_tokens add column if not exists token_link text;

-- cada download do instalador gera um código; quando o agente reporta, ligamos código -> máquina
create table if not exists public.instalacoes (
  codigo        text primary key,
  maquina_id    uuid references public.maquinas(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.instalacoes enable row level security;   -- sem policies: só funções SECURITY DEFINER acessam
revoke all on public.instalacoes from anon, authenticated;

-- ---------------------------------------------------------------------
-- agente_reportar: agora aceita setor/localização/responsável iniciais
-- (só preenche se estiver vazio) e o código da instalação
-- ---------------------------------------------------------------------
create or replace function public.agente_reportar(p_token text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tok    uuid;
  v_id     uuid;
  v_host   text := upper(nullif(trim(p_dados->>'hostname'), ''));
  v_serie  text := public._serial_valido(p_dados->>'numero_serie');
  v_ativo  text := public._serial_valido(p_dados->>'ativo');
  v_codigo text := nullif(trim(p_dados->>'codigo_instalacao'), '');
  v_novo   boolean := false;
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

  if v_ativo is not null and exists (
       select 1 from maquinas where upper(ativo) = upper(v_ativo) and id is distinct from v_id) then
    v_ativo := null;
  end if;

  if v_id is null then
    insert into maquinas (hostname, origem, tipo, numero_serie, ativo)
    values (v_host, 'agente', coalesce(nullif(p_dados->>'tipo',''), 'desktop'), v_serie, v_ativo)
    returning id into v_id;
    v_novo := true;
  end if;

  update maquinas set
    hostname               = v_host,
    origem                 = 'agente',
    numero_serie           = coalesce(v_serie, numero_serie),
    ativo                  = case when coalesce(ativo,'') = '' then v_ativo else ativo end,
    setor                  = coalesce(nullif(setor,''), nullif(trim(p_dados->>'setor'),'')),
    localizacao            = coalesce(nullif(localizacao,''), nullif(trim(p_dados->>'localizacao'),'')),
    responsavel            = coalesce(nullif(responsavel,''), nullif(trim(p_dados->>'responsavel'),'')),
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

  if v_codigo is not null and length(v_codigo) between 16 and 64 then
    insert into instalacoes (codigo, maquina_id) values (v_codigo, v_id)
    on conflict (codigo) do update set maquina_id = excluded.maquina_id, atualizado_em = now();
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'novo', v_novo);
end $$;

revoke all on function public.agente_reportar(text, jsonb) from public;
grant execute on function public.agente_reportar(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Página pública consulta se a máquina daquele download já reportou.
-- Só responde para códigos com menos de 7 dias e devolve dados básicos.
-- ---------------------------------------------------------------------
create or replace function public.verificar_instalacao(p_codigo text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'hostname', m.hostname, 'tipo', m.tipo, 'ativo', m.ativo,
           'fabricante', m.fabricante, 'modelo', m.modelo, 'cpu', m.cpu,
           'memoria_gb', m.memoria_gb, 'armazenamento_total_gb', m.armazenamento_total_gb,
           'armazenamento_livre_gb', m.armazenamento_livre_gb,
           'discos', (select coalesce(jsonb_agg(jsonb_build_object('tipo', d->>'tipo', 'tamanho_gb', d->'tamanho_gb')), '[]'::jsonb)
                        from jsonb_array_elements(m.discos) d),
           'so_nome', m.so_nome, 'so_display_version', m.so_display_version, 'so_build', m.so_build,
           'setor', m.setor, 'ultimo_online', m.ultimo_online)
    from instalacoes i join maquinas m on m.id = i.maquina_id
   where i.codigo = p_codigo
     and length(coalesce(p_codigo,'')) >= 16
     and i.criado_em > now() - interval '7 days';
$$;
revoke all on function public.verificar_instalacao(text) from public;
grant execute on function public.verificar_instalacao(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Painel: obtém (ou cria/rotaciona) o token usado nos links de instalação
-- ---------------------------------------------------------------------
create or replace function public.obter_token_link(p_novo boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  if coalesce(current_setting('request.jwt.claims', true), '') = ''
     or (current_setting('request.jwt.claims', true)::jsonb ->> 'role') <> 'authenticated' then
    raise exception 'apenas usuarios autenticados';
  end if;
  if p_novo then
    update agente_tokens set ativo = false where token_link is not null and ativo;
  else
    select token_link into v_token from agente_tokens
     where ativo and token_link is not null order by criado_em desc limit 1;
    if v_token is not null then return v_token; end if;
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into agente_tokens (descricao, token_hash, token_link)
  values ('Links de instalação', encode(digest(v_token, 'sha256'), 'hex'), v_token);
  return v_token;
end $$;
revoke all on function public.obter_token_link(boolean) from public, anon;
grant execute on function public.obter_token_link(boolean) to authenticated;

-- coluna com o texto do token não precisa ser lida diretamente pelo painel
revoke select on public.agente_tokens from authenticated;
grant select (id, descricao, ativo, criado_em, ultimo_uso) on public.agente_tokens to authenticated;
