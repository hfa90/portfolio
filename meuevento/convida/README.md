# Convida — Convites digitais interativos

Site completo (HTML + CSS + JS puro, sem build) para criar convites digitais personalizáveis,
com controle de convidados, lista de presentes, planejamento financeiro e jogos de festa.
Usa o **Supabase** como banco de dados e autenticação.

## 1. Configurar o banco de dados

1. Abra seu projeto em https://supabase.com/dashboard
2. Vá em **SQL Editor** → **New query**
3. Cole todo o conteúdo do arquivo `database/schema.sql` e clique em **Run**
   (isso cria todas as tabelas, políticas de segurança (RLS) e índices).
4. Em **Authentication → Providers**, confirme que o login por **Email** está habilitado.
   - Se quiser testar rápido sem confirmar e-mail: em **Authentication → Settings**,
     desative "Confirm email" (recomendado manter ativado em produção).

As credenciais do seu projeto já estão configuradas em `js/supabase-client.js`
(a "anon key" é pública por design — a segurança real vem das políticas RLS criadas no passo acima).

## 2. Testar localmente

Como o site é 100% estático, basta servir a pasta com qualquer servidor HTTP local, por exemplo:

```bash
cd convida
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080`.

> Não abra os arquivos com duplo clique (`file://`) — alguns navegadores bloqueiam
> chamadas de rede nesse modo. Sempre use um servidor local ou hospede online.

## 3. Publicar online (grátis)

Qualquer host de arquivos estáticos funciona. Os mais simples:

- **Netlify / Vercel**: arraste a pasta `convida` no painel, ou conecte um repositório Git.
- **GitHub Pages**: suba a pasta para um repositório e ative o Pages nas configurações.

Depois de publicado, o link do convite (compartilhado via WhatsApp) será algo como:
`https://seusite.com/convite.html?c=aniversario-de-helena-x7k2p`

## 4. Estrutura do projeto

```
convida/
├── index.html            → página inicial / apresentação
├── login.html             → login e cadastro do anfitrião
├── dashboard.html          → lista de convites do anfitrião
├── criar-convite.html      → assistente de criação (categoria → detalhes → publicar)
├── gerenciar.html           → painel de um convite: link, WhatsApp, atalhos, edição
├── convidados.html          → controle de convidados e respostas
├── presentes.html           → gestão da lista de presentes (opcional)
├── financeiro.html          → meta financeira, lançamentos e projeção
├── jogos.html                → bingo, sorteio e perguntas e respostas
├── convite.html               → CONVITE PÚBLICO (o link que é compartilhado)
├── css/style.css
├── js/
│   ├── supabase-client.js     → conexão com Supabase + funções auxiliares
│   └── categories.js          → define os campos inteligentes de cada categoria
└── database/schema.sql        → script completo do banco de dados
```

## 5. Como funcionam os "campos inteligentes"

Tudo está centralizado em `js/categories.js`, no objeto `CATEGORIES`. Cada categoria
(aniversário infantil, debutante de 15 anos, encontro entre amigos, casamento, etc.)
define dois grupos de campos:

- `hostFields`: preenchidos pelo anfitrião ao criar o convite (aparecem publicados no convite).
- `guestFields`: perguntados a cada convidado no momento da confirmação de presença.

Para criar uma nova categoria ou ajustar os campos de uma existente, edite apenas esse arquivo —
todas as telas (criação, convite público e gestão de convidados) já leem dessa mesma fonte.

## 6. Próximos passos sugeridos (não incluídos nesta versão)

- Upload de imagens direto pelo site (hoje a capa do convite é por URL). Dá para adicionar
  usando o **Supabase Storage** (bucket público + `supabase.storage.from().upload()`).
- Envio automático de lembretes por WhatsApp (exige uma API paga, como a WhatsApp Business API).
- Modo colaborativo em tempo real nos jogos (usando `supabase.channel()` / Realtime), hoje o
  modo apresentação roda localmente na tela de quem está controlando o jogo.
