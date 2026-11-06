# Inventário Quallit

Sistema web de inventário de computadores e notebooks do CD, com coleta **automática** dos dados por um agente instalado nas máquinas.

| O quê | Como é obtido |
|---|---|
| Hostname, nº de série, fabricante, modelo, tipo (desktop/notebook) | Agente (WMI/BIOS) |
| Memória total + cada módulo (slot, tamanho, DDR, MHz) | Agente |
| Armazenamento: discos (SSD/HDD/NVMe, saúde) e volumes (livre/usado) | Agente |
| Sistema operacional, versão (23H2/24H2), build, arquitetura, data de instalação | Agente |
| IP, MAC, domínio, usuário logado, último boot | Agente |
| **Último contato (última vez online)** | Sinal do agente a cada 5 min; coleta completa ao ligar, ao entrar, de hora em hora ou quando o IP muda |
| Patrimônio (ativo), status, setor, localização, responsável | Painel (ou etiqueta da BIOS / instalador) |

## Funcionalidades

- **Painel ao vivo**: indicadores e gráficos clicáveis (SO, RAM, disco, contato, status, setor). Clicar em uma barra filtra a lista.
- **Lista de máquinas**: busca instantânea (hostname, patrimônio, série, usuário, IP…), filtros, ordenação, exportação CSV (abre direto no Excel).
- **Detalhe da máquina**: todos os dados técnicos, edição do controle de inventário e **histórico automático** de alterações (ex.: "Memória 8 GB → 16 GB", "Windows 10 → 11", troca de status).
- **Alertas automáticos**: Windows sem suporte, disco cheio, HDD, RAM < 8 GB, sem contato há 30 dias, **máquina de estoque que foi ligada**, hostname duplicado, sem patrimônio.
- **Conferência física**: bipe as etiquetas com o leitor de código de barras USB (ou câmera do celular). Mostra em tempo real o que foi encontrado, o que **falta** e o que **não está cadastrado**. Várias pessoas podem bipar a mesma conferência ao mesmo tempo.
- **Link de instalação para o colaborador**: o técnico gera um link no painel e manda por WhatsApp/e-mail. O colaborador abre no computador, clica em **Baixar**, abre o arquivo e a página mostra a máquina reconhecida ao vivo. Funciona sem ser administrador.
- **Botão "Executar coleta agora"**: depois de instalado, a mesma página dispara a coleta na hora (protocolo `inventario-quallit://`).
- **Alerta de peça removida**: se a memória ou o disco de uma máquina diminuir (ex.: 16 GB → 8 GB), ela ganha um alerta vermelho até o técnico marcar como verificado.
- **Etiquetas com QR code e código de barras**: selecione máquinas na lista e imprima em rolo térmico (50×30, 60×40, 100×50 mm) ou folha A4 (24 ou 14 por folha). O QR code abre a ficha da máquina pela câmera do celular e é lido na conferência.
- **Empréstimo de notebooks**: retirada com assinatura na tela, acessórios, devolução prevista, termo de responsabilidade para imprimir, aviso de atraso e histórico por máquina.
- **Compra e garantia**: data de compra, fornecedor, nota fiscal, valor e fim da garantia, com importação por planilha CSV, alerta de garantia vencendo em 30 dias e de máquinas com mais de 5 anos.
- **Conferência sem internet + app no celular**: o painel pode ser instalado como app; sem sinal, as leituras ficam salvas no aparelho e são enviadas sozinhas quando a internet volta.
- **Vários CDs e níveis de acesso**: **Administrador** vê todos os CDs, cria e gerencia usuários (criar, editar, trocar senha, desativar, excluir), cadastra CDs, edita/reabre/exclui inventários e tem relatórios gerais e por CD. **Field** trabalha só no próprio CD. A separação é garantida no banco (RLS), não só na tela.
- **Relatórios**: parque por CD (máquinas, online, Windows sem suporte, peças removidas, garantia, empréstimos…), inventários com filtros por CD, status, período e responsável, e relatórios individuais de CD e de inventário prontos para imprimir ou salvar em PDF. Tudo exporta em CSV.
- **Tempo real**: a lista atualiza sozinha quando uma máquina reporta.

