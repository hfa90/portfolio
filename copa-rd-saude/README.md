# 🏆 Copa RD Saúde CD-AM

Sistema web para organizar o campeonato interno de **Tênis de Mesa, Damas e
Dominó** da RD Saúde (CD-AM), no formato **eliminação dupla** (quem perde uma
vez ainda joga a repescagem — só é eliminado na segunda derrota).

Inclui: inscrição pública, pagamento da taxa via **Pix** (QR Code + copia e
cola gerados na hora), envio de comprovante com confirmação por WhatsApp,
sorteio automático da chave, chaveamento interativo em tempo real e painel
administrativo para aprovar pagamentos e lançar resultados.

É um site estático (**PWA — Progressive Web App**), sem processo de build:
abra os arquivos direto no navegador ou hospede em qualquer serviço de
arquivos estáticos. Funciona como um app instalado tanto no Android quanto
no **iPhone** (ver seção *"Instalar no iPhone"* abaixo).

---

## 1. Estrutura do projeto

```
copa-rd-saude/
├── sql/
│   ├── schema.sql      ← rode primeiro (tabelas, RLS, seeds)
│   └── funcoes.sql      ← rode depois (função de registrar resultado)
└── public/               ← é isso que você hospeda / abre no navegador
    ├── index.html
    ├── inscricao.html
    ├── pagamento.html
    ├── chaveamento.html
    ├── admin-login.html
    ├── admin.html
    ├── manifest.json
    ├── service-worker.js
    ├── css/style.css
    ├── icons/
    └── js/
        ├── config.js               ← ⚠️ o ÚNICO arquivo que você precisa editar
        ├── supabaseClient.js
        ├── bracket.js              ← algoritmo de eliminação dupla (puro, testável com node)
        ├── pix.js                  ← gerador do payload Pix (puro, testável com node)
        └── chaveamentoService.js   ← liga o algoritmo ao Supabase
```

## 2. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (plano free resolve).
2. Vá em **SQL Editor** → cole o conteúdo de `sql/schema.sql` → **Run**.
3. Ainda no SQL Editor → cole o conteúdo de `sql/funcoes.sql` → **Run**.
4. Vá em **Storage** → crie um bucket chamado **`comprovantes`**, marcado como
   **privado** (não público).
5. No SQL Editor, rode as policies do bucket (estão comentadas no fim do
   `schema.sql`, é só descomentar e rodar):
   ```sql
   create policy "comprovantes_insert_publica"
     on storage.objects for insert
     with check (bucket_id = 'comprovantes');

   create policy "comprovantes_select_admin"
     on storage.objects for select
     using (bucket_id = 'comprovantes' and is_admin());
   ```
6. Vá em **Authentication → Users → Add user** e crie o usuário do
   organizador (seu e-mail + uma senha).
7. Copie o **UUID** desse usuário (aparece na lista de usuários) e rode:
   ```sql
   insert into auth_admins (user_id, email)
   values ('COLE-O-UUID-AQUI', 'seu-email@empresa.com');
   ```
8. Vá em **Project Settings → API** e copie a **Project URL** e a **anon public key**.

## 3. Configurar o app

Abra `public/js/config.js` e preencha:

```js
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
export const WHATSAPP_NUMERO = "5592995258724"; // já vem preenchido
export const PIX_CHAVE = "haydenfernandes.ti@gmail.com"; // já vem preenchido
export const VALOR_INSCRICAO = 10.0;
```

Pronto — não há mais nada para editar. O restante do app lê tudo daqui.

## 4. Rodar localmente

Não precisa de `npm install` nem build. Qualquer servidor estático serve:

```bash
cd public
python3 -m http.server 8080
# abra http://localhost:8080
```

## 5. Publicar (deploy)

Suba a pasta `public/` em qualquer um destes (todos têm plano free):

- **Vercel** / **Netlify**: arraste a pasta `public` no dashboard, ou conecte
  o repositório e configure *"Output directory: public"*.
- **GitHub Pages**: publique o conteúdo de `public/` na branch `gh-pages`.
- **Cloudflare Pages**: mesma ideia, output directory `public`.

Como é 100% estático (sem backend próprio — tudo roda direto no Supabase),
qualquer um desses funciona sem configuração extra além do domínio.

## 6. Instalar no iPhone (PWA)

