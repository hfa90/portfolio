# Meu Pedido / Marmita App

Sistema de pedidos de marmita com tela do colaborador, painel administrativo, comprovante PIX, pedidos coletivos, financeiro e notificacoes Web Push.

## Arquivos

| Arquivo | Funcao |
|---|---|
| `banco.sql` | Banco completo para Supabase: tabelas, indices, RLS, RPCs, storage e dados iniciais |
| `migracao-remover-horarios-e-corrigir-exclusao.sql` | Correcao pontual para bases ja criadas: remove bloqueios por horario e corrige a exclusao segura |
| `migracao-exclusao-segura.sql` | Correcao pontual para exclusao segura: exclui quando nao ha historico e desativa quando ha pedidos/pagamentos vinculados |
| `marmita.html` | App do colaborador: login por matricula/PIN, cardapio, pedido, historico e pedido coletivo |
| `admin.html` | Painel admin: pedidos, cardapio, fornecedores, pratos, acompanhamentos, colaboradores, financeiro e configuracoes |
| `marmita-sw.js` | Service worker para cache e notificacoes |
| `push-notificacoes.ts` | Edge Function opcional para envio de Web Push |
| `vapid.txt` | Chaves VAPID atuais |

## Setup Supabase

1. Crie ou abra o projeto no Supabase.
2. Em `Authentication > Users`, crie o admin:
   - Email: `haydenfernandes.ti@gmail.com`
   - Senha: `Acesso@2026`
   - Marque `Auto Confirm User`
3. Em `SQL Editor`, rode o arquivo inteiro `banco.sql`.
4. Em `Project Settings > API`, confirme `Project URL` e `anon/public key`.
5. Se usar outro projeto, troque `window.SUPABASE_URL` e `window.SUPABASE_ANON` no topo de `marmita.html` e `admin.html`.

Para um projeto Supabase que ja estava em uso antes desta correcao, rode `migracao-remover-horarios-e-corrigir-exclusao.sql` no SQL Editor. Ela preserva os dados, faz o cardapio depender apenas do botao `Pedidos abertos` e corrige a RPC `admin_excluir_registro`.

Se aparecer erro de chave estrangeira ao excluir fornecedor, prato, acompanhamento ou colaborador em uma instalacao antiga, a migracao acima ja cobre esse caso. O arquivo `migracao-exclusao-segura.sql` fica apenas como historico.

O SQL cria o perfil na tabela `admins` automaticamente quando encontrar o usuario de Auth com o email acima. Se voce rodou o SQL antes de criar o usuario no Auth, crie o usuario e rode novamente apenas o bloco `ADMIN INICIAL` no fim do `banco.sql`.

## Dados iniciais

O banco sobe com:

- Configuracao `pedidos_abertos = true`
- PIX da empresa configurado como `haydenfernandes.ti@gmail.com`
- 2 fornecedores de exemplo
- Pratos e acompanhamentos de exemplo
- Cardapio publicado para a data atual
- 3 colaboradores de teste:

| Nome | Matricula | PIN |
|---|---:|---:|
| Joao Silva | `001` | `1234` |
| Maria Souza | `002` | `5678` |
| Pedro Costa | `003` | `9999` |

## Rodar localmente

Como os HTMLs usam modulos ES, sirva por HTTP:

```bash
python -m http.server 8000
```

Acesse:

- Colaborador: `http://localhost:8000/marmita.html`
- Admin: `http://localhost:8000/admin.html`

## Seguranca aplicada no banco

- PINs dos colaboradores sao salvos com `pgcrypto/crypt`, nunca em texto puro.
- Login de colaborador usa RPC `login_colaborador` com bloqueio depois de 5 tentativas.
- RLS esta habilitado em todas as tabelas publicas.
- Cliente anonimo nao altera pedidos diretamente: usa RPC para criar pedido, anexar comprovante e salvar push.
- Admin precisa estar autenticado no Supabase Auth e ativo na tabela `admins`.
- Bucket `comprovantes-pix` aceita imagens/PDFs ate 5 MB e gera URL publica para conferencia no painel.

## Producao

Antes de colocar online:

- Troque dados de exemplo por fornecedores, pratos e colaboradores reais.
- Revise se `pix_empresa` deve continuar como `haydenfernandes.ti@gmail.com`.
- Troque as chaves VAPID se for usar notificacoes em dominio proprio.
- Hospede os arquivos em Netlify, Vercel, Cloudflare Pages ou outro host estatico.
