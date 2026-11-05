# Marmita Control v2 — o que mudou

## Passo único no Supabase (2 minutos)
1. Abra o projeto no Supabase → **SQL Editor** → **New query**.
2. Cole todo o arquivo `melhorias-v2.sql` e clique em **Run**.
3. No painel, toque em **Atualizar**. Em **Ajustes → Banco de dados** tudo deve aparecer com ✓.

O SQL só **adiciona** colunas e tabelas. Nenhum cliente, pedido ou produto é apagado ou alterado.
Sem ele o painel funciona, mas pagamento parcial, despesas, arquivar cliente, limite de fiado e categorias ficam desligados.

## Novidades
- **Histórico completo**: o painel agora carrega os pedidos em páginas de 1000. Antes, passando de 1000 pedidos, os mais antigos sumiam.
- **Ficha do cliente** (toque no nome em qualquer lugar): total gasto desde o início, nº de pedidos, ticket médio, frequência por semana,
  gasto mês a mês, dias da semana e do mês em que mais compra, produtos favoritos, quanto tempo leva para pagar o fiado,
  todos os pagamentos recebidos e todos os pedidos (filtro por mês). Botões: novo pedido, receber, cobrar, extrato do mês no WhatsApp.
- **Fiado**: total em aberto, idade da dívida (até 7 / 8–15 / 16–30 / +30 dias), ordenar por atraso/valor/nome,
  **Receber** com escolha dos pedidos, forma (Pix/Dinheiro/Cartão) e **pagamento parcial** (abate do mais antigo para o mais novo),
  limite de fiado por cliente com aviso no novo pedido, chave Pix junto na mensagem de cobrança, recebimentos recentes.
- **Novo pedido**: busca por nome, apelido, empresa ou telefone; mostra quanto o cliente já deve; **Repetir último pedido**;
  produtos mais vendidos primeiro, filtro e categorias; forma de recebimento quando paga na hora.
- **Clientes**: cadastro com apelido, local de trabalho, endereço, aniversário, limite e observações; aviso de cadastro duplicado;
  filtros Ativos/Devendo/Sumidos/Arquivados; ordenar por quem mais gasta, mais recente, mais pedidos ou maior fiado.
  **Excluir virou Arquivar**: o histórico nunca é apagado (antes, excluir cliente apagava todos os pedidos dele).
- **Produtos**: formulário com lucro por unidade e margem na hora, sugestão de preço por margem, prévia da foto, categoria,
  duplicar, reativar desativados, quantidade vendida e última venda de cada produto.
- **Financeiro**: períodos (hoje, 7 dias, mês, mês passado, 3 meses, ano, desde o início, datas livres) com comparação ao período anterior,
  **despesas** e **lucro líquido**, dinheiro que realmente entrou, gráfico mês a mês desde o início, vendas por dia da semana,
  por produto (com lucro), idade do fiado, ranking de clientes, CSV que abre direto no Excel.
- **Ajustes**: nome do negócio, chave Pix, dias para considerar cliente sumido, quinzena, **backup completo em JSON**.
- Segurança: textos de clientes (inclusive os criados pela loja online) não conseguem mais injetar código no painel.
- Visual novo, com modo escuro automático.

A loja online (`loja.html`) não foi alterada e continua funcionando.

## Arquivos
`index.html`, `style.css`, `app.js` (núcleo) e `app-vendas.js`, `app-fiado.js`, `app-clientes.js`, `app-produtos.js`, `app-financeiro.js`.
A versão anterior está guardada em `versao-anterior-v1/`.
