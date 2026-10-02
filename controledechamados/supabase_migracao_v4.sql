-- =====================================================================
-- TI Control v4 — Regra de pagamento por empresa
-- Idempotente. Supabase → SQL Editor → colar → Run
--
-- regra_pagamento (jsonb) aceita 3 formatos:
--   {"tipo":"dias","dias":45,"base":"nf","doc":"nf"}                                 → 45 dias após a NF
--   {"tipo":"semanal","doc":"nf","semanas_nf":1,"nf_ate":5,"semanas_pag":2,"dia_pag":4} → semana fechada (Positivo)
--   {"tipo":"mensal","doc":"recibo","fecha_dia":0,"dia_pag":10,"meses":1}              → mês fechado, paga dia 10 (Intercom)
--   dias da semana: 1=segunda ... 5=sexta · fecha_dia 0 = último dia do mês · "util":true joga sáb/dom para segunda
-- Empresas sem regra continuam usando prazo_pagamento_dias.
-- =====================================================================
alter table public.empresas add column if not exists regra_pagamento jsonb;

notify pgrst, 'reload schema';
