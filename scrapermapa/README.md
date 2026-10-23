# Prospecta: prospecção de empresas no Google Maps

Encontre empresas por **bairro, rua, cidade ou área do mapa** com nome, telefone (e se é celular),
endereço separado em rua/número/bairro/cidade/CEP, avaliação, horário, site, e-mail, redes sociais
e **dados da Receita Federal** (CNPJ, porte, abertura, sócios). Os dados viram uma lista de leads
com funil de vendas, WhatsApp com mensagem pronta e exportação para Excel.

**Sem Python para rodar o sistema e sem IA.** O site é estático (GitHub Pages) e o backend é o
**Supabase**: banco, login, segurança por usuário e funções.

🌐 **Site:** https://haydenfernandes.com.br/scrapermapa/

---

## Arquitetura

```
                    ┌──────────────────────────────┐
  Navegador ───────▶│  Site (GitHub Pages)         │  login, prospecção, leads, painel
                    └──────────────┬───────────────┘
                                   │ supabase-js (anon key + RLS)
                    ┌──────────────▼───────────────┐
                    │  SUPABASE                    │
                    │  • tabelas prospecta_*       │  fila de buscas, leads, histórico
                    │  • RLS: cada usuário só vê   │
                    │    os próprios dados         │
                    │  • Edge Functions:           │
                    │      places-search  (opção 2)│
                    │      enriquecer  (CNPJ/site) │
                    └──▲───────────▲───────────▲───┘
                       │           │           │
        ┌──────────────┘           │           └──────────────┐
  ┌─────┴───────────┐   ┌──────────┴──────────┐   ┌───────────┴─────────┐
  │ 1. Extensão do  │   │ 3. Robô na nuvem    │   │ 4. Robô no PC       │
  │ Chrome (no seu  │   │ (Docker: Railway,   │   │ ProspectaRobo.exe   │
  │ Google Maps)    │   │ Render, VPS)        │   │ (usa o Edge/Chrome) │
  └─────────────────┘   └─────────────────────┘   └─────────────────────┘
```

| Motor | Onde roda | Custo | Quando usar |
|---|---|---|---|
| **1. Extensão do Chrome** | No seu navegador, dentro do Google Maps | Grátis | Dia a dia. Menor chance de bloqueio, porque usa o seu navegador. |
| **2. Google Places API** | Edge Function do Supabase | Pago por uso (ver abaixo) | Precisão máxima: o endereço já vem estruturado e não quebra quando o Google muda a página. |
| **3. Robô na nuvem** | Servidor 24h | ~US$ 5/mês | Buscas grandes ou agendadas sem deixar o PC ligado. |
| **4. Robô no PC (.exe)** | Seu Windows | Grátis | Buscas longas em segundo plano, sem instalar nada. |

Todos gravam no mesmo banco. O site mostra o progresso em tempo real, qualquer que seja o motor.

---

## Passo 1: preparar o Supabase (uma vez)

Projeto usado: **`uvculminojmtltdulpsa`** (o mesmo do Chamado Fácil; as tabelas têm o prefixo
`prospecta_` e não interferem no outro sistema).

