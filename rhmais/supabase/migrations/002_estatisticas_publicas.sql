-- Números agregados para a página inicial (sem dados pessoais nem de contas).
create or replace function public.estatisticas_publicas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'vagas_analisadas', (select count(*) from public.vagas),
    'curriculos_adaptados', (select count(*) from public.curriculos where tipo = 'adaptado'),
    'buscas', (select count(*) from public.buscas),
    'skills', coalesce((select jsonb_agg(jsonb_build_array(sk, n) order by n desc) from
        (select sk, count(*) n from (select unnest(skills) sk from public.vagas) u group by sk order by n desc limit 8) k), '[]'::jsonb),
    'regioes', coalesce((select jsonb_agg(jsonb_build_array(reg, n) order by n desc) from
        (select case
            when uf in ('AC','AM','AP','PA','RO','RR','TO') then 'Norte'
            when uf in ('AL','BA','CE','MA','PB','PE','PI','RN','SE') then 'Nordeste'
            when uf in ('DF','GO','MT','MS') then 'Centro-Oeste'
            when uf in ('ES','MG','RJ','SP') then 'Sudeste'
            when uf in ('PR','RS','SC') then 'Sul'
            when modalidade = 'Remoto' then 'Remoto'
            else null end reg, count(*) n
         from public.vagas group by 1) r where reg is not null), '[]'::jsonb)
  );
$$;
revoke execute on function public.estatisticas_publicas() from public;
grant execute on function public.estatisticas_publicas() to anon, authenticated;
