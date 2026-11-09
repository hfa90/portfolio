-- RH+ Match · Fase 1: papéis (master/admin/candidato), solicitações de acesso, chaves da plataforma, currículos salvos.

-- ============================================================ perfis e papéis
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  papel text not null default 'candidato' check (papel in ('master', 'admin', 'candidato')),
  nome text not null default '',
  tipo_org text not null default '',
  organizacao text not null default '',
  telefone text not null default '',
  cidade text not null default '',
  uf text not null default '',
  visivel_recrutadores boolean not null default false,
  modelo_curriculo text not null default 'classico',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create or replace function public.eh_master() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and papel = 'master');
$$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = (select auth.uid()) and papel in ('admin', 'master'));
$$;
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select papel from public.perfis where id = (select auth.uid())), 'candidato');
$$;
revoke execute on function public.eh_master(), public.eh_admin(), public.meu_papel() from anon, public;
grant execute on function public.eh_master(), public.eh_admin(), public.meu_papel() to authenticated;

alter table public.perfis enable row level security;
drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.eh_master()));
drop policy if exists perfis_update on public.perfis;
create policy perfis_update on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;
-- o próprio usuário edita seus dados, mas NUNCA o papel (privilégio por coluna)
grant update (nome, tipo_org, organizacao, telefone, cidade, uf, visivel_recrutadores, modelo_curriculo, atualizado_em) on public.perfis to authenticated;

-- ============================================================ solicitações de acesso de administrador
create table if not exists public.solicitacoes_admin (
  id bigint generated always as identity primary key,
  usuario uuid not null references auth.users(id) on delete cascade,
  organizacao text not null default '',
  tipo_org text not null default '',
  telefone text not null default '',
  mensagem text not null default '',
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  criado_em timestamptz not null default now(),
  decidido_em timestamptz,
  decidido_por uuid references auth.users(id) on delete set null
);
create index if not exists solicitacoes_admin_usuario_idx on public.solicitacoes_admin(usuario);
create index if not exists solicitacoes_admin_decidido_idx on public.solicitacoes_admin(decidido_por);
create unique index if not exists solicitacoes_admin_pendente_uq on public.solicitacoes_admin(usuario) where status = 'pendente';
alter table public.solicitacoes_admin enable row level security;
drop policy if exists sol_select on public.solicitacoes_admin;
create policy sol_select on public.solicitacoes_admin for select to authenticated
  using (usuario = (select auth.uid()) or (select public.eh_master()));
drop policy if exists sol_insert on public.solicitacoes_admin;
create policy sol_insert on public.solicitacoes_admin for insert to authenticated
  with check (usuario = (select auth.uid()) and status = 'pendente');
revoke all on public.solicitacoes_admin from anon, authenticated;
grant select on public.solicitacoes_admin to authenticated;
grant insert (usuario, organizacao, tipo_org, telefone, mensagem) on public.solicitacoes_admin to authenticated;

-- ============================================================ novo usuário → perfil (e solicitação, se empresa)
create or replace function public.tg_novo_usuario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.perfis (id, email, papel, nome, tipo_org, organizacao, telefone)
  values (new.id, coalesce(new.email, ''),
          case when lower(coalesce(new.email, '')) = 'haydenfernandes.ti@gmail.com' then 'master' else 'candidato' end,
          left(coalesce(meta->>'nome', ''), 120), left(coalesce(meta->>'tipo_org', ''), 40),
          left(coalesce(meta->>'organizacao', ''), 160), left(coalesce(meta->>'telefone', ''), 40))
  on conflict (id) do nothing;
  if meta->>'tipo' = 'empresa' and lower(coalesce(new.email, '')) <> 'haydenfernandes.ti@gmail.com' then
    insert into public.solicitacoes_admin (usuario, organizacao, tipo_org, telefone, mensagem)
    values (new.id, left(coalesce(meta->>'organizacao', ''), 160), left(coalesce(meta->>'tipo_org', ''), 40),
            left(coalesce(meta->>'telefone', ''), 40), left(coalesce(meta->>'mensagem', ''), 1000))
    on conflict do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.tg_novo_usuario() from anon, authenticated, public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.tg_novo_usuario();