1. No Supabase → **SQL Editor** → **New query**, cole todo o arquivo
   [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. Pode rodar de novo quando houver
   atualização, porque o script é idempotente.
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://haydenfernandes.com.br/scrapermapa/`
   - *Redirect URLs*: adicione `https://haydenfernandes.com.br/scrapermapa/`
3. *(Opcional)* **Authentication → Providers → Email**: desative *Confirm email* se não quiser
   confirmação por e-mail ao criar conta.
4. Abra o site e clique em **Criar conta**.

## Passo 2: Edge Functions (enriquecimento e Places API)

As funções ficam em `supabase/functions/`. Há duas formas de publicar:

**Pelo painel (sem instalar nada):** Supabase → **Edge Functions** → **Deploy a new function** →
**Via Editor**. Crie uma função com o nome exato `enriquecer`, cole o conteúdo de
`supabase/functions/enriquecer/index.ts` e clique em **Deploy**. Repita para `places-search`.

**Pela CLI:**
```bash
npx supabase login
npx supabase functions deploy enriquecer    --project-ref uvculminojmtltdulpsa
npx supabase functions deploy places-search --project-ref uvculminojmtltdulpsa
```

- **`enriquecer`** não precisa de chave. Ela visita o site da empresa (e-mail, Instagram, Facebook,
  LinkedIn, CNPJ no rodapé), faz o diagnóstico do site (online, HTTPS, plataforma, Google Analytics,
  Meta Pixel), consulta a **BrasilAPI** (Receita Federal) e o **ViaCEP**.
- **`places-search`** precisa do segredo **`GOOGLE_PLACES_API_KEY`** (ver opção 2).

---

## Opção 1: extensão do Chrome

1. Baixe a pasta [`extensao/`](extensao/): em **Code → Download ZIP** no GitHub, extraia e pegue
   `scrapermapa/extensao`.
2. No Chrome, abra `chrome://extensions`, ative o **Modo do desenvolvedor** (canto superior direito),
   clique em **Carregar sem compactação** e selecione a pasta `extensao`.
3. Clique no ícone do Prospecta (🧩 → fixar) e entre com o mesmo e-mail e senha do site.
4. No site, escolha **Extensão do Chrome** e clique em **Abrir no Google Maps**. Ou pesquise
   direto no Maps, por exemplo *dentistas em Moema*.
5. No Maps, clique no botão **Prospecta** (canto superior direito) e depois em **Capturar resultados**.

Opções do painel:
- **Máx. empresas**: limite da captura.
- **Só neste local**: filtro estrito por bairro ou rua.
- **Abrir cada empresa**: dados completos. Desmarcado, lê só a lista, o que é mais rápido.
- **Enriquecer depois**: e-mail, redes e CNPJ via função `enriquecer`.

Também funciona na página de uma empresa individual ("Capturar esta empresa").

## Opção 2: Google Places API (oficial)

1. No [Google Cloud Console](https://console.cloud.google.com/): crie ou escolha um projeto, ative o
   faturamento, ative a **Places API (New)** e crie uma **chave de API**. Restrinja a chave à
   *Places API (New)*.
2. No Supabase: **Edge Functions → Secrets** → adicione `GOOGLE_PLACES_API_KEY` com a chave.
3. Publique a função `places-search` (passo 2).
4. No site, escolha **Google Places API**.

**Custo (tabela oficial):** cada consulta traz até 20 empresas e é cobrada no SKU *Text Search
Enterprise* (porque pedimos telefone, site e avaliação): **US$ 35 por 1.000 consultas**, com
**1.000 consultas grátis por mês**. Isso equivale a cerca de 20 mil empresas por mês sem custo. Uma
busca de 60 empresas usa 3 consultas. A API devolve no máximo 60 resultados por região; use a
**varredura em grade** para cobrir áreas maiores.
Fonte: [Google Maps Platform pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

## Opção 3: robô na nuvem

O robô fica em [`robo/`](robo/) (Python + Playwright, empacotado em Docker). Ele consulta a fila no
Supabase e atende as buscas com motor **"Robô na nuvem"** de todos os usuários.

**Railway** (o mais simples):
1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub repo** → `hfa90/portfolio`.
2. Em *Settings → Source*, defina **Root Directory** = `scrapermapa/robo`. O Dockerfile é detectado sozinho.
3. Em *Variables*, adicione:
   - `SUPABASE_URL` = `https://uvculminojmtltdulpsa.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = *Supabase → Settings → API → service_role*

   ⚠️ Essa chave dá acesso total ao banco: use-a **somente** como variável do servidor, nunca no site ou no GitHub.
4. Deploy. Em menos de 1 minuto o painel mostra "Robô na nuvem: online" (Configurações).

**Render:** *New → Background Worker → Docker*, mesmo diretório e mesmas variáveis.
**VPS:** `docker build -t prospecta-robo . && docker run -d --restart=always -e SUPABASE_URL=... -e SUPABASE_SERVICE_ROLE_KEY=... prospecta-robo`

> IPs de datacenter são bloqueados pelo Google com mais facilidade que IPs residenciais. Se
> aparecerem muitos erros, reduza as abas simultâneas (Configurações) ou prefira os motores 1 ou 4.

## Opção 4: robô no PC (ProspectaRobo.exe)

O GitHub Actions ([`.github/workflows/prospecta-robo.yml`](../.github/workflows/prospecta-robo.yml))
gera o executável a cada alteração em `robo/` e publica na release **prospecta-robo**:

⬇️ https://github.com/hfa90/portfolio/releases/download/prospecta-robo/ProspectaRobo.exe

1. Baixe e execute o arquivo. O Windows pode mostrar "O Windows protegeu o computador", porque o
   executável não é assinado: clique em **Mais informações → Executar assim mesmo**.
2. Entre com o e-mail e a senha do Prospecta. O login fica salvo em `%APPDATA%\Prospecta`.
3. Deixe a janela aberta. No site, escolha **Robô no meu PC** e inicie a busca.

O robô usa o **Microsoft Edge** (que já vem no Windows 10/11) ou o Chrome; não baixa nenhum
navegador. Para trocar de conta, rode `ProspectaRobo.exe --sair`. Em *Configurações → Mostrar o
navegador no robô do PC* você acompanha a busca na tela.

---

## Estrutura

```
scrapermapa/
├── index.html, css/, js/      Site (estático) — js/config.js tem a URL e a chave pública do Supabase
├── supabase/
│   ├── schema.sql             Tabelas, RLS, gatilhos e funções (RPC)
│   └── functions/
│       ├── places-search/     Opção 2 — Google Places API
│       └── enriquecer/        Site, CNPJ (BrasilAPI), CEP (ViaCEP), diagnóstico do site
├── extensao/                  Opção 1 — extensão do Chrome (Manifest V3)
└── robo/                      Opções 3 e 4 — robô Python/Playwright (Dockerfile + build .exe)
```

## Segurança

- A chave **anon** em `js/config.js` e na extensão é pública por definição. Quem protege os dados
  é o **RLS**: cada usuário só lê e grava as próprias linhas (`owner = auth.uid()`).
- As funções de gravação (`prospecta_salvar_leads`, `prospecta_progresso`, `prospecta_pegar_busca`)
  conferem se a busca pertence a quem chama.
- A chave **service_role** só existe no servidor do robô na nuvem.

## Manutenção

O Google muda o HTML do Maps de tempos em tempos. Se algum campo parar de vir, ajuste o mesmo
trecho em dois lugares:
- robôs: `JS_DETALHES` em [`robo/scraper.py`](robo/scraper.py);
- extensão: `lerPainel()` em [`extensao/content.js`](extensao/content.js).

As regras de endereço e telefone existem em Python ([`robo/dados.py`](robo/dados.py)) e em
JavaScript ([`extensao/parser.js`](extensao/parser.js)) e dão o mesmo resultado. Mantenha os dois em
sincronia.

## Boas práticas

- Use 2 a 3 abas simultâneas nos robôs; volume alto em pouco tempo pode gerar verificação do Google.
- A coleta automatizada da página do Google Maps contraria os Termos de Serviço do Google. O motor 2
  (Places API) é o caminho oficial.
- Dados de contato estão sujeitos à **LGPD**: aborde empresas de forma profissional e respeite
  pedidos de não contato (use o status *Descartado* e tags).
