# Deploy no GitHub Pages + Supabase

## 1. Criar o banco no Supabase

1. Crie um projeto no Supabase.
2. Abra `SQL Editor`.
3. Rode o arquivo `supabase-schema.sql`.

O schema cria a tabela `banco_games`, bloqueia acesso direto anonimo a ela com RLS e expõe apenas funcoes RPC com tokens.

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

- `.nojekyll`
- `index.html`
- `supabase-config.js`
- `supabase-schema.sql`
- `DEPLOY_GITHUB_SUPABASE.md`

No GitHub:

1. Abra `Settings`.
2. Abra `Pages`.
3. Em `Build and deployment`, selecione `Deploy from a branch`.
4. Escolha a branch e a pasta onde esta o `index.html`.

## 4. Como funcionam os acessos

Ao criar uma partida, o banco recebe um link mestre:

```txt
https://seuusuario.github.io/seu-repo/#bank=TOKEN_DO_BANCO
```

Esse link mostra todos os jogadores, todos os saldos, historico completo e os links individuais.

Para cada jogador, o banco copia um link individual:

```txt
https://seuusuario.github.io/seu-repo/#player=TOKEN_DO_JOGADOR
```

Esse link mostra somente a carteira daquele jogador. Ele recebe apenas:

- nome e saldo dele;
- historico que envolve a carteira dele;
- nomes dos outros jogadores para poder pagar alguem;
- nenhum saldo dos outros jogadores.

## Nota de seguranca

Este setup usa tokens longos nos links e funcoes RPC com validacao no Supabase. A tabela nao fica aberta diretamente para `anon`.

Quem tiver o link do banco tem acesso total. Quem tiver um link de jogador acessa somente aquela carteira. Para uso publico ou mais sensivel, o proximo passo seria adicionar Supabase Auth com login por usuario.
