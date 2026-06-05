-- Ferramentas de seguranca: bloqueios, denuncias e avaliacoes publicas.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamp with time zone not null default now(),
  primary key (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

alter table public.user_blocks enable row level security;

create index if not exists user_blocks_blocked_user_idx
  on public.user_blocks (blocked_user_id, created_at desc);

revoke all on public.user_blocks from anon;
revoke all on public.user_blocks from authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

drop policy if exists "user blocks owner select" on public.user_blocks;
create policy "user blocks owner select"
on public.user_blocks for select
to authenticated
using (blocker_id = (select auth.uid()));

drop policy if exists "user blocks owner insert" on public.user_blocks;
create policy "user blocks owner insert"
on public.user_blocks for insert
to authenticated
with check (blocker_id = (select auth.uid()));

drop policy if exists "user blocks owner delete" on public.user_blocks;
create policy "user blocks owner delete"
on public.user_blocks for delete
to authenticated
using (blocker_id = (select auth.uid()));

create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  conversation_id uuid references public.chat_conversations(id) on delete set null,
  reason text not null check (reason = any (array[
    'golpe',
    'violencia',
    'sem_consentimento',
    'ofensa',
    'assedio',
    'spam',
    'outro'
  ]::text[])),
  details text not null check (char_length(details) between 10 and 2000),
  status text not null default 'open' check (status = any (array['open','reviewing','resolved','dismissed']::text[])),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (reporter_id <> reported_user_id)
);

alter table public.safety_reports enable row level security;

create index if not exists safety_reports_reporter_created_idx
  on public.safety_reports (reporter_id, created_at desc);

create index if not exists safety_reports_reported_created_idx
  on public.safety_reports (reported_user_id, created_at desc);

create index if not exists safety_reports_profile_idx
  on public.safety_reports (profile_id);

create index if not exists safety_reports_conversation_idx
  on public.safety_reports (conversation_id);

revoke all on public.safety_reports from anon;
revoke all on public.safety_reports from authenticated;
grant select, insert on public.safety_reports to authenticated;

drop policy if exists "safety reports reporter select" on public.safety_reports;
create policy "safety reports reporter select"
on public.safety_reports for select
to authenticated
using (reporter_id = (select auth.uid()) or ((select auth.jwt() ->> 'email') = 'admin@venus092.com.br'));

drop policy if exists "safety reports reporter insert" on public.safety_reports;
create policy "safety reports reporter insert"
on public.safety_reports for insert
to authenticated
with check (reporter_id = (select auth.uid()));

create table if not exists public.profile_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reviewer_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 10 and 1200),
  status text not null default 'published' check (status = any (array['published','hidden','removed']::text[])),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (profile_id, customer_id),
  check (profile_id <> customer_id)
);

alter table public.profile_reviews enable row level security;

create index if not exists profile_reviews_profile_created_idx
  on public.profile_reviews (profile_id, status, created_at desc);

create index if not exists profile_reviews_customer_idx
  on public.profile_reviews (customer_id, created_at desc);

revoke all on public.profile_reviews from anon;
revoke all on public.profile_reviews from authenticated;
grant select on public.profile_reviews to anon, authenticated;

drop policy if exists "profile reviews public select" on public.profile_reviews;
create policy "profile reviews public select"
on public.profile_reviews for select
to anon, authenticated
using (status = 'published');

create or replace function public.is_blocked_between(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_user_a and b.blocked_user_id = p_user_b)
       or (b.blocker_id = p_user_b and b.blocked_user_id = p_user_a)
  );
$$;

