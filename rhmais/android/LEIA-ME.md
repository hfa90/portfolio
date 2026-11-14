# App Android do RH+ Match

O app é uma **Trusted Web Activity (TWA)**: abre o sistema publicado (`https://haydenfernandes.com.br/rhmais/sistema/`) em tela cheia, usando o motor do Chrome instalado no aparelho. Por isso:

- o **site continua funcionando normalmente** e qualquer mudança publicada no site já aparece no app, sem gerar APK novo;
- login, upload de currículo, exportação de Excel e as demais funções são as mesmas do navegador;
- o app compartilha a sessão com o Chrome do aparelho.

| Item | Valor |
|---|---|
| Pacote | `br.com.haydenfernandes.rhmais` |
| Versão | 1.0.0 (código 1) |
| Android mínimo | 7.0 (API 24) · alvo Android 16 (API 36) |
| APK publicado | `download/rhmais.apk` → https://haydenfernandes.com.br/rhmais/download/rhmais.apk |
| Abre em | `/rhmais/sistema/?origem=android` (o `?origem=android` avisa o site que está dentro do app, para não oferecer o download de novo) |

## ⚠️ Passo obrigatório: vincular o app ao domínio

> ✅ Já feito no repositório `hfa90/portfolio`: `.well-known/assetlinks.json` e `_config.yml` (com `include: [".well-known"]`) estão na raiz. Os passos abaixo ficam como referência.

Sem isso o app funciona, mas mostra uma **barra de endereço** no topo (o Android não tem como confirmar que o app é dono do site).

1. Copie `para-raiz-do-dominio/.well-known/assetlinks.json` para a **raiz** do repositório do seu site principal (o que publica `haydenfernandes.com.br`, não o do RH+ Match), ficando em
   `https://haydenfernandes.com.br/.well-known/assetlinks.json`.
2. O GitHub Pages ignora pastas que começam com ponto quando usa Jekyll. Na raiz desse repositório, crie um arquivo vazio chamado **`.nojekyll`** (ou, se o site usa Jekyll, acrescente `include: [".well-known"]` no `_config.yml`).
3. Publique e confira se o endereço acima abre o JSON. Depois, feche e abra o app: a barra some.

## Chave de assinatura (guarde com cuidado)

`assinatura/rhmais-release.keystore` + `assinatura/SENHA-DA-CHAVE.txt` (alias `rhmais`).

- **Faça backup fora do computador** (pendrive, cofre de senhas). Sem essa chave não é possível publicar atualizações que instalem por cima da versão atual, e o `assetlinks.json` deixa de valer.
- A pasta `assinatura/` está no `.gitignore`: nunca envie para o GitHub.
- Impressão digital SHA-256: `01:E6:76:82:35:F4:DA:A7:34:12:D7:2A:7F:08:18:7D:64:F5:22:60:E4:64:76:E9:44:8E:10:49:F5:C8:C0:B4`

## Gerar uma nova versão

Só é preciso quando mudar nome, ícone, cores ou endereço inicial do app (mudanças no site não exigem APK novo).

1. Em `projeto/twa-manifest.json`, aumente `appVersionCode` (ex.: 2) e `appVersionName` (ex.: 1.0.1).
2. Com Node.js, JDK 17 e Android SDK instalados:
   ```
   npm i -g @bubblewrap/cli
   cd android/projeto
   bubblewrap update
   bubblewrap build
   ```
   (`bubblewrap build` pede a senha do arquivo `SENHA-DA-CHAVE.txt`.)
3. Copie o `app-release-signed.apk` gerado para `download/rhmais.apk` e publique.

## Google Play (opcional)

Para publicar na Play Store, gere o pacote `.aab` com `bubblewrap build` (ele cria `app-release-bundle.aab`), crie o app no Play Console com o mesmo nome de pacote e, se usar a assinatura gerenciada pelo Google, acrescente ao `assetlinks.json` a impressão digital que o Play Console mostrar em *Integridade do app*.