## Estrutura

```
sql/01_schema.sql        → banco (tabelas, RLS, histórico, função do agente)
sql/02_link_instalacao.sql → link do colaborador + reconhecimento ao vivo
sql/03_garantia_emprestimos.sql → compra/garantia, empréstimos, alerta de peça removida
sql/04_multicd_usuarios.sql → CDs, perfis (Administrador / Field) e regras de acesso
sql/05_agendamentos.sql     → inventários programados (único, diário, semanal, mensal) com prazo
sql/06_agente_v2.sql        → agente 2.0: sinal, "Coletar agora", atualização automática e redes
sql/07_instalador_ps1.sql   → convites com código curto para o instalador .ps1 fixo (sem .cmd)
msi/                        → pacote MSI do agente (WiX) para Intune / SCCM / PDQ / GPO
ferramentas/empacotar.ps1   → assina e gera o instalador .ps1, o MSI e os hashes SHA-256
supabase/functions/admin-usuarios/ → função do servidor que cria e gerencia logins
web/                     → painel (HTML/CSS/JS puro + supabase-js)
web/instalar.html        → página pública que o colaborador abre
web/agente/              → coletor + modelo do instalador usados pela página
web/sw.js, manifest.webmanifest, icons/ → app instalável e funcionamento offline
web/campo/               → app de conferência para celular (PWA próprio, uso do Field)
agente/coletor.ps1       → coleta e envia os dados
agente/instalar-agente.ps1 / INSTALAR.bat → instala com tarefa agendada
agente/config.json       → URL, chave anon e token do agente (NÃO versionar)
```

## Instalação

### 1. Banco de dados (uma vez)
1. Supabase → **SQL Editor** → New query → cole todo o conteúdo de `sql/01_schema.sql` → **Run**. Depois faça o mesmo com `sql/02_link_instalacao.sql`, `sql/03_garantia_emprestimos.sql`, `sql/04_multicd_usuarios.sql`, `sql/05_agendamentos.sql`, `sql/06_agente_v2.sql` e `sql/07_instalador_ps1.sql` (sempre nessa ordem; se rodar um arquivo anterior de novo, rode os seguintes em seguida). Ao rodar o 04, **quem já tem login vira Administrador** e as máquinas existentes vão para o CD "CD01 · CD Principal" (renomeie em *Usuários e CDs → CDs*).
2. **Authentication → Users → Add user**: crie o usuário de cada pessoa que vai usar o painel (e-mail + senha, marque *Auto Confirm*).
3. **Authentication → Sign In / Providers → Email**: desative **"Allow new users to sign up"** (só quem você criar entra).

### 2. Painel web
Por usar módulos ES, abra via servidor HTTP (não funciona com duplo clique em `file://`):
- **VS Code**: extensão *Live Server* → clique direito em `web/index.html` → *Open with Live Server*; ou
- `cd web && python -m http.server 8080` → http://localhost:8080; ou
- Publique a pasta `web/` no **GitHub Pages**, Netlify ou Vercel (é só estático).

### 3. Agente nas máquinas
- **Link para o colaborador (mais fácil)**: Painel → *Agente coletor* → **Gerar link de instalação** (ou *Máquinas* → *Link de instalação*). Patrimônio/setor são opcionais. O colaborador abre o link **no computador**, clica em **Baixar instalador** e abre o arquivo `.cmd`:
  - como usuário comum: instala em `C:\Users\<usuário>\AppData\Local\InventarioQuallit`, sinal a cada 5 min e coleta completa ao entrar no Windows e de hora em hora;
  - como administrador: instala em `C:\InventarioQuallit` (protegida), sinal a cada 5 min e coleta completa ao ligar, ao entrar e de hora em hora (tarefa SYSTEM).
  - A página `instalar.html` precisa estar publicada (ex.: `https://haydenfernandes.com.br/inventario-quallit/web/instalar.html`) — configure `URL_PUBLICA` em `web/js/config.js`.
  - Para invalidar todos os links já enviados: no modal do link, **Invalidar links antigos**.
