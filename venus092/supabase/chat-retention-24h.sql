-- Venus chat storage and 24h retention.
-- Run this in the Supabase SQL editor, then enable Realtime for:
-- public.chat_conversations and public.chat_messages.

create extension if not exists pgcrypto;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references auth.users(id) on delete cascade,
  professional_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (client_id, professional_id)
);

alter table public.chat_conversations
  add column if not exists client_id uuid references auth.users(id) on delete cascade,
  add column if not exists professional_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours');

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists conversation_id uuid references public.chat_conversations(id) on delete cascade,
  add column if not exists sender_id uuid references auth.users(id) on delete cascade,
  add column if not exists content text,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

update public.chat_conversations
   set updated_at = coalesce(updated_at, created_at, now()),
       expires_at = coalesce(expires_at, coalesce(created_at, now()) + interval '24 hours');

update public.chat_messages
   set created_at = coalesce(created_at, now());

with ranked as (
  select
    id,
    first_value(id) over (
      partition by client_id, professional_id
      order by updated_at desc, created_at desc, id
    ) as keep_id
  from public.chat_conversations
  where client_id is not null
    and professional_id is not null
)
update public.chat_messages m
   set conversation_id = r.keep_id
  from ranked r
 where m.conversation_id = r.id
   and r.id <> r.keep_id;

with ranked as (
  select
    id,
    first_value(id) over (
      partition by client_id, professional_id
      order by updated_at desc, created_at desc, id
    ) as keep_id
  from public.chat_conversations
  where client_id is not null
    and professional_id is not null
)
delete from public.chat_conversations c
using ranked r
where c.id = r.id
  and r.id <> r.keep_id;

create unique index if not exists chat_conversations_client_professional_uidx
  on public.chat_conversations (client_id, professional_id);

create index if not exists chat_conversations_client_idx
  on public.chat_conversations (client_id, updated_at desc);

create index if not exists chat_conversations_professional_idx
  on public.chat_conversations (professional_id, updated_at desc);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

create or replace function public.touch_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_chat_conversation on public.chat_messages;
create trigger trg_touch_chat_conversation
after insert on public.chat_messages
for each row execute function public.touch_chat_conversation();

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

create or replace function public.mark_messages_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_messages m
     set read_at = coalesce(read_at, now())
    from public.chat_conversations c
   where c.id = m.conversation_id
     and c.id = p_conversation_id
     and auth.uid() in (c.client_id, c.professional_id)
     and m.sender_id <> auth.uid();
end;
$$;

create or replace function public.delete_expired_chat_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.chat_messages
   where created_at < now() - interval '24 hours';

  get diagnostics v_deleted = row_count;

  delete from public.chat_conversations c
   where c.expires_at < now()
     and not exists (
       select 1
         from public.chat_messages m
        where m.conversation_id = c.id
     );

  return v_deleted;
end;
$$;

create or replace function public.cleanup_expired_chat_messages_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_expired_chat_messages();
  return new;
end;
$$;

drop trigger if exists trg_cleanup_expired_chat_messages on public.chat_messages;
create trigger trg_cleanup_expired_chat_messages
after insert on public.chat_messages
for each statement execute function public.cleanup_expired_chat_messages_trigger();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat conversations participants select" on public.chat_conversations;
create policy "chat conversations participants select"
on public.chat_conversations for select
using (auth.uid() in (client_id, professional_id));

drop policy if exists "chat conversations clients insert" on public.chat_conversations;
create policy "chat conversations clients insert"
on public.chat_conversations for insert
with check (auth.uid() = client_id);

drop policy if exists "chat messages participants select" on public.chat_messages;
create policy "chat messages participants select"
on public.chat_messages for select
using (
  exists (
    select 1
      from public.chat_conversations c
     where c.id = conversation_id
       and auth.uid() in (c.client_id, c.professional_id)
  )
);

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
  )
);

drop policy if exists "chat messages participants update read" on public.chat_messages;
create policy "chat messages participants update read"
on public.chat_messages for update
using (
  exists (
    select 1
      from public.chat_conversations c
     where c.id = conversation_id
       and auth.uid() in (c.client_id, c.professional_id)
  )
)
with check (
  exists (
    select 1
      from public.chat_conversations c
     where c.id = conversation_id
       and auth.uid() in (c.client_id, c.professional_id)
  )
);

grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
grant execute on function public.delete_expired_chat_messages() to authenticated;

-- Optional hourly cleanup if pg_cron is enabled in your Supabase project:
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule(
--   'delete-expired-chat-messages',
--   '0 * * * *',
--   $$select public.delete_expired_chat_messages();$$
-- );