revoke execute on function public.is_blocked_between(uuid, uuid) from public;
revoke execute on function public.is_blocked_between(uuid, uuid) from anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.submit_profile_review(
  p_profile_id uuid,
  p_rating int,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_customer_name text;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select nome into v_customer_name
  from public.customers
  where id = v_uid;

  if v_customer_name is null then
    raise exception 'apenas clientes cadastrados podem avaliar';
  end if;

  if not exists (select 1 from public.profiles where id = p_profile_id and status = 'active') then
    raise exception 'perfil nao encontrado';
  end if;

  if p_profile_id = v_uid then
    raise exception 'autoavaliacao nao permitida';
  end if;

  insert into public.profile_reviews (profile_id, customer_id, reviewer_name, rating, comment, status, updated_at)
  values (p_profile_id, v_uid, v_customer_name, p_rating, trim(p_comment), 'published', now())
  on conflict (profile_id, customer_id)
  do update set
    reviewer_name = excluded.reviewer_name,
    rating = excluded.rating,
    comment = excluded.comment,
    status = 'published',
    updated_at = now()
  returning id into v_review_id;

  return v_review_id;
end;
$$;

revoke execute on function public.submit_profile_review(uuid, int, text) from public;
revoke execute on function public.submit_profile_review(uuid, int, text) from anon;
grant execute on function public.submit_profile_review(uuid, int, text) to authenticated;

create or replace function public.submit_safety_report(
  p_reported_user_id uuid,
  p_reason text,
  p_details text,
  p_profile_id uuid default null,
  p_conversation_id uuid default null,
  p_block_user boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_reported_user_id = v_uid then
    raise exception 'nao e possivel denunciar a propria conta';
  end if;

  if p_reason not in ('golpe','violencia','sem_consentimento','ofensa','assedio','spam','outro') then
    raise exception 'motivo invalido';
  end if;

  if char_length(trim(coalesce(p_details, ''))) < 10 then
    raise exception 'detalhes insuficientes';
  end if;

  if p_conversation_id is not null and not exists (
    select 1 from public.chat_conversations c
    where c.id = p_conversation_id
      and v_uid in (c.client_id, c.professional_id)
      and p_reported_user_id in (c.client_id, c.professional_id)
  ) then
    raise exception 'conversa invalida';
  end if;

  if p_profile_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
  ) then
    raise exception 'perfil invalido';
  end if;

  insert into public.safety_reports (reporter_id, reported_user_id, profile_id, conversation_id, reason, details)
  values (v_uid, p_reported_user_id, p_profile_id, p_conversation_id, p_reason, trim(p_details))
  returning id into v_report_id;

  if p_block_user then
    insert into public.user_blocks (blocker_id, blocked_user_id, reason)
    values (v_uid, p_reported_user_id, p_reason)
    on conflict (blocker_id, blocked_user_id)
    do update set reason = excluded.reason, created_at = now();
  end if;

  return v_report_id;
end;
$$;

revoke execute on function public.submit_safety_report(uuid, text, text, uuid, uuid, boolean) from public;
revoke execute on function public.submit_safety_report(uuid, text, text, uuid, uuid, boolean) from anon;
grant execute on function public.submit_safety_report(uuid, text, text, uuid, uuid, boolean) to authenticated;

create or replace function public.get_profile_review_summary(p_profile_id uuid)
returns table(total_reviews bigint, average_rating numeric)
language sql
security definer
set search_path = public
as $$
  select count(*)::bigint as total_reviews, round(avg(rating)::numeric, 1) as average_rating
  from public.profile_reviews
  where profile_id = p_profile_id and status = 'published';
$$;

grant execute on function public.get_profile_review_summary(uuid) to anon, authenticated;

create or replace function public.get_or_create_conversation(p_professional_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if public.is_blocked_between(auth.uid(), p_professional_id) then
    raise exception 'conversation blocked';
  end if;

  insert into public.chat_conversations (client_id, professional_id)
  values (auth.uid(), p_professional_id)
  on conflict (client_id, professional_id)
  do update set
    updated_at = now(),
    expires_at = case
      when chat_conversations.expires_at < now() then now() + interval '24 hours'
      else chat_conversations.expires_at
    end
  returning id into v_conversation_id;

  return v_conversation_id;
end;
$$;

revoke execute on function public.get_or_create_conversation(uuid) from public;
revoke execute on function public.get_or_create_conversation(uuid) from anon;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;

drop policy if exists "chat messages participants insert" on public.chat_messages;
create policy "chat messages participants insert"
on public.chat_messages for insert
with check (
  auth.uid() = sender_id
  and exists (
    select 1
      from public.chat_conversations c
     where c.id = conversation_id
       and auth.uid() in (c.client_id, c.professional_id)
       and c.expires_at > now()
       and not public.is_blocked_between(c.client_id, c.professional_id)
  )
);
