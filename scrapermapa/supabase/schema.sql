-- =====================================================================
--  PROSPECTA — estrutura no Supabase (Postgres)
--  Rode no SQL Editor do Supabase. Pode ser executado mais de uma vez.
--  Todas as tabelas usam o prefixo prospecta_ para conviver com outros
--  sistemas no mesmo projeto. Cada usuário enxerga apenas os próprios dados (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. BUSCAS (fila de prospecção)
--    fonte: nuvem (robô em servidor) | desktop (robô .exe no PC)
--           places (Google Places API) | extensao (extensão do Chrome)
-- ---------------------------------------------------------------------
create table if not exists public.prospecta_buscas (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  termo          text not null check (length(termo) between 2 and 120),
  local          text,
  modo           text not null default 'local' check (modo in ('local','area')),
  fonte          text not null default 'nuvem' check (fonte in ('nuvem','desktop','places','extensao')),
  latitude       double precision,
  longitude      double precision,
  zoom           double precision,
  bounds         jsonb,                    -- {norte,sul,leste,oeste}
  grade          int  not null default 1 check (grade between 1 and 4),
  max_resultados int  not null default 60 check (max_resultados between 1 and 500),
  opcoes         jsonb not null default '{}'::jsonb,   -- enriquecer, filtro_estrito, concorrencia
  status         text not null default 'pendente'
                 check (status in ('pendente','executando','concluida','cancelada','erro')),
  fase           text,
  encontrados    int not null default 0,
  processados    int not null default 0,
  salvos         int not null default 0,
  novos          int not null default 0,
  descartados    int not null default 0,
  logs           jsonb not null default '[]'::jsonb,
  erro           text,
  cancelar       boolean not null default false,
  robo           text,
  criado_em      timestamptz not null default now(),
  iniciado_em    timestamptz,
  finalizado_em  timestamptz
);
create index if not exists prospecta_buscas_owner_idx on public.prospecta_buscas(owner, criado_em desc);
create index if not exists prospecta_buscas_fila_idx on public.prospecta_buscas(fonte, status, criado_em);

-- ---------------------------------------------------------------------
-- 2. LEADS (empresas)
-- ---------------------------------------------------------------------
create table if not exists public.prospecta_leads (
  id              bigint generated always as identity primary key,
  owner           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_key       text not null,
  nome            text not null,
  categoria       text,
  telefone        text,
  telefone_e164   text,
  celular         boolean not null default false,
  site            text,
  email           text,
  instagram       text,
  facebook        text,
  linkedin        text,
  whatsapp_link   text,
  endereco        text,
  rua             text,
  numero          text,
  complemento     text,
  bairro          text,
  cidade          text,
  uf              text,
  cep             text,
  latitude        double precision,
  longitude       double precision,
  avaliacao       numeric(3,1),
  num_avaliacoes  int,
  horario         text,
  plus_code       text,
  situacao        text,
  faixa_preco     text,
  maps_url        text,
  -- Receita Federal (via CNPJ / BrasilAPI)
  cnpj               text,
  razao_social       text,
  nome_fantasia      text,
  porte              text,
  abertura           date,
  cnae               text,
  situacao_cadastral text,
  capital_social     numeric,
  socios             jsonb,
  -- Diagnóstico do site
  site_status       text,       -- online | offline | erro
  site_https        boolean,
  site_plataforma   text,       -- WordPress, Wix, Shopify...
  site_rastreamento text,       -- Google Analytics, Meta Pixel...
  enriquecido_em    timestamptz,
  -- CRM
  fonte           text,
  score           int not null default 0,
  status          text not null default 'novo'
                  check (status in ('novo','contatado','negociacao','cliente','descartado')),
  notas           text not null default '',
  tags            text not null default '',
  ultimo_contato  timestamptz,
  busca_id        uuid references public.prospecta_buscas(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (owner, place_key)
);
create index if not exists prospecta_leads_owner_idx on public.prospecta_leads(owner, criado_em desc);
create index if not exists prospecta_leads_status_idx on public.prospecta_leads(owner, status);
create index if not exists prospecta_leads_bairro_idx on public.prospecta_leads(owner, bairro);
create index if not exists prospecta_leads_cidade_idx on public.prospecta_leads(owner, cidade);

create table if not exists public.prospecta_lead_buscas (
  lead_id  bigint not null references public.prospecta_leads(id) on delete cascade,
  busca_id uuid   not null references public.prospecta_buscas(id) on delete cascade,
  owner    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (lead_id, busca_id)
);
create index if not exists prospecta_lead_buscas_busca_idx on public.prospecta_lead_buscas(busca_id);

create table if not exists public.prospecta_atividades (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lead_id    bigint not null references public.prospecta_leads(id) on delete cascade,
  tipo       text not null default 'nota',
  descricao  text not null,
  criado_em  timestamptz not null default now()
);
create index if not exists prospecta_atividades_lead_idx on public.prospecta_atividades(lead_id, criado_em desc);

-- Sinal de vida dos robôs (nuvem / desktop) — o painel mostra online/offline
create table if not exists public.prospecta_robos (
  id           text primary key,
  owner        uuid references auth.users(id) on delete cascade,   -- null = robô da nuvem (compartilhado)
  tipo         text not null check (tipo in ('nuvem','desktop')),
  host         text,
  versao       text,
  ultimo_sinal timestamptz not null default now(),
  info         jsonb not null default '{}'::jsonb
);

create table if not exists public.prospecta_config (
  owner        uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  mensagem     text,
  preferencias jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. SCORE (0-100) calculado no banco para todas as fontes
-- ---------------------------------------------------------------------
create or replace function public.prospecta_calc_score(l public.prospecta_leads)
returns int language sql immutable set search_path = public as $$
  select least(100, greatest(0,
      (case when coalesce(l.telefone,'') <> '' then 30 else 0 end)
    + (case when l.celular then 15 else 0 end)
    + (case when coalesce(l.email,'') <> '' then 15 else 0 end)
    + (case when coalesce(l.site,'') <> '' then 10 else 0 end)
    + (case when coalesce(l.instagram,'') <> '' or coalesce(l.facebook,'') <> '' or coalesce(l.linkedin,'') <> '' then 10 else 0 end)
    + (case when coalesce(l.avaliacao,0) >= 4 then 10 else 0 end)
    + (case when coalesce(l.num_avaliacoes,0) >= 20 then 5 else 0 end)
    + (case when l.situacao_cadastral ilike 'ativa' then 5 else 0 end)
    - (case when l.situacao ilike '%fechado%' or l.situacao_cadastral in ('BAIXADA','INAPTA','SUSPENSA') then 70 else 0 end)
  ))::int
$$;

create or replace function public.prospecta_leads_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.score := public.prospecta_calc_score(new);
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;
  return new;
end $$;

drop trigger if exists prospecta_leads_antes on public.prospecta_leads;
create trigger prospecta_leads_antes before insert or update on public.prospecta_leads
for each row execute function public.prospecta_leads_antes();

-- Histórico automático de mudança de status
create or replace function public.prospecta_leads_status_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare rot jsonb := '{"novo":"Novo","contatado":"Contatado","negociacao":"Em negociação","cliente":"Cliente","descartado":"Descartado"}';
begin
  if new.status is distinct from old.status then
    insert into prospecta_atividades(owner, lead_id, tipo, descricao)
    values (new.owner, new.id, 'status',
            'Status alterado: ' || coalesce(rot->>old.status, old.status) || ' → ' || coalesce(rot->>new.status, new.status));
  end if;
  return new;
end $$;

drop trigger if exists prospecta_leads_status_log on public.prospecta_leads;
create trigger prospecta_leads_status_log after update of status on public.prospecta_leads
for each row execute function public.prospecta_leads_status_log();

-- Contato registrado atualiza "último contato"
create or replace function public.prospecta_atividade_contato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo in ('whatsapp','ligacao','email','contato') then
    update prospecta_leads set ultimo_contato = new.criado_em where id = new.lead_id and owner = new.owner;
  end if;
  return new;
end $$;

drop trigger if exists prospecta_atividade_contato on public.prospecta_atividades;
create trigger prospecta_atividade_contato after insert on public.prospecta_atividades
for each row execute function public.prospecta_atividade_contato();

-- ---------------------------------------------------------------------
-- 4. RLS — cada usuário só vê/edita o que é dele
-- ---------------------------------------------------------------------
alter table public.prospecta_buscas      enable row level security;
alter table public.prospecta_leads       enable row level security;
alter table public.prospecta_lead_buscas enable row level security;
alter table public.prospecta_atividades  enable row level security;
alter table public.prospecta_robos       enable row level security;
alter table public.prospecta_config      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prospecta_buscas','prospecta_leads','prospecta_lead_buscas','prospecta_atividades','prospecta_config'] loop
    execute format('drop policy if exists dono_tudo on public.%I', t);
    execute format('create policy dono_tudo on public.%I for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists robos_ver on public.prospecta_robos;
create policy robos_ver on public.prospecta_robos for select to authenticated
  using (owner is null or owner = (select auth.uid()));

grant select, insert, update, delete on public.prospecta_buscas, public.prospecta_leads,
  public.prospecta_lead_buscas, public.prospecta_atividades, public.prospecta_config to authenticated;
grant select on public.prospecta_robos to authenticated;

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES (RPC) usadas pelos robôs, extensão e Edge Functions
-- ---------------------------------------------------------------------

-- Pega a próxima busca pendente da fila (sem duas máquinas pegarem a mesma)
create or replace function public.prospecta_pegar_busca(p_fonte text, p_robo text)
returns setof public.prospecta_buscas
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_fonte not in ('nuvem','desktop') then raise exception 'fonte inválida'; end if;
  if auth.role() <> 'service_role' and auth.uid() is null then raise exception 'não autenticado'; end if;

  select id into v_id from prospecta_buscas
   where status = 'pendente' and fonte = p_fonte
     and (auth.role() = 'service_role' or owner = auth.uid())
   order by criado_em
   for update skip locked
   limit 1;

  if v_id is null then return; end if;

  return query
    update prospecta_buscas
       set status = 'executando', fase = 'iniciando', iniciado_em = now(), robo = p_robo
     where id = v_id
    returning *;
end $$;

-- Grava (upsert) um lote de leads de uma busca. Preserva dados do CRM e
-- não apaga informação existente com campo vazio.
create or replace function public.prospecta_salvar_leads(p_busca uuid, p_leads jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid; v_fonte text;
  e jsonb; r prospecta_leads;
  v_id bigint; v_novo boolean;
  n_salvos int := 0; n_novos int := 0;
  ids jsonb := '[]'::jsonb;
begin
  select owner, fonte into v_owner, v_fonte from prospecta_buscas where id = p_busca;
  if v_owner is null then raise exception 'busca não encontrada'; end if;
  if auth.role() <> 'service_role' and v_owner is distinct from auth.uid() then
    raise exception 'sem permissão para esta busca';
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_leads, '[]'::jsonb)) loop
    -- booleans podem chegar como 0/1
    if jsonb_typeof(e->'celular') = 'number' then e := jsonb_set(e, '{celular}', to_jsonb((e->>'celular')::int = 1)); end if;
    r := jsonb_populate_record(null::prospecta_leads, e);
    if coalesce(r.place_key,'') = '' or coalesce(r.nome,'') = '' then continue; end if;

    insert into prospecta_leads as t (
      owner, place_key, nome, categoria, telefone, telefone_e164, celular, site, email, instagram, facebook,
      linkedin, whatsapp_link, endereco, rua, numero, complemento, bairro, cidade, uf, cep, latitude, longitude,
      avaliacao, num_avaliacoes, horario, plus_code, situacao, faixa_preco, maps_url,
      site_status, site_https, site_plataforma, site_rastreamento, fonte, busca_id)
    values (
      v_owner, r.place_key, r.nome, r.categoria, r.telefone, r.telefone_e164, coalesce(r.celular,false), r.site, r.email,
      r.instagram, r.facebook, r.linkedin, r.whatsapp_link, r.endereco, r.rua, r.numero, r.complemento, r.bairro,
      r.cidade, r.uf, r.cep, r.latitude, r.longitude, r.avaliacao, r.num_avaliacoes, r.horario, r.plus_code,
      r.situacao, r.faixa_preco, r.maps_url, r.site_status, r.site_https, r.site_plataforma, r.site_rastreamento,
      v_fonte, p_busca)
    on conflict (owner, place_key) do update set
      nome           = coalesce(nullif(excluded.nome,''), t.nome),
      categoria      = coalesce(nullif(excluded.categoria,''), t.categoria),
      telefone       = coalesce(nullif(excluded.telefone,''), t.telefone),
      telefone_e164  = coalesce(nullif(excluded.telefone_e164,''), t.telefone_e164),
      celular        = t.celular or excluded.celular,
      site           = coalesce(nullif(excluded.site,''), t.site),
      email          = coalesce(nullif(excluded.email,''), t.email),
      instagram      = coalesce(nullif(excluded.instagram,''), t.instagram),
      facebook       = coalesce(nullif(excluded.facebook,''), t.facebook),
      linkedin       = coalesce(nullif(excluded.linkedin,''), t.linkedin),
      whatsapp_link  = coalesce(nullif(excluded.whatsapp_link,''), t.whatsapp_link),
      endereco       = coalesce(nullif(excluded.endereco,''), t.endereco),
      rua            = coalesce(nullif(excluded.rua,''), t.rua),
      numero         = coalesce(nullif(excluded.numero,''), t.numero),
      complemento    = coalesce(nullif(excluded.complemento,''), t.complemento),
      bairro         = coalesce(nullif(excluded.bairro,''), t.bairro),
      cidade         = coalesce(nullif(excluded.cidade,''), t.cidade),
      uf             = coalesce(nullif(excluded.uf,''), t.uf),
      cep            = coalesce(nullif(excluded.cep,''), t.cep),
      latitude       = coalesce(excluded.latitude, t.latitude),
      longitude      = coalesce(excluded.longitude, t.longitude),
      avaliacao      = coalesce(excluded.avaliacao, t.avaliacao),
      num_avaliacoes = coalesce(excluded.num_avaliacoes, t.num_avaliacoes),
      horario        = coalesce(nullif(excluded.horario,''), t.horario),
      plus_code      = coalesce(nullif(excluded.plus_code,''), t.plus_code),
      situacao       = coalesce(nullif(excluded.situacao,''), t.situacao),
      faixa_preco    = coalesce(nullif(excluded.faixa_preco,''), t.faixa_preco),
      maps_url       = coalesce(nullif(excluded.maps_url,''), t.maps_url)
    returning t.id, (xmax = 0) into v_id, v_novo;

    insert into prospecta_lead_buscas(lead_id, busca_id, owner) values (v_id, p_busca, v_owner)
    on conflict do nothing;

    if v_novo then
      insert into prospecta_atividades(owner, lead_id, tipo, descricao)
      values (v_owner, v_id, 'sistema', 'Lead capturado (' || v_fonte || ')');
      n_novos := n_novos + 1;
    end if;
    n_salvos := n_salvos + 1;
    ids := ids || jsonb_build_object('id', v_id, 'novo', v_novo, 'place_key', r.place_key);
  end loop;

  update prospecta_buscas set salvos = salvos + n_salvos, novos = novos + n_novos where id = p_busca;
  return jsonb_build_object('salvos', n_salvos, 'novos', n_novos, 'ids', ids);
end $$;

-- Atualiza progresso/estado de uma busca e acrescenta linhas de log
create or replace function public.prospecta_progresso(
  p_busca uuid, p_campos jsonb default '{}'::jsonb, p_logs jsonb default '[]'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_cancelar boolean;
begin
  select owner into v_owner from prospecta_buscas where id = p_busca;
  if v_owner is null then raise exception 'busca não encontrada'; end if;
  if auth.role() <> 'service_role' and v_owner is distinct from auth.uid() then raise exception 'sem permissão'; end if;

  update prospecta_buscas set
    status        = coalesce(p_campos->>'status', status),
    fase          = coalesce(p_campos->>'fase', fase),
    encontrados   = coalesce((p_campos->>'encontrados')::int, encontrados),
    processados   = coalesce((p_campos->>'processados')::int, processados),
    descartados   = coalesce((p_campos->>'descartados')::int, descartados),
    erro          = coalesce(p_campos->>'erro', erro),
    finalizado_em = case when p_campos->>'status' in ('concluida','cancelada','erro') then now() else finalizado_em end,
    logs          = (select coalesce(jsonb_agg(x order by n), '[]'::jsonb) from (
                       select x, n from jsonb_array_elements(logs || coalesce(p_logs,'[]'::jsonb)) with ordinality a(x, n)
                       order by n desc limit 200) s)
  where id = p_busca
  returning cancelar into v_cancelar;

  return jsonb_build_object('cancelar', v_cancelar);
end $$;

-- Sinal de vida do robô
create or replace function public.prospecta_sinal_robo(p_id text, p_tipo text, p_host text, p_versao text, p_info jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_tipo = 'nuvem' and auth.role() <> 'service_role' then raise exception 'apenas o robô da nuvem'; end if;
  if p_tipo = 'desktop' and auth.uid() is null then raise exception 'não autenticado'; end if;
  insert into prospecta_robos(id, owner, tipo, host, versao, ultimo_sinal, info)
  values (p_id, case when p_tipo = 'nuvem' then null else auth.uid() end, p_tipo, p_host, p_versao, now(), coalesce(p_info,'{}'))
  on conflict (id) do update set ultimo_sinal = now(), host = excluded.host, versao = excluded.versao, info = excluded.info,
    owner = excluded.owner;
end $$;

-- Exclui uma busca (e opcionalmente os leads que só existem nela)
create or replace function public.prospecta_excluir_busca(p_busca uuid, p_apagar_leads boolean default false)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_apagar_leads then
    delete from prospecta_leads l
     where l.id in (select lead_id from prospecta_lead_buscas where busca_id = p_busca)
       and not exists (select 1 from prospecta_lead_buscas o where o.lead_id = l.id and o.busca_id <> p_busca);
  end if;
  delete from prospecta_buscas where id = p_busca;
end $$;

-- Indicadores do painel (respeita RLS: só os dados do usuário)
create or replace function public.prospecta_estatisticas()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',        (select count(*) from prospecta_leads),
    'com_telefone', (select count(*) from prospecta_leads where coalesce(telefone,'') <> ''),
    'celular',      (select count(*) from prospecta_leads where celular),
    'com_email',    (select count(*) from prospecta_leads where coalesce(email,'') <> ''),
    'sem_site',     (select count(*) from prospecta_leads where coalesce(site,'') = ''),
    'com_cnpj',     (select count(*) from prospecta_leads where coalesce(cnpj,'') <> ''),
    'buscas',       (select count(*) from prospecta_buscas),
    'por_status',   (select jsonb_object_agg(s, (select count(*) from prospecta_leads where status = s))
                       from unnest(array['novo','contatado','negociacao','cliente','descartado']) s),
    'por_dia',      (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'n', n) order by dia), '[]'::jsonb) from (
                       select to_char((criado_em at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') dia, count(*) n
                         from prospecta_leads where criado_em >= now() - interval '14 days' group by 1) d),
    'top_bairros',  (select coalesce(jsonb_agg(jsonb_build_object('nome', bairro, 'n', n)), '[]'::jsonb) from (
                       select bairro, count(*) n from prospecta_leads where coalesce(bairro,'') <> ''
                        group by bairro order by n desc limit 8) b),
    'top_categorias', (select coalesce(jsonb_agg(jsonb_build_object('nome', categoria, 'n', n)), '[]'::jsonb) from (
                       select categoria, count(*) n from prospecta_leads where coalesce(categoria,'') <> ''
                        group by categoria order by n desc limit 8) c),
    'por_fonte',    (select coalesce(jsonb_object_agg(coalesce(fonte,'?'), n), '{}'::jsonb) from (
                       select fonte, count(*) n from prospecta_leads group by fonte) f)
  )
$$;

-- Valores distintos para os filtros da lista
create or replace function public.prospecta_opcoes_filtro()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'bairros',    (select coalesce(jsonb_agg(bairro), '[]') from (select bairro from prospecta_leads where coalesce(bairro,'') <> '' group by bairro order by count(*) desc, bairro limit 300) x),
    'cidades',    (select coalesce(jsonb_agg(cidade), '[]') from (select cidade from prospecta_leads where coalesce(cidade,'') <> '' group by cidade order by count(*) desc, cidade limit 300) x),
    'categorias', (select coalesce(jsonb_agg(categoria), '[]') from (select categoria from prospecta_leads where coalesce(categoria,'') <> '' group by categoria order by count(*) desc, categoria limit 300) x)
  )
$$;

revoke all on function public.prospecta_pegar_busca(text, text) from public, anon;
revoke all on function public.prospecta_salvar_leads(uuid, jsonb) from public, anon;
revoke all on function public.prospecta_progresso(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.prospecta_sinal_robo(text, text, text, text, jsonb) from public, anon;
revoke all on function public.prospecta_excluir_busca(uuid, boolean) from public, anon;
revoke all on function public.prospecta_estatisticas() from public, anon;
revoke all on function public.prospecta_opcoes_filtro() from public, anon;
grant execute on function public.prospecta_pegar_busca(text, text) to authenticated, service_role;
grant execute on function public.prospecta_salvar_leads(uuid, jsonb) to authenticated, service_role;
grant execute on function public.prospecta_progresso(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.prospecta_sinal_robo(text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.prospecta_excluir_busca(uuid, boolean) to authenticated;
grant execute on function public.prospecta_estatisticas() to authenticated;
grant execute on function public.prospecta_opcoes_filtro() to authenticated;
