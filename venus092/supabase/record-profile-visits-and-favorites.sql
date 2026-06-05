-- Registro centralizado de visitas, contatos e favoritos de perfis.
-- Mantem inserts de analytics fechados por RLS e expoe apenas uma RPC controlada.

create or replace function public.record_profile_visit(
  p_profile_id uuid,
  p_evento text default 'view',
  p_visitor_hash text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_customer boolean := false;
begin
  if p_evento not in (
    'view',
    'whatsapp_click',
    'whatsapp_click_blocked',
    'chat_click',
    'chat_click_blocked',
    'favorite',
    'unfavorite'
  ) then
    raise exception 'evento invalido';
  end if;

  if not exists (
    select 1
      from public.profiles
     where id = p_profile_id
       and status = 'active'
  ) then
    raise exception 'perfil nao encontrado';
  end if;

  if v_uid is not null then
    select exists(select 1 from public.customers where id = v_uid)
      into v_is_customer;
  end if;

  insert into public.profile_analytics (profile_id, evento, visitor_hash)
  values (p_profile_id, p_evento, p_visitor_hash);

  if v_is_customer and p_evento in ('view', 'favorite') then
    insert into public.customer_history (customer_id, profile_id, viewed_at)
    values (v_uid, p_profile_id, now());
  end if;
end;
$$;

grant execute on function public.record_profile_visit(uuid, text, text) to anon, authenticated;

create index if not exists customer_history_customer_profile_viewed_idx
  on public.customer_history (customer_id, profile_id, viewed_at desc);

create index if not exists favorites_profile_created_idx
  on public.favorites (profile_id, created_at desc);

create or replace function public.get_profile_public_stats(p_profile_id uuid)
returns table(views_count bigint, favorites_count bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(*) filter (where evento = 'view') as views_count,
    count(*) filter (where evento = 'favorite') as favorites_count
  from public.profile_analytics
  where profile_id = p_profile_id;
$$;

grant execute on function public.get_profile_public_stats(uuid) to anon, authenticated;

create or replace function public.get_chat_participants(p_ids uuid[])
returns table(id uuid, name text, avatar_url text, kind text)
language sql
security definer
set search_path = public
as $$
  with requested as (
    select distinct unnest(p_ids) as id
  ), allowed as (
    select r.id
    from requested r
    where exists (
      select 1
      from public.chat_conversations c
      where auth.uid() in (c.client_id, c.professional_id)
        and r.id in (c.client_id, c.professional_id)
    )
  )
  select c.id, c.nome as name, c.avatar_url, 'customer'::text as kind
  from public.customers c
  join allowed a on a.id = c.id
  union all
  select p.id, p.nome_artistico as name, null::text as avatar_url, 'professional'::text as kind
  from public.profiles p
  join allowed a on a.id = p.id;
$$;

revoke execute on function public.get_chat_participants(uuid[]) from public;
revoke execute on function public.get_chat_participants(uuid[]) from anon;
grant execute on function public.get_chat_participants(uuid[]) to authenticated;
