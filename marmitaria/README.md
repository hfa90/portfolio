# 🍱 Marmita Control

Sistema web para controlar pedidos diários (marmitas, refrigerantes, etc.), pagamentos na hora ou na quinzena, cobrança via WhatsApp e financeiro (custo x lucro). Feito em HTML/CSS/JS puro + Supabase.

## 1. Configurar o Supabase

1. Abra seu projeto: https://supabase.com/dashboard/project/ckfiknmdcoiihlifourc
2. Vá em **SQL Editor** → **New query**, cole todo o conteúdo do arquivo `schema.sql` e clique em **Run**. Isso cria as tabelas `clientes`, `produtos`, `pedidos`, `itens_pedido` e já cadastra alguns produtos de exemplo.
3. Vá em **Project Settings → API**. Copie a chave **`anon` `public`**.
4. Abra o arquivo `config.js` e cole essa chave em `SUPABASE_ANON_KEY`. O `SUPABASE_URL` já está preenchido com a URL do seu projeto — confira se bate com a do painel.

⚠️ Nunca coloque a chave **`service_role`** no `config.js` — ela é secreta e o arquivo fica público no GitHub. A `anon public` é feita para ser usada no navegador.

## 2. Testar localmente

Como o app usa `fetch`/módulos, abra com um servidor local em vez de dar duplo clique no `index.html`:

```bash
# dentro da pasta do projeto
python3 -m http.server 8080
# depois acesse http://localhost:8080
```

Ou, se tiver a extensão "Live Server" do VS Code, é só clicar em "Go Live".

## 3. Hospedar no GitHub Pages

```bash
git init
git add .
git commit -m "Marmita Control"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/marmita-control.git
git push -u origin main
```

Depois, no repositório: **Settings → Pages → Branch: main → / (root)** → Save. Em alguns minutos o site fica disponível em `https://SEU_USUARIO.github.io/marmita-control/`.

## Como o sistema funciona

- **Painel** — resumo do dia e do mês: faturamento, quanto falta receber, lucro.
- **Novo Pedido** — escolha ou crie o cliente, marque os produtos e quantidades, escolha se paga na hora ou na quinzena (quando é quinzena, aparece o campo de **taxa em R$** para adicionar ao total).
- **Pedidos** — histórico completo, com filtro por data e status, marcar como pago ou excluir.
- **Cobrança** — lista todos os clientes que ainda devem, com o total e um botão que abre o **WhatsApp já com a mensagem de cobrança pronta** (usa o número cadastrado do cliente).
- **Clientes** — cadastro simples de nome + WhatsApp.
- **Produtos** — cadastro de custo e preço de venda de cada item (marmita P/M/G, coca-cola, suco...); o sistema calcula a margem automaticamente.
- **Financeiro** — faturamento, custo dos produtos, lucro, taxas de quinzena recebidas, total em aberto vs. já recebido, e um gráfico simples de vendas por produto — tudo filtrável por hoje / 7 dias / mês / tudo.

Pagamentos "na hora" já entram como **pagos**; pagamentos "na quinzena" entram como **pendentes** até você marcar como pago (individualmente ou tudo de uma vez pela tela de Cobrança).

O layout é responsivo: no computador aparece um menu lateral, no celular vira uma barra de navegação inferior (com um botão **+** de atalho para lançar pedido rápido).

## Estrutura dos arquivos

```
index.html   → estrutura das telas
style.css    → visual (tema "comanda de cozinha")
app.js       → toda a lógica: Supabase, formulários, cálculos
config.js    → suas credenciais do Supabase (edite aqui)
schema.sql   → script para criar as tabelas no Supabase
```
