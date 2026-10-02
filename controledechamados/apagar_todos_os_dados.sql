-- =====================================================================
-- TI Control — APAGAR TODOS OS DADOS DO SISTEMA
-- =====================================================================
-- O que este script apaga (sem volta):
--   • todos os recebimentos (pagamentos registrados)
--   • todos os chamados / RATs
--   • todas as empresas
--   • reinicia as numerações automáticas das tabelas
--
-- O que ele NÃO apaga:
--   • a estrutura do banco (tabelas, colunas, regras de acesso)
--   • a sua conta de login (veja a PARTE OPCIONAL no final)
--   • os arquivos anexados (RAT/NF) — veja "ANEXOS" no final
--
-- COMO USAR
--   1. (Recomendado) Faça um backup antes: no app, Financeiro → aba "Todos"
--      → botão "CSV"; ou no Supabase, Table Editor → cada tabela → Export.
--   2. Supabase → SQL Editor → cole este arquivo inteiro.
--   3. Troque  confirmar boolean := false;  por  confirmar boolean := true;
--   4. Clique em Run. O Supabase vai avisar que é uma operação destrutiva:
--      confirme em "Run query".
--   5. O resultado mostra quantos registros restaram (devem ser 0).
-- =====================================================================

do $$
declare
  confirmar boolean := false;   -- <<< MUDE PARA true PARA APAGAR DE VERDADE
  n_rec  bigint;
  n_cham bigint;
  n_emp  bigint;
begin
  select count(*) into n_rec  from public.recebimentos;
  select count(*) into n_cham from public.chamados;
  select count(*) into n_emp  from public.empresas;

  if not confirmar then
    raise exception 'NADA FOI APAGADO. Seriam apagados: % recebimento(s), % chamado(s), % empresa(s). Para confirmar, mude "confirmar boolean := false" para true e rode de novo.',
      n_rec, n_cham, n_emp;
  end if;

  truncate table public.recebimentos, public.chamados, public.empresas restart identity cascade;

  raise notice 'Apagados: % recebimento(s), % chamado(s), % empresa(s).', n_rec, n_cham, n_emp;
end $$;

-- Conferência: tudo deve estar zerado
select 'empresas' as tabela, count(*) as registros from public.empresas
union all select 'chamados', count(*) from public.chamados
union all select 'recebimentos', count(*) from public.recebimentos;


-- =====================================================================
-- ANEXOS (arquivos de RAT e NF)
-- O Supabase não permite apagar arquivos por SQL. Para apagar os anexos:
--   Supabase → Storage → bucket "chamados-anexos" → selecione todas as
--   pastas → Delete.
-- =====================================================================


-- =====================================================================
-- PARTE OPCIONAL — também liberar o "dono" do sistema
-- Use só se quiser recomeçar do zero inclusive o acesso: a próxima conta
-- criada no app volta a ser a dona. Para usar, remova os "--" das 2 linhas.
-- (Contas de login em si se apagam em Authentication → Users.)
-- =====================================================================
-- delete from public.usuarios_autorizados;
-- select count(*) as donos_restantes from public.usuarios_autorizados;
