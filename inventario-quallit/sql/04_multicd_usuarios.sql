-- =====================================================================
--  INVENTÁRIO QUALLIT — 04: vários CDs + usuários por nível (Administrador / Field)
--  Rode DEPOIS do 01, 02 e 03 (SQL Editor > New query > Run). Pode rodar mais de uma vez.
--
--  • Administrador: vê e gerencia todos os CDs, usuários, inventários e relatórios.
--  • Field: vê e trabalha só no próprio CD; não exclui máquinas nem inventários
--    e não altera inventário já finalizado.
--  • Os usuários que já existem viram ADMINISTRADORES (só na primeira execução).
-- =====================================================================

-- ---------------------------------------------------------------------
-- CDs e perfis
-- ---------------------------------------------------------------------
create table if not exists public.cds (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nome       text not null,
  cidade     text,
  uf         text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
insert into public.cds (codigo, nome)
select 'CD01', 'CD Principal' where not exists (select 1 from public.cds);

create table if not exists public.perfis (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nome       text not null,
  email      text,
  papel      text not null default 'field' check (papel in ('admin','field')),
  cd_id      uuid references public.cds(id) on delete restrict,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now(),
  constraint perfis_field_tem_cd check (papel = 'admin' or cd_id is not null)
);

-- funções usadas nas regras de acesso
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfis where user_id = auth.uid() and ativo and papel = 'admin');
$$;
create or replace function public.meu_cd()
returns uuid language sql stable security definer set search_path = public as $$
  select cd_id from perfis where user_id = auth.uid() and ativo;
$$;
create or replace function public.cd_padrao()
returns uuid language sql stable security definer set search_path = public as $$
  select id from cds order by criado_em, codigo limit 1;
$$;

-- primeira execução: quem já tem login vira administrador
insert into public.perfis (user_id, nome, email, papel)
select u.id, coalesce(u.raw_user_meta_data ->> 'nome', split_part(u.email, '@', 1)), u.email, 'admin'
  from auth.users u
 where not exists (select 1 from public.perfis where papel = 'admin')
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- CD em máquinas, inventários, empréstimos e tokens do agente
-- ---------------------------------------------------------------------
alter table public.maquinas      add column if not exists cd_id uuid references public.cds(id);
alter table public.conferencias  add column if not exists cd_id uuid references public.cds(id);
alter table public.emprestimos   add column if not exists cd_id uuid references public.cds(id);
alter table public.agente_tokens add column if not exists cd_id uuid references public.cds(id) on delete cascade;

update public.maquinas      set cd_id = public.cd_padrao() where cd_id is null;
update public.conferencias  set cd_id = public.cd_padrao() where cd_id is null;
update public.emprestimos e set cd_id = coalesce((select m.cd_id from public.maquinas m where m.id = e.maquina_id), public.cd_padrao()) where cd_id is null;
update public.agente_tokens set cd_id = public.cd_padrao() where cd_id is null;

alter table public.maquinas     alter column cd_id set not null;
alter table public.conferencias alter column cd_id set not null;
alter table public.emprestimos  alter column cd_id set not null;

create index if not exists maquinas_cd_idx     on public.maquinas (cd_id);
create index if not exists conferencias_cd_idx on public.conferencias (cd_id, criado_em desc);
create index if not exists emprestimos_cd_idx  on public.emprestimos (cd_id);
create index if not exists perfis_cd_idx       on public.perfis (cd_id);

-- resultado congelado do inventário no momento em que é finalizado (para relatórios históricos)
alter table public.conferencias
  add column if not exists total_esperadas     int,
  add column if not exists total_encontradas   int,
  add column if not exists total_faltando      int,
  add column if not exists total_desconhecidas int,
  add column if not exists total_fora          int,
  add column if not exists faltantes           jsonb,
  add column if not exists finalizado_por      text;

-- preenche o CD automaticamente (Field: o seu CD; agente/admin sem CD: CD padrão)
create or replace function public._preencher_cd()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cd_id is null then
    new.cd_id := coalesce(meu_cd(), cd_padrao());
  end if;
  return new;
end $$;
drop trigger if exists trg_maquinas_cd on public.maquinas;
create trigger trg_maquinas_cd before insert on public.maquinas for each row execute function public._preencher_cd();
drop trigger if exists trg_conferencias_cd on public.conferencias;
create trigger trg_conferencias_cd before insert on public.conferencias for each row execute function public._preencher_cd();

-- empréstimo herda o CD da máquina
create or replace function public._emprestimo_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select status, cd_id into new.status_anterior, new.cd_id from maquinas where id = new.maquina_id;
  return new;
