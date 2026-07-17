-- CRUD seguro para Perfis de Admin.
-- Permite que um Master vincule usuarios existentes do Supabase Auth
-- aos perfis master, gestor, financeiro e cozinha.

drop function if exists public.admin_criar_perfil(text, text, text, boolean);
drop function if exists public.admin_atualizar_perfil(uuid, text, text, boolean);
drop function if exists public.admin_excluir_perfil(uuid);

create or replace function public.admin_criar_perfil(
  p_email text,
  p_nome text,
  p_perfil text,
  p_ativo boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email text;
  v_nome text := nullif(btrim(p_nome), '');
  v_perfil text := lower(nullif(btrim(p_perfil), ''));
  v_ativo boolean := coalesce(p_ativo, true);
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode gerenciar admins.' using errcode = '42501';
  end if;

  if v_nome is null or nullif(btrim(p_email), '') is null then
    raise exception 'Informe nome e email do admin.' using errcode = '22023';
  end if;

  if v_perfil not in ('master', 'gestor', 'financeiro', 'cozinha') then
    raise exception 'Perfil de admin invalido.' using errcode = '22023';
  end if;

  select u.id, u.email
    into v_user_id, v_email
    from auth.users u
   where lower(u.email) = lower(btrim(p_email))
   limit 1;

  if v_user_id is null then
    raise exception 'Usuario nao encontrado no Supabase Auth. Crie o login em Authentication > Users antes de vincular o perfil.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.admins a
     where lower(a.email) = lower(v_email)
       and a.id <> v_user_id
  ) then
    raise exception 'Este email ja esta vinculado a outro perfil de admin.' using errcode = '23505';
  end if;

  if v_user_id = (select auth.uid()) and (v_perfil <> 'master' or v_ativo = false) then
    raise exception 'Voce nao pode remover seu proprio acesso master.' using errcode = '42501';
  end if;

  if exists (
       select 1 from public.admins a
        where a.id = v_user_id
          and a.perfil = 'master'
          and a.ativo = true
     )
     and (v_perfil <> 'master' or v_ativo = false)
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  insert into public.admins (id, nome, email, perfil, ativo)
  values (v_user_id, v_nome, v_email, v_perfil, v_ativo)
  on conflict (id) do update
     set nome = excluded.nome,
         email = excluded.email,
         perfil = excluded.perfil,
         ativo = excluded.ativo;

  return v_user_id;
end;
$$;

create or replace function public.admin_atualizar_perfil(
  p_admin_id uuid,
  p_nome text,
  p_perfil text,
  p_ativo boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admins%rowtype;
  v_nome text := nullif(btrim(p_nome), '');
  v_perfil text := lower(nullif(btrim(p_perfil), ''));
  v_ativo boolean := coalesce(p_ativo, true);
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode gerenciar admins.' using errcode = '42501';
  end if;

  if v_nome is null then
    raise exception 'Informe o nome do admin.' using errcode = '22023';
  end if;

  if v_perfil not in ('master', 'gestor', 'financeiro', 'cozinha') then
    raise exception 'Perfil de admin invalido.' using errcode = '22023';
  end if;

  select * into v_admin from public.admins where id = p_admin_id;
  if not found then
    raise exception 'Perfil de admin nao encontrado.' using errcode = 'P0002';
  end if;

  if p_admin_id = (select auth.uid()) and (v_perfil <> 'master' or v_ativo = false) then
    raise exception 'Voce nao pode remover seu proprio acesso master.' using errcode = '42501';
  end if;

  if v_admin.perfil = 'master'
     and v_admin.ativo = true
     and (v_perfil <> 'master' or v_ativo = false)
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  update public.admins
     set nome = v_nome,
         perfil = v_perfil,
         ativo = v_ativo
   where id = p_admin_id;
end;
$$;

create or replace function public.admin_excluir_perfil(p_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admins%rowtype;
begin
  if not public.is_admin_master() then
    raise exception 'Somente perfil master pode excluir admins.' using errcode = '42501';
  end if;

  select * into v_admin from public.admins where id = p_admin_id;
  if not found then
    raise exception 'Perfil de admin nao encontrado.' using errcode = 'P0002';
  end if;

  if p_admin_id = (select auth.uid()) then
    raise exception 'Voce nao pode excluir seu proprio perfil master.' using errcode = '42501';
  end if;

  if v_admin.perfil = 'master'
     and v_admin.ativo = true
     and (select count(*) from public.admins where perfil = 'master' and ativo = true) <= 1 then
    raise exception 'Mantenha pelo menos um perfil master ativo.' using errcode = '42501';
  end if;

  delete from public.admins where id = p_admin_id;
end;
$$;

revoke all on function public.admin_criar_perfil(text, text, text, boolean) from public;
revoke all on function public.admin_criar_perfil(text, text, text, boolean) from anon;
grant execute on function public.admin_criar_perfil(text, text, text, boolean) to authenticated;
revoke all on function public.admin_atualizar_perfil(uuid, text, text, boolean) from public;
revoke all on function public.admin_atualizar_perfil(uuid, text, text, boolean) from anon;
grant execute on function public.admin_atualizar_perfil(uuid, text, text, boolean) to authenticated;
revoke all on function public.admin_excluir_perfil(uuid) from public;
revoke all on function public.admin_excluir_perfil(uuid) from anon;
grant execute on function public.admin_excluir_perfil(uuid) to authenticated;

notify pgrst, 'reload schema';