- **Manual**: copie a pasta `agente` → botão direito em `INSTALAR.bat` → *Executar como administrador* → informe o patrimônio.
- **Em massa (GPO/SCCM/Intune/PDQ)**:
  ```
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "\\SERVIDOR\share\agente\instalar-agente.ps1"
  ```
- **Testar sem enviar**: `powershell -ExecutionPolicy Bypass -File coletor.ps1 -SoMostrar`
- Rede com **proxy**: preencha `"proxy": "http://proxy:porta"` no `config.json`.
- Log da coleta: `C:\ProgramData\InventarioQuallit\coletor.log`.

O agente identifica a máquina pelo **nº de série** (depois patrimônio, depois hostname), então renomear ou reinstalar o Windows não cria duplicata.

## Segurança
- Sem login, nada é lido (RLS). A chave `anon` é pública por design.
- O agente **só** consegue chamar a função `agente_reportar` e precisa de um token válido. Tokens podem ser gerados/revogados na tela **Agente coletor**.
- `agente/config.json` está no `.gitignore` — não suba o token para o GitHub público.

## Uso no dia a dia

### Etiquetas
*Máquinas* → marque as máquinas (ou filtre) → **Etiquetas** → escolha o modelo → **Imprimir**. Na janela de impressão use escala **100% / tamanho real** e **sem margens**. Em folha A4 já usada, informe em "Começar na posição" a primeira etiqueta livre.

### Empréstimos
*Empréstimos* → **Novo empréstimo** → bipe a etiqueta (ou use a câmera), preencha o colaborador, marque os acessórios, peça a assinatura na tela. O termo abre pronto para imprimir. Na volta: **Devolução** → condição (com avaria vai para Manutenção automaticamente).

### Conferência sem internet (celular)
1. Abra o painel no celular **com internet** e entre com seu usuário. No Chrome: menu ⋮ → **Instalar app / Adicionar à tela inicial**.
2. Abra a conferência desejada uma vez com internet (ela fica guardada no aparelho).
3. No galpão, mesmo sem sinal, continue bipando: aparece "📴 salva no aparelho". Quando a internet voltar, as leituras são enviadas sozinhas.
- A câmera lê código de barras e QR code no Android; no iPhone lê QR code.

### Compras e garantias em lote
*Máquinas* → **Importar compras** → **Baixar planilha modelo**, preencha no Excel, salve como CSV e importe. As máquinas são encontradas pelo patrimônio, hostname ou nº de série.

## Níveis de acesso (Administrador e Field)

### Publicar a função de usuários (uma vez)
Criar logins e trocar senhas exige a chave mestra do Supabase, que nunca pode ficar no navegador. Por isso existe uma função no servidor:
1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nome: `admin-usuarios`. Apague o código de exemplo, cole o conteúdo de `supabase/functions/admin-usuarios/index.ts` e clique em **Deploy**.
3. Pronto: a tela *Usuários e CDs* passa a criar, editar, trocar senha e excluir. (A função só aceita chamadas de administradores ativos.)

Com a CLI do Supabase, alternativa: `supabase functions deploy admin-usuarios`.

### Rotina do administrador
- **CDs**: *Usuários e CDs → CDs → Novo CD* (código, nome, cidade/UF). CD com máquinas não pode ser excluído, só desativado.
- **Usuários**: *Novo usuário* → escolha **Field** (e o CD) ou **Administrador**. A senha inicial é gerada e aparece para você enviar (WhatsApp/copiar). Depois: *Editar* (nome, e-mail, perfil, CD, ativo), *Senha* (gera nova) e *Excluir*.
- **Trocar de CD**: no seletor do menu lateral, escolha um CD ou *Todos os CDs*. Painel, máquinas, empréstimos, inventários, etiquetas e relatórios seguem a escolha.
- **Inventários**: abrir qualquer um, **Editar** (nome, setor, CD), **Reabrir** um finalizado e **Excluir** (pede para digitar EXCLUIR).
- **Links de instalação**: escolha o CD no modal do link — a máquina instalada por ele entra direto naquele CD.

