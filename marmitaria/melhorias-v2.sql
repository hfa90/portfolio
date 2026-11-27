-- =========================================================
-- Marmita Control — melhorias v2
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run.
--
-- 100% ADITIVO: só cria colunas e tabelas novas.
-- Não apaga, não altera e não move nenhum dado existente.
-- Pode rodar mais de uma vez sem problema (if not exists).
-- O painel funciona sem isso, mas algumas funções ficam
-- desligadas até você rodar (pagamento parcial, despesas,
-- arquivar cliente, limite de fiado, categorias).
-- =========================================================

-- ---------- CLIENTES: cadastro mais completo ----------
alter table clientes add column if not exists apelido       text;
alter table clientes add column if not exists empresa       text;            -- local de trabalho / setor
alter table clientes add column if not exists endereco      text;
alter table clientes add column if not exists aniversario   date;
alter table clientes add column if not exists limite_fiado  numeric(10,2);   -- vazio = sem limite
alter table clientes add column if not exists ativo         boolean not null default true; -- "arquivar" em vez de excluir

-- ---------- PRODUTOS: categoria e descrição ----------
alter table produtos add column if not exists categoria  text;
alter table produtos add column if not exists descricao  text;

-- ---------- PEDIDOS: pagamento parcial e forma de recebimento ----------
-- valor_pago = quanto já foi abatido deste pedido (fiado pago aos poucos).
-- Pedidos antigos ficam com 0 — o status "pago"/"pendente" continua valendo igual.
alter table pedidos add column if not exists valor_pago        numeric(10,2) not null default 0;
alter table pedidos add column if not exists forma_recebimento text;         -- pix | dinheiro | cartao | outro

-- ---------- PAGAMENTOS: histórico de cada valor recebido ----------
create table if not exists pagamentos (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid references clientes(id) on delete set null,
  valor            numeric(10,2) not null check (valor > 0),
  data_pagamento   date not null default current_date,
  forma            text not null default 'pix',
  pedidos_ids      uuid[] not null default '{}',   -- pedidos que esse valor abateu/quitou
  observacoes      text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_pagamentos_cliente on pagamentos (cliente_id);
create index if not exists idx_pagamentos_data    on pagamentos (data_pagamento);

-- ---------- DESPESAS: gastos do negócio (gás, embalagem, mercado...) ----------
create table if not exists despesas (
  id           uuid primary key default gen_random_uuid(),
  data         date not null default current_date,
  descricao    text not null,
  categoria    text not null default 'Outros',
  valor        numeric(10,2) not null check (valor >= 0),
  created_at   timestamptz not null default now()
);
create index if not exists idx_despesas_data on despesas (data);

-- ---------- Índices para o histórico carregar rápido ----------
create index if not exists idx_pedidos_cliente on pedidos (cliente_id);
create index if not exists idx_pedidos_data    on pedidos (data_pedido);
create index if not exists idx_itens_pedido    on itens_pedido (pedido_id);

-- ---------- Segurança das tabelas novas ----------
-- Só quem está logado no painel lê/escreve pagamentos e despesas.
-- (A loja online não precisa dessas tabelas.)
alter table pagamentos enable row level security;
alter table despesas   enable row level security;

drop policy if exists "painel_pagamentos" on pagamentos;  -- remove só a regra de acesso, nunca dados
create policy "painel_pagamentos" on pagamentos
  for all to authenticated using (true) with check (true);

drop policy if exists "painel_despesas" on despesas;
create policy "painel_despesas" on despesas
  for all to authenticated using (true) with check (true);
