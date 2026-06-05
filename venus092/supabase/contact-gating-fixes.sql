-- Fixes for gated profile contact actions.
-- Run in the Supabase SQL editor.

alter table public.profile_analytics
  drop constraint if exists profile_analytics_evento_check;

alter table public.profile_analytics
  add constraint profile_analytics_evento_check
  check (
    evento = any (array[
      'view',
      'whatsapp_click',
      'whatsapp_click_blocked',
      'chat_click',
      'chat_click_blocked',
      'favorite',
      'unfavorite'
    ]::text[])
  );

create index if not exists profile_analytics_profile_evento_created_idx
  on public.profile_analytics (profile_id, evento, created_at desc);

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
