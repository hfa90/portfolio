# Inventário Quallit

Sistema web de inventário de computadores e notebooks do CD, com coleta **automática** dos dados por um agente instalado nas máquinas.

| O quê | Como é obtido |
|---|---|
| Hostname, nº de série, fabricante, modelo, tipo (desktop/notebook) | Agente (WMI/BIOS) |
| Memória total + cada módulo (slot, tamanho, DDR, MHz) | Agente |
| Armazenamento: discos (SSD/HDD/NVMe, saúde) e volumes (livre/usado) | Agente |
| Sistema operacional, versão (23H2/24H2), build, arquitetura, data de instalação | Agente |
| IP, MAC, domínio, usuário logado, último boot | Agente |
| **Último contato (última vez online)** | Atualizado a cada execução do agente (boot, logon e de hora em hora) |
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
supabase/functions/admin-usuarios/ → função do servidor que cria e gerencia logins
web/                     → painel (HTML/CSS/JS puro + supabase-js)
web/instalar.html        → página pública que o colaborador abre
web/agente/              → coletor + modelo do instalador usados pela página
web/sw.js, manifest.webmanifest, icons/ → app instalável e funcionamento offline
agente/coletor.ps1       → coleta e envia os dados
agente/instalar-agente.ps1 / INSTALAR.bat → instala com tarefa agendada
agente/config.json       → URL, chave anon e token do agente (NÃO versionar)
```

## Instalação

### 1. Banco de dados (uma vez)
1. Supabase → **SQL Editor** → New query → cole todo o conteúdo de `sql/01_schema.sql` → **Run**. Depois faça o mesmo com `sql/02_link_instalacao.sql`, `sql/03_garantia_emprestimos.sql` e `sql/04_multicd_usuarios.sql` (sempre nessa ordem; se rodar um arquivo anterior de novo, rode os seguintes em seguida). Ao rodar o 04, **quem já tem login vira Administrador** e as máquinas existentes vão para o CD "CD01 · CD Principal" (renomeie em *Usuários e CDs → CDs*).
2. **Authentication → Users → Add user**: crie o usuário de cada pessoa que vai usar o painel (e-mail + senha, marque *Auto Confirm*).
3. **Authentication → Sign In / Providers → Email**: desative **"Allow new users to sign up"** (só quem você criar entra).

### 2. Painel web
Por usar módulos ES, abra via servidor HTTP (não funciona com duplo clique em `file://`):
- **VS Code**: extensão *Live Server* → clique direito em `web/index.html` → *Open with Live Server*; ou
- `cd web && python -m http.server 8080` → http://localhost:8080; ou
- Publique a pasta `web/` no **GitHub Pages**, Netlify ou Vercel (é só estático).

### 3. Agente nas máquinas
- **Link para o colaborador (mais fácil)**: Painel → *Agente coletor* → **Gerar link de instalação** (ou *Máquinas* → *Link de instalação*). Patrimônio/setor são opcionais. O colaborador abre o link **no computador**, clica em **Baixar instalador** e abre o arquivo `.cmd`:
  - como usuário comum: instala em `C:\Users\<usuário>\AppData\Local\InventarioQuallit`, coleta ao entrar no Windows e de hora em hora;
  - como administrador: instala em `C:\InventarioQuallit` (protegida), coleta ao ligar, ao entrar e de hora em hora (tarefa SYSTEM).
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