### O que o Field pode fazer
Ver e editar máquinas do seu CD, criar e bipar inventários, finalizar (depois só o admin reabre), registrar empréstimos, imprimir etiquetas, gerar link de instalação do seu CD e ver os relatórios do seu CD. Não exclui máquinas nem inventários e não vê outros CDs nem usuários.

## App de conferência no celular (Field)

Endereço: `https://haydenfernandes.com.br/inventario-quallit/web/campo/` (ou, no painel, **Inventários → 📱 App do celular** para ver o QR code).

1. O Field abre o link no celular e entra com o mesmo login do painel.
2. **Instalar**: Android/Chrome → menu ⋮ do app → *Instalar o app* (ou o aviso do navegador). iPhone/Safari → *Compartilhar* → *Adicionar à Tela de Início*. O ícone se chama **Conferência**.
3. Escolhe um inventário aberto (ou cria um) e confere:
   - bipa com leitor Bluetooth/USB, digita o patrimônio, ou usa **Ler etiquetas com a câmera** (a câmera fica aberta e lê uma etiqueta atrás da outra; tem lanterna nos aparelhos compatíveis);
   - na aba **Faltando**, toca na máquina para **marcar manualmente** quando a etiqueta não puder ser lida;
   - errou? **Desfazer** no próprio resultado ou tocando na leitura.
4. **Finalizar inventário** → mostra o resumo → **Confirmar e sincronizar**: as leituras vão para o sistema e o inventário é encerrado com o resultado congelado (o mesmo que aparece nos relatórios do painel).

Funciona sem internet: as leituras ficam salvas no celular (mesmo fechando o app). Se finalizar sem sinal, o inventário fica **na fila** e é sincronizado sozinho quando a conexão voltar. Para criar um inventário novo é preciso internet. A tela fica ligada durante a conferência e os campos não dão zoom ao tocar.

## Painel, modos de visualização e relatórios

- **Painel**: nota de saúde do parque (% de máquinas sem problemas importantes), 4 números principais, a lista *O que resolver agora* (ordenada por gravidade, um clique abre as máquinas filtradas), os inventários abertos com o relógio do prazo e a composição do parque em abas.
- **Máquinas** tem 4 modos, e o sistema lembra o último que você usou:
  - **Tabela**: o modo clássico.
  - **Cartões**: RAM, disco e sistema de cada máquina num relance.
  - **Quadro**: colunas por status, setor ou CD. **Arraste um cartão** para outra coluna e a mudança é gravada na hora, com botão *Desfazer*. Empréstimos não se arrastam: use a tela de Empréstimos.
  - **Mosaico**: cada quadradinho é uma máquina, colorido por contato, sistema, RAM, disco ou idade. Passe o mouse para ver os detalhes e clique numa cor da legenda para destacar só aquele grupo.
- **Relatórios → Parque**: cartão de saúde por CD com os 5 principais problemas, mapa de calor comparando os CDs (cor mais forte = maior proporção) e a tabela completa recolhida no fim. Todo número abre a lista de máquinas correspondente.

## Inventários programados e prazo

1. Rode `sql/05_agendamentos.sql` (passo 1 da instalação).
2. Como administrador, abra **Inventários → Agendados → Programar inventário** e preencha:
   - **CD**: um CD ou *Todos os CDs*, que cria um inventário em cada CD.
   - **Setor**: opcional.
   - **Frequência**: única, diária, semanal (escolha os dias) ou mensal (dia do mês ou último dia).
   - **Horário** e **prazo**: 2h, 4h, 8h, 1 dia, 7 dias ou um número de horas à sua escolha.

   A prévia mostra as próximas execuções antes de salvar.
