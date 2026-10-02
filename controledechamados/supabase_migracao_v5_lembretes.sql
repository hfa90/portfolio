-- =====================================================================
-- TI Control v5 — Lembretes no celular (Web Push)
-- Supabase → SQL Editor → colar tudo → Run  (idempotente)
-- Depois publique a Edge Function em supabase/functions/lembretes (Verify JWT = OFF)
-- As chaves VAPID são geradas pela própria função no primeiro uso; o token do agendador é gerado aqui.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- aparelhos que recebem as notificações
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok timestamptz
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_dono on public.push_subscriptions;
create policy push_subs_dono on public.push_subscriptions for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- horários (editáveis no app em Configurações)
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  hora_vespera time not null default '19:00',
  hora_dia time not null default '06:30',
  vapid_public text
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;
alter table public.push_config enable row level security;
drop policy if exists push_config_dono on public.push_config;
create policy push_config_dono on public.push_config for all to authenticated using (public.is_autorizado()) with check (public.is_autorizado());
revoke all on public.push_config from anon;
grant select, update on public.push_config to authenticated;

-- segredos: RLS ligado e sem policy => só a Edge Function (service role) lê
create table if not exists public.push_segredos (
  id int primary key default 1 check (id = 1),
  vapid_private text,
  vapid_subject text,
  cron_token text
);
alter table public.push_segredos enable row level security;
revoke all on public.push_segredos from anon, authenticated;
insert into public.push_segredos (id, cron_token)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- controle para não repetir o mesmo aviso
create table if not exists public.push_enviados (
  chave text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_enviados enable row level security;
revoke all on public.push_enviados from anon, authenticated;

-- agendador: chama a função a cada 10 minutos
select cron.schedule('lembretes-push', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://qkalxpjnyjbbnsswhdsb.supabase.co/functions/v1/lembretes',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', (select cron_token from public.push_segredos where id = 1)),
    body := '{}'::jsonb
  );
$cron$);

notify pgrst, 'reload schema';