end $$;

-- histórico passa a registrar troca de CD
create or replace function public._maquinas_auditoria()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  campos text[] := array['hostname','ativo','tipo','status','numero_serie','fabricante','modelo',
                         'cpu','memoria_gb','armazenamento_total_gb','so_nome','so_display_version',
                         'so_build','setor','localizacao','responsavel',
                         'data_compra','fornecedor','nota_fiscal','garantia_fim','cd_id'];
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
-- Agente: máquina nova entra no CD do token usado na instalação
-- ---------------------------------------------------------------------
create or replace function public.agente_reportar(p_token text, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_tok    uuid;
  v_cd     uuid;
  v_id     uuid;
  v_host   text := upper(nullif(trim(p_dados->>'hostname'), ''));
  v_serie  text := public._serial_valido(p_dados->>'numero_serie');
  v_ativo  text := public._serial_valido(p_dados->>'ativo');
  v_codigo text := nullif(trim(p_dados->>'codigo_instalacao'), '');
  v_novo   boolean := false;
begin
  select id, cd_id into v_tok, v_cd from agente_tokens
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
       and cd_id = coalesce(v_cd, cd_id)
     order by ultimo_online desc nulls last limit 1;
  end if;

  if v_ativo is not null and exists (
       select 1 from maquinas where upper(ativo) = upper(v_ativo) and id is distinct from v_id) then
    v_ativo := null;
  end if;

  if v_id is null then
    insert into maquinas (hostname, origem, tipo, numero_serie, ativo, cd_id)
    values (v_host, 'agente', coalesce(nullif(p_dados->>'tipo',''), 'desktop'), v_serie, v_ativo,
            coalesce(v_cd, cd_padrao()))
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

-- token dos links de instalação: um por CD. Field gera para o próprio CD; admin escolhe o CD.
drop function if exists public.obter_token_link(boolean);
create or replace function public.obter_token_link(p_cd uuid default null, p_novo boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_cd uuid; v_token text; v_cod text;
begin
  if auth.uid() is null then raise exception 'apenas usuarios autenticados'; end if;
  v_cd := case when eh_admin() then coalesce(p_cd, cd_padrao()) else meu_cd() end;
  if v_cd is null then raise exception 'usuario sem CD definido'; end if;
  if p_novo then
    if not eh_admin() then raise exception 'apenas administradores podem invalidar links'; end if;
    update agente_tokens set ativo = false where token_link is not null and ativo and cd_id = v_cd;
  else
    select token_link into v_token from agente_tokens
     where ativo and token_link is not null and cd_id = v_cd order by criado_em desc limit 1;
    if v_token is not null then return v_token; end if;
  end if;
  select codigo into v_cod from cds where id = v_cd;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into agente_tokens (descricao, token_hash, token_link, cd_id)
  values ('Links de instalação · ' || coalesce(v_cod, '?'), encode(digest(v_token, 'sha256'), 'hex'), v_token, v_cd);
  return v_token;
end $$;
revoke all on function public.obter_token_link(uuid, boolean) from public, anon;
grant execute on function public.obter_token_link(uuid, boolean) to authenticated;

drop function if exists public.gerar_token_agente(text);
create or replace function public.gerar_token_agente(p_descricao text, p_cd uuid default null)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_token text := encode(gen_random_bytes(24), 'hex');
begin
  if not eh_admin() then raise exception 'apenas administradores'; end if;
  insert into agente_tokens (descricao, token_hash, cd_id)
  values (coalesce(nullif(p_descricao,''), 'Token'), encode(digest(v_token, 'sha256'), 'hex'), coalesce(p_cd, cd_padrao()));
  return v_token;
end $$;
revoke all on function public.gerar_token_agente(text, uuid) from public, anon;
grant execute on function public.gerar_token_agente(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- REGRAS DE ACESSO (RLS)
-- ---------------------------------------------------------------------
alter table public.cds    enable row level security;
alter table public.perfis enable row level security;
revoke all on public.cds, public.perfis from anon;
grant select, insert, update, delete on public.cds, public.perfis to authenticated;

do $$
declare r record;
begin
  -- remove as regras antigas ("todo usuário logado vê tudo")
  for r in select policyname, tablename from pg_policies
            where schemaname = 'public'
              and tablename in ('maquinas','maquinas_historico','conferencias','conferencia_itens',
                                'emprestimos','agente_tokens','cds','perfis')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- CDs: todos leem o próprio (admin lê todos); só admin altera
create policy cds_ler    on public.cds for select to authenticated using ((select eh_admin()) or id = (select meu_cd()));
create policy cds_admin  on public.cds for all    to authenticated using ((select eh_admin())) with check ((select eh_admin()));

-- perfis: cada um lê o seu; admin lê e altera todos
create policy perfis_ler   on public.perfis for select to authenticated using (user_id = auth.uid() or (select eh_admin()));
create policy perfis_admin on public.perfis for all    to authenticated using ((select eh_admin())) with check ((select eh_admin()));

-- máquinas
create policy maq_ler     on public.maquinas for select to authenticated using ((select eh_admin()) or cd_id = (select meu_cd()));
create policy maq_inserir on public.maquinas for insert to authenticated with check ((select eh_admin()) or cd_id = (select meu_cd()));
create policy maq_alterar on public.maquinas for update to authenticated
  using ((select eh_admin()) or cd_id = (select meu_cd())) with check ((select eh_admin()) or cd_id = (select meu_cd()));
create policy maq_excluir on public.maquinas for delete to authenticated using ((select eh_admin()));

-- histórico
create policy hist_ler on public.maquinas_historico for select to authenticated using (
  (select eh_admin()) or exists (select 1 from public.maquinas m where m.id = maquina_id and m.cd_id = (select meu_cd())));

-- inventários (conferências): Field cria e finaliza no seu CD; editar finalizado, reabrir e excluir = admin
create policy conf_ler     on public.conferencias for select to authenticated using ((select eh_admin()) or cd_id = (select meu_cd()));
create policy conf_inserir on public.conferencias for insert to authenticated with check ((select eh_admin()) or cd_id = (select meu_cd()));
create policy conf_alterar on public.conferencias for update to authenticated
  using ((select eh_admin()) or (cd_id = (select meu_cd()) and status = 'aberta'))
  with check ((select eh_admin()) or cd_id = (select meu_cd()));
create policy conf_excluir on public.conferencias for delete to authenticated using ((select eh_admin()));

create policy itens_ler on public.conferencia_itens for select to authenticated using (
  (select eh_admin()) or exists (select 1 from public.conferencias c where c.id = conferencia_id and c.cd_id = (select meu_cd())));
create policy itens_inserir on public.conferencia_itens for insert to authenticated with check (
  (select eh_admin()) or exists (select 1 from public.conferencias c where c.id = conferencia_id and c.cd_id = (select meu_cd()) and c.status = 'aberta'));
create policy itens_alterar on public.conferencia_itens for update to authenticated
  using ((select eh_admin()) or exists (select 1 from public.conferencias c where c.id = conferencia_id and c.cd_id = (select meu_cd()) and c.status = 'aberta'))
  with check ((select eh_admin()) or exists (select 1 from public.conferencias c where c.id = conferencia_id and c.cd_id = (select meu_cd())));
create policy itens_excluir on public.conferencia_itens for delete to authenticated using ((select eh_admin()));

-- empréstimos
create policy emp_ler     on public.emprestimos for select to authenticated using ((select eh_admin()) or cd_id = (select meu_cd()));
create policy emp_inserir on public.emprestimos for insert to authenticated with check (
  (select eh_admin()) or exists (select 1 from public.maquinas m where m.id = maquina_id and m.cd_id = (select meu_cd())));
create policy emp_alterar on public.emprestimos for update to authenticated
  using ((select eh_admin()) or cd_id = (select meu_cd())) with check ((select eh_admin()) or cd_id = (select meu_cd()));
create policy emp_excluir on public.emprestimos for delete to authenticated using ((select eh_admin()));

-- tokens do agente: só admin
create policy tok_ler     on public.agente_tokens for select to authenticated using ((select eh_admin()));
create policy tok_alterar on public.agente_tokens for update to authenticated using ((select eh_admin())) with check ((select eh_admin()));
revoke select on public.agente_tokens from authenticated;
grant select (id, descricao, ativo, criado_em, ultimo_uso, cd_id) on public.agente_tokens to authenticated;

-- ---------------------------------------------------------------------
-- VIEW recriada (passa a incluir o CD)
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
                        and d.cd_id = b.cd_id and d.status not in ('descartado'))   then 'hostname_duplicado' end,
    case when b.garantia_fim between current_date and current_date + 30
              and b.status <> 'descartado'                                          then 'garantia_vencendo' end,
    case when b.data_compra < current_date - interval '5 years'
              and b.status <> 'descartado'                                          then 'renovacao' end
  ], null) as alertas
from base b;

revoke all on public.vw_maquinas from anon;
grant select on public.vw_maquinas to authenticated;