-- usuários que já existem
insert into public.perfis (id, email, papel)
select u.id, coalesce(u.email, ''),
       case when lower(coalesce(u.email, '')) = 'haydenfernandes.ti@gmail.com' then 'master' else 'candidato' end
from auth.users u
on conflict (id) do update set papel = case when lower(excluded.email) = 'haydenfernandes.ti@gmail.com' then 'master' else public.perfis.papel end;

-- ============================================================ funções do master
create or replace function public.listar_usuarios() returns table (
  id uuid, email text, papel text, nome text, organizacao text, tipo_org text, criado_em timestamptz, ultimo_acesso timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.eh_master() then raise exception 'Apenas o usuário master pode listar usuários'; end if;
  return query
    select p.id, p.email, p.papel, p.nome, p.organizacao, p.tipo_org, p.criado_em, u.last_sign_in_at
    from public.perfis p join auth.users u on u.id = p.id
    order by case p.papel when 'master' then 0 when 'admin' then 1 else 2 end, p.criado_em desc;
end $$;

create or replace function public.definir_papel(p_usuario uuid, p_papel text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_master() then raise exception 'Apenas o usuário master pode alterar papéis'; end if;
  if p_papel not in ('admin', 'candidato') then raise exception 'Papel inválido'; end if;
  if exists (select 1 from public.perfis where id = p_usuario and papel = 'master') then
    raise exception 'O papel do usuário master não pode ser alterado';
  end if;
  update public.perfis set papel = p_papel, atualizado_em = now() where id = p_usuario;
  if not found then raise exception 'Usuário não encontrado'; end if;
end $$;

create or replace function public.decidir_solicitacao(p_id bigint, p_aprovar boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid;
begin
  if not public.eh_master() then raise exception 'Apenas o usuário master pode decidir solicitações'; end if;
  update public.solicitacoes_admin
     set status = case when p_aprovar then 'aprovada' else 'recusada' end, decidido_em = now(), decidido_por = (select auth.uid())
   where id = p_id and status = 'pendente'
   returning usuario into v_usuario;
  if v_usuario is null then raise exception 'Solicitação não encontrada ou já decidida'; end if;
  if p_aprovar then
    update public.perfis p set papel = 'admin', atualizado_em = now(),
      organizacao = case when p.organizacao = '' then s.organizacao else p.organizacao end,
      tipo_org = case when p.tipo_org = '' then s.tipo_org else p.tipo_org end
    from public.solicitacoes_admin s where s.id = p_id and p.id = v_usuario and p.papel = 'candidato';
  end if;
end $$;
revoke execute on function public.listar_usuarios(), public.definir_papel(uuid, text), public.decidir_solicitacao(bigint, boolean) from anon, public;
grant execute on function public.listar_usuarios(), public.definir_papel(uuid, text), public.decidir_solicitacao(bigint, boolean) to authenticated;

-- ============================================================ chaves de API da plataforma (só o master grava; ninguém lê pela API)
create table if not exists public.config_plataforma (
  id int primary key default 1 check (id = 1),
  adzuna_app_id text not null default '',
  adzuna_app_key text not null default '',
  jooble_key text not null default '',
  github_token text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);
insert into public.config_plataforma (id) values (1) on conflict do nothing;
alter table public.config_plataforma enable row level security;
revoke all on public.config_plataforma from anon, authenticated;

create or replace function public.chaves_plataforma_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'adzuna_app_id', c.adzuna_app_id <> '', 'adzuna_app_key', c.adzuna_app_key <> '',
    'jooble_key', c.jooble_key <> '', 'github_token', c.github_token <> '', 'atualizado_em', c.atualizado_em)
  from public.config_plataforma c where c.id = 1;
$$;
create or replace function public.salvar_chaves_plataforma(p_chaves jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.eh_master() then raise exception 'Apenas o usuário master pode alterar as chaves de API'; end if;
  update public.config_plataforma set
    adzuna_app_id  = case when p_chaves ? 'adzuna_app_id'  then left(btrim(p_chaves->>'adzuna_app_id'), 200)  else adzuna_app_id end,
    adzuna_app_key = case when p_chaves ? 'adzuna_app_key' then left(btrim(p_chaves->>'adzuna_app_key'), 200) else adzuna_app_key end,
    jooble_key     = case when p_chaves ? 'jooble_key'     then left(btrim(p_chaves->>'jooble_key'), 200)     else jooble_key end,
    github_token   = case when p_chaves ? 'github_token'   then left(btrim(p_chaves->>'github_token'), 300)   else github_token end,
    atualizado_em = now(), atualizado_por = (select auth.uid())
  where id = 1;
  return public.chaves_plataforma_status();
end $$;
revoke execute on function public.chaves_plataforma_status(), public.salvar_chaves_plataforma(jsonb) from anon, public;
grant execute on function public.chaves_plataforma_status(), public.salvar_chaves_plataforma(jsonb) to authenticated;

-- as chaves por conta deixam de existir (tabela estava vazia)
alter table public.configuracoes drop column if exists adzuna_app_id, drop column if exists adzuna_app_key,
  drop column if exists jooble_key, drop column if exists github_token;

-- ============================================================ "Meu perfil" do candidato = um registro próprio em candidatos
alter table public.candidatos add column if not exists proprio boolean not null default false;
create unique index if not exists candidatos_proprio_uq on public.candidatos(owner) where proprio;

-- ============================================================ currículos salvos (base e adaptados por vaga)
create table if not exists public.curriculos (
  id bigint generated always as identity primary key,
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null default 'adaptado' check (tipo in ('base', 'adaptado')),
  titulo text not null default '',
  modelo text not null default 'classico',
  conteudo jsonb not null,
  padrao boolean not null default false,
  vaga_url text,
  vaga_titulo text not null default '',
  vaga_empresa text not null default '',
  candidato_id bigint references public.candidatos(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists curriculos_owner_idx on public.curriculos(owner, criado_em desc);
create index if not exists curriculos_candidato_idx on public.curriculos(candidato_id);
create unique index if not exists curriculos_vaga_uq on public.curriculos(owner, coalesce(candidato_id, 0), vaga_url) where tipo = 'adaptado' and vaga_url is not null;
create unique index if not exists curriculos_padrao_uq on public.curriculos(owner, coalesce(candidato_id, 0)) where padrao;
alter table public.curriculos enable row level security;
do $$ declare op text; begin
  foreach op in array array['select', 'insert', 'update', 'delete'] loop
    execute format('drop policy if exists curriculos_%s on public.curriculos', op);
  end loop;
end $$;
create policy curriculos_select on public.curriculos for select to authenticated using (owner = (select auth.uid()));
create policy curriculos_insert on public.curriculos for insert to authenticated with check (owner = (select auth.uid()));
create policy curriculos_update on public.curriculos for update to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy curriculos_delete on public.curriculos for delete to authenticated using (owner = (select auth.uid()));
revoke all on public.curriculos from anon;
grant select, insert, update, delete on public.curriculos to authenticated;

-- marcar um currículo como padrão desmarca os outros do mesmo dono/candidato
create or replace function public.definir_curriculo_padrao(p_id bigint) returns void
language plpgsql security invoker set search_path = '' as $$
declare v_cand bigint;
begin
  select candidato_id into v_cand from public.curriculos where id = p_id and owner = (select auth.uid());
  if not found then raise exception 'Currículo não encontrado'; end if;
  update public.curriculos set padrao = false
   where owner = (select auth.uid()) and coalesce(candidato_id, 0) = coalesce(v_cand, 0) and padrao and id <> p_id;
  update public.curriculos set padrao = true, atualizado_em = now() where id = p_id;
end $$;
revoke execute on function public.definir_curriculo_padrao(bigint) from anon, public;
grant execute on function public.definir_curriculo_padrao(bigint) to authenticated;
