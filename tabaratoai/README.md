# Ta Barato Ai - Frontend estatico com Supabase

Esta versao deixa a aplicacao pronta para rodar sem servidor Python: as telas ficam em `static/` e as chamadas `/api/...` sao interceptadas por `static/js/supabase-api.js`, que conversa direto com o Supabase usando `supabase-js`.

## Configuracao

1. Crie ou abra seu projeto no Supabase.
2. Rode `supabase/schema.sql` no SQL Editor.
3. Crie um bucket publico chamado `uploads` em Storage.
4. Preencha `static/js/supabase-config.js` com a Project URL e a anon/publishable key.
5. Abra `static/index.html` ou publique a pasta `static/` em qualquer hospedagem estatica.

## Admin

Como nao existe mais servidor, nao coloque `service_role` no frontend. Para liberar o painel admin, defina no usuario do Supabase Auth:

```json
{
  "role": "admin"
}
```

em `app_metadata`.

## Funcoes que eram Python

OCR de nota fiscal, pesquisa visual, Chef IA, scraping e geocodificacao por servidor foram marcadas como endpoints pendentes no adaptador. Para manter 100% JavaScript/Supabase, migre essas partes para Supabase Edge Functions ou APIs externas chamadas pelo navegador.
