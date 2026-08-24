# Fim de Tarde — Comandas digitais via QR Code

Sistema completo de pedidos para o bar: cada **mesa** tem um QR fixo, cada
**cliente** pode abrir sua **comanda individual** com QR próprio, o **garçom**
consegue escanear qualquer um dos dois QRs para lançar pedidos manualmente, a
**cozinha/bar** vê tudo em tempo real, e a conta pode ser **dividida
igualmente** ou fechada por comanda.

## Como o fluxo funciona

```
Mesa impressa (QR fixo)
   └─ cliente escaneia → abre uma SESSÃO na mesa (se ainda não houver)
        ├─ "Pedir pela mesa toda"      → pedidos ficam ligados só à sessão
        └─ "Só para mim" → cria uma COMANDA (com nome + QR próprio)
                └─ mostra a QR da comanda na tela p/ o garçom escanear depois

Garçom escaneia QR da mesa OU de uma comanda
   → abre a mesma tela de pedido, lança itens em nome do cliente

Cozinha/Bar
   → vê os itens chegarem em tempo real, avança Pendente → Preparo → Pronto

Garçom entrega → marca "Entregue"

Fechar a conta (garçom)
   → soma tudo da sessão, divide por N pessoas (editável) ou mostra
     o consumo de cada comanda, fecha a mesa e libera para o próximo grupo
```

Cada mesa tem **um QR só, impresso uma vez** — ele não muda a cada rodada.
Ele sempre aponta para a sessão aberta daquela mesa; se não houver sessão
aberta, o próprio app cria uma na hora que alguém escaneia.

## Estrutura de arquivos

```
fimdetarde/
├── supabase/
│   └── schema.sql          ← rode isso no SQL Editor do Supabase
└── app/
    ├── shared/
    │   ├── config.js        ← cole aqui a URL e a anon key do seu projeto
    │   ├── lib.js            ← helpers (Supabase client, formatação, toasts)
    │   └── styles.css        ← design system usado nas 4 telas
    ├── cliente.html / .js    ← tela que o cliente vê ao escanear o QR
    ├── garcom.html / .js     ← painel do garçom (login, scanner, pedidos, fechar conta)
    ├── cozinha.html / .js    ← painel da cozinha/bar (kanban em tempo real)
    └── admin.html / .js      ← gerar QR das mesas, editar cardápio, cadastrar equipe
```

## Passo a passo

### 1. Criar o projeto no Supabase
Crie um projeto em [app.supabase.com](https://app.supabase.com) (plano free
já é suficiente para começar).

### 2. Rodar o schema
Abra **SQL Editor** no painel do Supabase, cole o conteúdo de
`supabase/schema.sql` e rode. Isso cria as tabelas, as políticas de RLS e um
cardápio + 3 mesas de exemplo (edite/apague à vontade depois).

### 3. Ligar o Realtime
Em **Database → Replication**, habilite a replicação (Realtime) para as
tabelas `order_items`, `orders`, `sessions`, `comandas` e `tables`. Sem isso
o painel da cozinha e as atualizações ao vivo não funcionam.

### 4. Configurar as chaves do app
Em **Project Settings → API**, copie a **Project URL** e a **anon public
key** e cole em `app/shared/config.js`:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'ey...';
```

### 5. Criar a equipe (login do garçom, cozinha e admin)
1. Em **Authentication → Users**, clique em "Add user" e crie um e-mail +
   senha para cada pessoa (garçom, cozinha, admin — pode ser o mesmo
   usuário com papel `admin` para você testar tudo).
2. Copie o UUID do usuário criado.
3. No SQL Editor, rode (ou use a aba **Equipe** do `admin.html` depois que
   tiver pelo menos um admin):
   ```sql
   insert into staff (auth_id, name, role)
   values ('COLE-O-UUID-AQUI', 'Seu Nome', 'admin');
   ```

### 6. Publicar os arquivos
A pasta `app/` é um site estático puro — sem build, sem servidor. Pode
subir em:
- **Netlify / Vercel**: arraste a pasta `app/` (drag-and-drop) ou conecte o
  repositório.
- **GitHub Pages**: suba a pasta `app/` para um repositório e ative Pages.
- **Supabase Storage**: também funciona como host estático simples.

Depois de publicar, abra `admin.html`, faça login com o usuário `admin` que
você criou, vá em **Mesas** e gere o QR de cada mesa — o link já aponta
para `cliente.html?mesa=...` no domínio publicado. Imprima e plastifique.

### 7. Testar o fluxo
1. Escaneie o QR de uma mesa com o celular → escolha "Só para mim" → faça
   um pedido.
2. Entre em `garcom.html`, faça login, veja a mesa aparecer no painel,
   escaneie o mesmo QR (ou o QR pessoal mostrado na tela do cliente) para
   confirmar que abre a comanda certa.
3. Entre em `cozinha.html` com um login de cozinha/bar e veja o pedido
   chegando ao vivo — avance os status.
4. Volte no `garcom.html`, marque o item como entregue, e feche a conta
   testando a divisão entre N pessoas.

## Decisões de projeto (e trade-offs a saber)

- **RLS permissiva para pedidos**: como o cliente não faz login, o acesso
  de leitura/escrita em `orders`/`order_items`/`comandas` usa políticas
  abertas — a segurança real vem do token aleatório do QR (128 bits,
  imprevisível). Isso é adequado para um bar de porte pequeno/médio; se
  quiser blindar mais, dá para trocar por Edge Functions com validação de
  token no servidor.
- **QR da mesa é fixo**; a sessão embaixo dele é que abre/fecha. Isso evita
  ter que reimprimir QR toda rodada.
- **Fechar a conta é ação do garçom** (não do cliente), para evitar que
  alguém feche a mesa sem pagar — o cliente só visualiza o total e simula
  a divisão.
- **Sem processamento de pagamento**: o app calcula e mostra os valores;
  a cobrança em si (Pix, maquininha) continua fora do sistema.

## Próximos passos sugeridos
- Impressora térmica na cozinha (via ESC/POS a partir do painel).
- Notificação sonora no painel da cozinha quando um item novo chega.
- Fechamento com Pix/QR de pagamento integrado.
- App agrupando vários bares (multi-tenant) caso seu amigo abra outra unidade.
