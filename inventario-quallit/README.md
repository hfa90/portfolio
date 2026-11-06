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
- **Tempo real**: a lista atualiza sozinha quando uma máquina reporta.

## Estrutura

```
sql/01_schema.sql        → banco (tabelas, RLS, histórico, função do agente)
sql/02_link_instalacao.sql → link do colaborador + reconhecimento ao vivo
web/                     → painel (HTML/CSS/JS puro + supabase-js)
web/instalar.html        → página pública que o colaborador abre
web/agente/              → coletor + modelo do instalador usados pela página
agente/coletor.ps1       → coleta e envia os dados
agente/instalar-agente.ps1 / INSTALAR.bat → instala com tarefa agendada
agente/config.json       → URL, chave anon e token do agente (NÃO versionar)
```

## Instalação

### 1. Banco de dados (uma vez)
1. Supabase → **SQL Editor** → New query → cole todo o conteúdo de `sql/01_schema.sql` → **Run**. Depois faça o mesmo com `sql/02_link_instalacao.sql` (sempre nessa ordem; se rodar o 01 de novo, rode o 02 em seguida).
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
