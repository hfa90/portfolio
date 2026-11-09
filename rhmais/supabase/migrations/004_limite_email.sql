-- limite de e-mails de aviso por conta (60 a cada 24 h), separado do limite de IA
create or replace function public.registrar_uso_email() returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_usados int;
begin
  if v_user is null then raise exception 'Não autenticado'; end if;
  select count(*) into v_usados from public.uso_ia where owner = v_user and recurso = 'email' and criado_em > now() - interval '24 hours';
  if v_usados >= 60 then raise exception 'Limite diário de e-mails de aviso atingido.'; end if;
  insert into public.uso_ia(owner, recurso) values (v_user, 'email');
end $$;
revoke execute on function public.registrar_uso_email() from anon, public;
grant execute on function public.registrar_uso_email() to authenticated;