3. No horário marcado, o inventário aparece aberto para o Field (no painel e no app do celular) com um **relógio que esvazia**:
   - 🟢 tempo de sobra
   - ⏳ fique de olho (passou da metade)
   - 🔥 reta final (últimos 20%)
   - ⏰ vencido

   Na tela da conferência, duas barras comparam *tempo usado × conferido* e avisam se o ritmo está bom, com uma previsão de término. Ao finalizar, o inventário fica marcado como 🏁 *no prazo* ou 🐢 *com atraso*. A pontualidade aparece em *Relatórios → Inventários*.

**Geração automática:** o arquivo 05 tenta agendar a função a cada 5 minutos com **pg_cron**. Para isso, ative *Integrations → Cron* no Supabase antes de rodar o 05; se já rodou, ative e rode o 05 de novo. Sem o pg_cron, o inventário é criado na primeira vez que alguém abre o painel ou o app depois do horário. A criação nunca duplica.

## Agente 2.0

A tarefa agendada roda **a cada 5 minutos**. Em cada execução, o agente:

1. Envia as coletas que ficaram **guardadas sem internet** (pasta `fila`, até 10).
2. Manda um **sinal leve**, que mantém o status online e traz pedidos do painel.
3. Faz a **coleta completa** em 6 situações: passou 1 hora, o PC reiniciou, o IP mudou, alguém clicou em **⟳ Coletar agora**, é a primeira execução ou o agente acabou de ser atualizado.
4. Se houver versão nova publicada, **atualiza a si mesmo**.

O log fica em `coletor.log` (512 KB + 1 arquivo anterior). O estado fica em `estado.json`, na mesma pasta do agente.

**Primeiro passo:**
- Rode `sql/06_agente_v2.sql`.
- Máquinas com agente **1.x precisam reinstalar uma vez** pelo link de instalação. A lista delas aparece em *Agente coletor → Atualizações*.
- Máquinas que já têm o 2.0 recebem as próximas versões sozinhas. Quando o 2.0 roda pela primeira vez, ele também ajusta a tarefa agendada de 1 hora para 5 minutos.

### Coletar agora
Abra a máquina e clique em **⟳ Coletar agora**. O pedido aparece como "⏳ enviado", depois "🔄 recebido", e os dados chegam ao painel em até 5 minutos. Field e administrador podem pedir, cada um no seu CD.

### Redes e setores
Em *Agente coletor → Redes e setores*, cadastre as faixas de IP (ex.: `10.12.5.0/24` = Expedição do CD01). O painel sugere as faixas que encontrou nos IPs das máquinas: é só clicar em **Cadastrar**.
- A faixa mais específica vence: um /24 de um setor ganha do /16 do CD inteiro.
- Com "gravar setor automaticamente" ligado, a máquina recebe o setor e a localização da rede. A troca fica no histórico.
- Notebooks emprestados não têm o setor alterado.
- Máquina que aparece na rede de **outro CD** ganha o alerta **Fora do CD**, e o administrador pode movê-la com um clique.
- Ao salvar uma rede, ela é aplicada na hora usando o último IP conhecido de cada máquina.

### Atualização automática
1. Atualize o `web/agente/coletor.ps1` no site, com o número em `$AgenteVersao` aumentado.
2. Em *Agente coletor → Atualizações*, clique em **Publicar**.

Em cada máquina, o agente então:
- baixa a versão nova com o token;
- confere o **SHA-256** e a **sintaxe** do script;
- roda a versão nova uma vez como teste;
- **volta sozinho para a anterior** se o teste falhar e não tenta aquela versão de novo.

Para desfazer uma versão, publique outra com número maior. **Pausar atualizações** congela as máquinas na versão atual.

> 🔒 O agente roda como SYSTEM, então quem publica uma versão executa código em todas as máquinas. Só administradores podem publicar (garantido no banco). Use senhas fortes nas contas de administrador e publique apenas o arquivo do repositório.

## Instalação em ambiente com antivírus/EDR (CrowdStrike)

O antigo instalador `.cmd` (um arquivo de lote com o script em base64) foi **removido**. Esse formato é o mesmo de muitos malwares, por isso o CrowdStrike o bloqueia. Agora existem duas formas de instalar, e as duas usam formatos que o EDR trata como software corporativo:

