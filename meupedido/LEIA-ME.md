# 🍱 Marmita App

Sistema completo de gestão de pedidos de marmita para empresas. **Apenas 3 arquivos.**

## 📁 Arquivos

| Arquivo | O que é |
|---|---|
| `banco.sql` | Banco base (rodar no Supabase uma vez só) |
| `migration.sql` | Complemento atual do banco: RPCs, pedidos coletivos, comprovantes PIX e push |
| `marmita.html` | Tela do colaborador: login com PIN + cardápio + pedido + meus pedidos |
| `admin.html` | Painel administrativo completo: pedidos, cardápio, fornecedores, pratos, acompanhamentos, colaboradores, financeiro, configurações |

---

## 🚀 Setup — 5 passos

### 1. Criar projeto no Supabase
Acesse https://supabase.com → "New project" → defina nome e senha do banco.

### 2. Rodar o banco
No Supabase: **SQL Editor → New query** → cole todo o conteúdo de `banco.sql` → **Run**.

Depois rode também o conteúdo de **`migration.sql`**. Ele é idempotente e pode ser executado mais de uma vez; serve tanto para uma instalação nova quanto para atualizar um banco que já estava usando a primeira versão.

O `banco.sql` cria as tabelas base, funções, políticas RLS **e já popula com dados de exemplo**. O `migration.sql` adiciona os recursos usados pela versão atual das telas:
- RPCs `cardapio_hoje`, `criar_pedido`, `meus_pedidos`, `buscar_pedido`, `anexar_comprovante`, `copiar_cardapio`, `criar_pedido_coletivo` e `listar_pedidos_coletivos`
- colunas de empresa/WhatsApp do colaborador e comprovante PIX do pedido
- bucket público `comprovantes-pix`
- tabela `push_subscriptions`
- suporte a pedidos coletivos
- 2 fornecedores (Restaurante da Dona Maria, Marmitex do Zé)
- Pratos e acompanhamentos
- Cardápio de hoje
- 3 colaboradores de teste:

| Nome | Matrícula | PIN |
|---|---|---|
| João Silva | `001` | `1234` |
| Maria Souza | `002` | `5678` |
| Pedro Costa | `003` | `9999` |

> 💡 Quando for pra produção, remova/comente o bloco "DADOS DE EXEMPLO" no final do `banco.sql`.

### 3. Configurar as chaves nos HTMLs
No Supabase: **Project Settings → API** → copie:
- **Project URL**
- **anon / public key**

Em **`marmita.html`** e **`admin.html`**, troque as duas linhas no topo:
```js
window.SUPABASE_URL  = "https://SEU-PROJETO.supabase.co";
window.SUPABASE_ANON = "SUA-ANON-KEY-AQUI";
```

> A `anon key` é segura para o frontend — a proteção é feita via RLS no banco.

### 4. Criar o primeiro admin
No Supabase: **Authentication → Users → Add user**:
- Email: o seu (ex.: `admin@empresa.com`)
- Senha: defina uma forte
- ✅ Marque **"Auto Confirm User"**

Depois, no **SQL Editor**, rode:
```sql
insert into admins (id, nome, email)
select id, 'Hayden Fernandes', email
  from auth.users
 where email = 'master@haydenfernandes.com.br';
```

### 5. Abrir os arquivos
Como é JavaScript com módulos ES, **precisa servir via HTTP** (não funciona abrindo direto do explorador).

**Opção A — Python (já vem instalado na maioria das máquinas):**
```bash
cd pasta-do-projeto
python3 -m http.server 8000
```
Acesse:
- Colaborador: http://localhost:8000/marmita.html
- Admin: http://localhost:8000/admin.html

**Opção B — VS Code:** instale a extensão **Live Server** e clique em "Go Live".

**Opção C — Hospedar grátis:** suba os arquivos no **Netlify Drop** (https://app.netlify.com/drop) ou **Vercel** — é só arrastar a pasta.

---

## 🎯 Funcionalidades

### Lado Colaborador (`marmita.html`)
- ✅ Login com matrícula + PIN numérico (4 dígitos)
- ✅ Cardápio do dia agrupado por fornecedor
- ✅ Montagem do pedido: prato + acompanhamentos + observações
- ✅ 4 formas de pagamento: Pix Empresa, Pix Fornecedor, Dinheiro, Fiado semanal
- ✅ Aba "Meus pedidos" com histórico e status de pagamento
- ✅ Totalmente responsivo (mobile-first)

### Lado Admin (`admin.html`)
- ✅ Login com email/senha (Supabase Auth)
- ✅ **Pedidos do dia** — visualiza tudo agrupado por fornecedor, filtra por data, marca como pago, **gera mensagens prontas para o WhatsApp** (com botão "Abrir no WhatsApp" que já preenche tudo)
- ✅ **Cardápio do dia** — marca quais pratos estarão disponíveis em qualquer data
- ✅ **Fornecedores** — CRUD completo com WhatsApp, Pix, dias de atendimento
- ✅ **Pratos** — CRUD ligado a fornecedores
- ✅ **Acompanhamentos** — CRUD com preço extra opcional
- ✅ **Colaboradores** — CRUD + reset de PIN
- ✅ **Financeiro** — saldo em aberto por colaborador, total por fornecedor, faturamento do mês
- ✅ **Configurações** — nome da empresa, Pix da empresa, período de fechamento do fiado (semanal/mensal configurável), horário-limite

---

## 📱 Exemplo de mensagem gerada para WhatsApp

```
🍱 Pedido — Restaurante da Dona Maria — 15/05/2026

1. João Silva
   Filé acebolado + Arroz, Feijão, Salada — R$ 22,00

2. Maria Souza
   Frango grelhado + Purê, Salada — R$ 22,00
   📝 sem cebola

━━━━━━━━━━━━━
Total: 2 marmitas — R$ 44,00
```
O botão "Abrir no WhatsApp" já abre a conversa com o fornecedor com essa mensagem pronta.

---

## 🔒 Segurança

- **PINs com bcrypt** (`pgcrypto` + `gen_salt('bf')`) — nunca em texto puro.
- Verificação por **função `SECURITY DEFINER`** — o hash nunca sai do banco.
- **Row Level Security** habilitado em todas as tabelas:
  - Admins autenticados → acesso total.
  - Anônimo → só lê cardápio público; insere pedidos validados.
- A `anon key` exposta no frontend **é segura** desde que o RLS esteja correto.

---

## 🛠️ Personalização rápida

- **Cores e fonte:** as variáveis CSS estão no topo de cada HTML (`:root { --brick: ... }`). Mudou ali, mudou tudo.
- **Tamanho do PIN:** em `marmita.html`, procure `const PIN_LEN = 4;` e altere (o backend aceita 4–8 dígitos).
- **Adicionar novos campos:** edite o SQL + os formulários nos modais do admin.

---

## ❓ Problemas comuns

**"Erro ao conectar"** → verifique se colocou a URL e anon key certas nos dois HTMLs.

**"Usuário não está cadastrado como administrador"** → você esqueceu o passo 4 (criar o registro na tabela `admins`).

**Login do colaborador não funciona** → confirme que rodou o `banco.sql` inteiro, incluindo a seção `DADOS DE EXEMPLO`, ou cadastre colaboradores manualmente pelo painel admin.

**Não carrega o cardápio** → a aba "Cardápio do dia" no admin precisa ter pratos marcados pra data de hoje.
