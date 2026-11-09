-- RH+ Match — controle de uso da IA (adaptação de currículo).
-- Execute no SQL Editor depois do schema.sql. Idempotente.
-- Cada conta pode gerar até 30 adaptações a cada 24 horas (ajuste o número abaixo se quiser).

create table if not exists public.uso_ia (
  id bigint generated always as identity primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  recurso text not null,
  criado_em timestamptz not null default now()
);
create index if not exists uso_ia_owner_idx on public.uso_ia(owner, criado_em desc);

-- RLS ligado e SEM políticas: ninguém lê nem altera a tabela pela API;
-- só a função abaixo (security definer) grava nela.
alter table public.uso_ia enable row level security;
revoke all on public.uso_ia from anon, authenticated;

create or replace function public.registrar_uso_ia(p_recurso text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_limite int := 30;
  v_usados int;
begin
  if v_user is null then raise exception 'Não autenticado'; end if;
  select count(*) into v_usados from public.uso_ia
   where owner = v_user and criado_em > now() - interval '24 hours';
  if v_usados >= v_limite then
    raise exception 'Limite diário de % adaptações com IA atingido. Tente novamente amanhã.', v_limite;
  end if;
  insert into public.uso_ia(owner, recurso) values (v_user, left(coalesce(p_recurso, ''), 40));
end $$;
revoke execute on function public.registrar_uso_ia(text) from anon, public;
grant execute on function public.registrar_uso_ia(text) to authenticated;
