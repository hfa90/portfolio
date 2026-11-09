-- RH+ Match · Fase 2: vagas publicadas por empresas, candidaturas pelo sistema e mensagens.

create or replace function public.regiao_de(p_uf text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_uf in ('AC','AM','AP','PA','RO','RR','TO') then 'Norte'
    when p_uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'Nordeste'
    when p_uf in ('DF','GO','MT','MS') then 'Centro-Oeste'
    when p_uf in ('ES','MG','RJ','SP') then 'Sudeste'
    when p_uf in ('PR','RS','SC') then 'Sul'
    else '' end;
$$;

-- ============================================================ vagas publicadas
create table if not exists public.vagas_publicadas (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organizacao text not null default '',
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  descricao text not null default '' check (length(descricao) <= 20000),
  requisitos text not null default '' check (length(requisitos) <= 8000),
  beneficios text not null default '' check (length(beneficios) <= 4000),
  cidade text not null default '',
  uf text not null default '',
  regiao text generated always as (public.regiao_de(uf)) stored,
  modalidade text not null default '' check (modalidade in ('', 'Presencial', 'Híbrido', 'Remoto')),
  regime text not null default '' check (regime in ('', 'CLT', 'PJ', 'Estágio', 'Temporário', 'Jovem aprendiz', 'Freelancer', 'Trainee')),
  area text not null default '',
  senioridade text not null default '',
  salario_min numeric check (salario_min is null or salario_min >= 0),
  salario_max numeric check (salario_max is null or salario_max >= 0),
  mostrar_salario boolean not null default true,
  email_contato text not null default '',
  status text not null default 'aberta' check (status in ('rascunho', 'aberta', 'pausada', 'encerrada')),
  expira_em date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists vagas_pub_owner_idx on public.vagas_publicadas(owner);
create index if not exists vagas_pub_status_idx on public.vagas_publicadas(status, criado_em desc);
create index if not exists vagas_pub_local_idx on public.vagas_publicadas(uf, cidade);

alter table public.vagas_publicadas enable row level security;
drop policy if exists vp_select_publico on public.vagas_publicadas;
create policy vp_select_publico on public.vagas_publicadas for select to anon, authenticated
  using (status = 'aberta' and (expira_em is null or expira_em >= current_date));
drop policy if exists vp_select_dono on public.vagas_publicadas;
create policy vp_select_dono on public.vagas_publicadas for select to authenticated
  using (owner = (select auth.uid()) or (select public.eh_master()));
drop policy if exists vp_insert on public.vagas_publicadas;
create policy vp_insert on public.vagas_publicadas for insert to authenticated
  with check (owner = (select auth.uid()) and (select public.eh_admin()));
drop policy if exists vp_update on public.vagas_publicadas;
create policy vp_update on public.vagas_publicadas for update to authenticated
  using (owner = (select auth.uid()) or (select public.eh_master()))
  with check (owner = (select auth.uid()) or (select public.eh_master()));
drop policy if exists vp_delete on public.vagas_publicadas;
create policy vp_delete on public.vagas_publicadas for delete to authenticated
  using (owner = (select auth.uid()) or (select public.eh_master()));
revoke all on public.vagas_publicadas from anon, authenticated;
grant select on public.vagas_publicadas to anon, authenticated;
grant insert, update, delete on public.vagas_publicadas to authenticated;

drop trigger if exists vagas_pub_atualizado on public.vagas_publicadas;
create trigger vagas_pub_atualizado before update on public.vagas_publicadas
  for each row execute function public.tg_atualizado_em();

-- ============================================================ candidaturas
create table if not exists public.candidaturas (
  id bigint generated always as identity primary key,
  vaga_id bigint not null references public.vagas_publicadas(id) on delete cascade,
  candidato uuid not null default auth.uid() references auth.users(id) on delete cascade,
  perfil jsonb not null default '{}'::jsonb,        -- cópia dos dados do candidato no momento da candidatura
  curriculo jsonb,                                  -- cópia congelada do currículo enviado
  curriculo_modelo text not null default 'classico',
  mensagem text not null default '' check (length(mensagem) <= 3000),
  score numeric,
  detalhes jsonb not null default '{}'::jsonb,
  status text not null default 'enviada' check (status in ('enviada', 'em_analise', 'entrevista', 'aprovada', 'reprovada', 'contratada', 'desistiu')),
  motivo text not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (vaga_id, candidato)
);
create index if not exists candidaturas_candidato_idx on public.candidaturas(candidato, criado_em desc);
create index if not exists candidaturas_vaga_idx on public.candidaturas(vaga_id, status);

-- dono da vaga (para as políticas)
create or replace function public.dono_da_vaga(p_vaga bigint) returns uuid
language sql stable security definer set search_path = '' as $$
  select owner from public.vagas_publicadas where id = p_vaga;
$$;
revoke execute on function public.dono_da_vaga(bigint) from anon, public;
grant execute on function public.dono_da_vaga(bigint) to authenticated;

-- o candidato continua vendo a vaga em que se candidatou, mesmo depois de encerrada
create or replace function public.candidatou_se(p_vaga bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.candidaturas where vaga_id = p_vaga and candidato = (select auth.uid()));
$$;
revoke execute on function public.candidatou_se(bigint) from anon, public;
grant execute on function public.candidatou_se(bigint) to authenticated;
drop policy if exists vp_select_candidato on public.vagas_publicadas;
create policy vp_select_candidato on public.vagas_publicadas for select to authenticated using (public.candidatou_se(id));

alter table public.candidaturas enable row level security;
drop policy if exists cand_select on public.candidaturas;
create policy cand_select on public.candidaturas for select to authenticated
  using (candidato = (select auth.uid()) or public.dono_da_vaga(vaga_id) = (select auth.uid()) or (select public.eh_master()));
drop policy if exists cand_insert on public.candidaturas;
create policy cand_insert on public.candidaturas for insert to authenticated
  with check (candidato = (select auth.uid()) and status = 'enviada'
    and exists (select 1 from public.vagas_publicadas v where v.id = vaga_id and v.status = 'aberta' and (v.expira_em is null or v.expira_em >= current_date)));
revoke all on public.candidaturas from anon, authenticated;
grant select on public.candidaturas to authenticated;
grant insert (vaga_id, candidato, perfil, curriculo, curriculo_modelo, mensagem, score, detalhes) on public.candidaturas to authenticated;

-- mudança de etapa: o dono da vaga move entre as etapas; o candidato só pode desistir
create or replace function public.mudar_status_candidatura(p_id bigint, p_status text, p_motivo text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.candidaturas%rowtype; v_dono uuid;
begin
  select * into c from public.candidaturas where id = p_id;
  if not found then raise exception 'Candidatura não encontrada'; end if;
  v_dono := public.dono_da_vaga(c.vaga_id);
  if p_status not in ('enviada', 'em_analise', 'entrevista', 'aprovada', 'reprovada', 'contratada', 'desistiu') then raise exception 'Etapa inválida'; end if;
  if (select auth.uid()) = c.candidato and v_dono is distinct from (select auth.uid()) then
    if p_status <> 'desistiu' then raise exception 'O candidato só pode desistir da candidatura'; end if;
  elsif v_dono is distinct from (select auth.uid()) and not public.eh_master() then
    raise exception 'Sem permissão para alterar esta candidatura';
  elsif p_status = 'desistiu' then raise exception 'Somente o candidato pode desistir';
  end if;
  update public.candidaturas set status = p_status, motivo = left(coalesce(p_motivo, ''), 1000), atualizado_em = now() where id = p_id;
end $$;
revoke execute on function public.mudar_status_candidatura(bigint, text, text) from anon, public;
grant execute on function public.mudar_status_candidatura(bigint, text, text) to authenticated;

-- ============================================================ mensagens da candidatura
create table if not exists public.mensagens (
  id bigint generated always as identity primary key,
  candidatura_id bigint not null references public.candidaturas(id) on delete cascade,
  autor uuid not null default auth.uid() references auth.users(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now(),
  lida_em timestamptz
);
create index if not exists mensagens_cand_idx on public.mensagens(candidatura_id, criado_em);
create index if not exists mensagens_autor_idx on public.mensagens(autor);

create or replace function public.participa_candidatura(p_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.candidaturas c where c.id = p_id
    and (c.candidato = (select auth.uid()) or public.dono_da_vaga(c.vaga_id) = (select auth.uid()) or public.eh_master()));
$$;
revoke execute on function public.participa_candidatura(bigint) from anon, public;
grant execute on function public.participa_candidatura(bigint) to authenticated;

alter table public.mensagens enable row level security;
drop policy if exists msg_select on public.mensagens;
create policy msg_select on public.mensagens for select to authenticated using (public.participa_candidatura(candidatura_id));
drop policy if exists msg_insert on public.mensagens;
create policy msg_insert on public.mensagens for insert to authenticated
  with check (autor = (select auth.uid()) and public.participa_candidatura(candidatura_id));
drop policy if exists msg_update on public.mensagens;
create policy msg_update on public.mensagens for update to authenticated
  using (public.participa_candidatura(candidatura_id) and autor <> (select auth.uid()))
  with check (public.participa_candidatura(candidatura_id));
revoke all on public.mensagens from anon, authenticated;
grant select on public.mensagens to authenticated;
grant insert (candidatura_id, autor, texto) on public.mensagens to authenticated;
grant update (lida_em) on public.mensagens to authenticated;

-- ============================================================ contagem de candidaturas por vaga (para o dono)
create or replace function public.resumo_minhas_vagas() returns table (vaga_id bigint, total bigint, novas bigint, nao_lidas bigint)
language sql stable security invoker set search_path = '' as $$
  select c.vaga_id, count(*), count(*) filter (where c.status = 'enviada'),
         (select count(*) from public.mensagens m join public.candidaturas c2 on c2.id = m.candidatura_id
           where c2.vaga_id = c.vaga_id and m.lida_em is null and m.autor <> (select auth.uid()))
  from public.candidaturas c join public.vagas_publicadas v on v.id = c.vaga_id
  where v.owner = (select auth.uid())
  group by c.vaga_id;
$$;
revoke execute on function public.resumo_minhas_vagas() from anon, public;
grant execute on function public.resumo_minhas_vagas() to authenticated;

-- números públicos passam a incluir vagas abertas na plataforma
create or replace function public.estatisticas_publicas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vagas_analisadas', (select count(*) from public.vagas),
    'vagas_plataforma', (select count(*) from public.vagas_publicadas where status = 'aberta' and (expira_em is null or expira_em >= current_date)),
    'curriculos_adaptados', (select count(*) from public.curriculos where tipo = 'adaptado'),
    'buscas', (select count(*) from public.buscas),
    'skills', coalesce((select jsonb_agg(jsonb_build_array(sk, n) order by n desc) from
        (select sk, count(*) n from (select unnest(skills) sk from public.vagas) u group by sk order by n desc limit 8) k), '[]'::jsonb),
    'regioes', coalesce((select jsonb_agg(jsonb_build_array(reg, n) order by n desc) from
        (select coalesce(nullif(public.regiao_de(uf), ''), case when modalidade = 'Remoto' then 'Remoto' end) reg, count(*) n
         from public.vagas group by 1) r where reg is not null), '[]'::jsonb)
  );
$$;
revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;
