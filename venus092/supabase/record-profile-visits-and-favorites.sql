-- Registro centralizado de visitas, contatos, favoritos e notificacoes de perfis.
-- Mantem inserts de analytics fechados por RLS e expoe apenas RPCs controladas.

create table if not exists public.profile_notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_customer_id uuid references public.customers(id) on delete set null,
  evento text not null check (evento = any (array[
    'view',
    'favorite',
    'whatsapp_click',
    'chat_click'
  ]::text[])),
  title text not null,
  body text not null,
  dedupe_key text,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

alter table public.profile_notifications enable row level security;

create unique index if not exists profile_notifications_dedupe_uidx
  on public.profile_notifications (dedupe_key)
  where dedupe_key is not null;

create index if not exists profile_notifications_profile_created_idx
  on public.profile_notifications (profile_id, created_at desc);

create index if not exists profile_notifications_profile_unread_idx
  on public.profile_notifications (profile_id, read_at, created_at desc);

create index if not exists profile_notifications_actor_customer_idx
  on public.profile_notifications (actor_customer_id)
  where actor_customer_id is not null;

revoke all on public.profile_notifications from anon;
revoke all on public.profile_notifications from authenticated;
grant select, update(read_at) on public.profile_notifications to authenticated;

drop policy if exists "profile notifications owner select" on public.profile_notifications;
create policy "profile notifications owner select"
on public.profile_notifications for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists "profile notifications owner read update" on public.profile_notifications;
create policy "profile notifications owner read update"
on public.profile_notifications for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

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
  v_should_record boolean := true;
  v_title text;
  v_body text;
  v_dedupe_key text;
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

  if p_evento = 'view' and p_visitor_hash is not null then
    v_should_record := not exists (
      select 1
        from public.profile_analytics
       where profile_id = p_profile_id
         and evento = 'view'
         and visitor_hash = p_visitor_hash
         and created_at >= now() - interval '30 minutes'
    );
  end if;

  if not v_should_record then
    return;
  end if;

  insert into public.profile_analytics (profile_id, evento, visitor_hash)
  values (p_profile_id, p_evento, p_visitor_hash);

  if v_is_customer and p_evento in ('view', 'favorite') then
    insert into public.customer_history (customer_id, profile_id, viewed_at)
    values (v_uid, p_profile_id, now());
  end if;

  if p_evento in ('view', 'favorite', 'whatsapp_click', 'chat_click') then
    v_title := case p_evento
      when 'view' then 'Seu perfil foi visualizado'
      when 'favorite' then 'Seu perfil foi favoritado'
      when 'whatsapp_click' then 'Novo clique no WhatsApp'
      when 'chat_click' then 'Novo interesse por chat'
    end;

    v_body := case p_evento
      when 'view' then case when v_is_customer then 'Um cliente cadastrado abriu seu perfil.' else 'Um visitante anonimo abriu seu perfil.' end
      when 'favorite' then 'Um cliente salvou seu perfil nos favoritos.'
      when 'whatsapp_click' then 'Alguem clicou para falar com voce pelo WhatsApp.'
      when 'chat_click' then 'Alguem abriu uma conversa pelo seu perfil.'
    end;

    v_dedupe_key := case
      when p_evento = 'view' and p_visitor_hash is not null
        then 'view:' || p_profile_id::text || ':' || p_visitor_hash || ':' || to_char(date_trunc('hour', now()), 'YYYYMMDDHH24')
      when p_evento = 'favorite' and v_uid is not null
        then 'favorite:' || p_profile_id::text || ':' || v_uid::text
      else null
    end;

    insert into public.profile_notifications (
      profile_id,
      actor_customer_id,
      evento,
      title,
      body,
      dedupe_key
    ) values (
      p_profile_id,
      case when v_is_customer then v_uid else null end,
      p_evento,
      v_title,
      v_body,
      v_dedupe_key
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
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

do $$
begin
  alter publication supabase_realtime add table public.profile_notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