Este projeto **não é um app nativo compilado** (não existe `.ipa` nem
publicação na App Store aqui) — é um **PWA instalável**, que na prática
funciona como um app na tela do usuário:

1. Publique o site (passo 5) com HTTPS (Vercel/Netlify já dão isso de graça).
2. No iPhone, abra o link no **Safari**.
3. Toque no ícone de compartilhar (□↑) → **"Adicionar à Tela de Início"**.
4. O ícone da Copa aparece na tela do usuário e abre em tela cheia, sem a
   barra do Safari — visualmente indistinguível de um app nativo.

Se no futuro vocês quiserem um app nativo de verdade (para a App Store), dá
para embrulhar este mesmo código com **Capacitor** ou **React Native
WebView** — me avise que posso preparar esse projeto.

## 7. Como o pagamento funciona, na prática

Não há integração com um gateway de pagamento (Mercado Pago, PagSeguro etc.)
— o Pix gerado é um **QR estático** (payload BR Code) para a chave
`haydenfernandes.ti@gmail.com`, então **não existe confirmação automática**
de que o pagamento caiu. O fluxo é:

1. Atleta gera o Pix, paga, anexa o print/PDF do comprovante no app
   (some para o Supabase Storage) e toca em **"Confirmar pelo WhatsApp"**
   (abre o WhatsApp já com uma mensagem pronta — a pessoa só precisa anexar
   o mesmo print e enviar; não existe forma de um site anexar o arquivo
   automaticamente no WhatsApp de outra pessoa, essa etapa manual é
   inevitável).
2. O organizador confere no **painel admin** (aba *Inscrições*) e clica em
   **Aprovar** ou **Rejeitar** — só então a inscrição entra no sorteio.

Se no futuro vocês quiserem confirmação automática, dá para integrar a API
do Mercado Pago (Pix dinâmico com webhook) — é uma reformulação relativamente
pequena da tela de pagamento, me avise se quiser isso depois.

## 8. Sobre o chaveamento (eliminação dupla)

- O sorteio (aba *Chaveamento* do admin) só aparece quando houver pelo menos
  2 inscrições **confirmadas** na modalidade.
- Se o número de inscritos não for uma potência de 2 (4, 8, 16, 32...), o
  sistema preenche automaticamente com **byes** (avanço automático na
  primeira rodada) — o algoritmo distribui os byes de forma justa entre os
  posicionamentos do sorteio.
- Ao lançar um placar, o sistema já move o vencedor para a próxima fase e o
  perdedor para a repescagem automaticamente (função `registrar_resultado_partida`
  no banco), inclusive resolvendo byes em cadeia quando necessário.
- Grande final: se quem veio da repescagem vencer o primeiro confronto, o
  sistema libera automaticamente uma segunda partida ("reset") — já que quem
  vem da chave de vencedores só é eliminado ao perder duas vezes.
- **Recomendação prática**: teste o fluxo completo com um grupo pequeno
  (3 a 5 pessoas fictícias) antes do dia do evento, e lembre-se que qualquer
  ajuste manual sempre pode ser feito direto na tabela `partidas` do Supabase
  se algum caso extremo aparecer.

## 9. Testando o algoritmo isoladamente

Os dois módulos mais "matemáticos" do projeto não dependem de navegador nem
de Supabase — dá pra rodar e conferir com Node puro:

```bash
node public/js/bracket.js   # gera uma chave de teste e imprime a tabela
node public/js/pix.js       # gera um payload Pix de teste
```

## 10. Segurança (RLS) — resumo

- Leitura é pública em tudo (modalidades, inscrições, chaveamento) — faz
  sentido para um evento interno onde todo mundo pode acompanhar.
- Qualquer pessoa pode **criar** uma inscrição e um pagamento (fluxo de
  cadastro não exige login).
- Um visitante só pode alterar o **próprio** pagamento, e só os campos de
  comprovante — campos como valor, chave Pix e status de aprovação são
  protegidos por um trigger no banco e só o organizador (autenticado e
  cadastrado em `auth_admins`) pode aprovar/rejeitar, gerar chaveamento ou
  lançar resultados.

---

Qualquer ajuste de identidade visual, textos ou regras do campeonato é só
pedir — o projeto inteiro está em arquivos simples de HTML/CSS/JS, sem
build step, então qualquer editor de texto serve para mexer depois.
