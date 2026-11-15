-- RH+ Match · Reforço de segurança (auditoria de 2026-11-15)

-- 1) Nota de compatibilidade das candidaturas só pode ser gravada pelo servidor (Edge Function "candidatar", service role).
--    Qualquer nota/detalhe enviado direto pelo navegador é descartado; numa atualização a nota original é mantida.
create or replace function public.tg_candidatura_protege()
returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.score := null;
    new.detalhes := '{}'::jsonb;
  else
    new.score := old.score;
    new.detalhes := old.detalhes;
    new.perfil := old.perfil;
    new.curriculo := old.curriculo;
    new.candidato := old.candidato;
    new.vaga_id := old.vaga_id;
  end if;
  return new;
end $$;
revoke all on function public.tg_candidatura_protege() from public, anon, authenticated;

drop trigger if exists candidatura_protege on public.candidaturas;
create trigger candidatura_protege before insert or update on public.candidaturas
  for each row execute function public.tg_candidatura_protege();

-- 2) Permissões que o site não usa: esvaziar tabela (TRUNCATE), criar gatilhos (TRIGGER) e chaves estrangeiras (REFERENCES).
--    O TRUNCATE ignora as regras por linha (RLS), então não deve ficar com usuários comuns.
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
