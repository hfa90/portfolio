# Deploy no GitHub Pages + Supabase

## 1. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra `SQL Editor`.
3. Rode o arquivo `supabase-schema.sql`.

Esse schema cria uma tabela `banco_games` com uma linha por partida. O estado inteiro da mesa fica no campo `state` em JSON.

## 2. Configurar o app

Edite `supabase-config.js`:

```js
window.BANCO_SUPABASE = {
  url: "https://SEU-PROJETO.supabase.co",
  publishableKey: "SUA_CHAVE_PUBLICA",
  table: "banco_games"
};
```

Use a chave publica/publishable do Supabase. Nunca coloque `service_role` no GitHub ou no navegador.

## 3. Hospedar no GitHub Pages

Suba estes arquivos para um repositorio:

- `index.html`
- `supabase-config.js`
- `supabase-schema.sql`
- `DEPLOY_GITHUB_SUPABASE.md`

No GitHub:

1. Abra `Settings`.
2. Abra `Pages`.
3. Em `Build and deployment`, selecione `Deploy from a branch`.
4. Escolha a branch e a pasta onde esta o `index.html`.

## 4. Como compartilhar a partida

Quando voce cria uma partida, o app coloca o codigo da sala no final da URL, por exemplo:

```txt
https://seuusuario.github.io/seu-repo/#abc123xyz
```

Envie esse link para os amigos. Todos que abrirem o mesmo link entram na mesma mesa.

## Nota de seguranca

Este setup deixa qualquer pessoa com o link da sala ler e alterar a partida. Para Banco Imobiliario entre amigos isso costuma ser suficiente. Para algo publico ou com contas reais, o proximo passo e adicionar login com Supabase Auth e politicas RLS por usuario.