| | Instalador `.ps1` (página do colaborador) | Pacote `.msi` (Intune / SCCM / PDQ / GPO) |
|---|---|---|
| Para quem | Self-service: o colaborador recebe o link | Instalação em massa pela TI |
| Arquivo | `web/agente/Instalar-InventarioQuallit.ps1`: **fixo, legível, igual para todos** | `web/agente/InventarioQuallit.msi` |
| Configuração | Código curto no nome do arquivo (`…-ABCD234567.ps1`), trocado no servidor pela config do link | Propriedades do `msiexec` (`TOKEN=…`) |
| Roda como | O próprio usuário (15 min) ou administrador/SYSTEM (5 min) | SYSTEM (5 min), sem janela |
| Assinatura | `Set-AuthenticodeSignature` (CA interna) | `signtool` |

### Instalador .ps1
1. Rode `sql/07_instalador_ps1.sql`.
2. O colaborador abre o link, clica em **Baixar instalador** e, na pasta Downloads, usa **botão direito → Executar com o PowerShell**. Se o arquivo for renomeado, o instalador pede o código mostrado na página.
3. O instalador:
   - busca a configuração pelo código (válido por 7 dias);
   - grava o coletor, conferindo o SHA-256;
   - registra a tarefa agendada e faz a primeira coleta.

   Não usa `.vbs`, `.bat`, base64 nem download de código.

### MSI
```
msiexec /i InventarioQuallit.msi /qn TOKEN=<token do agente> [ATIVO=PAT123] [SETOR="Expedição"] [LOCALIZACAO="Doca 2"] [RESPONSAVEL="Nome"] [PROXY=http://proxy:8080]
msiexec /x InventarioQuallit.msi /qn
```
- O MSI instala em `C:\Program Files\Inventario Quallit` e cria a tarefa `InventarioQuallit` (SYSTEM, a cada 5 minutos, ao ligar e ao entrar). Ele também cria a tarefa `InventarioQuallit-Coletar`, usada pelo botão "Executar coleta agora" da página.
- O `config.json` com o token só pode ser lido pelo SYSTEM e pelos administradores. O token não aparece no log do msiexec (`MsiHiddenProperties`).
- Numa atualização ou reparo sem `TOKEN`, o `config.json` atual é mantido.
- **Intune**: configure como app Win32 (ou linha de negócio), com contexto **Sistema** e detecção pelo código do produto MSI.
- **GPO**: use um script de inicialização com o comando `msiexec` acima (*Software Installation* não passa propriedades).

### Gerar e assinar (`ferramentas/empacotar.ps1`)
Rode sempre que mudar o `agente/coletor.ps1`:
```
.\ferramentas\empacotar.ps1 -Certificado <thumbprint do certificado de code signing>
```
O script faz, em ordem:
1. assina o `coletor.ps1`;
2. gera e assina o `Instalar-InventarioQuallit.ps1`, com o coletor assinado dentro;
3. gera o MSI com o WiX v3 (`candle`/`light`) ou o `wixl` (msitools, no Linux) e assina com o `signtool`;
4. grava os SHA-256 em `web/agente/SHA256SUMS.txt`.

Sem `-Certificado`, os arquivos saem sem assinatura. Depois, publique a pasta `web/agente` e, se o coletor mudou, use *Agente coletor → Atualizações → Publicar*.

- **Agente assinado só aceita atualização assinada pelo mesmo certificado.** Se o coletor instalado estiver assinado, uma versão publicada sem assinatura (ou com outro certificado) é recusada e registrada no `coletor.log`.
- **Liberação por hash:** se o time de segurança preferir, envie o `SHA256SUMS.txt` para eles cadastrarem os arquivos como permitidos no Falcon (*IOC Management*). Regere e reenvie a cada versão.
- Com GPO `AllSigned`, os scripts precisam estar assinados por um certificado confiável no domínio. O empacotar.ps1 já cuida disso quando recebe `-Certificado`.
