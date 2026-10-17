-- TI Control v6 — Corrige "duplicate key chamados_numero_rat_key"
-- O RAT era gerado com COUNT(*)+1; após excluir um chamado, repetia um número existente.
create or replace function public.gerar_numero_rat()
returns trigger language plpgsql as $function$
declare
  ano text;
  sequencia integer;
begin
  if new.numero_rat is null or new.numero_rat = '' then
    ano := to_char(current_date, 'YYYY');
    perform pg_advisory_xact_lock(hashtext('gerar_numero_rat_' || ano));
    select coalesce(max((substring(numero_rat from '^RAT-' || ano || '-(\d+)$'))::int), 0) + 1
      into sequencia
      from public.chamados
     where numero_rat like 'RAT-' || ano || '-%';
    new.numero_rat := 'RAT-' || ano || '-' || lpad(sequencia::text, 4, '0');
  end if;
  return new;
end;
$function$;
