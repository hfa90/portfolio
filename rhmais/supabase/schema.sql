-- RH+ Match — schema Supabase
-- Execute no SQL Editor do projeto (Dashboard → SQL Editor → New query → cole → Run).
-- Idempotente: pode rodar de novo sem perder dados.
-- Cada usuário (consultoria) enxerga somente os próprios registros (RLS por owner).

create table if not exists public.candidatos (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  email text default '',
  telefone text default '',
  cargo_desejado text default '',
  cargos_alternativos text default '',
  skills text default '',
  senioridade text default '',
  cidade text default '',
  uf text default '',
  modalidades text default 'Presencial,Híbrido,Remoto',
  pretensao_salarial numeric default 0,
  aceita_mudanca boolean default false,
  resumo text default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.vagas (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null,
  titulo text default '',
  empresa text default '',
  fonte text default '',
  cidade text default '',
  uf text default '',
  modalidade text default '',
  senioridade text default '',
  salario text default '',
  contrato text default '',
  descricao text default '',
  tags text[] default '{}',
  skills text[] default '{}',
  publicada_em date,
  coletada_em timestamptz not null default now(),
  unique (owner, url)
);

create table if not exists public.pipeline (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  candidato_id bigint not null references public.candidatos(id) on delete cascade,
  vaga_id bigint not null references public.vagas(id) on delete cascade,
  score numeric default 0,
  detalhes jsonb default '{}'::jsonb,
  status text not null default 'Sugerida' check (status in
    ('Sugerida','Enviada ao candidato','Candidatura feita','Entrevista','Proposta','Contratado','Descartada')),
  notas text default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (candidato_id, vaga_id)
);

create table if not exists public.buscas (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  candidato_id bigint references public.candidatos(id) on delete set null,
  termos text default '',
  total int default 0,
  compativeis int default 0,
  fontes text default '',
  criada_em timestamptz not null default now()
);

create table if not exists public.configuracoes (
  owner uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  empresa_nome text default 'Minha Consultoria de RH',
  paginas_por_fonte int default 2 check (paginas_por_fonte between 1 and 5),
  score_minimo_padrao int default 40 check (score_minimo_padrao between 0 and 90),
  fontes_ativas text[] default array['gupy','vagas_com','infojobs','programathor','github_br','remotive','himalayas','adzuna','jooble'],
  adzuna_app_id text default '',
  adzuna_app_key text default '',
  jooble_key text default '',
  github_token text default '',
  atualizado_em timestamptz default now()
);

create index if not exists candidatos_owner_idx on public.candidatos(owner);
create index if not exists vagas_owner_idx on public.vagas(owner);
create index if not exists pipeline_owner_idx on public.pipeline(owner);
create index if not exists pipeline_candidato_idx on public.pipeline(candidato_id);
create index if not exists pipeline_vaga_idx on public.pipeline(vaga_id);
create index if not exists buscas_owner_idx on public.buscas(owner, criada_em desc);
create index if not exists buscas_candidato_idx on public.buscas(candidato_id);

-- atualizado_em automático no pipeline
create or replace function public.tg_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists pipeline_atualizado on public.pipeline;
create trigger pipeline_atualizado before update on public.pipeline
  for each row execute function public.tg_atualizado_em();

-- Row Level Security: cada usuário só acessa o que é dele
do $$
declare t text;
begin
  foreach t in array array['candidatos','vagas','pipeline','buscas','configuracoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono_select" on public.%I', t);
    execute format('drop policy if exists "dono_insert" on public.%I', t);
    execute format('drop policy if exists "dono_update" on public.%I', t);
    execute format('drop policy if exists "dono_delete" on public.%I', t);
    execute format('create policy "dono_select" on public.%I for select to authenticated using (owner = (select auth.uid()))', t);
    execute format('create policy "dono_insert" on public.%I for insert to authenticated with check (owner = (select auth.uid()))', t);
    execute format('create policy "dono_update" on public.%I for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()))', t);
    execute format('create policy "dono_delete" on public.%I for delete to authenticated using (owner = (select auth.uid()))', t);
  end loop;
end $$;

-- o pipeline só pode apontar para candidato e vaga do próprio usuário
create or replace function public.tg_pipeline_dono() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.candidatos c where c.id = new.candidato_id and c.owner = new.owner)
     or not exists (select 1 from public.vagas v where v.id = new.vaga_id and v.owner = new.owner) then
    raise exception 'Candidato ou vaga não pertence a este usuário';
  end if;
  return new;
end $$;
drop trigger if exists pipeline_dono on public.pipeline;
create trigger pipeline_dono before insert or update on public.pipeline
  for each row execute function public.tg_pipeline_dono();

-- Indicadores do painel (security invoker: respeita o RLS do usuário logado)
create or replace function public.painel_resumo() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'candidatos', (select count(*) from public.candidatos),
    'vagas', (select count(*) from public.vagas),
    'status', coalesce((select jsonb_object_agg(status, n) from
        (select status, count(*) n from public.pipeline group by status) s), '{}'::jsonb),
    'por_fonte', coalesce((select jsonb_agg(jsonb_build_array(fonte, n) order by n desc) from
        (select fonte, count(*) n from public.vagas group by fonte order by n desc limit 7) f), '[]'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_array(sk, n) order by n desc) from
        (select sk, count(*) n from (select unnest(skills) sk from public.vagas order by id desc limit 20000) u
         group by sk order by n desc limit 7) k), '[]'::jsonb)
  );
$$;
revoke execute on function public.painel_resumo() from anon, public;
grant execute on function public.painel_resumo() to authenticated;

grant select, insert, update, delete on public.candidatos, public.vagas, public.pipeline, public.buscas, public.configuracoes to authenticated;
revoke all on public.candidatos, public.vagas, public.pipeline, public.buscas, public.configuracoes from anon;
