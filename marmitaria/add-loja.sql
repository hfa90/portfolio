-- =========================================================
-- Marmita Control — migração opcional para a "Loja Online"
-- Rode isso no SQL Editor do Supabase (uma vez só).
-- Sem isso, a loja funciona normalmente, só não aparece o
-- selo "🌐 Online" nos pedidos feitos pelo link público.
-- =========================================================

alter table pedidos
  add column if not exists origem text not null default 'painel';

-- (opcional) índice para filtrar rápido os pedidos vindos da loja
create index if not exists idx_pedidos_origem on pedidos (origem);
